import { describe, expect, it } from 'vitest';
import { BuildTiming, type PerfClock } from './buildTiming';

/** A clock that reads the times given, and keeps every measure made. */
function clock(times: number[]): PerfClock & { measures: { name: string; start: number; end: number }[] } {
  const measures: { name: string; start: number; end: number }[] = [];
  return { now: () => times.shift()!, measure: (name, o) => measures.push({ name, ...o }), measures };
}

describe('BuildTiming (audit CORE-33: the match build, split by phase)', () => {
  it('measures each phase from the end of the one before, by name, and sums them in one line', () => {
    const c = clock([100, 103.4, 140, 152.6]);
    const t = new BuildTiming('match build', c);
    t.phase('map meshes');
    t.phase('lighting');
    t.notes.push('map meshes reused');
    t.phase('presentation');
    expect(c.measures).toEqual([
      { name: 'match build: map meshes', start: 100, end: 103.4 },
      { name: 'match build: lighting', start: 103.4, end: 140 },
      { name: 'match build: presentation', start: 140, end: 152.6 },
    ]);
    expect(t.totalMs).toBeCloseTo(52.6, 6);
    expect(t.line()).toBe('match build 53 ms (map meshes reused) · map meshes 3 · lighting 37 · presentation 13');
  });

  it('works on the real performance clock (Node has one, like the browser)', () => {
    const t = new BuildTiming('test build');
    t.phase('nothing');
    expect(t.totalMs).toBeGreaterThanOrEqual(0);
    expect(t.line()).toMatch(/^test build \d+ ms · nothing \d+$/);
  });
});
