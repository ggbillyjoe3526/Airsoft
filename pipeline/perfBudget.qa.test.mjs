import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { budgetFor, frameTimesGatedFor, judgeRun } from './perfMatrix.mjs';
import { budgetVerdict, DESKTOP_4K } from './perfDesktop.mjs';

const budgets = JSON.parse(readFileSync('pipeline/perf-budget.json', 'utf8'));
const MAPS = ['depot', 'woodland', 'neon'];

describe('the desktop Ultra line (PF3), against the real budget file', () => {
  it('never reaches another environment: laptop, container and ci keep the preset line and judge Ultra as before', () => {
    for (const env of ['laptop', 'container', 'ci', undefined]) {
      for (const map of MAPS) for (const backend of ['webgl', 'webgpu']) {
        expect(budgetFor(budgets, map, 'ultra', backend, env)).toEqual(budgetFor(budgets, map, 'ultra', backend));
      }
    }
    expect(frameTimesGatedFor(budgets, 'container', 'ultra')).toBe(false);
    expect(frameTimesGatedFor(budgets, 'ci', 'ultra')).toBe(false);
    expect(frameTimesGatedFor(budgets, 'laptop', 'ultra')).toBe(true);
    for (const p of ['low', 'medium', 'high']) expect(frameTimesGatedFor(budgets, 'laptop', p)).toBe(true);
  });

  it('gates the desktop on Ultra only, on both back ends (each its own line) and every map', () => {
    for (const p of ['low', 'medium', 'high']) expect(frameTimesGatedFor(budgets, 'desktop', p)).toBe(false);
    expect(frameTimesGatedFor(budgets, 'desktop', 'ultra')).toBe(true);
    for (const map of MAPS) for (const backend of ['webgl', 'webgpu']) {
      expect(budgetFor(budgets, map, 'ultra', backend, 'desktop')).toMatchObject(backend === 'webgl' ? { p95Ms: 7.2, p99Ms: 11.5 } : { p95Ms: 6.5, p99Ms: 9 });
      expect(budgetFor(budgets, map, 'high', backend, 'desktop')).toEqual(budgetFor(budgets, map, 'high', backend));
    }
  });

  it('does not fail a slow frame on desktop High, but fails one on desktop Ultra', () => {
    const metrics = { p95Ms: 50, p99Ms: 80 };
    const j = (preset) => judgeRun({ run: { map: 'depot', mode: 'elimination', preset }, metrics, budget: budgetFor(budgets, 'depot', preset, 'webgpu', 'desktop'), baseline: null, baselineName: 'x', frameTimesGated: frameTimesGatedFor(budgets, 'desktop', preset) }).over.map((o) => o.metric);
    expect(j('high')).toEqual([]);
    expect(j('ultra')).toEqual(['p95Ms', 'p99Ms']);
  });

  it('holds every 4K Ultra desktop baseline inside the line ("so Ultra can\'t get slower" from today\'s numbers)', () => {
    const dir = 'pipeline/baseline';
    const files = readdirSync(dir).filter((f) => f.startsWith('desktop') && f.endsWith('.json'));
    let checked = 0;
    for (const f of files) {
      const b = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
      if (b.preset !== 'ultra' || !String(b.viewport).startsWith('3840x2160')) continue;
      checked++;
      const run = { map: b.map ?? 'depot', mode: b.mode ?? 'elimination', viewport: DESKTOP_4K };
      expect(budgetVerdict(budgets, run, 'ultra', { backend: b.backend, metrics: b.metrics }), f).not.toMatch(/p9[59]Ms/);
    }
    expect(checked).toBeGreaterThan(0);
    expect(existsSync(`${dir}/desktop-ultra.json`)).toBe(true);
  });
});
