#!/usr/bin/env node
/**
 * The review packet (token-efficiency plan, item 15): pipeline/out/review-packet.md holds what the critic and QA read
 * first, so they stop exploring: the task block, the gate's summary, the contracts whose files the diff touches, QA's
 * report, the file list and the diff itself without the change records and generated files. They open other files only
 * where the packet isn't enough. Its second line says where the diff starts, and the file list gives each file's lines,
 * so a packet over the read guard's 40 KB (.claude/hooks/read-guard.mjs) is read by range.
 *
 *   node pipeline/packet.mjs [--task M27[,M28]] [--base origin/main]
 *
 * The gate (pipeline/gate.mjs) writes it at the end of every run but CI's; run this to rebuild it alone, after a commit
 * or once QA's report is in. Without --task it takes the ids from pipeline/out/gate-report.json.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { failureSections } from './failures.mjs';
import { parseTaskList, taskBlockText, tasksVersions } from './scope.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Where the packet is written, and QA's report (.claude/agents/qa.md), both relative to the repository. */
export const PACKET = 'pipeline/out/review-packet.md';
export const QA_REPORT = 'pipeline/out/qa-artifacts/qa-report.md';
/** Lines of context around each change: enough to judge most hunks without opening the file. */
export const CONTEXT_LINES = 8;
/** The diff stops growing past this; the files after it are listed with the command that shows them. */
export const MAX_DIFF_BYTES = 512 * 1024;
/** The read guard's limit (.claude/hooks/read-guard.mjs): a packet over it is read by range. */
const READ_GUARD_BYTES = 40 * 1024;

/**
 * Files whose diff the packet leaves out, and why: the change records (the task's record, CHANGELOG, FEATURES, the patch
 * notes, the archive, and TASKS, whose block the packet quotes) and generated files (the lockfile, perf baselines,
 * light bakes). The file list still names them.
 */
export const LEFT_OUT = [
  [/^docs\/records\//, 'the task\'s record'],
  [/^(CHANGELOG\.md|docs\/FEATURES\.md|docs\/patch-notes\/)/, 'change records'],
  [/^docs\/archive\//, 'archived history'],
  [/^docs\/TASKS\.md$/, 'the task list; the block is above'],
  [/^package-lock\.json$/, 'generated'],
  [/^pipeline\/baseline\//, 'perf baseline numbers'],
  [/^src\/map\/bakes\//, 'generated light bake'],
];

/** Why the packet leaves `file`'s diff out, or null when it carries it. */
export function leftOutReason(file) {
  return LEFT_OUT.find(([re]) => re.test(file))?.[1] ?? null;
}

/**
 * `git diff --numstat -z` output as `[{ file, added, deleted, binary }]`, a renamed file under its new path (`-z` gives
 * the old and new paths as separate fields).
 */
export function parseNumstat(text) {
  const fields = String(text ?? '').split('\0');
  const out = [];
  for (let i = 0; i < fields.length; i++) {
    const m = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(fields[i]);
    if (!m) continue;
    let file = m[3];
    if (file === '') {
      file = fields[i + 2] ?? '';
      i += 2;
    }
    if (file) out.push({ file, added: m[1] === '-' ? 0 : Number(m[1]), deleted: m[2] === '-' ? 0 : Number(m[2]), binary: m[1] === '-' });
  }
  return out;
}

/** A unified diff split per file: `Map<path, text>`, the path the `b/` side names (a renamed file's new path). */
export function splitDiff(text) {
  const out = new Map();
  for (const chunk of String(text ?? '').split(/^(?=diff --git )/m)) {
    const m = /^diff --git a\/.+? b\/(.+)$/m.exec(chunk);
    if (m) out.set(m[1].trim(), chunk.endsWith('\n') ? chunk : `${chunk}\n`);
  }
  return out;
}

/**
 * The entries of `docs/ARCHITECTURE.md` › Contracts: `[{ name, text, files }]`, `name` the bold lead, `text` the entry as
 * written, `files` the source files it names in backticks (tests left out: a test pins a contract, it isn't one).
 */
export function contractEntries(architecture) {
  const section = /^## Contracts[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(String(architecture ?? ''))?.[1] ?? '';
  const entries = [];
  for (const chunk of section.split(/^(?=- \*\*)/m)) {
    if (!chunk.startsWith('- **')) continue;
    const text = chunk.trimEnd();
    const name = /^- \*\*(.+?)\*\*/.exec(text)?.[1] ?? '';
    const files = [...text.matchAll(/`([\w./-]+\.(?:ts|mjs|md|json))`/g)].map((m) => m[1]).filter((f) => !/\.test\.[cm]?[jt]s$/.test(f));
    entries.push({ name, text, files: [...new Set(files)] });
  }
  return entries;
}

/** Whether a changed `file` (repository path) is the file a contract names as `named` (often relative to `src/`). */
const sameFile = (file, named) => file === named || file.endsWith(`/${named}`);

/**
 * The contracts the critic's check 2 needs to read: those whose files the diff touches, and those the task block's
 * `contract:` line names (e.g. "CharacterMover (behaviour unchanged)"; "none" names none). Each as `{ entry, named,
 * touched }`, `touched` the changed files that are the contract's.
 */
export function contractsForDiff(entries, changedFiles, contractLine) {
  const words = String(contractLine ?? '').replace(/\([^)]*\)/g, ' ').split(/[,;+]|\band\b/).map((w) => w.trim()).filter((w) => w.length >= 3 && w.toLowerCase() !== 'none');
  const out = [];
  for (const entry of entries) {
    const touched = changedFiles.filter((f) => entry.files.some((named) => sameFile(f, named)));
    const named = words.some((w) => entry.name.includes(w));
    if (touched.length > 0 || named) out.push({ entry, named, touched });
  }
  return out;
}

const seconds = (gate) => (typeof gate?.ms === 'number' ? ` ${Math.round(gate.ms / 1000)} s` : '');
const mark = (gate) => (gate?.pass === true ? '✓' : gate?.pass === false ? '✗' : '–');

/** One gate's line (and, for perf, one per run) in the packet's gate summary. */
function gateLines(name, gate) {
  if (!gate) return [`- ${name} – not in the report`];
  const bits = [];
  if (name === 'tests' && typeof gate.total === 'number') bits.push(`${gate.total} tests${gate.failed ? `, ${gate.failed} failed` : ''} (${gate.projects ?? 'all'}${gate.shard ? `, shard ${gate.shard}` : ''})`);
  if (name === 'smoke' && typeof gate.expected === 'number') bits.push(`${gate.expected} passed${gate.unexpected ? `, ${gate.unexpected} failed` : ''}`);
  if (name === 'scope' && gate.touches) bits.push(`touches ${gate.touches.join(', ')}`);
  if (name === 'scope' && gate.outsideTouches) bits.push(`outside: ${gate.outsideTouches.join(', ')}`);
  if (name === 'changelog' && gate.lines) bits.push(gate.lines.join(' / '));
  if (gate.reason) bits.push(gate.reason);
  const lines = [`- ${name} ${mark(gate)}${seconds(gate)}${bits.length ? ` · ${bits.join(' · ')}` : ''}`];
  for (const run of gate.runs ?? []) {
    const m = run.metrics;
    const numbers = m ? `${m.drawCalls} draw calls (max ${m.drawCallsMax}), ${Math.round(m.triangles)} triangles, ${m.gpuMemoryMB} MB GPU, heap +${m.heapGrowthMB} MB, p95 ${m.p95Ms} ms` : run.reason ?? '';
    const flags = [...(run.overBudget ?? []).map((o) => `${o.metric} ${o.now} over the budget ${o.limit}`), ...(run.worse ?? []).map((w) => `${w.metric} ${w.now} is ${w.pct} % over the baseline's ${w.baseline}`)];
    lines.push(`  - ${run.run} ${mark(run)} · ${numbers}${flags.length ? ` · ${flags.join('; ')}` : ''}`);
  }
  for (const w of gate.warnings ?? []) lines.push(`  - warning: ${w}`);
  return lines;
}

/** The packet's gate summary: where the report is from, then a line per gate. */
export function gateSummary(report, head) {
  if (!report) return ['No gate report yet: `node pipeline/gate.mjs --task <id>` writes one.'];
  const from = report.head === head ? `head ${String(head).slice(0, 7)} (this head)` : `head ${String(report.head).slice(0, 7)}, **not this head (${String(head).slice(0, 7)}): run the gate again before the critic**`;
  const lines = [`\`pipeline/out/gate-report.json\`: ${from} · ${report.mode} run · env ${report.env} · base ${report.base} · ${report.when}. ${report.pass ? 'Every gate passed or was skipped.' : 'A gate failed (failures below).'}`, ''];
  for (const [name, gate] of Object.entries(report.gates ?? {})) lines.push(...gateLines(name, gate));
  return lines;
}

/**
 * The packet as Markdown, from its parts: `ids`, `head` and `base` (the base's name and merge base), `blocks` (each
 * task's block text, or null), `report` (the gate report or null), `contracts` (contractsForDiff) and `contractCount`,
 * `qa` (QA's report text, or null), `files` (`[{ file, added, deleted, binary, diff, leftOut }]`, `diff` null when left
 * out) and `diffCommand` (how to see a left-out file's diff). The line ranges the file list gives are this text's own.
 */
export function assemblePacket({ ids, head, base, blocks, report, contracts, contractCount, qa, files, diffCommand }) {
  const idText = ids.length ? ids.join(', ') : 'no task';
  const head7 = String(head).slice(0, 7);
  const lines = [`# Review packet · ${idText} · head ${head7}`, '{{READ}}', ''];

  lines.push('## Task', '');
  if (ids.length === 0) lines.push('No task id given (`--task <id>`): no block to quote.');
  ids.forEach((id, i) => {
    lines.push(...(blocks[i] ? blocks[i].split('\n') : [`No block "## ${id}" in docs/TASKS.md or its history since ${base}.`]), '');
  });

  lines.push('## Gates', '', ...gateSummary(report, head), '');
  // The failures summary's gate headings sit one level down here, under "Failures".
  if (report && report.pass === false) lines.push('## Failures', '', ...failureSections(report).map((l) => (l.startsWith('## ') ? `#${l}` : l)), '');

  lines.push('## Contracts', '');
  if (contracts.length === 0) lines.push(`The diff touches no file a contract in \`docs/ARCHITECTURE.md\` › Contracts names (${contractCount} contracts), and the task names none.`, '');
  else {
    lines.push(`For check 2: the contracts of \`docs/ARCHITECTURE.md\` › Contracts (${contractCount} in all) that the task names or whose files the diff touches.`, '');
    for (const c of contracts) {
      const why = [c.named ? 'named by the task' : null, c.touched.length ? `touched: ${c.touched.join(', ')}` : null].filter(Boolean).join('; ');
      lines.push(...c.entry.text.split('\n'), `  _(${why})_`, '');
    }
  }

  lines.push('## QA report', '');
  lines.push(...(qa ? qa.trimEnd().split('\n') : [`None for ${idText} yet (QA writes \`${QA_REPORT}\`, first line naming the task).`]), '');

  const added = files.reduce((n, f) => n + f.added, 0);
  const deleted = files.reduce((n, f) => n + f.deleted, 0);
  lines.push(`## Files (${files.length}, +${added} −${deleted}, against ${base})`, '');
  const fileLine = lines.length;
  for (const f of files) lines.push(`- \`${f.file}\` ${f.binary ? 'binary' : `+${f.added} −${f.deleted}`}`);
  lines.push('', '## Diff', '');

  const diffStart = lines.length + 1;
  let at = diffStart;
  files.forEach((f, i) => {
    let note;
    if (f.diff) {
      const diffLines = f.diff.replace(/\n$/, '').split('\n');
      note = `lines ${at}–${at + diffLines.length - 1}`;
      lines.push(...diffLines);
      at += diffLines.length;
    } else note = f.leftOut ? `left out (${f.leftOut})` : f.binary ? 'binary, no diff' : 'no diff';
    lines[fileLine + i] += ` · ${note}`;
  });
  if (files.every((f) => !f.diff)) lines.push('No diff to show: every changed file is left out (see the file list).');

  const text = `${lines.join('\n')}\n`;
  const summaryEnd = diffStart - 4;
  const byRange = ' Over 40 KB: read the diff by range, with the line ranges in the file list.';
  // The size as written, line 2 included (counted with the by-range note, so a packet at the limit gets the note).
  const bytes = Buffer.byteLength(text) - '{{READ}}'.length + 200 + Buffer.byteLength(byRange);
  const read = `Read lines 1–${summaryEnd} first: the task, the gates, the contracts, QA's report and the file list. The diff runs from line ${diffStart} to ${lines.length} (${Math.ceil(bytes / 1024)} KB in all, ${CONTEXT_LINES} lines of context; ${diffCommand} shows a left-out file).${bytes > READ_GUARD_BYTES ? byRange : ''}`;
  return text.replace('{{READ}}', read);
}

/**
 * Builds and writes the packet: the task blocks (from docs/TASKS.md or the branch's history, as the scope gate finds
 * them), the gate report, the contracts, QA's report and the diff of the working tree against `mergeBase` (the merge
 * base of HEAD and `base`; untracked files count). Returns the packet's path relative to `root`.
 */
export function writePacket({ ids = [], base = 'origin/main', mergeBase = null, report = null, root = ROOT } = {}) {
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 });
  const head = git('rev-parse', 'HEAD').trim();
  const mb = mergeBase ?? git('merge-base', base, 'HEAD').trim();
  const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null);

  // Each block where the scope gate finds it: the working tree, then the branch's history (its records commit clears it).
  const blocks = ids.map(() => null);
  for (const { text } of tasksVersions((...a) => git(...a).trim(), mb, read('docs/TASKS.md'))) {
    ids.forEach((id, i) => {
      blocks[i] ??= text === null ? null : taskBlockText(text, id);
    });
    if (blocks.every(Boolean)) break;
  }

  const tracked = parseNumstat(git('diff', '--numstat', '-z', mb));
  const untracked = git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
  const diffs = splitDiff(git('diff', '--no-color', '--no-ext-diff', `--unified=${CONTEXT_LINES}`, mb));
  const stats = [...tracked];
  for (const file of untracked) {
    // `git diff --no-index` exits 1 when the files differ, so it is run without throwing.
    const r = spawnSync('git', ['diff', '--no-index', '--no-color', '--no-ext-diff', `--unified=${CONTEXT_LINES}`, '--', '/dev/null', file], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const one = splitDiff(r.stdout ?? '');
    const text = one.get(file) ?? null;
    const binary = text !== null && /^Binary files /m.test(text);
    stats.push({ file, added: text && !binary ? text.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length : 0, deleted: 0, binary });
    if (text) diffs.set(file, text);
  }
  stats.sort((a, b) => a.file.localeCompare(b.file));

  let bytes = 0;
  const files = stats.map((s) => {
    const leftOut = leftOutReason(s.file);
    const diff = leftOut || s.binary ? null : diffs.get(s.file) ?? null;
    if (diff && bytes + diff.length > MAX_DIFF_BYTES) return { ...s, diff: null, leftOut: `over the packet's ${MAX_DIFF_BYTES / 1024} KB` };
    if (diff) bytes += diff.length;
    return { ...s, diff, leftOut };
  });

  const contractLine = blocks.map((b) => /^contract:\s*(.*)$/m.exec(b ?? '')?.[1] ?? '').join(', ');
  const entries = contractEntries(read('docs/ARCHITECTURE.md'));
  const contracts = contractsForDiff(entries, stats.map((s) => s.file), contractLine);

  const qaText = read(QA_REPORT);
  const qaFirst = qaText?.split('\n')[0] ?? '';
  const qa = qaText && ids.some((id) => new RegExp(`\\b${id}\\b`).test(qaFirst)) ? qaText : null;

  const baseName = `${base}@${mb.slice(0, 7)}`;
  const text = assemblePacket({ ids, head, base: baseName, blocks, report, contracts, contractCount: entries.length, qa, files, diffCommand: `\`git diff ${mb.slice(0, 7)} -- <file>\`` });
  const out = join(root, PACKET);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  return PACKET;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const reportPath = join(ROOT, 'pipeline', 'out', 'gate-report.json');
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  const ids = args.includes('--task') ? parseTaskList(value('--task', '')) : parseTaskList(report?.task ?? '');
  console.log(`review packet in ${writePacket({ ids, base: value('--base', 'origin/main'), report })}`);
}
