import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baselineFileName, baselineLag, baselineLagWarning, budgetFor, isPerfPath, judgeRun, perfScope, perfTag, runFileName, runName, selectPerfRuns } from './perfMatrix.mjs';

const budgets = JSON.parse(readFileSync('pipeline/perf-budget.json', 'utf8'));
const matrix = budgets.matrix;
const names = (files, opts) => selectPerfRuns(files, matrix, opts).map(runName);

describe('the perf gate\'s matrix (perf-budget.json, M76, audit CORE-03)', () => {
  it('holds every map in both modes on Low and Extraction on Medium on the big maps', () => {
    expect(matrix.map(runName).sort()).toEqual([
      'depot elimination low', 'depot extraction low',
      'neon elimination low', 'neon extraction low', 'neon extraction medium',
      'woodland elimination low', 'woodland extraction low', 'woodland extraction medium',
    ]);
  });

  it('has a committed container baseline for every combination, recorded on that map, mode and preset', () => {
    for (const run of matrix) {
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
    expect(names(['src/render/lighting.test.ts', 'src/ai/botBrain.test.ts', 'pipeline/perfMatrix.test.mjs'])).toEqual([]);
  });

  it('runs the whole matrix for a shared perf path, config and pool included (CORE-03)', () => {
    for (const file of ['src/render/lighting.ts', 'src/sim/bbs.ts', 'src/config/graphics.ts', 'src/pool/pool.ts', 'src/map/maps.ts', 'vite.config.ts', 'src/core/loop.ts']) {
      expect(isPerfPath(file), file).toBe(true);
      expect(names([file]), file).toEqual(matrix.map(runName));
    }
  });

  it('runs only a map\'s combinations for that map\'s own files', () => {
    expect(names(['src/map/woodland.ts'])).toEqual(['woodland elimination low', 'woodland extraction low', 'woodland extraction medium']);
    expect(names(['src/map/depot.ts'])).toEqual(['depot elimination low', 'depot extraction low']);
    expect(names(['src/render/cityProps.ts', 'src/map/neonHeights.ts'])).toEqual(['neon elimination low', 'neon extraction low', 'neon extraction medium']);
  });

  it('runs a map\'s Extraction combinations for its Extraction data, and every map\'s for Extraction\'s own code', () => {
    expect(names(['src/map/woodlandExtraction.ts'])).toEqual(['woodland extraction low', 'woodland extraction medium']);
    expect(names(['src/map/neonHeightsExtraction.ts'])).toEqual(['neon extraction low', 'neon extraction medium']);
    expect(names(['src/sim/extraction.ts'])).toEqual(['depot extraction low', 'woodland extraction low', 'neon extraction low', 'woodland extraction medium', 'neon extraction medium']);
    expect(perfScope('src/ai/extractionRoles.ts')).toEqual({ mode: 'extraction' });
    expect(perfScope('src/render/exitRenderer.ts')).toEqual({ mode: 'extraction' });
  });

  it('unions the scopes of several files, in the matrix\'s order', () => {
    expect(names(['src/map/depot.ts', 'src/map/woodlandExtraction.ts'])).toEqual(['depot elimination low', 'depot extraction low', 'woodland extraction low', 'woodland extraction medium']);
    expect(names(['src/map/depot.ts', 'src/render/renderer.ts'])).toEqual(matrix.map(runName));
  });

  it('runs the whole matrix on --perf, whatever changed', () => {
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
  });

  it('lays a map\'s own lines over its preset\'s (owner decision 4: map-scoped Medium budgets)', () => {
    const b = { presets: { low: { drawCalls: 100, triangles: 150000 }, medium: { drawCalls: 120, triangles: 200000 } }, maps: { neon: { medium: { drawCalls: 130 } } } };
    expect(budgetFor(b, 'neon', 'medium')).toEqual({ drawCalls: 130, triangles: 200000 });
    expect(budgetFor(b, 'neon', 'low')).toEqual({ drawCalls: 100, triangles: 150000 });
    expect(budgetFor(b, 'depot', 'medium')).toEqual({ drawCalls: 120, triangles: 200000 });
    expect(budgetFor(b, 'depot', 'ultra')).toEqual({});
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

  it('passes the recorded numbers, and holds Neon Heights to its own Medium line (140), not the preset\'s 120', () => {
    expect(judge({ drawCalls: 111, triangles: 122000, gpuMemoryMB: 56 })).toEqual({ over: [], worse: [] });
    // 135 calls is over the preset's 120 but within Neon Heights' 140 (the 10 % check against 111 is the next test's).
    expect(judge({ drawCalls: 135, triangles: 122000, gpuMemoryMB: 56 }).over).toEqual([]);
    expect(judge({ drawCalls: 141, triangles: 122000, gpuMemoryMB: 56 }).over).toEqual([{ metric: 'drawCalls', limit: 140, now: 141 }]);
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
