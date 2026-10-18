#!/usr/bin/env node
/**
 * The desktop suite (PF3's baseline; pipeline/README.md › The desktop run): every run `perfDesktop.mjs` DESKTOP_SUITE
 * lists, one after another through perf-run.mjs `--env desktop` (frames past the screen's refresh), then a summary to
 * send back, printed and written to pipeline/out/perf-desktop-summary.md. The baselines land in pipeline/baseline/desktop*.json.
 *
 *   node pipeline/perf-desktop.mjs [--channel chrome|msedge] [--chromium /path] [--port 4181]   (npm run perf:desktop)
 *
 * It checks the packages it needs are installed (NEEDED_PACKAGES; a download whose `npm install` stopped early is
 * told to run it), then builds the game once (build-cached.mjs, its output shown); a failed build stops the suite. The
 * browser's arguments are passed on to every run; the suite's own (map, mode, preset, size) are refused. A run that
 * fails is a row with its error; the suite goes on.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESKTOP_SUITE, failureLine, NEEDED_PACKAGES, runPresets, suiteArgs, summaryMarkdown } from './perfDesktop.mjs';
import { runFileName } from './perfMatrix.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'pipeline', 'out');
const passOn = process.argv.slice(2);
/** The suite's own options: passed on, they would replace every run's and its files' names would stop matching. */
const OWN = ['--env', '--map', '--mode', '--preset', '--backend', '--viewport', '--baseline', '--no-build'];
const clash = passOn.filter((a) => OWN.includes(a));
if (clash.length) {
  console.error(`perf-desktop: ${clash.join(', ')} ${clash.length > 1 ? 'are' : 'is'} the suite's own; pass only the browser's (--channel, --chromium, --port, --vsync)`);
  process.exit(1);
}
const started = new Date();

// A download whose `npm install` didn't run or stopped early can't build (vitest/config is the Vite config's import).
const missing = NEEDED_PACKAGES.filter((name) => !existsSync(join(ROOT, 'node_modules', name, 'package.json')));
if (missing.length) {
  console.error(`perf-desktop: ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not installed; run \`npm install\` in this folder, then this again`);
  process.exit(1);
}

console.log('perf-desktop: building the game');
if (spawnSync(process.execPath, [join(ROOT, 'pipeline', 'build-cached.mjs'), '--mode', 'e2e'], { cwd: ROOT, stdio: 'inherit' }).status !== 0) {
  console.error('\nperf-desktop: the game\'s build failed, so nothing was measured; send the output above');
  process.exit(1);
}

const rows = [];
DESKTOP_SUITE.forEach((run, i) => {
  console.log(`\nperf-desktop: run ${i + 1} of ${DESKTOP_SUITE.length}: ${run.map} ${run.mode} ${run.preset} on ${run.backend} at ${run.viewport}`);
  const runStarted = new Date();
  // The run's errors are kept for its row, and shown as they would have been.
  const { stderr } = spawnSync(process.execPath, [join(ROOT, 'pipeline', 'perf-run.mjs'), ...suiteArgs(run), '--no-build', ...passOn], { cwd: ROOT, stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8' });
  process.stderr.write(stderr ?? '');
  for (const preset of runPresets(run)) {
    const file = join(OUT, runFileName('desktop', { ...run, preset }));
    const result = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    // A file from before this run is not its own (the 1080p run's file has 4K Depot Ultra's name).
    const own = result && new Date(result.when) >= runStarted ? result : null;
    rows.push({ run, preset, result: own, ...(own ? {} : { failure: failureLine(stderr) }) });
  }
});

const budgets = JSON.parse(readFileSync(join(ROOT, 'pipeline', 'perf-budget.json'), 'utf8'));
const summary = summaryMarkdown(rows, started.toISOString(), budgets);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'perf-desktop-summary.md'), summary);
console.log(`\n${summary}\nperf-desktop: written to pipeline/out/perf-desktop-summary.md; send it with pipeline/baseline/desktop*.json`);
process.exit(rows.every((r) => r.result && r.result.errors.length === 0) ? 0 : 1);
