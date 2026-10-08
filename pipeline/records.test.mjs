import { describe, expect, it } from 'vitest';
import { ATTEMPT_COLUMNS, attemptTableHeader, gateCell, lineIndex, metricsIndex, metricsRow, parseRecord, readRecords, reviewIndex } from './records.mjs';

const record = (overrides = {}) => {
  const parts = {
    title: '# M80 · Bots stop at the flag',
    review: '**Review:** 2 attempts · 8/8 · Accept (Opus)',
    attempts: `${attemptTableHeader()}\n| 2026-10-08 | 1 | Opus 5.5 (build thread) | ✓ 18 s | ✓ 70 s | ✓ 85 s | – not required | ✓ | ✓ | 6/8 Retry (Opus) | AC2 the flag | ~1 h | QA 80k |\n| 2026-10-08 | 2 | Opus 5.5 (build thread) | ✓ 17 s | ✓ 71 s | ✓ 84 s | – not required | ✓ | ✓ | 8/8 Accept (Opus) | – | ~30 min | critic 90k |`,
    decisions: '- **Bots wait 2 s at the flag.** Long enough to read, short enough to keep the round moving.',
    issues: '- None.',
    ...overrides,
  };
  return `${parts.title}\n\n${parts.review}\n\n## Attempts\n\n${parts.attempts}\n\n## Decisions\n\n${parts.decisions}\n\n## Known issues left\n\n${parts.issues}\n`;
};

describe('per-task records (pipeline/records.mjs, TE2)', () => {
  it('reads a record\'s review line, attempt rows, decisions and known issues', () => {
    const r = parseRecord(record(), 'M80.md');
    expect(r.problems).toEqual([]);
    expect(r.id).toBe('M80');
    expect(r.title).toBe('Bots stop at the flag');
    expect(r.review).toEqual({ attempts: 2, score: '8/8', verdict: 'Accept', critic: 'Opus', note: null });
    expect(r.attempts).toHaveLength(2);
    expect(r.attempts[1]).toHaveLength(ATTEMPT_COLUMNS.length);
    expect(r.decisions).toEqual(['**Bots wait 2 s at the flag.** Long enough to read, short enough to keep the round moving.']);
    expect(r.issues).toEqual([]);
  });

  it('takes a trivial task\'s review and a short note', () => {
    const r = parseRecord(record({ review: '**Review:** 1 attempt · trivial · Accept (Haiku diff check) · a typo only' }), 'M80.md');
    expect(r.problems).toEqual([]);
    expect(r.review).toMatchObject({ attempts: 1, score: 'trivial', critic: 'Haiku diff check', note: 'a typo only' });
  });

  it.each([
    [{ title: '# Bots stop at the flag' }, 'the first line is not'],
    [{ review: '**Review:** M80 took two goes and the critic liked it' }, 'the review line is not'],
    [{ review: `**Review:** 1 attempt · 8/8 · Accept (Opus) · ${'x'.repeat(81)}` }, 'note is over 80'],
    [{ attempts: '| Date | Task |\n|---|---|\n| 2026-10-08 | M80 |' }, 'standard columns'],
    [{ attempts: `${attemptTableHeader()}\n| 2026-10-08 | 1 | ? | ✓ | ✓ | ✓ | – | ✓ | ✓ | ? | – | ? | ? |` }, 'still has a "?" cell'],
    [{ attempts: attemptTableHeader() }, 'has no rows'],
  ])('reports a record that breaks the format (%#)', (overrides, problem) => {
    expect(parseRecord(record(overrides), 'M80.md').problems.join('; ')).toContain(problem);
  });

  it('wants the file named after the task', () => {
    expect(parseRecord(record(), 'M81.md').problems).toContain('the file is M81.md, not M80.md');
  });

  it('builds the review, metrics and decision indexes', () => {
    const records = [parseRecord(record(), 'M80.md')];
    expect(reviewIndex(records)).toContain('| M80 | Bots stop at the flag | 2 · 8/8 · Accept (Opus) |');
    const metrics = metricsIndex(records).split('\n');
    expect(metrics[0]).toBe(`| Date | Task | ${ATTEMPT_COLUMNS.slice(1).join(' | ')} |`);
    expect(metrics[2]).toMatch(/^\| 2026-10-08 \| M80 \| 1 \| Opus 5\.5/);
    expect(lineIndex(records, 'decisions')).toBe('- M80: **Bots wait 2 s at the flag.** Long enough to read, short enough to keep the round moving.');
  });

  it('every record in docs/records follows the format', () => {
    for (const r of readRecords()) expect(r.problems, r.file).toEqual([]);
  });
});

describe('the attempt row the gate writes (metricsRow)', () => {
  const report = {
    when: '2026-10-08T09:30:00.000Z',
    gates: {
      build: { pass: true, ms: 17_600 },
      tests: { pass: false, ms: 71_200, failures: [{ test: 'bots | hold the flag' }, { test: 'another' }] },
      smoke: { pass: true, ms: 85_000 },
      perf: { pass: null, reason: 'not required (no perf-relevant path changed)' },
      scope: { pass: true },
      changelog: { pass: false, reason: 'no line naming **M80** under Unreleased' },
    },
  };

  it('fills the date and the six gate cells, and leaves what the gate can\'t know as ?', () => {
    const cells = metricsRow(report).split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
    expect(cells).toHaveLength(ATTEMPT_COLUMNS.length);
    expect(cells).toEqual(['2026-10-08', '?', '?', '✓ 18 s', '✗ 71 s (2 failed: bots \\| hold the flag)', '✓ 85 s', '– not required', '✓', '✗ (no line naming **M80** under Unreleased)', '?', '?', '?', '?']);
  });

  it('takes the cells the thread knows', () => {
    const row = metricsRow(report, { attempt: 2, model: 'Opus 5.5 (build thread)', critic: '8/8 Accept (Opus)', retry: '–', wall: '~1 h', tokens: 'QA 80k' });
    expect(row).toMatch(/^\| 2026-10-08 \| 2 \| Opus 5\.5 \(build thread\) \|/);
    expect(row).toMatch(/\| 8\/8 Accept \(Opus\) \| – \| ~1 h \| QA 80k \|$/);
    expect(row).not.toContain('?');
  });

  it('marks a gate the report doesn\'t have, and clips a long reason', () => {
    expect(gateCell(undefined)).toBe('–');
    expect(gateCell({ pass: null })).toBe('–');
    const long = gateCell({ pass: false, reason: 'x'.repeat(200) });
    expect(long.length).toBeLessThan(70);
    expect(long.endsWith('…)')).toBe(true);
  });
});
