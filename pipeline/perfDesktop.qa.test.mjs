import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { baselineLag, runFileName } from './perfMatrix.mjs';
import { DESKTOP_HD, DESKTOP_SUITE, runPresets, summaryMarkdown, vsyncHeld } from './perfDesktop.mjs';

const budgets = JSON.parse(readFileSync('pipeline/perf-budget.json', 'utf8'));

describe('perf-desktop (QA)', () => {
  it('has the 1080p run write the same out-file as 4K Depot Ultra, which is why the runner checks the file\'s time', () => {
    const hd = DESKTOP_SUITE.find((r) => r.viewport === DESKTOP_HD);
    const names = DESKTOP_SUITE.filter((r) => r !== hd).flatMap((r) => runPresets(r).map((preset) => runFileName('desktop', { ...r, preset })));
    expect(names).toContain(runFileName('desktop', hd));
    // Every other run file name is unique, so only the 1080p run needs the time check.
    expect(new Set(names).size).toBe(names.length);
  });

  it('does not take a missing or non-numeric median for a held refresh', () => {
    expect(vsyncHeld(undefined)).toBeNull();
    expect(vsyncHeld(NaN)).toBeNull();
  });

  it('writes a summary from rows that all failed, and from a result recorded with head unknown', () => {
    const run = DESKTOP_SUITE[0];
    const none = summaryMarkdown([{ run, preset: 'low', result: null }], 'now', budgets);
    expect(none).toContain('GPU: unknown · head unknown');
    const m = { fps: 100, onePercentLowFps: 70, p50Ms: 10, p95Ms: 12, p99Ms: 14, worstMs: 30, simTicksPerSecond: 60, figureMs: 1, drawCalls: 90 };
    const md = summaryMarkdown([{ run, preset: 'low', result: { backend: 'webgpu', head: 'unknown', gpu: 'x', metrics: m, errors: ['e'] } }], 'now', budgets);
    expect(md).toContain('head unknown');
    expect(md).toMatch(/\| low \| 100 \|.*\| 1 \|$/m);
  });

  it('treats a head of unknown as not in history, so the gate only warns about such a baseline', () => {
    expect(baselineLag('unknown', () => '3')).toBeNull();
  });
});
