import { describe, expect, it } from 'vitest';
import { vec3 } from '../sim/vec';
import { type Bush, foliageDepth } from './foliage';

/** A bush 2 m across and 1.6 m tall, its foot at the origin: the leaves fill an ellipsoid centred 0.8 m up. */
const BUSH: Bush = { x: 0, y: 0, z: 0, radius: 1, height: 1.6 };

describe('foliageDepth (M33e)', () => {
  it('measures the leaves a line crosses: a bush’s full width through its middle, its height straight down', () => {
    expect(foliageDepth([BUSH], vec3(-5, 0.8, 0), vec3(5, 0.8, 0))).toBeCloseTo(2, 6);
    expect(foliageDepth([BUSH], vec3(0, 5, 0), vec3(0, -1, 0))).toBeCloseTo(1.6, 6);
    // Off-centre the chord is shorter: 2√(1 − 0.6²) = 1.6 m at 0.6 m to the side.
    expect(foliageDepth([BUSH], vec3(-5, 0.8, 0.6), vec3(5, 0.8, 0.6))).toBeCloseTo(1.6, 6);
  });

  it('is zero for a line that passes over, beside or short of the bush', () => {
    expect(foliageDepth([BUSH], vec3(-5, 1.7, 0), vec3(5, 1.7, 0))).toBe(0);
    expect(foliageDepth([BUSH], vec3(-5, 0.8, 1.05), vec3(5, 0.8, 1.05))).toBe(0);
    expect(foliageDepth([BUSH], vec3(-5, 0.8, 0), vec3(-1.2, 0.8, 0))).toBe(0);
  });

  it('counts only the part of the line inside: from the middle out is one radius', () => {
    expect(foliageDepth([BUSH], vec3(0, 0.8, 0), vec3(5, 0.8, 0))).toBeCloseTo(1, 6);
    expect(foliageDepth([BUSH], vec3(-5, 0.8, 0), vec3(0.5, 0.8, 0))).toBeCloseTo(1.5, 6);
  });

  it('adds up the bushes in a row, and stops counting once past the limit', () => {
    const row: Bush[] = [BUSH, { ...BUSH, x: 3 }, { ...BUSH, x: 6 }];
    expect(foliageDepth(row, vec3(-5, 0.8, 0), vec3(10, 0.8, 0))).toBeCloseTo(6, 6);
    expect(foliageDepth(row, vec3(-5, 0.8, 0), vec3(10, 0.8, 0), 1)).toBeCloseTo(2, 6);
  });

  it('is zero with no bushes or a zero-length line', () => {
    expect(foliageDepth([], vec3(-5, 0.8, 0), vec3(5, 0.8, 0))).toBe(0);
    expect(foliageDepth([BUSH], vec3(0, 0.8, 0), vec3(0, 0.8, 0))).toBe(0);
  });
});
