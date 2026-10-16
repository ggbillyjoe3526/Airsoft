import { describe, expect, it } from 'vitest';
import { vec3 } from '../sim/vec';
import { type Bush, firstLeaves, foliageDepth, type LeafCrossing, leafFloor, leafSurface } from './foliage';

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

describe('firstLeaves (Dev 6 item 44)', () => {
  const out: LeafCrossing = { enter: -1, exit: -1, through: false };
  const east = vec3(1, 0, 0);

  it('gives where a path goes into a bush and where it comes out, in metres along it', () => {
    expect(firstLeaves([BUSH], vec3(-5, 0.8, 0), east, 10, out)).toBe(true);
    expect(out.enter).toBeCloseTo(4, 6);
    expect(out.exit).toBeCloseTo(6, 6);
    expect(out.through).toBe(true);
  });

  it('clips the crossing to the path: one ending among the leaves is not through, one starting inside goes in at 0', () => {
    expect(firstLeaves([BUSH], vec3(-5, 0.8, 0), east, 4.5, out)).toBe(true);
    expect(out.enter).toBeCloseTo(4, 6);
    expect(out.exit).toBeCloseTo(4.5, 6);
    expect(out.through).toBe(false);
    expect(firstLeaves([BUSH], vec3(0, 0.8, 0), east, 10, out)).toBe(true);
    expect(out.enter).toBe(0);
    expect(out.exit).toBeCloseTo(1, 6);
    expect(out.through).toBe(true);
  });

  it('takes the nearest bush of a row, whichever order the map lists them in', () => {
    const row: Bush[] = [{ ...BUSH, x: 6 }, { ...BUSH, x: 3 }, BUSH];
    expect(firstLeaves(row, vec3(-5, 0.8, 0), east, 20, out)).toBe(true);
    expect(out.enter).toBeCloseTo(4, 6);
    expect(out.exit).toBeCloseTo(6, 6);
    expect(firstLeaves(row, vec3(1.5, 0.8, 0), east, 20, out)).toBe(true);
    expect(out.enter).toBeCloseTo(0.5, 6);
  });

  it('meets nothing short of a bush, beside it or over it, or with none', () => {
    expect(firstLeaves([BUSH], vec3(-5, 0.8, 0), east, 3.9, out)).toBe(false);
    expect(firstLeaves([BUSH], vec3(-5, 0.8, 1.05), east, 10, out)).toBe(false);
    expect(firstLeaves([BUSH], vec3(-5, 1.7, 0), east, 10, out)).toBe(false);
    expect(firstLeaves([], vec3(-5, 0.8, 0), east, 10, out)).toBe(false);
  });

  it('counts a sliver at the very rim, or leaving from the surface, as no leaves (a BB never stalls there)', () => {
    // Out from where the last tick left it, on the surface: no crossing, whichever way it goes on.
    expect(firstLeaves([BUSH], vec3(1, 0.8, 0), east, 10, out)).toBe(false);
    expect(firstLeaves([BUSH], vec3(1, 0.8, 0), vec3(0.8, 0.6, 0), 10, out)).toBe(false);
    // A chord of under a millimetre, just inside the rim.
    expect(firstLeaves([BUSH], vec3(-5, 0.8, 0.9999999), east, 10, out)).toBe(false);
  });
});

describe('leafSurface (Dev 6 item 44: where knocked-out leaves show)', () => {
  it('brings a BB stopped deep in a bush back out to the leaves on its shooter’s side', () => {
    const out = vec3();
    // Stopped 0.6 m in from the -x side, shooter 5 m off that way at the same height: the leaves show at x = -1.
    expect(leafSurface([BUSH], vec3(-0.4, 0.8, 0), vec3(-5, 0.8, 0), out)).toBe(out);
    expect(out.x).toBeCloseTo(-1, 6);
    expect(out.y).toBeCloseTo(0.8, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it('takes a BB that came out of an edge back to where it went in', () => {
    const out = vec3();
    // A chord 0.6 m to the side: in at x = -0.8, out at x = 0.8; shooter off to -x.
    leafSurface([BUSH], vec3(0.8, 0.8, 0.6), vec3(-5, 0.8, 0.6), out);
    expect(out.x).toBeCloseTo(-0.8, 6);
    expect(out.z).toBeCloseTo(0.6, 6);
  });

  it('stays where the BB stopped when it was fired from inside the same bush, or is in no bush', () => {
    const out = vec3();
    leafSurface([BUSH], vec3(0.6, 0.8, 0), vec3(0, 0.8, 0), out);
    expect(out).toEqual(vec3(0.6, 0.8, 0));
    leafSurface([BUSH], vec3(3, 0.8, 0), vec3(-5, 0.8, 0), out);
    expect(out).toEqual(vec3(3, 0.8, 0));
    leafSurface([], vec3(0, 0.8, 0), vec3(-5, 0.8, 0), out);
    expect(out).toEqual(vec3(0, 0.8, 0));
  });
});

describe('leafFloor (BP5: where knocked-out leaves come to rest)', () => {
  const bush: Bush = { x: 0, y: 1.5, z: 0, radius: 1, height: 1.2 };
  const lower: Bush = { x: 0.8, y: 1.2, z: 0, radius: 1, height: 1.2 };

  it('is the base of the bush the point is in or on, the lowest of overlapping ones, and none outside any', () => {
    expect(leafFloor([bush], vec3(0.3, 2, 0.2))).toBe(1.5);
    expect(leafFloor([bush], vec3(1, 2, 0))).toBe(1.5); // on its side
    expect(leafFloor([bush, lower], vec3(0.5, 2, 0))).toBe(1.2);
    expect(leafFloor([bush], vec3(3, 2, 0))).toBe(Number.NEGATIVE_INFINITY);
    expect(leafFloor([bush], vec3(0, 4, 0))).toBe(Number.NEGATIVE_INFINITY); // well over it
    expect(leafFloor([], vec3(0, 2, 0))).toBe(Number.NEGATIVE_INFINITY);
  });
});
