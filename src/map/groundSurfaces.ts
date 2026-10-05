import { NIGHT_SIGHT } from '../config/bots';
import { GROUND_LOOK } from '../config/render';
import type { GroundPatch, GroundSurface, MapData } from './mapTypes';
import { buildNightField, underCanopy } from './nightSight';
import { terrainMaxX, terrainMaxZ } from './terrain';

/**
 * A map's ground on one grid (M33i, MapData.ground): what each cell is (grass, leaf litter, earth, gravel, boards). The
 * terrain is painted from it (render/terrainMeshes.ts) and footsteps read it (M33j, audio/soundMaterials.ts), the same
 * function for both, so what you see underfoot is what you hear. Pure data: no Three.js.
 */

/** The surfaces in grid order: a cell holds its surface's index here. */
export const GROUND_SURFACES: readonly GroundSurface[] = ['grass', 'leaves', 'earth', 'gravel', 'wood'];

export interface GroundGrid {
  minX: number;
  minZ: number;
  cell: number;
  cols: number;
  rows: number;
  /** Each cell's surface (an index into GROUND_SURFACES), row by row along z. */
  surface: Uint8Array;
  /** 1 where the cell is under the trees (the night sight's canopy rule), whatever its surface. */
  underTrees: Uint8Array;
}

/** Squared distance from (x, z) to the segment a–b. */
function segmentDistance2(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
  const ex = x - ax - t * dx;
  const ez = z - az - t * dz;
  return ex * ex + ez * ez;
}

/** Whether (x, z) lies on a patch: inside its box, or within half its width of its path. */
export function onPatch(p: GroundPatch, x: number, z: number): boolean {
  if (p.box) {
    const [x0, x1, z0, z1] = p.box;
    if (x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && z >= Math.min(z0, z1) && z <= Math.max(z0, z1)) return true;
  }
  const path = p.path;
  if (!path || path.length === 0) return false;
  const r2 = ((p.width ?? 0) / 2) ** 2;
  if (path.length === 1) return segmentDistance2(x, z, path[0]!.x, path[0]!.z, path[0]!.x, path[0]!.z) <= r2;
  for (let i = 1; i < path.length; i++) if (segmentDistance2(x, z, path[i - 1]!.x, path[i - 1]!.z, path[i]!.x, path[i]!.z) <= r2) return true;
  return false;
}

/** The ground's extent: the terrain's, else every block's footprint. */
function extent(map: MapData): { x0: number; x1: number; z0: number; z1: number } {
  const t = map.terrain;
  if (t) return { x0: t.minX, x1: terrainMaxX(t), z0: t.minZ, z1: terrainMaxZ(t) };
  let x0 = Number.POSITIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  for (const b of map.blocks) {
    x0 = Math.min(x0, b.center.x - b.size.x / 2);
    x1 = Math.max(x1, b.center.x + b.size.x / 2);
    z0 = Math.min(z0, b.center.z - b.size.z / 2);
    z1 = Math.max(z1, b.center.z + b.size.z / 2);
  }
  return Number.isFinite(x0) ? { x0, x1, z0, z1 } : { x0: 0, x1: 0, z0: 0, z1: 0 };
}

/**
 * The ground grid of `map` (cells `cell` m), or null for a map without MapData.ground. Each cell is `base`, then
 * `underTrees` where the trees close overhead (map/nightSight.ts's canopy rule, worked out as for a night match whatever
 * the light, so the ground is the same by day), then each patch in order over that, a later patch winning.
 */
export function buildGroundGrid(map: MapData, cell: number = GROUND_LOOK.cell): GroundGrid | null {
  const g = map.ground;
  if (!g) return null;
  const { x0, x1, z0, z1 } = extent(map);
  const cols = Math.max(1, Math.ceil((x1 - x0) / cell));
  const rows = Math.max(1, Math.ceil((z1 - z0) / cell));
  const surface = new Uint8Array(cols * rows).fill(GROUND_SURFACES.indexOf(g.base));
  const underTrees = new Uint8Array(cols * rows);
  const canopy = buildNightField(map, NIGHT_SIGHT, true)!;
  const under = g.underTrees === undefined ? -1 : GROUND_SURFACES.indexOf(g.underTrees);
  const patches = g.patches.map((p) => ({ p, id: GROUND_SURFACES.indexOf(p.surface) }));
  const point = { x: 0, y: 0, z: 0 };
  for (let j = 0; j < rows; j++) {
    point.z = z0 + (j + 0.5) * cell;
    for (let i = 0; i < cols; i++) {
      point.x = x0 + (i + 0.5) * cell;
      const k = j * cols + i;
      if (underCanopy(canopy, point)) {
        underTrees[k] = 1;
        if (under >= 0) surface[k] = under;
      }
      for (const { p, id } of patches) if (onPatch(p, point.x, point.z)) surface[k] = id;
    }
  }
  return { minX: x0, minZ: z0, cell, cols, rows, surface, underTrees };
}

/** The cell (i, j) holding (x, z), clamped to the grid's edge (the ground past it is its edge's). */
function cellIndex(grid: GroundGrid, x: number, z: number): number {
  const i = Math.min(grid.cols - 1, Math.max(0, Math.floor((x - grid.minX) / grid.cell)));
  const j = Math.min(grid.rows - 1, Math.max(0, Math.floor((z - grid.minZ) / grid.cell)));
  return j * grid.cols + i;
}

/** What the ground is at (x, z): O(1), allocation-free (M33j's footsteps call it every step). */
export function groundAt(grid: GroundGrid, x: number, z: number): GroundSurface {
  return GROUND_SURFACES[grid.surface[cellIndex(grid, x, z)]!]!;
}

/** Whether the ground at (x, z) is under the trees. */
export function groundUnderTrees(grid: GroundGrid, x: number, z: number): boolean {
  return grid.underTrees[cellIndex(grid, x, z)] === 1;
}
