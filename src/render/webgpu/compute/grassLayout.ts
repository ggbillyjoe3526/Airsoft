import { GPU_GRASS, type GpuDressingTier } from '../../../config/gpuDressing';
import { GROUND_SURFACES, type GroundGrid } from '../../../map/groundSurfaces';
import type { MapData } from '../../../map/mapTypes';
import { type Terrain, terrainHeightAt } from '../../../map/terrain';
import type { Ops } from './kernelOps';

/**
 * Where the grass's blades can be (WebGPU overhaul W5; drawn by grassField.ts): the clipmap of blade slots round the
 * camera (config/gpuDressing.ts GPU_GRASS), the ground's height under a blade on the terrain's own triangles, and the
 * mask of where grass grows. Pure: the kernels are written over kernelOps.ts's Ops, so the compute pass and the unit
 * tests (grassLayout.test.ts, against map/terrain.ts and every lattice point of a ring) run the same formula.
 */

/**
 * A preset's clipmap: a full square of `first` slots round the camera, then `levels − 1` rings of `perLevel` slots
 * round it, ring L's lattice `spacing`·2^L apart.
 */
export interface GrassLevels {
  readonly spacing: number;
  readonly half: number;
  readonly hole: number;
  readonly levels: number;
  readonly first: number;
  readonly perLevel: number;
  readonly count: number;
}

/** The clipmap for `tier`. */
export function grassLevels(tier: GpuDressingTier): GrassLevels {
  const { spacing, half, levels } = GPU_GRASS.tiers[tier];
  // The ring inside covers the hole: its reach, (half − 1) of its own (half as wide) steps, is past the hole's far edge.
  const hole = Math.floor(half / 2) - 2;
  const first = 4 * half * half;
  const perLevel = 4 * (half * half - hole * hole);
  return { spacing, half, hole, levels, first, perLevel, count: first + perLevel * (levels - 1) };
}

/**
 * Slot `n` of the clipmap as its ring and its lattice step (i, j) from the ring's middle: the first `first` slots fill
 * the inner square row by row, the rest are the rings' (ringSlot).
 */
export function clipSlot<T>(o: Ops<T>, n: T, g: GrassLevels): { level: T; i: T; j: T } {
  const width = 2 * g.half;
  const k = o.sub(n, o.c(g.first));
  const ring = o.floor(o.div(k, o.c(g.perLevel)));
  const slot = ringSlot(o, o.sub(k, o.mul(ring, o.c(g.perLevel))), g.half, g.hole);
  const pick = (a: T, b: T): T => o.ifLess(n, o.c(g.first), a, b);
  return {
    level: pick(o.c(0), o.add(ring, o.c(1))),
    i: pick(o.sub(mod(o, n, width), o.c(g.half)), slot.i),
    j: pick(o.sub(o.floor(o.div(n, o.c(width))), o.c(g.half)), slot.j),
  };
}

/** How far ring `level` reaches from the camera (Chebyshev metres): every slot of it nearer than this is drawn. */
export function levelReach(g: GrassLevels, level: number): number {
  return (g.half - 1) * g.spacing * 2 ** level;
}

/** `v` mod `n` for v ≥ 0 (floats: every count here is under 2^24). */
function mod<T>(o: Ops<T>, v: T, n: number): T {
  return o.sub(v, o.mul(o.floor(o.div(v, o.c(n))), o.c(n)));
}

/**
 * Slot `k` (0 .. perLevel − 1) of a ring as its lattice step (i, j) from the ring's middle: the ring is the square
 * [−half, half)² less the hole [−hole, hole)², cut into four rectangles (the rows above and below the hole, full width,
 * then the columns left and right of it), so every lattice point of the ring is one slot and no slot is wasted.
 */
export function ringSlot<T>(o: Ops<T>, k: T, half: number, hole: number): { i: T; j: T } {
  const width = 2 * half;
  const band = half - hole;
  const rows = width * band;
  const sides = band * 2 * hole;
  // Above the hole, below it, left of it, right of it.
  const kb = o.sub(k, o.c(rows));
  const kl = o.sub(k, o.c(2 * rows));
  const kr = o.sub(k, o.c(2 * rows + sides));
  const above = { i: o.sub(mod(o, k, width), o.c(half)), j: o.add(o.c(hole), o.floor(o.div(k, o.c(width)))) };
  const below = { i: o.sub(mod(o, kb, width), o.c(half)), j: o.sub(o.floor(o.div(kb, o.c(width))), o.c(half)) };
  const left = { i: o.sub(mod(o, kl, band), o.c(half)), j: o.sub(o.floor(o.div(kl, o.c(band))), o.c(hole)) };
  const right = { i: o.add(mod(o, kr, band), o.c(hole)), j: o.sub(o.floor(o.div(kr, o.c(band))), o.c(hole)) };
  const pick = (a: T, b: T, c: T, d: T): T => o.ifLess(k, o.c(rows), a, o.ifLess(k, o.c(2 * rows), b, o.ifLess(k, o.c(2 * rows + sides), c, d)));
  return { i: pick(above.i, below.i, left.i, right.i), j: pick(above.j, below.j, left.j, right.j) };
}

/**
 * The terrain's height (or any value per vertex: `read(i, j)`) at the point (fx, fz) in cells from its corner, on the
 * terrain's own triangles (map/terrain.ts terrainHeightAt: each cell split along its (0, 0)–(1, 1) diagonal). The caller
 * keeps fx, fz inside the terrain.
 */
export function onTriangles<T>(o: Ops<T>, fx: T, fz: T, cols: number, rows: number, read: (i: T, j: T) => T): T {
  const i = o.min(o.c(cols - 1), o.floor(fx));
  const j = o.min(o.c(rows - 1), o.floor(fz));
  const u = o.sub(fx, i);
  const v = o.sub(fz, j);
  const i1 = o.add(i, o.c(1));
  const j1 = o.add(j, o.c(1));
  const h00 = read(i, j);
  const h11 = read(i1, j1);
  // u ≥ v: the triangle with (1, 0); else the one with (0, 1). Both corners are read either way (no branch on the GPU).
  const h10 = read(i1, j);
  const h01 = read(i, j1);
  const lower = o.add(o.add(h00, o.mul(u, o.sub(h10, h00))), o.mul(v, o.sub(h11, h10)));
  const upper = o.add(o.add(h00, o.mul(v, o.sub(h01, h00))), o.mul(u, o.sub(h11, h01)));
  return o.ifLess(u, v, upper, lower);
}

/** Where grass grows, on a grid over the terrain: 1 grass, 0 none (255 and 0 in `cells`, row by row along z). */
export interface GrassMask {
  readonly minX: number;
  readonly minZ: number;
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  readonly cells: Uint8Array;
}

/** A block stands on the ground when its foot is no higher than this above the terrain under its middle (m). */
const ON_GROUND = 0.5;

/**
 * Where `map`'s grass grows (GPU_GRASS.mask): its ground grid's grass cells that aren't under the trees, off the
 * footprint of every block and look-only block standing on the ground (a margin round each) and every puddle. Over
 * the terrain's area, at GPU_GRASS.mask.cell.
 */
export function grassMask(map: MapData, terrain: Terrain, grid: GroundGrid): GrassMask {
  const { cell, margin } = GPU_GRASS.mask;
  const cols = Math.round((terrain.cols * terrain.cell) / cell);
  const rows = Math.round((terrain.rows * terrain.cell) / cell);
  const cells = new Uint8Array(cols * rows);
  const grass = GROUND_SURFACES.indexOf('grass');
  for (let r = 0; r < rows; r++) {
    const z = terrain.minZ + (r + 0.5) * cell;
    const gj = Math.floor((z - grid.minZ) / grid.cell);
    if (gj < 0 || gj >= grid.rows) continue;
    for (let c = 0; c < cols; c++) {
      const x = terrain.minX + (c + 0.5) * cell;
      const gi = Math.floor((x - grid.minX) / grid.cell);
      if (gi < 0 || gi >= grid.cols) continue;
      const k = gj * grid.cols + gi;
      if (grid.surface[k] === grass && grid.underTrees[k] === 0) cells[r * cols + c] = 255;
    }
  }
  const clear = (x0: number, x1: number, z0: number, z1: number, inside: (x: number, z: number) => boolean): void => {
    const c0 = Math.max(0, Math.floor((x0 - terrain.minX) / cell));
    const c1 = Math.min(cols - 1, Math.floor((x1 - terrain.minX) / cell));
    const r0 = Math.max(0, Math.floor((z0 - terrain.minZ) / cell));
    const r1 = Math.min(rows - 1, Math.floor((z1 - terrain.minZ) / cell));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) if (inside(terrain.minX + (c + 0.5) * cell, terrain.minZ + (r + 0.5) * cell)) cells[r * cols + c] = 0;
    }
  };
  for (const b of [...map.blocks, ...(map.decor ?? [])]) {
    const ground = terrainHeightAt(terrain, b.center.x, b.center.z);
    if (ground === undefined || b.center.y - b.size.y / 2 > ground + ON_GROUND) continue;
    const hx = b.size.x / 2 + margin;
    const hz = b.size.z / 2 + margin;
    clear(b.center.x - hx, b.center.x + hx, b.center.z - hz, b.center.z + hz, () => true);
  }
  for (const p of map.dressing?.puddles ?? []) {
    const ax = p.width / 2 + margin;
    const az = p.depth / 2 + margin;
    clear(p.x - ax, p.x + ax, p.z - az, p.z + az, (x, z) => ((x - p.x) / ax) ** 2 + ((z - p.z) / az) ** 2 <= 1);
  }
  return { minX: terrain.minX, minZ: terrain.minZ, cell, cols, rows, cells };
}
