import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baselineFileName, baselineLag, baselineLagWarning, budgetFor, frameTimesGatedFor, isPerfPath, judgeRun, perfScope, perfTag, rendererTag, runFileName, runName, selectPerfRuns } from './perfMatrix.mjs';

const budgets = JSON.parse(readFileSync('pipeline/perf-budget.json', 'utf8'));
const matrix = budgets.matrix;
const names = (files, opts) => selectPerfRuns(files, matrix, opts).map(runName);
/** A list of WebGL combination names, then the same on WebGPU (the matrix lists the WebGL ones first). */
const both = (list) => [...list, ...list.map((n) => `${n} webgpu`)];
const webglRuns = matrix.filter((run) => (run.backend ?? 'webgl') === 'webgl');

describe('the perf gate\'s matrix (perf-budget.json, M76, audit CORE-03)', () => {
  it('holds every map in both modes on Low and Extraction on Medium on the big maps', () => {
    expect(webglRuns.map(runName).sort()).toEqual([
      'depot elimination low', 'depot extraction low',
      'neon elimination low', 'neon extraction low', 'neon extraction medium',
      'woodland elimination low', 'woodland extraction low', 'woodland extraction medium',
    ]);
  });

  it('runs the same eight combinations on WebGPU, after the WebGL ones (WebGPU overhaul W6)', () => {
    const gpu = matrix.filter((run) => run.backend === 'webgpu');
    expect(gpu.map(({ map, mode, preset }) => ({ map, mode, preset }))).toEqual(webglRuns.map(({ map, mode, preset }) => ({ map, mode, preset })));
    expect(matrix.map((run) => run.backend ?? 'webgl')).toEqual([...webglRuns.map(() => 'webgl'), ...gpu.map(() => 'webgpu')]);
    expect(matrix.map(runName)).toEqual(both(webglRuns.map(runName)));
  });

  it('has a committed container baseline for every combination, recorded on that map, mode and preset', () => {
    for (const run of webglRuns) {
      const path = join('pipeline', 'baseline', baselineFileName('container', run, budgets.budgetPreset));
      expect(existsSync(path), path).toBe(true);
      const baseline = JSON.parse(readFileSync(path, 'utf8'));
      expect([baseline.env, baseline.map, baseline.mode, baseline.preset], path).toEqual(['container', run.map, run.mode, run.preset]);
      expect(baseline.head, path).toMatch(/^[0-9a-f]{40}$/);
      expect(baseline.errors, path).toEqual([]);
      // Each baseline sits within its own budget, so the gate starts green.
      for (const [metric, limit] of Object.entries(budgetFor(budgets, run.map, run.preset))) {
        if (budgets.frameTimeGatedEnvs.includes('container') || !['p95Ms', 'p99Ms'].includes(metric)) expect(baseline.metrics[metric], `${path} ${metric}`).toBeLessThanOrEqual(limit);
      }
    }
  });
});

describe('which combinations a diff runs (pipeline/perfMatrix.mjs)', () => {
  it('runs nothing for a diff without a perf path, nor for tests and docs under one', () => {
    expect(names(['docs/TASKS.md', 'src/ui/hud.ts', 'pipeline/gate.mjs', 'README.md'])).toEqual([]);
    expect(names(['src/render/light/lighting.test.ts', 'src/ai/botBrain.test.ts', 'pipeline/perfMatrix.test.mjs'])).toEqual([]);
    // Test support and the balance figures (TE4) ship nothing either; a production file beside them still counts.
    expect(names(['src/ai/depotMatchSupport.ts', 'src/ai/extractionRunSupport.ts', 'src/sim/testSupport.ts', 'src/ai/balance/depotPro.balance.ts', 'src/ai/balance/balanceSupport.ts'])).toEqual([]);
    expect(isPerfPath('src/ai/botBrain.ts')).toBe(true);
    expect(isPerfPath('src/ai/extractionRoles.ts')).toBe(true);
    expect(names(['src/render/README.md', 'src/ui/menus/README.md', 'src/assets/models/characters/README.md'])).toEqual([]);
  });

  it('runs the whole matrix for a shared perf path, config and pool included (CORE-03)', () => {
    for (const file of ['src/render/light/lighting.ts', 'src/sim/bbs.ts', 'src/config/graphics.ts', 'src/pool/pool.ts', 'src/map/maps.ts', 'vite.config.ts', 'src/core/loop.ts']) {
      expect(isPerfPath(file), file).toBe(true);
      expect(names([file]), file).toEqual(matrix.map(runName));
    }
  });

  it('runs only a map\'s combinations for that map\'s own files', () => {
    expect(names(['src/map/woodland.ts'])).toEqual(both(['woodland elimination low', 'woodland extraction low', 'woodland extraction medium']));
    expect(names(['src/map/depot.ts'])).toEqual(both(['depot elimination low', 'depot extraction low']));
    expect(names(['src/render/field/mapPieces/cityProps.ts', 'src/map/neonHeights.ts'])).toEqual(both(['neon elimination low', 'neon extraction low', 'neon extraction medium']));
  });

  it('runs a map\'s Extraction combinations for its Extraction data, and every map\'s for Extraction\'s own code', () => {
    expect(names(['src/map/woodlandExtraction.ts'])).toEqual(both(['woodland extraction low', 'woodland extraction medium']));
    expect(names(['src/map/neonHeightsExtraction.ts'])).toEqual(both(['neon extraction low', 'neon extraction medium']));
    expect(names(['src/sim/extraction.ts'])).toEqual(both(['depot extraction low', 'woodland extraction low', 'neon extraction low', 'woodland extraction medium', 'neon extraction medium']));
    expect(perfScope('src/ai/extractionRoles.ts')).toEqual({ mode: 'extraction' });
    expect(perfScope('src/render/match/exitRenderer.ts')).toEqual({ mode: 'extraction' });
  });

  it('unions the scopes of several files, in the matrix\'s order', () => {
    expect(names(['src/map/depot.ts', 'src/map/woodlandExtraction.ts'])).toEqual(both(['depot elimination low', 'depot extraction low', 'woodland extraction low', 'woodland extraction medium']));
    expect(names(['src/map/depot.ts', 'src/render/renderer.ts'])).toEqual(matrix.map(runName));
  });

  it('runs the whole matrix on --env laptop, whatever changed', () => {
    expect(names([], { force: true })).toEqual(matrix.map(runName));
    expect(names(['docs/TASKS.md'], { force: true })).toEqual(matrix.map(runName));
  });
});

describe('each combination\'s files and budget', () => {
  it('names files as perf-run.mjs writes them: Depot Elimination keeps the first names', () => {
    expect(perfTag('depot', 'elimination')).toBe('');
    expect(perfTag('depot', 'extraction')).toBe('-extraction');
    expect(perfTag('neon', 'elimination')).toBe('-neon');
    expect(baselineFileName('container', { map: 'depot', mode: 'elimination', preset: 'low' }, 'low')).toBe('container.json');
    expect(baselineFileName('container', { map: 'depot', mode: 'elimination', preset: 'medium' }, 'low')).toBe('container-medium.json');
    expect(baselineFileName('container', { map: 'woodland', mode: 'extraction', preset: 'medium' }, 'low')).toBe('container-woodland-extraction-medium.json');
    expect(baselineFileName('laptop', { map: 'neon', mode: 'elimination', preset: 'low' }, 'low')).toBe('laptop-neon.json');
    expect(runFileName('container', { map: 'depot', mode: 'elimination', preset: 'low' })).toBe('perf-container-low.json');
    expect(runFileName('container', { map: 'neon', mode: 'extraction', preset: 'medium' })).toBe('perf-container-neon-extraction-medium.json');
    // A run the node renderer drew (W1, its result's backend) is named apart; WebGL's names stay what the gate reads.
    expect(rendererTag(undefined)).toBe('');
    expect(rendererTag('webgl')).toBe('');
    expect(runFileName('container', { backend: 'webgl', map: 'depot', mode: 'elimination', preset: 'low' })).toBe('perf-container-low.json');
    expect(runFileName('container', { backend: 'webgpu', map: 'depot', mode: 'elimination', preset: 'low' })).toBe('perf-container-webgpu-low.json');
    expect(rendererTag('webgpu')).toBe('-webgpu');
    // Names carry the back end only when it is not WebGL, so the existing names stay.
    expect(runName({ map: 'woodland', mode: 'extraction', preset: 'medium' })).toBe('woodland extraction medium');
    expect(runName({ map: 'woodland', mode: 'extraction', preset: 'medium', backend: 'webgl' })).toBe('woodland extraction medium');
    expect(runName({ map: 'woodland', mode: 'extraction', preset: 'medium', backend: 'webgpu' })).toBe('woodland extraction medium webgpu');
    expect(runFileName('laptop', { backend: 'webgpu', map: 'neon', mode: 'extraction', preset: 'high' })).toBe('perf-laptop-webgpu-neon-extraction-high.json');
    expect(baselineFileName('laptop', { backend: 'webgpu', map: 'depot', mode: 'elimination', preset: 'low' }, 'low')).toBe('laptop-webgpu.json');
    expect(baselineFileName('laptop', { backend: 'webgpu', map: 'woodland', mode: 'elimination', preset: 'ultra' }, 'low')).toBe('laptop-webgpu-woodland-ultra.json');
  });

  it('lays a map\'s own lines over its preset\'s (owner decision 4: map-scoped Medium budgets)', () => {
    const b = { presets: { low: { drawCalls: 100, triangles: 150000 }, medium: { drawCalls: 120, triangles: 200000 } }, maps: { neon: { medium: { drawCalls: 130 } } } };
    expect(budgetFor(b, 'neon', 'medium')).toEqual({ drawCalls: 130, triangles: 200000 });
    expect(budgetFor(b, 'neon', 'low')).toEqual({ drawCalls: 100, triangles: 150000 });
    expect(budgetFor(b, 'depot', 'medium')).toEqual({ drawCalls: 120, triangles: 200000 });
    expect(budgetFor(b, 'depot', 'ultra')).toEqual({});
    // The back end's lines come last: its presets' lines over the map's, its maps' lines over those (W6).
    const g = { ...b, backends: { webgpu: { presets: { medium: { triangles: 250000 } }, maps: { neon: { medium: { drawCalls: 150 } } } } } };
    expect(budgetFor(g, 'neon', 'medium')).toEqual({ drawCalls: 130, triangles: 200000 });
    expect(budgetFor(g, 'neon', 'medium', 'webgl')).toEqual({ drawCalls: 130, triangles: 200000 });
    expect(budgetFor(g, 'neon', 'medium', 'webgpu')).toEqual({ drawCalls: 150, triangles: 250000 });
    expect(budgetFor(g, 'depot', 'medium', 'webgpu')).toEqual({ drawCalls: 120, triangles: 250000 });
    expect(budgetFor(g, 'neon', 'low', 'webgpu')).toEqual({ drawCalls: 100, triangles: 150000 });
    // The real file scopes Medium for both big maps.
    expect(Object.keys(budgets.maps.woodland.medium).length).toBeGreaterThan(0);
    expect(Object.keys(budgets.maps.neon.medium).length).toBeGreaterThan(0);
  });
});

describe('judging one run against its budget and baseline', () => {
  const run = { map: 'neon', mode: 'extraction', preset: 'medium' };
  const budget = budgetFor(budgets, 'neon', 'medium');
  const baseline = { map: 'neon', mode: 'extraction', preset: 'medium', metrics: { drawCalls: 111, triangles: 122000, gpuMemoryMB: 56, p95Ms: 8000 } };
  const judge = (metrics, opts = {}) => judgeRun({ run, metrics, budget, baseline, baselineName: 'container-neon-extraction-medium.json', frameTimesGated: false, ...opts });

  it('passes the recorded numbers, and holds Neon Heights to its own Medium line (145), not the preset\'s 120', () => {
    expect(judge({ drawCalls: 111, triangles: 122000, gpuMemoryMB: 56 })).toEqual({ over: [], worse: [] });
    // 140 calls is over the preset's 120 but within Neon Heights' 145 (the 10 % check against 111 is the next test's).
    expect(judge({ drawCalls: 140, triangles: 122000, gpuMemoryMB: 56 }).over).toEqual([]);
    expect(judge({ drawCalls: 146, triangles: 122000, gpuMemoryMB: 56 }).over).toEqual([{ metric: 'drawCalls', limit: 145, now: 146 }]);
  });

  it('fails a metric more than 10 % over its baseline, not one within it', () => {
    expect(judge({ drawCalls: 122, triangles: 122000, gpuMemoryMB: 56 }).worse).toEqual([]);
    expect(judge({ drawCalls: 123, triangles: 122000, gpuMemoryMB: 56 }).worse).toEqual([{ metric: 'drawCalls', baseline: 111, now: 123, pct: 11 }]);
  });

  it('judges frame times only where they are gated (the laptop)', () => {
    expect(judge({ drawCalls: 111, triangles: 122000, gpuMemoryMB: 56, p95Ms: 9000 })).toEqual({ over: [], worse: [] });
    const gated = judge({ drawCalls: 111, triangles: 122000, gpuMemoryMB: 56, p95Ms: 9000 }, { frameTimesGated: true });
    expect(gated.over.map((o) => o.metric)).toEqual(['p95Ms']);
    expect(gated.worse.map((w) => w.metric)).toEqual(['p95Ms']);
  });

  it('skips the relative check without a baseline, or with one of another combination (a pre-M48 file is Depot Elimination)', () => {
    expect(judge({ drawCalls: 200 }, { baseline: null }).note).toContain('no baseline');
    expect(judge({ drawCalls: 200 }, { baseline: null }).worse).toEqual([]);
    const old = judge({ drawCalls: 200 }, { baseline: { preset: 'medium', metrics: { drawCalls: 50 } } });
    expect(old.note).toContain('is depot elimination medium, not neon extraction medium');
    expect(old.worse).toEqual([]);
  });
});

describe('a baseline\'s age (CORE-12: a warning, never a failure)', () => {
  const head = 'a'.repeat(40);

  it('counts the commits since the baseline\'s head, or null when the head is unknown here', () => {
    expect(baselineLag(head, () => '7\n')).toBe(7);
    expect(baselineLag(head, () => { throw new Error('bad revision'); })).toBeNull();
    expect(baselineLag(undefined, () => '0')).toBeNull();
    expect(baselineLag('not a sha', () => '0')).toBeNull();
  });

  it('warns past the limit and when the head is gone, not at or under it', () => {
    expect(baselineLagWarning('container.json', head, 20, 20)).toBeNull();
    expect(baselineLagWarning('container.json', head, 0, 20)).toBeNull();
    expect(baselineLagWarning('container.json', head, 21, 20)).toContain('21 commits behind HEAD');
    expect(baselineLagWarning('container.json', head, null, 20)).toContain('not in this clone\'s history');
    expect(budgets.baselineMaxLag).toBe(20);
  });
});

describe('the desktop\'s Ultra line (PF3)', () => {
  it('adds an environment\'s lines over every other, only in that environment', () => {
    const b = { presets: { ultra: { p95Ms: 14, drawCalls: 150 } }, backends: { webgpu: { presets: { ultra: { drawCalls: 160 } } } }, envs: { desktop: { ultra: { p95Ms: 4.2 } } } };
    expect(budgetFor(b, 'depot', 'ultra', 'webgpu', 'desktop')).toEqual({ p95Ms: 4.2, drawCalls: 160 });
    const both = { presets: { ultra: { p95Ms: 14 } }, envs: { desktop: { ultra: { p95Ms: 6.5 }, backends: { webgl: { ultra: { p95Ms: 7.2 } } } } } };
    expect(budgetFor(both, 'depot', 'ultra', 'webgl', 'desktop')).toEqual({ p95Ms: 7.2 });
    expect(budgetFor(both, 'depot', 'ultra', 'webgpu', 'desktop')).toEqual({ p95Ms: 6.5 });
    expect(budgetFor(both, 'depot', 'ultra', 'webgl', 'laptop')).toEqual({ p95Ms: 14 });
    expect(budgetFor(b, 'depot', 'ultra', 'webgpu', 'laptop')).toEqual({ p95Ms: 14, drawCalls: 160 });
    expect(budgetFor(b, 'depot', 'ultra', 'webgpu')).toEqual({ p95Ms: 14, drawCalls: 160 });
    expect(budgetFor(b, 'depot', 'high', 'webgl', 'desktop')).toEqual({});
  });

  it('judges frame times where the environment is listed, and on its listed presets only', () => {
    const b = { frameTimeGatedEnvs: ['laptop', 'desktop'], frameTimeGatedPresets: { desktop: ['ultra'] } };
    expect(frameTimesGatedFor(b, 'laptop', 'low')).toBe(true);
    expect(frameTimesGatedFor(b, 'desktop', 'ultra')).toBe(true);
    expect(frameTimesGatedFor(b, 'desktop', 'low')).toBe(false);
    expect(frameTimesGatedFor(b, 'container', 'ultra')).toBe(false);
    expect(frameTimesGatedFor(budgets, 'desktop', 'ultra')).toBe(true);
    expect(frameTimesGatedFor(budgets, 'desktop', 'medium')).toBe(false);
    expect(frameTimesGatedFor(budgets, 'container', 'low')).toBe(false);
  });
});
