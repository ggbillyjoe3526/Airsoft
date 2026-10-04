import { describe, expect, it } from 'vitest';
import { buildOccluders, occlusionAt, occlusionShade, rayBox } from './vertexOcclusion';

/** A floor 20 m square (box 0) with a 3 m wall along x = 0 (box 1) standing on it. */
const FLOOR = [-10, -0.2, -10, 10, 0, 10] as const;
const WALL = [-0.2, 0, -5, 0.2, 3, 5] as const;
const occ = buildOccluders([FLOOR, WALL], 2);

describe('rayBox (F3)', () => {
  it('returns the distance to a box ahead, Infinity for one behind or beyond reach, 0 from inside', () => {
    const boxes = new Float64Array([1, -1, -1, 2, 1, 1]);
    expect(rayBox(boxes, 0, 0, 0, 0, 1, 0, 0, 5)).toBeCloseTo(1);
    expect(rayBox(boxes, 0, 0, 0, 0, -1, 0, 0, 5)).toBe(Number.POSITIVE_INFINITY);
    expect(rayBox(boxes, 0, 0, 0, 0, 1, 0, 0, 0.5)).toBe(Number.POSITIVE_INFINITY);
    expect(rayBox(boxes, 0, 1.5, 0, 0, 0, 1, 0, 5)).toBe(0);
  });
});

describe('occlusionAt (F3)', () => {
  it('is 0 on open floor far from anything (the floor it lies on never shades it)', () => {
    expect(occlusionAt(occ, 6, 0, 6, 0, 1, 0, 0.01, 0)).toBe(0);
  });

  it('shades the floor along a wall foot, less further out, and not past reach', () => {
    const foot = occlusionAt(occ, 0.3, 0, 0, 0, 1, 0, 0.01, 0);
    const out = occlusionAt(occ, 1.2, 0, 0, 0, 1, 0, 0.01, 0);
    expect(foot).toBeGreaterThan(0.1);
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThan(foot);
    expect(occlusionAt(occ, 3, 0, 0, 0, 1, 0, 0.01, 0)).toBe(0);
  });

  it('ignores the box a point lies on (skip), so a wall face is not shaded by its own wall', () => {
    const face = [0.2, 1.5, 0] as const;
    expect(occlusionAt(occ, ...face, 1, 0, 0, 0.01, 1)).toBe(0);
    // Without the skip index the rays start inside the wall's own box and every one is blocked.
    expect(occlusionAt(occ, 0.19, 1.5, 0, 1, 0, 0, 0, -1)).toBeGreaterThan(0.9);
  });

  it('shades a face looking at a nearby box, and never a face looking down', () => {
    const near = buildOccluders([FLOOR, WALL, [1, 0, -1, 2, 1, 1]], 2);
    expect(occlusionAt(near, 0.2, 0.5, 0, 1, 0, 0, 0.01, 1)).toBeGreaterThan(0.2);
    expect(occlusionAt(near, 0, -0.2, 0, 0, -1, 0, 0.01, 0)).toBe(0);
  });
});

describe('occlusionShade', () => {
  it('maps the share to 1 - strength .. 1, clamped', () => {
    expect(occlusionShade(0, 0.5)).toBe(1);
    expect(occlusionShade(1, 0.5)).toBe(0.5);
    expect(occlusionShade(2, 0.5)).toBe(0.5);
    expect(occlusionShade(-1, 0.5)).toBe(1);
  });
});
