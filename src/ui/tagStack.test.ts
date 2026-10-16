import { describe, expect, it } from 'vitest';
import { stackTags } from './tagStack';

/** Lays out tags given as [x, y, w, h, shown] and returns where each one's bottom ends up. */
function lay(tags: [number, number, number, number, boolean][], gap = 2): number[] {
  const n = tags.length;
  const out = new Float64Array(n);
  stackTags(
    n,
    tags.map((t) => t[0]),
    tags.map((t) => t[1]),
    tags.map((t) => t[2]),
    tags.map((t) => t[3]),
    tags.map((t) => t[4]),
    gap,
    new Int32Array(n),
    out,
  );
  return [...out];
}

/** Whether the laid-out boxes of two tags overlap. */
function overlap(a: [number, number, number, number, boolean], ay: number, b: [number, number, number, number, boolean], by: number): boolean {
  return Math.abs(a[0] - b[0]) < (a[2] + b[2]) / 2 && ay - a[3] < by && by - b[3] < ay;
}

describe('name tags laid out together (BP5)', () => {
  it('leaves tags that are apart where they are', () => {
    expect(lay([[100, 300, 60, 20, true], [300, 305, 60, 20, true], [100, 200, 60, 20, true]])).toEqual([300, 305, 200]);
  });

  it('stacks the higher of two overlapping tags over the lower one, x unchanged', () => {
    // Two teammates side by side: tags 60 px wide, 30 px apart, 4 px apart in height.
    const y = lay([[400, 300, 60, 20, true], [430, 296, 60, 20, true]]);
    expect(y[0]).toBe(300);
    expect(y[1]).toBe(300 - 20 - 2);
  });

  it('keeps the lower tag (the nearer teammate) in place whichever comes first', () => {
    const y = lay([[430, 296, 60, 20, true], [400, 300, 60, 20, true]]);
    expect(y[1]).toBe(300);
    expect(y[0]).toBe(278);
  });

  it('stacks three on one spot into a column, none overlapping', () => {
    const tags: [number, number, number, number, boolean][] = [[500, 300, 70, 18, true], [505, 300, 50, 18, true], [495, 299, 80, 18, true]];
    const y = lay(tags);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(overlap(tags[i]!, y[i]!, tags[j]!, y[j]!)).toBe(false);
    expect(Math.max(...y)).toBe(300);
    expect(Math.min(...y)).toBe(300 - 2 * (18 + 2));
  });

  it('moves a tag that lands on another after its first move up past that one too', () => {
    // The top tag sits just over the middle one's spot, which the bottom one pushes up into.
    const tags: [number, number, number, number, boolean][] = [[200, 300, 60, 20, true], [200, 290, 60, 20, true], [210, 270, 60, 20, true]];
    const y = lay(tags, 0);
    expect(y).toEqual([300, 280, 260]);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(overlap(tags[i]!, y[i]!, tags[j]!, y[j]!)).toBe(false);
  });

  it('ignores hidden tags', () => {
    expect(lay([[400, 300, 60, 20, false], [410, 298, 60, 20, true]])).toEqual([300, 298]);
  });
});
