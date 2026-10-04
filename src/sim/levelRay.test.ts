import { describe, expect, it } from 'vitest';
import type { MapBlock } from '../map/mapTypes';
import type { SurfaceHit } from './armament';
import { buildLevelRay, castLevelRay } from './levelRay';
import { vec3 } from './vec';

const BLOCKS: MapBlock[] = [
  { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(20, 0.5, 20) },
  { kind: 'wall', center: vec3(0, 1.5, -5), size: vec3(20, 3, 0.4) },
  { kind: 'crate', center: vec3(-4, 0.6, 0), size: vec3(1.2, 1.2, 1.2) },
  { kind: 'container', center: vec3(6, 1.3, 3), size: vec3(2.4, 2.6, 6) },
  // A 1:2 ramp rising towards +x from y = 0 at x = 2 to y = 1 at x = 4.
  { kind: 'ramp', rise: '+x', center: vec3(3, 0.5, 6), size: vec3(2, 1, 2), surface: 'metal' },
];

function hit(): SurfaceHit {
  return { normal: vec3(), material: 'metal' };
}

describe('castLevelRay (audit SIM-01)', () => {
  const level = buildLevelRay(BLOCKS);

  it('tells what a ray met: the surface facing back along it and its material', () => {
    const out = hit();
    // Towards the concrete wall at z = -5 (its near face at -4.8).
    expect(castLevelRay(level, vec3(0, 1.5, 0), vec3(0, 0, -1), 20, out)).toBeCloseTo(4.8, 9);
    expect(out.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(out.material).toBe('concrete');
    expect(castLevelRay(level, vec3(0, 1.5, 0), vec3(0, 0, -1), 20)).toBeCloseTo(4.8, 9);
    // Down onto the wooden crate's top; along x into the steel container's side.
    expect(castLevelRay(level, vec3(-4, 3, 0), vec3(0, -1, 0), 10, out)).toBeCloseTo(1.8, 9);
    expect(out.normal.y).toBe(1);
    expect(out.material).toBe('wood');
    expect(castLevelRay(level, vec3(0, 1, 3), vec3(1, 0, 0), 10, out)).toBeCloseTo(4.8, 9);
    expect(out.normal.x).toBe(-1);
    expect(out.material).toBe('metal');
    // Nothing up there, nothing within reach, nothing outside the level.
    expect(castLevelRay(level, vec3(0, 1.5, 0), vec3(0, 1, 0), 10, out)).toBe(-1);
    expect(castLevelRay(level, vec3(0, 1.5, 0), vec3(0, 0, -1), 4.7, out)).toBe(-1);
    expect(castLevelRay(level, vec3(50, 1, 0), vec3(0, 0, -1), 100, out)).toBe(-1);
  });

  it('meets a ramp on its slope, the normal tilted back up the ramp', () => {
    const out = hit();
    // Straight down at x = 3.5: the slope is at y = 0.75 there.
    expect(castLevelRay(level, vec3(3.5, 2, 6), vec3(0, -1, 0), 5, out)).toBeCloseTo(1.25, 9);
    expect(out.normal.x).toBeCloseTo(-1 / Math.sqrt(5), 9);
    expect(out.normal.y).toBeCloseTo(2 / Math.sqrt(5), 9);
    expect(out.material).toBe('metal');
    // Level along +x at y = 0.5 meets the slope at x = 3 (passing over the low edge), not the box's side at x = 2.
    expect(castLevelRay(level, vec3(0, 0.5, 6), vec3(1, 0, 0), 10, out)).toBeCloseTo(3, 9);
    // Above the high end it flies over.
    expect(castLevelRay(level, vec3(0, 1.1, 6), vec3(1, 0, 0), 3.9, out)).toBe(-1);
  });

  it('meets the far side of a block it starts inside, facing back along the ray, as a ray against a closed mesh does', () => {
    const out = hit();
    expect(castLevelRay(level, vec3(-3.9, 0.6, 0), vec3(1, 0, 0), 5, out)).toBeCloseTo(0.5, 9);
    expect(out.normal.x).toBe(-1);
    expect(Math.hypot(out.normal.y, out.normal.z)).toBe(0);
    expect(out.material).toBe('wood');
    // Starting on a face: going in meets it at once, going out meets nothing.
    expect(castLevelRay(level, vec3(-4.6, 0.6, 0), vec3(1, 0, 0), 5, out)).toBe(0);
    expect(castLevelRay(level, vec3(-4.6, 0.6, 0.3), vec3(-1, 0, 0), 5, out)).toBe(-1);
  });

  it('finds the nearest block along a long ray that crosses many grid cells, in any direction', () => {
    const out = hit();
    // Diagonally across the floor, over the crate: the container's -x face (x = 4.8) is the first thing in the way.
    const d = vec3(1, 0, 0.25);
    const len = Math.hypot(d.x, d.z);
    d.x /= len;
    d.z /= len;
    const t = castLevelRay(level, vec3(-9, 1.5, -2), d, 40, out);
    const atX = (4.8 + 9) / d.x;
    expect(-2 + atX * d.z).toBeGreaterThan(0); // within the container's length (z 0 to 6)
    expect(t).toBeCloseTo(atX, 9);
    expect(out.normal.x).toBe(-1);
    expect(out.material).toBe('metal');
    // Along z past the container's side: the wall at the far end, or nothing just over its top.
    expect(castLevelRay(level, vec3(9, 2.9, 9), vec3(0, 0, -1), 40, out)).toBeCloseTo(13.8, 9);
    expect(castLevelRay(level, vec3(9, 3.1, 9), vec3(0, 0, -1), 40, out)).toBe(-1);
  });

  it('tests a block once per cast however many cells it spans, and keeps working once its cast counter wraps', () => {
    const local = buildLevelRay(BLOCKS);
    local.cast = 0xfffffffe;
    for (let i = 0; i < 3; i++) expect(castLevelRay(local, vec3(0, 1.5, 0), vec3(0, 0, -1), 20)).toBeCloseTo(4.8, 9);
    expect(local.cast).toBeLessThan(10);
  });
});
