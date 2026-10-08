import { describe, expect, it } from 'vitest';
import { formatBand, formatValue, judge, judgeAll, measuresFrom, measuresNotRun, reportMarkdown, standardError, summaryLine } from './balanceReport.mjs';

/** A vitest JSON report as `vitest run --reporter=json` writes it, with figures in two tests' meta and one failure. */
const REPORT = {
  testResults: [
    {
      name: '/repo/src/ai/balance/depotPro.balance.ts',
      status: 'passed',
      assertionResults: [
        {
          fullName: 'a 3v3 Elimination match on Depot, both teams on Pro measures',
          status: 'passed',
          meta: { balance: [
            { label: "Depot, Pro, Elimination: the west end's share of the decided rounds", value: 0.495, of: 218, band: { min: 0.4, max: 0.6 }, detail: '108 of 218 decided' },
            { label: 'Depot, Pro, Elimination: rounds that run out the clock', value: 0, of: 220, band: { max: 0.1 } },
          ] },
        },
        { fullName: 'a test with no figures', status: 'passed', meta: {} },
      ],
    },
    {
      name: '/repo/src/ai/balance/woodlandPro.balance.ts',
      status: 'failed',
      assertionResults: [{ fullName: 'Woodland measures', status: 'failed', failureMessages: ['\x1b[31mError: Rapier would not load\x1b[39m\n    at x (src/physics/physicsWorld.ts:80:1)'], meta: {} }],
    },
    { name: '/repo/src/ai/balance/broken.balance.ts', status: 'failed', message: 'SyntaxError: Unexpected token', assertionResults: [] },
  ],
};

describe('the balance report (token plan item 22)', () => {
  it('reads every figure from the tests\' meta, with its file relative to the repository', () => {
    const measures = measuresFrom(REPORT, '/repo');
    expect(measures).toHaveLength(2);
    expect(measures[0]).toMatchObject({ file: 'src/ai/balance/depotPro.balance.ts', value: 0.495, of: 218 });
    expect(measures[0].test).toContain('Depot');
  });

  it('lists the measures that did not run: a failed test and a file that did not load', () => {
    expect(measuresNotRun(REPORT, '/repo')).toEqual([
      { file: 'src/ai/balance/woodlandPro.balance.ts', test: 'Woodland measures', message: 'Error: Rapier would not load' },
      { file: 'src/ai/balance/broken.balance.ts', test: '(the file did not load)', message: 'SyntaxError: Unexpected token' },
    ]);
  });

  it('takes a share\'s standard error from its count, or the one a figure gives', () => {
    expect(standardError({ value: 0.5, of: 100, band: {} })).toBeCloseTo(0.05);
    expect(standardError({ value: 0.25, of: 48, band: {} })).toBeCloseTo(Math.sqrt(0.25 * 0.75 / 48));
    expect(standardError({ value: -0.01, se: 0.007, band: {} })).toBe(0.007);
    expect(standardError({ value: 43, band: {}, unit: 'FC a minute' })).toBeNull();
  });

  it('calls a figure in band, near an edge, outside within noise, or outside', () => {
    const band = { min: 0.4, max: 0.6 };
    expect(judge({ value: 0.5, of: 200, band }).verdict).toBe('in band');
    // 58 % of 100: 3.5 points from the edge with ±4.9: near it.
    expect(judge({ value: 0.58, of: 100, band }).verdict).toBe('near an edge');
    // 62 % of 100: 2 points past it, under two standard errors.
    expect(judge({ value: 0.62, of: 100, band }).verdict).toBe('outside, within noise');
    // 70 % of 100: 10 points past it, about two standard errors.
    expect(judge({ value: 0.7, of: 100, band }).verdict).toBe('outside');
    expect(judge({ value: 0.3, of: 400, band }).verdict).toBe('outside');
    // A plain number has no standard error: inside is in band, past an edge is outside.
    expect(judge({ value: 19, band: { min: 20, max: 60 }, unit: 'FC a minute' }).verdict).toBe('outside');
    expect(judge({ value: 20, band: { min: 20, max: 60 }, unit: 'FC a minute' }).verdict).toBe('in band');
    // An open end: only the other one counts; a share of nothing did not run.
    expect(judge({ value: 0.02, of: 180, band: { max: 0.1 } }).verdict).toBe('in band');
    expect(judge({ value: Number.NaN, of: 0, band }).verdict).toBe('did not run');
  });

  it('shows shares, differences, numbers and bands in plain words', () => {
    expect(formatValue({ value: 0.495, of: 218 })).toBe('49.5 %');
    expect(formatValue({ value: -0.0123, unit: 'points' })).toBe('−1.2 points');
    expect(formatValue({ value: 43.21, unit: 'FC a minute' })).toBe('43.2 FC a minute');
    expect(formatValue({ value: 1.0234, unit: '×' })).toBe('1.02×');
    expect(formatBand({ band: { min: 0.4, max: 0.6 }, of: 1 })).toBe('40–60 %');
    expect(formatBand({ band: { max: 0.1 }, of: 1 })).toBe('≤ 10 %');
    expect(formatBand({ band: { min: 0 }, unit: 'points' })).toBe('≥ 0 points');
    expect(formatBand({ band: { min: 20, max: 60 }, unit: 'FC a minute' })).toBe('20–60 FC a minute');
    expect(formatBand({ band: { max: 1.6 }, unit: '×' })).toBe('≤ 1.6×');
  });

  it('puts the most urgent first, and writes a table any reader can act on', () => {
    const rows = judgeAll([
      { file: 'a', label: 'fine', value: 0.5, of: 400, band: { min: 0.4, max: 0.6 } },
      { file: 'b', label: 'far out', value: 0.8, of: 400, band: { min: 0.4, max: 0.6 }, detail: '320 of 400' },
      { file: 'c', label: 'just out', value: 0.61, of: 100, band: { min: 0.4, max: 0.6 } },
    ]);
    expect(rows.map((r) => r.label)).toEqual(['far out', 'just out', 'fine']);
    expect(summaryLine(rows)).toBe('3 figures: 1 outside their band, 1 outside but within noise, 0 near an edge, 1 in band');
    const md = reportMarkdown(rows, { commit: 'abc1234', when: '2026-10-08 06:00 UTC', notRun: measuresNotRun(REPORT, '/repo') });
    expect(md).toContain('Measured 2026-10-08 06:00 UTC on `abc1234`.');
    expect(md).toContain('| far out | 80.0 % ±2.0 (320 of 400) | 40–60 % | outside | b |');
    expect(md).toContain('## Measures that did not run');
    expect(md).toContain('2 measures did not run');
    expect(md).toContain('Nothing here fails a build.');
  });
});
