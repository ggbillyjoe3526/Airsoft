import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { baselineFileName } from './perfMatrix.mjs';
import { boundHint, budgetVerdict, DESKTOP_4K, DESKTOP_HD, DESKTOP_SUITE, FAILURE_CHARS, failureLine, NEEDED_PACKAGES, runPresets, suiteArgs, summaryMarkdown, UNCAPPED_ARGS, vsyncHeld } from './perfDesktop.mjs';

const budgets = JSON.parse(readFileSync('pipeline/perf-budget.json', 'utf8'));
const metrics = (fps, p50Ms, extra = {}) => ({ fps, onePercentLowFps: fps * 0.7, p50Ms, p95Ms: p50Ms * 1.2, p99Ms: p50Ms * 1.5, worstMs: p50Ms * 3, simTicksPerSecond: 60, figureMs: 0.4, drawCalls: 80, ...extra });
const result = (backend, m, gpu = 'ANGLE (NVIDIA GeForce RTX 5090)') => ({ backend, gpu, head: 'abcdef1234', metrics: m, errors: [] });
const hd = DESKTOP_SUITE.at(-1);
const depot4k = DESKTOP_SUITE[0];

describe('the desktop suite (PF3\'s baseline)', () => {
  it('runs Ultra at 4K on every map in both modes on WebGPU, Depot on every preset and once on WebGL2', () => {
    const ultra4k = DESKTOP_SUITE.filter((r) => r.viewport === DESKTOP_4K && r.backend === 'webgpu');
    const pairs = ultra4k.map((r) => `${r.map} ${r.mode}`).sort();
    const maps = [...new Set(budgets.matrix.map((r) => r.map))];
    expect(pairs).toEqual(maps.flatMap((m) => [`${m} elimination`, `${m} extraction`]).sort());
    expect(runPresets(depot4k)).toEqual(['low', 'medium', 'high', 'ultra']);
    expect(DESKTOP_SUITE.filter((r) => r.backend === 'webgl').map((r) => `${r.map} ${r.mode} ${r.preset} ${r.viewport}`)).toEqual([`depot elimination ultra ${DESKTOP_4K}`]);
  });

  it('records a baseline for every 4K run and none at 1080p, whose file would replace 4K Depot\'s', () => {
    expect(DESKTOP_SUITE.filter((r) => r.viewport === DESKTOP_4K).every((r) => r.baseline)).toBe(true);
    expect(hd).toMatchObject({ map: 'depot', mode: 'elimination', preset: 'ultra', backend: 'webgpu', viewport: DESKTOP_HD, baseline: false });
    expect(suiteArgs(hd)).not.toContain('--baseline');
    // Every baseline file is a different one.
    const files = DESKTOP_SUITE.filter((r) => r.baseline).flatMap((r) => runPresets(r).map((preset) => baselineFileName('desktop', { ...r, preset }, budgets.budgetPreset)));
    expect(new Set(files).size).toBe(files.length);
    expect(files).toContain('desktop-webgpu-ultra.json');
    expect(files).toContain('desktop-ultra.json');
  });

  it('gives perf-run.mjs the desktop env and the run\'s own options', () => {
    expect(suiteArgs(depot4k)).toEqual(['--env', 'desktop', '--map', 'depot', '--mode', 'elimination', '--preset', 'all', '--backend', 'webgpu', '--viewport', '3840x2160', '--baseline']);
  });

  it('lets frames run past the screen\'s refresh', () => {
    expect(UNCAPPED_ARGS).toEqual(['--disable-gpu-vsync', '--disable-frame-rate-limit']);
  });
});

describe('the summary\'s hints', () => {
  it('sees a median frame on a common refresh period as held by vsync', () => {
    expect(vsyncHeld(1000 / 240)).toBe(240);
    expect(vsyncHeld(16.7)).toBe(60);
    expect(vsyncHeld(2.4)).toBeNull();
    expect(vsyncHeld(5)).toBeNull();
  });

  it('calls a run GPU-bound when a quarter of the pixels runs far faster, CPU-bound when it barely helps', () => {
    expect(boundHint(200, 400)).toMatch(/^GPU-bound/);
    expect(boundHint(200, 210)).toMatch(/^CPU-bound/);
    expect(boundHint(200, 260)).toMatch(/^Mixed/);
    expect(boundHint(undefined, 400)).toBeNull();
  });

  it('writes a row per preset, marks the 240 Hz line and gives the hint from Depot at 4K and 1080p', () => {
    const rows = [
      { run: depot4k, preset: 'ultra', result: result('webgpu', metrics(300, 3.2)) },
      { run: DESKTOP_SUITE[2], preset: 'ultra', result: result('webgpu', metrics(150, 6.5)) },
      { run: DESKTOP_SUITE[3], preset: 'ultra', result: null },
      { run: hd, preset: 'ultra', result: result('webgpu', metrics(700, 1.4)) },
    ];
    const md = summaryMarkdown(rows, '2026-10-17T07:00:00Z', budgets);
    expect(md).toContain('GPU: ANGLE (NVIDIA GeForce RTX 5090)');
    expect(md).toContain('head abcdef1');
    expect(md).toMatch(/\| depot \| elimination \| webgpu \| 4K \| ultra \| 300 \| 210 \| 3\.20 \| 3\.84 \| [\d.]+ \| [\d.]+ \| ok \|/);
    expect(md).toMatch(/\| woodland \| elimination \| webgpu \| 4K \| ultra \| 150 \| .* \| p95Ms 7\.8 > 6\.5, p99Ms 9\.75 > 9 \|/);
    // At 1080p the frame times aren't judged: the line is 4K's.
    expect(md).toMatch(/\| depot \| elimination \| webgpu \| 1920x1080 \| ultra \| 700 \| .* \| ok \|/);
    expect(md).toContain('| woodland | extraction | webgpu | 4K | ultra | no result');
    expect(md).toContain('- GPU-bound at 4K: 1080p runs 2.33× as fast as 4K');
    expect(md).not.toContain('uncapped switches');
  });

  it('says when vsync held the frames, and then gives no GPU-or-CPU hint', () => {
    const rows = [
      { run: depot4k, preset: 'ultra', result: result('webgpu', metrics(240, 1000 / 240)) },
      { run: hd, preset: 'ultra', result: result('webgpu', metrics(240, 1000 / 240)) },
    ];
    const md = summaryMarkdown(rows, 'now', budgets);
    expect(md).toContain('sat on a 240 Hz screen');
    expect(md).not.toMatch(/bound/);
  });
});

describe('a failed run\'s row', () => {
  it('names the first error line of the run\'s stderr', () => {
    const stderr = 'node:internal/errors:985\n  const err = new Error(message);\n\nError: Command failed: node pipeline/build-cached.mjs --mode e2e\n    at genericNodeError\n';
    expect(failureLine(stderr)).toBe('Error: Command failed: node pipeline/build-cached.mjs --mode e2e');
    expect(failureLine('perf: asked for the webgpu back end but webgl drew; no file written\r\n')).toMatch(/^perf: asked for the webgpu/);
  });

  it('falls back to the first line that isn\'t a crash\'s noise, keeps the cell whole and short', () => {
    const launch = 'node:internal/modules/run_main:123\n    triggerUncaughtException(\n    ^\n\nbrowserType.launch: Failed to launch chromium because executable doesn\'t exist at /x\n    at /y/perf-run.mjs:163:4 {\n  log: [],\n  name: \'Error\'\n}\n\nNode.js v22.22.0\n';
    expect(failureLine(launch)).toBe('browserType.launch: Failed to launch chromium because executable doesn\'t exist at /x');
    expect(failureLine('')).toBe('no output');
    expect(failureLine(undefined)).toBe('no output');
    expect(failureLine('TypeError: a | b')).toBe('TypeError: a / b');
    expect(failureLine(`Error: ${'x'.repeat(500)}`)).toHaveLength(FAILURE_CHARS);
  });

  it('shows the error in the summary', () => {
    const md = summaryMarkdown([{ run: depot4k, preset: 'low', result: null, failure: 'Error: no adapter' }], 'now', budgets);
    expect(md).toContain('| depot | elimination | webgpu | 4K | low | no result: Error: no adapter |');
  });
});

describe('the packages the suite checks first', () => {
  it('are the build\'s and the browser\'s, each in package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const declared = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(NEEDED_PACKAGES).toEqual(['vite', 'vitest', '@playwright/test']);
    for (const name of NEEDED_PACKAGES) expect(declared[name], name).toBeTruthy();
    expect(readFileSync('vite.config.ts', 'utf8')).toContain("from 'vitest/config'");
  });
});

describe('a match that ends inside the window', () => {
  it('is named under the table with the seconds it measured', () => {
    const rows = [
      { run: DESKTOP_SUITE[5], preset: 'ultra', result: result('webgpu', metrics(180, 5.5, { matchEnded: true, seconds: 41.2 })) },
      { run: DESKTOP_SUITE[4], preset: 'ultra', result: result('webgpu', metrics(198, 5, { matchEnded: false, seconds: 60 })) },
    ];
    const md = summaryMarkdown(rows, 'now', budgets);
    expect(md).toContain('- The match ended inside the window, which then stopped at its last tick: neon extraction ultra (41 s).');
    expect(md).not.toContain('neon elimination ultra (');
  });
});

describe('the desktop\'s budget column (PF3)', () => {
  it('judges Ultra\'s frame times at 4K against envs.desktop.ultra, and not at 1080p or on High', () => {
    expect(budgets.envs.desktop.ultra).toEqual({ p95Ms: 6.5, p99Ms: 9 });
    const slow = result('webgpu', metrics(140, 6, { p95Ms: 7.1, p99Ms: 9.4 }));
    expect(budgetVerdict(budgets, depot4k, 'ultra', slow)).toBe('p95Ms 7.1 > 6.5, p99Ms 9.4 > 9');
    expect(budgetVerdict(budgets, hd, 'ultra', slow)).toBe('ok');
    expect(budgetVerdict(budgets, depot4k, 'high', slow)).toBe('ok');
    expect(budgetVerdict(budgets, depot4k, 'ultra', result('webgpu', metrics(210, 4.7, { p95Ms: 5.6, p99Ms: 6.4 })))).toBe('ok');
  });

  it('still judges the other lines on every preset', () => {
    expect(budgetVerdict(budgets, depot4k, 'low', result('webgpu', metrics(900, 1, { drawCalls: 140 })))).toBe('drawCalls 140 > 100');
  });
});
