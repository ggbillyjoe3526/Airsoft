#!/usr/bin/env node
/**
 * Per-task records (token-efficiency plan, items 3 and 4; docs/records/README.md): each task keeps its review line,
 * its attempt rows, its own decisions and the known issues it left in one file, `docs/records/<id>.md`, instead of
 * appending to shared tables. This module reads and checks those files and prints the index tables built from them;
 * `metricsRow` is the attempt row the gate (pipeline/gate.mjs) writes from its own report.
 *
 *   node pipeline/records.mjs [--metrics | --decisions | --issues | --check]
 *
 * With no flag it prints the review index (one line per task). --metrics prints every attempt row with a Task column,
 * --decisions and --issues every record's lines of that kind, --check exits 1 when a record breaks the format.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const RECORDS_DIR = join(ROOT, 'docs', 'records');

/** The attempt table's columns, in order (docs/records/README.md); the archived METRICS.md had these plus Task. */
export const ATTEMPT_COLUMNS = ['Date', 'Attempt', 'Worker model', 'build', 'tests', 'smoke', 'perf', 'scope', 'changelog', 'Critic', 'Retry reason', 'Wall time', 'Worker tokens'];
/** The gates in the order the attempt table shows them. */
const GATES = ['build', 'tests', 'smoke', 'perf', 'scope', 'changelog'];
/** Longest reason a gate cell carries, and longest note on a review line (item 4: fixed short formats). */
const CELL_REASON_MAX = 60;
export const REVIEW_NOTE_MAX = 80;
/** A task id as the pipeline writes them (pipeline/scope.mjs): M27, M29a, FA11a, BP1, TE2. */
const TASK_ID = /^[A-Z]{1,3}\d+[a-z]?$/;
/** `**Review:** 2 attempts · 8/8 · Accept (Opus)`, optionally ` · <short note>`. */
const REVIEW = /^\*\*Review:\*\* (\d+) attempts? · (\d\/8|trivial) · (Accept|Auto-accept|Escalated) \(([^)]+)\)(?: · (.+))?$/;
const SECTIONS = ['Attempts', 'Decisions', 'Known issues left'];

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
/** A value made safe for one table cell: one line, no column breaks. */
const cell = (value) => String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
const splitRow = (line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());

/**
 * One gate's cell in the attempt table: `✓ 18 s` when it passed (`✓ 95 s (fast)` for tests run without the slow
 * project), `✗ 64 s (why)` when it failed, `– not required` when it
 * was skipped (the reason up to its first bracket), `–` when the report has no such gate.
 */
export function gateCell(gate) {
  if (!gate) return '–';
  const secs = typeof gate.ms === 'number' ? ` ${Math.round(gate.ms / 1000)} s` : '';
  // A tests gate that left the slow guards to CI says so (token plan item 21).
  if (gate.pass === true) return `✓${secs}${gate.projects === 'fast' ? ' (fast)' : ''}`;
  if (gate.pass === false) {
    const failures = gate.failures ?? [];
    const first = failures[0] ? String(failures[0].test ?? failures[0].title ?? failures[0].message ?? '') : '';
    const why = gate.reason ?? (failures.length > 1 ? `${failures.length} failed: ${first}` : first);
    return `✗${secs}${why ? ` (${clip(cell(why), CELL_REASON_MAX)})` : ''}`;
  }
  const reason = String(gate.reason ?? '').split(' (')[0].trim();
  return reason ? `– ${reason}` : '–';
}

/**
 * The attempt row for `report` (pipeline/out/gate-report.json): the date and the six gate cells from the report, the
 * rest from `extra` ({ attempt, model, critic, retry, wall, tokens }); a cell the gate can't know stays `?` for the
 * thread to fill in when it writes the record.
 */
export function metricsRow(report, extra = {}) {
  const date = String(report.when ?? '').slice(0, 10) || '?';
  const known = (key) => (extra[key] === undefined || extra[key] === null || extra[key] === '' ? '?' : cell(extra[key]));
  const cells = [date, known('attempt'), known('model'), ...GATES.map((g) => gateCell(report.gates?.[g])), known('critic'), known('retry'), known('wall'), known('tokens')];
  return `| ${cells.join(' | ')} |`;
}

/** The header and separator rows of the attempt table. */
export function attemptTableHeader() {
  return `| ${ATTEMPT_COLUMNS.join(' | ')} |\n|${ATTEMPT_COLUMNS.map(() => '---').join('|')}|`;
}

/**
 * A record file's parts: { id, title, review, attempts (rows, each an array of cells), decisions, issues, problems }.
 * `problems` lists every way the text breaks the format (docs/records/README.md); `file` is its name, which must be
 * `<id>.md`.
 */
export function parseRecord(text, file = null) {
  const problems = [];
  const lines = text.split('\n');
  const title = lines[0]?.match(/^# (\S+) · (.+)$/);
  const id = title?.[1] ?? null;
  if (!title) problems.push('the first line is not "# <id> · <title>"');
  else if (!TASK_ID.test(id)) problems.push(`"${id}" is not a task id`);
  if (file && id && file !== `${id}.md`) problems.push(`the file is ${file}, not ${id}.md`);

  const reviewLine = lines.find((l) => l.startsWith('**Review:**'));
  const m = reviewLine?.match(REVIEW);
  const review = m ? { attempts: Number(m[1]), score: m[2], verdict: m[3], critic: m[4], note: m[5] ?? null } : null;
  if (!reviewLine) problems.push('no "**Review:**" line');
  else if (!m) problems.push('the review line is not "**Review:** <n> attempts · <score>/8 · <verdict> (<critic>)"');
  else if (review.note && review.note.length > REVIEW_NOTE_MAX) problems.push(`the review line's note is over ${REVIEW_NOTE_MAX} characters`);

  const sections = {};
  let current = null;
  for (const line of lines) {
    const h = line.match(/^## (.+)$/);
    if (h) {
      current = h[1].trim();
      sections[current] = [];
    } else if (current) sections[current].push(line);
  }
  for (const name of SECTIONS) if (!sections[name]) problems.push(`no "## ${name}" section`);

  const tableLines = (sections.Attempts ?? []).filter((l) => l.trim().startsWith('|'));
  const attempts = [];
  if (sections.Attempts) {
    const header = tableLines[0] ? splitRow(tableLines[0]) : [];
    if (header.join('|') !== ATTEMPT_COLUMNS.join('|')) problems.push('the Attempts table does not have the standard columns');
    for (const row of tableLines.slice(2)) {
      const cells = splitRow(row);
      if (cells.length !== ATTEMPT_COLUMNS.length) problems.push(`an attempt row has ${cells.length} cells, not ${ATTEMPT_COLUMNS.length}`);
      else if (cells.includes('?')) problems.push(`attempt ${cells[1]} still has a "?" cell`);
      attempts.push(cells);
    }
    if (attempts.length === 0) problems.push('the Attempts table has no rows');
  }
  const items = (name) => (sections[name] ?? []).filter((l) => /^- /.test(l)).map((l) => l.slice(2).trim()).filter((l) => l !== 'None.');
  return { id, title: title?.[2] ?? null, review, attempts, decisions: items('Decisions'), issues: items('Known issues left'), problems };
}

/** Every record in `dir` (README.md aside), parsed, oldest first by the first attempt's date, then by id. */
export function readRecords(dir = RECORDS_DIR) {
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md');
  } catch {
    return [];
  }
  const records = files.map((file) => ({ file, ...parseRecord(readFileSync(join(dir, file), 'utf8'), file) }));
  const firstDate = (r) => r.attempts[0]?.[0] ?? '';
  return records.sort((a, b) => firstDate(a).localeCompare(firstDate(b)) || String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
}

/** The review index: one row per record (task, title, review line). */
export function reviewIndex(records) {
  const rows = records.map((r) => `| ${r.id} | ${cell(r.title)} | ${r.review ? `${r.review.attempts} · ${r.review.score} · ${r.review.verdict} (${r.review.critic})${r.review.note ? ` · ${cell(r.review.note)}` : ''}` : '?'} |`);
  return ['| Task | Title | Review |', '|---|---|---|', ...rows].join('\n');
}

/** Every attempt row of every record, with the task id as a second column (the archived METRICS.md's shape). */
export function metricsIndex(records) {
  const header = ['Date', 'Task', ...ATTEMPT_COLUMNS.slice(1)];
  const rows = records.flatMap((r) => r.attempts.map((cells) => `| ${[cells[0], r.id, ...cells.slice(1)].join(' | ')} |`));
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows].join('\n');
}

/** Every record's lines of one kind ('decisions' or 'issues'), each tagged with its task id. */
export function lineIndex(records, kind) {
  return records.flatMap((r) => r[kind].map((line) => `- ${r.id}: ${line}`)).join('\n');
}

function main(argv) {
  const records = readRecords();
  if (argv.includes('--check')) {
    const bad = records.filter((r) => r.problems.length > 0);
    for (const r of bad) for (const p of r.problems) console.error(`docs/records/${r.file}: ${p}`);
    console.log(`${records.length} records, ${bad.length} with problems`);
    return bad.length === 0 ? 0 : 1;
  }
  if (argv.includes('--metrics')) console.log(metricsIndex(records));
  else if (argv.includes('--decisions')) console.log(lineIndex(records, 'decisions') || 'No decisions in the records.');
  else if (argv.includes('--issues')) console.log(lineIndex(records, 'issues') || 'No known issues in the records.');
  else console.log(reviewIndex(records));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
