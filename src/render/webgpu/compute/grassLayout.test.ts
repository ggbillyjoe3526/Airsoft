import { describe, expect, it } from 'vitest';
import { GPU_GRASS, type GpuDressingTier } from '../../../config/gpuDressing';
import { QUALITY, resolveQuality } from '../../../config/render';
import { buildGroundGrid, GROUND_SURFACES } from '../../../map/groundSurfaces';
import { buildTerrain, terrainHeightAt } from '../../../map/terrain';
import { WOODLAND } from '../../../map/woodland';
import { createRng, rngNext } from '../../../sim/rng';
import { dressingTier } from './gpuDressing';
import { clipSlot, type GrassLevels, grassLevels, grassMask, levelReach, onTriangles } from './grassLayout';
import { numberOps as o } from './kernelOps';

/** The grass's layout (W5): the clipmap's slots, the ground's height under a blade, where grass grows. */

const TIERS: GpuDressingTier[] = ['medium', 'high', 'ultra'];

/** Every slot of `g` as "level:i:j". */
function slots(g: GrassLevels): string[] {
  const out: string[] = [];
  for (let n = 0; n < g.count; n++) {
    const s = clipSlot(o, n, g);
    out.push(`${s.level}:${s.i}:${s.j}`);
  }
  return out;
}

describe('the clipmap of blade slots', () => {
  it("caps each preset's blades, Ultra near the concept's 160,000", () => {
    expect(TIERS.map((t) => grassLevels(t).count)).toEqual([41_952, 93_696, 159_892]);
    expect(grassLevels('ultra').count).toBeLessThanOrEqual(160_000);
  });

  it('gives every lattice point of the square and of each ring one slot, and no slot two points', () => {
    const g: GrassLevels = { ...grassLevels('medium'), half: 10, hole: 3, levels: 3, first: 400, perLevel: 4 * (100 - 9), count: 400 + 2 * 4 * 91 };
    const all = slots(g);
    expect(new Set(all).size).toBe(g.count);
    for (let level = 0; level < g.levels; level++) {
      for (let i = -g.half; i < g.half; i++) {
        for (let j = -g.half; j < g.half; j++) {
          const inHole = level > 0 && i >= -g.hole && i < g.hole && j >= -g.hole && j < g.hole;
          expect(all.includes(`${level}:${i}:${j}`)).toBe(!inHole);
        }
      }
    }
    // And on a real preset: every slot inside its ring.
    for (const s of slots(grassLevels('medium'))) {
      const [level, i, j] = s.split(':').map(Number) as [number, number, number];
      const g2 = grassLevels('medium');
      expect(Math.max(Math.abs(i + 0.5), Math.abs(j + 0.5))).toBeLessThanOrEqual(g2.half);
      if (level > 0) expect(Math.max(i < 0 ? -i : i + 1, j < 0 ? -j : j + 1)).toBeGreaterThan(g2.hole);
    }
  });

  it("leaves no gap: each ring's hole lies inside the reach of the one within it, and each reaches past its predecessor", () => {
    for (const t of TIERS) {
      const g = grassLevels(t);
      for (let level = 1; level < g.levels; level++) {
        const step = g.spacing * 2 ** level;
        // The hole's farthest point from the eye: its edge, and the ring's middle up to half a step off the eye.
        expect((g.hole + 0.5) * step).toBeLessThan(levelReach(g, level - 1));
        expect(levelReach(g, level)).toBeGreaterThan(levelReach(g, level - 1));
      }
      // A blade a ring's square holds lies within its reach of any eye inside the half step its middle snaps by.
      expect((g.half - 0.5) * g.spacing).toBeGreaterThan(levelReach(g, 0));
    }
  });

  it('reaches out to the haze on High and Ultra (Woodland by night: 140 m), and thins by four a ring', () => {
    expect(levelReach(grassLevels('ultra'), 3)).toBeGreaterThan(120);
    expect(levelReach(grassLevels('high'), 3)).toBeGreaterThan(120);
    const g = grassLevels('high');
    expect(levelReach(g, 1) / levelReach(g, 0)).toBe(2);
  });
});

describe('onTriangles', () => {
  it("gives the terrain's height on its own triangles, as terrainHeightAt does", () => {
    const t = buildTerrain(-12, -8, 1.5, 16, 10, (x, z) => Math.sin(x * 0.4) * 2 + Math.cos(z * 0.7) + x * 0.05);
    const rng = createRng(17);
    const read = (i: number, j: number): number => t.heights[j * (t.cols + 1) + i]!;
    for (let k = 0; k < 500; k++) {
      const x = t.minX + rngNext(rng) * t.cols * t.cell;
      const z = t.minZ + rngNext(rng) * t.rows * t.cell;
      const h = onTriangles(o, (x - t.minX) / t.cell, (z - t.minZ) / t.cell, t.cols, t.rows, read);
      expect(h).toBeCloseTo(terrainHeightAt(t, x, z)!, 9);
    }
    // Its far edges count as inside, as terrainHeightAt's do.
    expect(onTriangles(o, t.cols, t.rows, t.cols, t.rows, read)).toBeCloseTo(terrainHeightAt(t, t.minX + t.cols * t.cell, t.minZ + t.rows * t.cell)!, 9);
  });
});

describe('grassMask', () => {
  const terrain = WOODLAND.terrain!;
  const grid = buildGroundGrid(WOODLAND)!;
  const mask = grassMask(WOODLAND, terrain, grid);
  const at = (x: number, z: number): number => mask.cells[Math.floor((z - mask.minZ) / mask.cell) * mask.cols + Math.floor((x - mask.minX) / mask.cell)]!;

  it("covers the terrain at the mask's cell, grass on Woodland's meadow", () => {
    expect(mask.cell).toBe(GPU_GRASS.mask.cell);
    expect(mask.cols * mask.cell).toBe(terrain.cols * terrain.cell);
    const share = mask.cells.reduce((n, c) => n + (c > 0 ? 1 : 0), 0) / mask.cells.length;
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.95);
  });

  it('grows none off the grass, under the trees, under any block standing on the ground, or in a puddle', () => {
    const grass = GROUND_SURFACES.indexOf('grass');
    for (let r = 0; r < mask.rows; r += 3) {
      for (let c = 0; c < mask.cols; c += 3) {
        const x = mask.minX + (c + 0.5) * mask.cell;
        const z = mask.minZ + (r + 0.5) * mask.cell;
        const k = Math.floor((z - grid.minZ) / grid.cell) * grid.cols + Math.floor((x - grid.minX) / grid.cell);
        if (grid.surface[k] !== grass || grid.underTrees[k] === 1) expect(mask.cells[r * mask.cols + c]).toBe(0);
      }
    }
    for (const b of WOODLAND.blocks) {
      const ground = terrainHeightAt(terrain, b.center.x, b.center.z);
      if (ground === undefined || b.center.y - b.size.y / 2 > ground + 0.5) continue;
      expect(at(b.center.x, b.center.z)).toBe(0);
    }
    for (const p of WOODLAND.dressing!.puddles!) if (Math.abs(p.x) < 59 && Math.abs(p.z) < 39) expect(at(p.x, p.z)).toBe(0);
  });
});

describe('dressingTier', () => {
  it('draws Medium, High and Ultra their own counts, Low none, and a Custom preset High with Map detail on', () => {
    expect(dressingTier(QUALITY.low)).toBeNull();
    expect(dressingTier(QUALITY.medium)).toBe('medium');
    expect(dressingTier(QUALITY.high)).toBe('high');
    expect(dressingTier(QUALITY.ultra)).toBe('ultra');
    expect(dressingTier(resolveQuality('custom', { shadows: false }))).toBe('high');
    expect(dressingTier(resolveQuality('custom', { mapDetail: false }))).toBeNull();
  });
});
