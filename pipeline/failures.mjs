/**
 * The gate's failures-only summary (token-efficiency plan, item 19): every failure of a gate run as its test's name,
 * the error, the file and line and the first lines of output. The gate (pipeline/gate.mjs) prints it as it goes and
 * writes it to pipeline/out/failures.md, so the thread fixes from one short list instead of spawning the triage agent on
 * a raw log. An entry marked unplaced (no file and line could be read from the output) is where the triage agent may
 * still help, on a long log.
 */

/** Most failures a gate lists; the rest are counted (the gate's report and log have them all). */
export const MAX_FAILURES = 20;
/** Lines kept from an error besides its first. */
const DETAIL_LINES = 3;
/** Lines kept from a log's end when nothing in it could be placed. */
const TAIL_LINES = 10;

const stripAnsi = (text) => String(text ?? '').replace(/\x1b\[[0-9;]*m/g, '');
const STACK_LINE = /^\s*(at\s|❯\s)/;

/** `path` relative to `root` when it lies inside it (forward slashes), else null. */
function inside(path, root) {
  const p = path.replace(/^file:\/\//, '').replace(/\\/g, '/');
  const r = String(root ?? '').replace(/\\/g, '/').replace(/\/$/, '');
  if (r && p.startsWith(`${r}/`)) return p.slice(r.length + 1);
  return /^(src|pipeline|e2e)\//.test(p) ? p : null;
}

/**
 * `path:line` of the first stack frame of `text` inside the repository at `root` and outside `node_modules`, the path
 * relative to `root`; null when there is none.
 */
export function firstFrame(text, root) {
  for (const m of stripAnsi(text).matchAll(/((?:file:\/\/)?(?:[A-Za-z]:)?[^\s():'"]+\.(?:[cm]?[jt]sx?)):(\d+)(?::\d+)?/g)) {
    const rel = inside(m[1], root);
    if (rel && !rel.includes('node_modules/')) return `${rel}:${m[2]}`;
  }
  return null;
}

/** An error's first line and up to three more before its stack, ANSI colours and blank lines dropped. */
export function errorHead(message, max = 1 + DETAIL_LINES) {
  const out = [];
  for (const raw of stripAnsi(message).split('\n')) {
    if (STACK_LINE.test(raw)) break;
    const line = raw.trimEnd();
    if (line.trim() === '') continue;
    out.push(out.length === 0 ? line.trim() : line);
    if (out.length === max) break;
  }
  return out;
}

/**
 * The failures in a vitest JSON report (`vitest run --reporter=json`): each failed test as `{ test, file, at, message,
 * detail }`, `test` its full name, `file` its test file, `at` the first frame inside the repository, then each test file
 * that failed with no failing test of its own (it did not load: a syntax error, a missing import, a throw at the top).
 */
export function vitestFailures(data, root) {
  const failures = [];
  for (const file of data?.testResults ?? []) {
    const path = inside(String(file.name ?? ''), root) ?? String(file.name ?? '');
    const failedTests = (file.assertionResults ?? []).filter((t) => t.status === 'failed');
    for (const t of failedTests) {
      const text = t.failureMessages?.[0] ?? '';
      const detail = errorHead(text);
      failures.push({ test: t.fullName, file: path, at: firstFrame(text, root), message: detail[0] ?? '', detail });
    }
    if (failedTests.length === 0 && file.status === 'failed') {
      const detail = errorHead(file.message ?? '');
      failures.push({ test: '(the file did not load)', file: path, at: firstFrame(file.message ?? '', root), message: detail[0] ?? '', detail });
    }
  }
  return failures;
}

/**
 * The failures in a build's output: each TypeScript error (`path(line,col): error TSnnnn: …`, as tsc prints them) as
 * `{ test, file, at, message, detail }`, then Vite's `error during build` block. When neither is there, the output's
 * last lines that mention an error, or its last lines, as one unplaced entry.
 */
export function buildFailures(output, root) {
  const lines = stripAnsi(output).split('\n');
  const failures = [];
  for (const line of lines) {
    const m = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(line.trim());
    if (m) {
      const file = inside(m[1], root) ?? m[1];
      failures.push({ test: `error ${m[3]}`, file, at: `${file}:${m[2]}`, message: m[4], detail: [m[4]] });
    }
  }
  const viteAt = lines.findIndex((l) => /error during build/i.test(l));
  if (viteAt >= 0) {
    const detail = lines.slice(viteAt + 1).map((l) => l.trimEnd()).filter((l) => l.trim() !== '' && !STACK_LINE.test(l)).slice(0, 1 + DETAIL_LINES);
    const block = detail.join('\n');
    const at = firstFrame(block, root) ?? (/([\w./-]+\.[cm]?[jt]sx?) \((\d+):\d+\)/.exec(block)?.slice(1, 3).join(':') ?? null);
    failures.push({ test: 'vite build', at, message: detail[0]?.trim() ?? 'error during build', detail: detail.map((l) => l.trim()), ...(at ? {} : { unplaced: true }) });
  }
  if (failures.length > 0) return failures;
  const errors = lines.filter((l) => /\berror\b/i.test(l)).slice(-1 - DETAIL_LINES);
  const detail = (errors.length > 0 ? errors : lines.filter((l) => l.trim() !== '').slice(-TAIL_LINES)).map((l) => l.trim());
  return detail.length > 0 ? [{ test: 'build', at: null, message: detail[0], detail, unplaced: true }] : [];
}

/** Where a failure is: its `at`, or a smoke failure's `file` when that carries a line (pipeline/smokeReport.mjs). */
const placeOf = (f) => f.at ?? (/:\d+$/.test(String(f.file ?? '')) ? f.file : null);

/** One failure as the gate prints it: a `✗` line naming it, then its error's lines and where it is, indented. */
export function failureLines(f) {
  const file = f.file && f.file !== placeOf(f) ? `${f.file} › ` : '';
  const name = `✗ ${f.project ? `[${f.project}] ` : ''}${file}${f.test ?? f.title ?? '(unnamed)'}`;
  const detail = (f.detail?.length ? f.detail : [f.message]).filter(Boolean).map((l) => `    ${String(l).slice(0, 300)}`);
  const place = placeOf(f);
  const where = place ? [`    at ${place}`] : f.unplaced ? ['    no file and line in the output (the gate\'s log has all of it)'] : [];
  return [name, ...detail, ...where];
}

/** A failed gate's own lines when it lists no failures: scope's stray files, its reason, and its output's last lines. */
function gateNotes(gate) {
  const out = [];
  for (const f of gate.outsideTouches ?? []) out.push(`✗ outside the task's touches: ${f}`);
  for (const q of gate.qaCommitsOutsideTests ?? []) out.push(`✗ QA commit ${q.commit} touches ${q.file}`);
  if (gate.reason) out.push(`✗ ${gate.reason}`);
  const tail = stripAnsi(gate.evidence).trim().split('\n').filter((l) => l.trim() !== '').slice(-TAIL_LINES);
  if (tail.length > 0) out.push(`${out.length ? '  ' : '✗ '}no file and line in the output; its last lines (the gate's log has all of it):`, ...tail.map((l) => `    ${l.trimEnd().slice(0, 300)}`));
  if (out.length === 0) out.push('✗ failed, with no reason or output in the report (see the gate\'s log)');
  return out;
}

/**
 * The failures of a gate report (pipeline/out/gate-report.json) as Markdown lines: which gates failed, then a heading
 * per failed gate with its log and its failures (at most MAX_FAILURES, the rest counted); [] when none failed. The
 * review packet (pipeline/packet.mjs) carries the same lines.
 */
export function failureSections(report) {
  const failed = Object.entries(report?.gates ?? {}).filter(([, g]) => g.pass === false);
  if (failed.length === 0) return [];
  const out = [`Failed: ${failed.map(([name]) => name).join(', ')}. Every other gate passed or was skipped.`];
  for (const [name, gate] of failed) {
    const counts = name === 'tests' && typeof gate.failed === 'number' ? ` · ${gate.failed} failed of ${gate.total}` : '';
    const logs = [gate.log, ...(gate.runs ?? []).filter((r) => !r.pass).map((r) => r.log)].filter(Boolean);
    out.push('', `## ${name}${counts}${logs.length ? ` (${logs.join(', ')})` : ''}`);
    const failures = gate.failures ?? [];
    if (failures.length === 0) out.push(...gateNotes(gate));
    for (const f of failures.slice(0, MAX_FAILURES)) out.push(...failureLines(f));
    const listed = Math.min(failures.length, MAX_FAILURES);
    const more = Math.max(failures.length, name === 'tests' && typeof gate.failed === 'number' ? gate.failed : 0) - listed;
    if (failures.length > 0 && more > 0) out.push(`… and ${more} more (${gate.report ?? gate.log ?? 'the gate report'})`);
  }
  return out;
}

/** The failures-only summary the gate writes to pipeline/out/failures.md: a title, then failureSections, or one line. */
export function failuresSummary(report) {
  const title = `# Gate failures · ${report?.task ?? 'no task'} · head ${String(report?.head ?? '?').slice(0, 7)}`;
  const sections = failureSections(report);
  return `${title}\n\n${sections.length ? sections.join('\n') : 'None: every gate passed or was skipped.'}\n`;
}
