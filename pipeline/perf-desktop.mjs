#!/usr/bin/env node
/**
 * The desktop suite (PF3's baseline; pipeline/README.md › The desktop run): every run `perfDesktop.mjs` DESKTOP_SUITE
 * lists, one after another through perf-run.mjs `--env desktop` (frames past the screen's refresh), then a summary to
 * send back, printed and written to pipeline/out/perf-desktop-summary.md. The baselines land in pipeline/baseline/desktop*.json.
 *
 *   node pipeline/perf-desktop.mjs [--channel chrome|msedge] [--chromium /path] [--port 4181]   (npm run perf:desktop)
 *
 * Any argument is passed on to every run. A run that fails is a row saying so; the suite goes on.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESKTOP_SUITE, runPresets, suiteArgs, summaryMarkdown } from './perfDesktop.mjs';
import { runFileName } from './perfMatrix.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'pipeline', 'out');
const passOn = process.argv.slice(2);
const started = new Date();

const rows = [];
DESKTOP_SUITE.forEach((run, i) => {
  console.log(`\nperf-desktop: run ${i + 1} of ${DESKTOP_SUITE.length}: ${run.map} ${run.mode} ${run.preset} on ${run.backend} at ${run.viewport}`);
  const runStarted = new Date();
  // The bundle is built (or found up to date) by the first run only.
  spawnSync(process.execPath, [join(ROOT, 'pipeline', 'perf-run.mjs'), ...suiteArgs(run), ...(i > 0 ? ['--no-build'] : []), ...passOn], { cwd: ROOT, stdio: 'inherit' });
  for (const preset of runPresets(run)) {
    const file = join(OUT, runFileName('desktop', { ...run, preset }));
    const result = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    // A file from before this run is not its own (the 1080p run's file has 4K Depot Ultra's name).
    rows.push({ run, preset, result: result && new Date(result.when) >= runStarted ? result : null });
  }
});

const summary = summaryMarkdown(rows, started.toISOString());
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'perf-desktop-summary.md'), summary);
console.log(`\n${summary}\nperf-desktop: written to pipeline/out/perf-desktop-summary.md; send it with pipeline/baseline/desktop*.json`);
process.exit(rows.every((r) => r.result && r.result.errors.length === 0) ? 0 : 1);
