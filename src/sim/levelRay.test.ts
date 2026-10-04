import { describe, expect, it } from 'vitest';
import type { MapBlock } from '../map/mapTypes';
import { planeTerrain, SLOPE_YARD, SLOPE_YARD_TERRAIN } from '../map/testSupport';
import { terrainHeightAt, terrainRange } from '../map/terrain';
import { createRng, rngNext } from './rng';
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

describe('castLevelRay against sloping ground (M33c)', () => {
  const level = buildLevelRay(SLOPE_YARD.blocks, 1, SLOPE_YARD_TERRAIN);
  const ground = (x: number, z: number): number => terrainHeightAt(SLOPE_YARD_TERRAIN, x, z)!;

  it('stops a ray straight down on terrainHeightAt, with an upward normal and the material earth', () => {
    const out = hit();
    const rng = createRng(5);
    for (let n = 0; n < 300; n++) {
      const x = -13 + rngNext(rng) * 26;
      const z = -13 + rngNext(rng) * 26;
      // Skip the crate and the walls, which stop the ray first.
      if (SLOPE_YARD.blocks.some((b) => Math.abs(x - b.center.x) < b.size.x / 2 + 0.1 && Math.abs(z - b.center.z) < b.size.z / 2 + 0.1)) continue;
      expect(castLevelRay(level, vec3(x, 9, z), vec3(0, -1, 0), 30, out), `(${x}, ${z})`).toBeCloseTo(9 - ground(x, z), 5);
      expect(out.material).toBe('earth');
      expect(out.normal.y).toBeGreaterThan(0.5); // the hill's flank is the steepest, about 0.6 rise per metre
      expect(Math.hypot(out.normal.x, out.normal.y, out.normal.z)).toBeCloseTo(1, 6);
    }
    expect(castLevelRay(level, vec3(0, 9, 0), vec3(0, -1, 0), 30)).toBeCloseTo(9 - ground(0, 0), 5);
  });

  it('gives a plane its analytic normal, tilted back down the slope', () => {
    const plane = buildLevelRay([], 1, planeTerrain(0.3));
    const out = hit();
    expect(castLevelRay(plane, vec3(2, 5, 3), vec3(0, -1, 0), 20, out)).toBeCloseTo(5 - 0.6, 5);
    const n = Math.hypot(0.3, 1);
    expect(out.normal.x).toBeCloseTo(-0.3 / n, 6);
    expect(out.normal.y).toBeCloseTo(1 / n, 6);
    expect(out.normal.z).toBeCloseTo(0, 6);
    expect(out.material).toBe('earth');
  });

  it('lands slanted rays from above and level rays from the side on the ground surface', () => {
    const out = hit();
    const rng = createRng(8);
    let hits = 0;
    for (let n = 0; n < 400; n++) {
      const origin = vec3(-12 + rngNext(rng) * 24, 4 + rngNext(rng) * 4, -12 + rngNext(rng) * 24);
      // Slanted: pitched 10 to 80 degrees below the horizon, any heading.
      const yaw = rngNext(rng) * Math.PI * 2;
      const pitch = ((10 + rngNext(rng) * 70) * Math.PI) / 180;
      const d = vec3(Math.cos(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
      const t = castLevelRay(level, origin, d, 60, out);
      if (t < 0) continue; // out through the side of the yard, or into a wall
      if (out.material !== 'earth') continue;
      hits++;
      const px = origin.x + d.x * t;
      const py = origin.y + d.y * t;
      const pz = origin.z + d.z * t;
      expect(py, `slanted ${n}`).toBeCloseTo(ground(px, pz), 4);
      // The ray was above the ground all the way (the first hit, not a later one).
      for (const f of [0.2, 0.5, 0.8, 0.99]) {
        const x = origin.x + d.x * t * f;
        const z = origin.z + d.z * t * f;
        expect(origin.y + d.y * t * f, `slanted ${n} at ${f}`).toBeGreaterThan(ground(x, z) - 1e-6);
      }
      expect(out.normal.x * d.x + out.normal.y * d.y + out.normal.z * d.z, 'normal faces back along the ray').toBeLessThan(0);
      expect(out.normal.y).toBeGreaterThan(0);
    }
    expect(hits).toBeGreaterThan(100);
    // From the side: level along +x at z = 8 (clear of the hill and blocks) at a height under the slope's upper end.
    const along = castLevelRay(level, vec3(-12, 0, 8), vec3(1, 0, 0), 40, out);
    expect(along).toBeGreaterThan(0);
    expect(0 - ground(-12 + along, 8)).toBeCloseTo(0, 4); // y = 0 meets the slope where 0.15 x = 0, x = 0
    expect(-12 + along).toBeCloseTo(0, 3);
    expect(out.material).toBe('earth');
    expect(out.normal.x).toBeLessThan(0); // the slope faces back down towards -x, towards the ray
    expect(out.normal.y).toBeGreaterThan(0.9);
    // From below the slope's high end, going up and across: it meets the ground from the underside.
    const under = castLevelRay(level, vec3(10, -5, 8), vec3(0, 1, 0), 40, out);
    expect(under).toBeCloseTo(ground(10, 8) + 5, 5);
    expect(out.normal.y).toBeLessThan(0);
  });

  it('flies over a hill it passes above and meets it just below its crest', () => {
    const { max } = terrainRange(SLOPE_YARD_TERRAIN);
    const out = hit();
    // Along +x across the hill's flank (z = -9), clear of the low wall, above the crest of the whole terrain.
    expect(castLevelRay(level, vec3(-13, max + 0.5, -9), vec3(1, 0, 0), 40, out)).toBe(-1);
    // Along the grid line z = -6 through the hill's centre the ground is straight between vertices, so its highest
    // point is a vertex: a level ray a hair above it flies over, a hair below it meets the hill's near flank.
    let peak = -Infinity;
    for (let x = -13; x <= 13; x++) peak = Math.max(peak, ground(x, -6));
    expect(castLevelRay(level, vec3(-13, peak + 0.01, -6), vec3(1, 0, 0), 40, out)).toBe(-1);
    const t = castLevelRay(level, vec3(-13, peak - 0.01, -6), vec3(1, 0, 0), 40, out);
    expect(t).toBeGreaterThan(0);
    expect(peak - 0.01 - ground(-13 + t, -6)).toBeCloseTo(0, 4);
    expect(out.material).toBe('earth');
    // A ray over the top of the ground but short of it reports nothing.
    expect(castLevelRay(level, vec3(0, 9, 8), vec3(0, -1, 0), 9 - ground(0, 8) - 0.01)).toBe(-1);
  });

  it('lets the nearer of a block and the ground win, with each one\'s own normal and material', () => {
    const out = hit();
    const crate = SLOPE_YARD.blocks[0]!;
    const top = crate.center.y + crate.size.y / 2;
    // Down onto the crate's top: wood at the crate's height, though the ground is lower beneath it.
    expect(castLevelRay(level, vec3(crate.center.x, 5, crate.center.z), vec3(0, -1, 0), 20, out)).toBeCloseTo(5 - top, 6);
    expect(out.material).toBe('wood');
    expect(out.normal.y).toBe(1);
    // Beside it, the ground.
    expect(castLevelRay(level, vec3(crate.center.x + 1.5, 5, crate.center.z), vec3(0, -1, 0), 20, out)).toBeCloseTo(5 - ground(crate.center.x + 1.5, crate.center.z), 5);
    expect(out.material).toBe('earth');
    // A level ray into the crate's side at a height above the ground meets the crate; the earth under it is not met first.
    const side = castLevelRay(level, vec3(-9, top - 0.2, crate.center.z), vec3(1, 0, 0), 20, out);
    expect(side).toBeCloseTo(9 - 5 - 0.6, 6);
    expect(out.material).toBe('wood');
    // The yard's end wall stops a level ray across the slope's low end (its far side below the ground there).
    expect(castLevelRay(level, vec3(-10, 1.5, 0), vec3(-1, 0, 0), 20, out)).toBeCloseTo(4.6, 6);
    expect(out.material).toBe('concrete');
  });

  it('hits the ground with no blocks at all, and not beyond the terrain or past maxDist', () => {
    const bare = buildLevelRay([], 1, SLOPE_YARD_TERRAIN);
    const out = hit();
    expect(castLevelRay(bare, vec3(0, 3, 0), vec3(0, -1, 0), 10, out)).toBeCloseTo(3 - ground(0, 0), 5);
    expect(out.material).toBe('earth');
    expect(castLevelRay(bare, vec3(0, 3, 0), vec3(0, -1, 0), 3 - ground(0, 0) - 0.01, out)).toBe(-1);
    // Off the terrain's footprint there is no ground to meet.
    expect(castLevelRay(bare, vec3(20, 3, 0), vec3(0, -1, 0), 50, out)).toBe(-1);
    // Entering the footprint from outside, slanting down into it.
    const d = vec3(Math.SQRT1_2, -Math.SQRT1_2, 0);
    const t = castLevelRay(bare, vec3(-20, 6, 8), d, 60, out);
    expect(t).toBeGreaterThan(0);
    expect(6 + d.y * t).toBeCloseTo(ground(-20 + d.x * t, 8), 4);
    // The same map without terrain: nothing to hit.
    expect(castLevelRay(buildLevelRay([], 1), vec3(0, 3, 0), vec3(0, -1, 0), 10)).toBe(-1);
  });
});
