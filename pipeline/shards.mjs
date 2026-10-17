#!/usr/bin/env node
/**
 * Balanced shares of the slow bot-match guards for CI's `slow` jobs (DX4). Vitest's own `--shard` cuts the files by a
 * hash of their paths into equal counts, so one share drew 290 s of guards and another 69 s; here each file carries its
 * measured seconds (`pipeline/slow-times.json`) and the files are dealt longest first to the lightest share, which
 * every job computes the same way from the same table. A file the table doesn't know weighs the table's median.
 *
 *   node pipeline/shards.mjs --from <vitest json report>    rewrites slow-times.json from a run of the slow project
 *
 * Refresh the table when the slow jobs' times drift a minute or more apart: `npx vitest run --project slow
 * --reporter=json --outputFile=pipeline/out/slow.json`, then the command above.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const TIMES_PATH = join(ROOT, 'pipeline', 'slow-times.json');

/** The middle of the known weights (the weight of a file the table doesn't name); 1 when the table is empty. */
function median(values) {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Share `index` (1-based) of `count` of `files` (repository paths), balanced by `weights` (path → seconds): files are
 * taken heaviest first (ties by path, so every job agrees) and each goes to the share with the least weight so far
 * (ties to the lower share). Every file lands in exactly one share; a share may be empty when there are fewer files
 * than shares.
 */
export function balancedShare(files, weights, index, count) {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(index) || index < 1 || index > count) {
    throw new Error(`shards: share ${index} of ${count} is not a share`);
  }
  const fallback = median(Object.values(weights));
  const weightOf = (f) => (typeof weights[f] === 'number' ? weights[f] : fallback);
  const ordered = [...new Set(files)].sort((a, b) => weightOf(b) - weightOf(a) || (a < b ? -1 : a > b ? 1 : 0));
  const loads = new Array(count).fill(0);
  const shares = Array.from({ length: count }, () => []);
  for (const f of ordered) {
    let lightest = 0;
    for (let s = 1; s < count; s++) if (loads[s] < loads[lightest]) lightest = s;
    loads[lightest] += weightOf(f);
    shares[lightest].push(f);
  }
  return shares[index - 1].sort();
}

/** The table from a vitest JSON report: each test file's seconds, rounded, keyed by its repository path. */
export function timesFromReport(report, root = ROOT) {
  const times = {};
  for (const file of report.testResults ?? []) {
    const path = relative(root, file.name).split('\\').join('/');
    times[path] = Math.max(1, Math.round((file.endTime - file.startTime) / 1000));
  }
  return Object.fromEntries(Object.entries(times).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** The committed table, or an empty one (every file then weighs the same and the shares split by count). */
export function readTimes(path = TIMES_PATH) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : null;
  if (!from) {
    console.error('shards: node pipeline/shards.mjs --from <vitest json report of the slow project>');
    process.exit(2);
  }
  const times = timesFromReport(JSON.parse(readFileSync(from, 'utf8')));
  writeFileSync(TIMES_PATH, `${JSON.stringify(times, null, 2)}\n`);
  console.log(`shards: ${Object.keys(times).length} files, ${Object.values(times).reduce((a, b) => a + b, 0)} s, written to pipeline/slow-times.json`);
}
