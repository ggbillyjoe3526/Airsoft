/**
 * The bot balance report (token plan item 22): the figures the `balance` project's tests measure (src/ai/balance/,
 * who wins, who lands the first hit, how often the squad gets out of Extraction), each judged against its band and
 * its standard error. It never fails a build: a figure outside its band is a finding for the bug pass
 * (docs/PROCESS.md › Bug pass). Pure functions over vitest's JSON report, so balanceReport.test.mjs tests them;
 * pipeline/balance.mjs runs the measures and writes the report.
 */

/** The verdicts, most urgent first (the report's order). */
export const VERDICTS = ['did not run', 'outside', 'outside, within noise', 'near an edge', 'in band'];
/** Past its band by fewer standard errors than this, a figure is called noise: re-measure on more seeds first. */
export const NOISE_SE = 2;

/**
 * Every measure in a vitest JSON report, in file order: `{ file, test, label, value, of?, band, se?, unit?, detail? }`.
 * A balance test hands its measures to the report in its task's meta (src/ai/balance/balanceSupport.ts › reportMeasure).
 */
export function measuresFrom(data, root = '') {
  const out = [];
  const prefix = root ? `${String(root).replace(/\\/g, '/').replace(/\/$/, '')}/` : '';
  for (const file of data?.testResults ?? []) {
    const name = String(file.name ?? '').replace(/\\/g, '/');
    const path = prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name;
    for (const t of file.assertionResults ?? []) {
      for (const m of t.meta?.balance ?? []) out.push({ file: path, test: t.fullName, ...m });
    }
  }
  return out;
}

/** The balance tests that failed or did not load: `{ file, test, message }` (their figures are missing from the report). */
export function measuresNotRun(data, root = '') {
  const out = [];
  const prefix = root ? `${String(root).replace(/\\/g, '/').replace(/\/$/, '')}/` : '';
  for (const file of data?.testResults ?? []) {
    const name = String(file.name ?? '').replace(/\\/g, '/');
    const path = prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name;
    const failed = (file.assertionResults ?? []).filter((t) => t.status === 'failed');
    for (const t of failed) out.push({ file: path, test: t.fullName, message: firstLine(t.failureMessages?.[0]) });
    if (failed.length === 0 && file.status === 'failed') out.push({ file: path, test: '(the file did not load)', message: firstLine(file.message) });
  }
  return out;
}

const firstLine = (text) => String(text ?? '').replace(/\x1b\[[0-9;]*m/g, '').split('\n').find((l) => l.trim() !== '')?.trim() ?? '';

/** One standard error of a measure: its own `se`, else a share's (√(p(1−p)/n) over its `of`), else null. */
export function standardError(m) {
  if (typeof m.se === 'number') return m.se;
  if (typeof m.of === 'number' && m.of > 0 && Number.isFinite(m.value)) return Math.sqrt((m.value * (1 - m.value)) / m.of);
  return null;
}

/**
 * A measure's verdict: `in band`; `near an edge` (inside, but within one standard error of an edge); `outside, within
 * noise` (past an edge by less than NOISE_SE standard errors: re-measure on more seeds before acting); `outside`
 * (further, or with no standard error to judge by); `did not run` (no figure, e.g. a share of no rounds).
 */
export function judge(m) {
  const se = standardError(m);
  if (!Number.isFinite(m.value)) return { verdict: 'did not run', se };
  const { min, max } = m.band ?? {};
  const past = Math.max(min !== undefined ? min - m.value : 0, max !== undefined ? m.value - max : 0);
  if (past > 0) return { verdict: se !== null && past < NOISE_SE * se ? 'outside, within noise' : 'outside', se };
  const room = Math.min(min !== undefined ? m.value - min : Infinity, max !== undefined ? max - m.value : Infinity);
  return { verdict: se !== null && room < se ? 'near an edge' : 'in band', se };
}

/** `unit` of a share and its standard error: `%` (a share), `points` (a difference of two shares), else a plain number. */
const isPercent = (m) => m.unit === undefined ? typeof m.of === 'number' : m.unit === '%' || m.unit === 'points';
const pct = (v) => `${(100 * v).toFixed(1)}`;
const num = (v) => String(Number(v.toPrecision(3)));

/** A figure as the report shows it: `49.5 %`, `−1.2 points`, `43 FC a minute`, `1.02×`. */
export function formatValue(m) {
  if (!Number.isFinite(m.value)) return '–';
  if (m.unit === 'points') return `${m.value < 0 ? '−' : '+'}${pct(Math.abs(m.value))} points`;
  if (isPercent(m)) return `${pct(m.value)} %`;
  return m.unit === '×' ? `${num(m.value)}×` : `${num(m.value)}${m.unit ? ` ${m.unit}` : ''}`;
}

/** A band as the report shows it: `40–60 %`, `≤ 10 %`, `≥ 0 points`, `20–60 FC a minute`. */
export function formatBand(m) {
  const { min, max } = m.band ?? {};
  const show = (v) => (isPercent(m) ? pct(v).replace(/\.0$/, '') : num(v));
  const unit = isPercent(m) ? (m.unit === 'points' ? ' points' : ' %') : m.unit === '×' ? '×' : m.unit ? ` ${m.unit}` : '';
  if (min !== undefined && max !== undefined) return `${show(min)}–${show(max)}${unit}`;
  if (max !== undefined) return `≤ ${show(max)}${unit}`;
  if (min !== undefined) return `≥ ${show(min)}${unit}`;
  return '–';
}

/** The report's rows: each measure with its verdict, most urgent first, file order within a verdict. */
export function judgeAll(measures) {
  return measures
    .map((m, i) => ({ ...m, ...judge(m), order: i }))
    .sort((a, b) => VERDICTS.indexOf(a.verdict) - VERDICTS.indexOf(b.verdict) || a.order - b.order)
    .map(({ order, ...row }) => row);
}

const cell = (value) => String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();

/** The verdict counts a report's first line and the runner's summary give. */
export function tally(rows) {
  const count = (v) => rows.filter((r) => r.verdict === v).length;
  return { figures: rows.length, outside: count('outside'), noise: count('outside, within noise'), near: count('near an edge'), inBand: count('in band'), missing: count('did not run') };
}

/** The runner's one-line summary. */
export function summaryLine(rows, notRun = []) {
  const t = tally(rows);
  const failed = notRun.length > 0 ? `, ${notRun.length} measure${notRun.length > 1 ? 's' : ''} did not run` : '';
  return `${t.figures} figures: ${t.outside} outside their band, ${t.noise} outside but within noise, ${t.near} near an edge, ${t.inBand} in band${failed}`;
}

/**
 * The report as Markdown: a header naming the commit and when, the table of figures (most urgent first) and the
 * measures that did not run, with their first error line.
 */
export function reportMarkdown(rows, { commit = '?', when = '', filters = [], notRun = [] } = {}) {
  const lines = [
    '# Balance report',
    '',
    `Measured ${when} on \`${commit}\`${filters.length > 0 ? `, only the measures matching ${filters.map((f) => `\`${f}\``).join(', ')}` : ''}. ${summaryLine(rows, notRun)}.`,
    '',
    'A figure **outside** its band by two standard errors or more is a balance issue for the bug pass. One **outside, within',
    'noise** is re-measured on more seeds before anyone acts on it, and one **near an edge** is one to watch',
    '(`docs/PROCESS.md` › Bug pass). Nothing here fails a build.',
    '',
    '| Figure | Measured | Target | Verdict | Source |',
    '|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const se = r.se !== null && r.se !== undefined && Number.isFinite(r.value) ? ` ±${isPercent(r) ? pct(r.se) : num(r.se)}` : '';
    const detail = r.detail ? ` (${r.detail})` : '';
    lines.push(`| ${cell(r.label)} | ${cell(`${formatValue(r)}${se}${detail}`)} | ${cell(formatBand(r))} | ${cell(r.verdict)} | ${cell(r.file)} |`);
  }
  if (notRun.length > 0) {
    lines.push('', '## Measures that did not run', '');
    for (const n of notRun) lines.push(`- \`${n.file}\` › ${n.test}: ${n.message || 'no message'}`);
  }
  return `${lines.join('\n')}\n`;
}
