import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { baselineFileName } from './perfMatrix.mjs';
import { boundHint, DESKTOP_4K, DESKTOP_HD, DESKTOP_SUITE, runPresets, suiteArgs, summaryMarkdown, UNCAPPED_ARGS, vsyncHeld } from './perfDesktop.mjs';

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
    const md = summaryMarkdown(rows, '2026-10-17T07:00:00Z');
    expect(md).toContain('GPU: ANGLE (NVIDIA GeForce RTX 5090)');
    expect(md).toContain('head abcdef1');
    expect(md).toMatch(/\| depot \| elimination \| webgpu \| 4K \| ultra \| 300 \| 210 \| 3\.20 \| 3\.84 \| .* \| yes \|/);
    expect(md).toMatch(/\| woodland \| elimination \| webgpu \| 4K \| ultra \| 150 \| .* \| no \|/);
    expect(md).toContain('| woodland | extraction | webgpu | 4K | ultra | no result');
    expect(md).toContain('- GPU-bound at 4K: 1080p runs 2.33× as fast as 4K');
    expect(md).not.toContain('uncapped switches');
  });

  it('says when vsync held the frames, and then gives no GPU-or-CPU hint', () => {
    const rows = [
      { run: depot4k, preset: 'ultra', result: result('webgpu', metrics(240, 1000 / 240)) },
      { run: hd, preset: 'ultra', result: result('webgpu', metrics(240, 1000 / 240)) },
    ];
    const md = summaryMarkdown(rows, 'now');
    expect(md).toContain('sat on a 240 Hz screen');
    expect(md).not.toMatch(/bound/);
  });
});
