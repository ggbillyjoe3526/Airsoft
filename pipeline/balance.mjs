#!/usr/bin/env node
/**
 * The bot balance report (token plan item 22): runs the `balance` project's measures (src/ai/balance/*.balance.ts,
 * headless bot matches on every map and mode) and writes pipeline/out/balance-report.md (and .json), each figure
 * judged against its band (pipeline/balanceReport.mjs). On demand only: the gate, CI and `vitest run` never run it,
 * and it exits 0 whatever the figures say. It exits 1 only when a measure could not run.
 *
 *   node pipeline/balance.mjs [filter …]     e.g. `node pipeline/balance.mjs woodland` (vitest's file-name filters)
 *
 * The whole set is long (see pipeline/README.md); a task that changes one map's or mode's balance runs its filter.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeAll, measuresFrom, measuresNotRun, reportMarkdown, summaryLine } from './balanceReport.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'pipeline', 'out');
const ARTIFACTS = join(OUT, 'qa-artifacts');
const JSON_REPORT = join(ARTIFACTS, 'balance-vitest.json');
const REPORT = join(OUT, 'balance-report.md');

const filters = process.argv.slice(2);
mkdirSync(ARTIFACTS, { recursive: true });

const started = Date.now();
// AIRSOFT_BALANCE adds the `balance` project to vite.config.ts, which `vitest run` otherwise never sees.
const r = spawnSync('npx', ['vitest', 'run', '--project', 'balance', '--reporter=json', `--outputFile=${JSON_REPORT}`, ...filters], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, AIRSOFT_BALANCE: '1' },
  shell: process.platform === 'win32',
  maxBuffer: 64 * 1024 * 1024,
});
writeFileSync(join(ARTIFACTS, 'balance.log'), `${r.stdout ?? ''}\n${r.stderr ?? ''}`);

let data;
try {
  data = JSON.parse(readFileSync(JSON_REPORT, 'utf8'));
} catch (e) {
  console.error(`balance: no readable vitest report (${e.message}); the log is ${relative(ROOT, join(ARTIFACTS, 'balance.log'))}`);
  process.exit(1);
}

const rows = judgeAll(measuresFrom(data, ROOT));
const notRun = measuresNotRun(data, ROOT);
let commit = '?';
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  // Not a git checkout: the report says `?`.
}
const when = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
writeFileSync(REPORT, reportMarkdown(rows, { commit, when, filters, notRun }));
writeFileSync(join(OUT, 'balance-report.json'), `${JSON.stringify({ commit, when, filters, rows, notRun }, null, 2)}\n`);

console.log(`balance: ${summaryLine(rows, notRun)} (${Math.round((Date.now() - started) / 1000)} s) · ${relative(ROOT, REPORT)}`);
for (const row of rows.filter((x) => x.verdict.startsWith('outside') || x.verdict === 'did not run')) console.log(`  ${row.verdict}: ${row.label}`);
for (const n of notRun) console.log(`  did not run: ${n.file} › ${n.test}: ${n.message}`);
process.exit(notRun.length > 0 || rows.length === 0 ? 1 : 0);
