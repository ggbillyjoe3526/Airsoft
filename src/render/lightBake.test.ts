import { describe, expect, it } from 'vitest';
import { BAKED_LIGHT } from '../config/bake';
import type { MapBlock, MapData } from '../map/mapTypes';
import { vec3 } from '../sim/vec';
import { bakeHash, bakeInputs, bakeProbes, rayDirections } from './lightBake';
import { decodeProbeFile, encodeProbeFile } from './probeFile';
import { type ProbeSample, sampleProbes } from './probeGrid';

/**
 * The offline bake (G6, render/lightBake.ts; run by pipeline/bake-light.mjs): a small yard with a red wall beside open
 * ground and a closed hut, baked as the game's maps are.
 */

const RED = 0xd02020;
const floor: MapBlock = { kind: 'floor', center: vec3(0, -0.1, 0), size: vec3(16, 0.2, 16) };
const redWall: MapBlock = { kind: 'wall', center: vec3(-3, 1.5, 0), size: vec3(0.4, 3, 8), paint: RED };
/** A hut 3 m square, walls and roof all round: dark inside. */
const hut: MapBlock[] = [
  { kind: 'wall', center: vec3(4, 1.25, -1.5), size: vec3(3.4, 2.5, 0.2) },
  { kind: 'wall', center: vec3(4, 1.25, 1.5), size: vec3(3.4, 2.5, 0.2) },
  { kind: 'wall', center: vec3(2.4, 1.25, 0), size: vec3(0.2, 2.5, 3) },
  { kind: 'wall', center: vec3(5.6, 1.25, 0), size: vec3(0.2, 2.5, 3) },
  { kind: 'floor', center: vec3(4, 2.6, 0), size: vec3(3.4, 0.2, 3.4) },
];
const YARD: MapData = { name: 'Bake yard', blocks: [floor, redWall, ...hut], killY: -10, spawns: [[], []], deadZones: [[], []], lanes: [] };

describe('the light bake (G6)', () => {
  const inputs = bakeInputs(YARD);
  const grid = bakeProbes(inputs);
  const at = (x: number, y: number, z: number): ProbeSample => sampleProbes(grid, x, y, z, { r: 0, g: 0, b: 0, vis: 1 });

  it('casts its rays evenly over the sphere (unit length, centred)', () => {
    const d = rayDirections(BAKED_LIGHT.bake.rays);
    const sum = [0, 0, 0];
    for (let i = 0; i < BAKED_LIGHT.bake.rays; i++) {
      expect(Math.hypot(d[i * 3]!, d[i * 3 + 1]!, d[i * 3 + 2]!)).toBeCloseTo(1, 9);
      for (let a = 0; a < 3; a++) sum[a]! += d[i * 3 + a]!;
    }
    for (const s of sum) expect(Math.abs(s) / BAKED_LIGHT.bake.rays).toBeLessThan(0.05);
  });

  it('is deterministic: the same map gives the same bytes, and its hash is stamped in', () => {
    const again = bakeProbes(bakeInputs(YARD));
    expect(Array.from(encodeProbeFile(again))).toEqual(Array.from(encodeProbeFile(grid)));
    expect(grid.hash).toBe(bakeHash(inputs));
    expect(grid.version).toBe(BAKED_LIGHT.bake.version);
    expect(grid.preset).toBe(BAKED_LIGHT.bake.preset);
    expect(decodeProbeFile(encodeProbeFile(grid))).toEqual(grid);
  });

  it('spaces the probes as the bake says, over the map and a little above its highest block', () => {
    expect(grid.spacing).toBeCloseTo(BAKED_LIGHT.bake.probe, 6);
    expect(grid.origin[0]).toBeLessThanOrEqual(-8);
    expect(grid.origin[0] + (grid.nx - 1) * grid.spacing).toBeGreaterThanOrEqual(8 - grid.spacing);
    expect(grid.origin[1] + (grid.ny - 1) * grid.spacing).toBeGreaterThanOrEqual(3 + BAKED_LIGHT.bake.headroom - grid.spacing);
  });

  it('sees the open sky in the open, little of it inside the hut, and less at a wall’s foot than in the open', () => {
    const open = at(-6, 1, 6);
    expect(open.vis).toBeGreaterThan(0.85);
    // (Rays down to the open ground count as open: the hemisphere's ground colour is that light, so a hut keeps a third.)
    expect(at(4, 1.2, 0).vis).toBeLessThan(0.4);
    expect(at(-2.6, 0.4, 0).vis).toBeLessThan(open.vis - 0.1);
  });

  it('brings the red wall’s colour onto the ground beside it, more than in the open', () => {
    const beside = at(-2.4, 0.5, 0);
    const open = at(-6, 0.5, 6);
    expect(beside.r).toBeGreaterThan(beside.g * 1.3);
    expect(beside.r).toBeGreaterThan(open.r);
  });

  it('asks for a re-bake (a new hash) when a block moves, a tint changes or the sun moves, and only then', () => {
    expect(bakeHash(bakeInputs({ ...YARD }))).toBe(grid.hash);
    const moved = { ...YARD, blocks: [floor, { ...redWall, center: vec3(-3.5, 1.5, 0) }, ...hut] };
    expect(bakeHash(bakeInputs(moved))).not.toBe(grid.hash);
    const repainted = { ...YARD, blocks: [floor, { ...redWall, paint: 0x2020d0 }, ...hut] };
    expect(bakeHash(bakeInputs(repainted))).not.toBe(grid.hash);
    const sun = { ...inputs, sunDir: [0, 1, 0] as [number, number, number] };
    expect(bakeHash(sun)).not.toBe(grid.hash);
  });
});
