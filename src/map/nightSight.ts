import type { Vec3 } from '../sim/vec';
import type { MapData } from './mapTypes';
import { surfaceHeightAt } from './surfaces';
import { type Terrain, terrainHeightAt, terrainMaxX, terrainMaxZ } from './terrain';

/**
 * A pool of light on a night field (M33g): a camp fire or a lantern at `position`, lighting the ground within `radius`
 * metres. Anyone standing in it can be made out from as far as in daylight. The renderer draws it (M33f); bots read it
 * here. `colour` is the light's (hex RGB).
 */
export interface MapLight {
  position: Vec3;
  radius: number;
  colour: number;
}

/** How far a bot makes someone out at night (m), by the light the target stands in (config/bots.ts NIGHT_SIGHT). */
export interface NightSightConfig {
  /** In a light pool, or in a lit weapon torch's beam (M33h, map/torchLight.ts): as far as in daylight. */
  lit: number;
  /** In the open, by moonlight. */
  open: number;
  /** Under the trees, where the canopy hides the moon. */
  canopy: number;
  /** Indoors in the dark (M34e): under a floor or roof where no pool lights. */
  indoor: number;
  /** Ground counts as under the trees when at least `canopyTrees` tree trunks stand within `canopyRadius` m of it. */
  canopyTrees: number;
  canopyRadius: number;
  /** The canopy is worked out on a grid of this cell size (m). */
  canopyCell: number;
  /**
   * Floors (M34e): a pool lights the floor under it, for feet from `poolBelow` m under that floor to `poolAbove` m over
   * it, not the floors above or below.
   */
  poolBelow: number;
  poolAbove: number;
  /**
   * Indoors (M34e): feet with the underside of a block between `roofFrom` and `roofTo` m over them stand under a floor or
   * roof; unlit, they are seen from `indoor` m.
   */
  roofFrom: number;
  roofTo: number;
  /**
   * A lit weapon torch (M33h) gives its holder away to anyone within this angle (degrees) of where it points: they are
   * made out from `lit` metres, however dark it is round them.
   */
  torchSeenFromDeg: number;
}

/**
 * What bots need to know about the dark on a night field (any map with `night`, Woodland first): the light pools, and
 * where the trees close overhead, on a grid worked out once when the match loads.
 */
export interface NightField {
  /** The sight ranges and canopy rule it was built with. */
  sight: NightSightConfig;
  lights: readonly MapLight[];
  minX: number;
  minZ: number;
  cell: number;
  cols: number;
  rows: number;
  /** 1 where the cell's centre is under the trees, row by row along z. */
  canopy: Uint8Array;
  /**
   * Each pool's floor height (M34e): the walkable surface under its light (NaN where there is none). On a map with
   * terrain the ground under the feet is the floor instead (`terrain`), so a pool lights the whole of a slope.
   */
  lightFloors: Float64Array;
  /** The map's terrain, if it has one: its ground is every pool's floor (as groundUnder reads it). */
  terrain?: Terrain | undefined;
  /**
   * The undersides over each cell's centre (M34e), lowest first: `roofs[roofStart[c] .. roofStart[c + 1])` for cell c,
   * from every block but trees, whose bottom is above the lowest walkable surface there.
   */
  roofStart: Uint32Array;
  roofs: Float64Array;
}

/**
 * The walkable ground's height at (x, z) for a pool whose light hangs at `below` (m): the terrain's (past its edge, the
 * edge's, so a pool by the fence stays flat behind it), or the highest floor or ramp top under the light; undefined where
 * there is none. (M33f; here since M34e, as night sight reads it too.)
 */
export function groundUnder(map: MapData, x: number, z: number, below: number): number | undefined {
  if (map.terrain) return terrainGround(map.terrain, x, z);
  let best: number | undefined;
  for (const b of map.blocks) {
    const h = surfaceHeightAt(b, x, z);
    if (h !== undefined && h <= below && (best === undefined || h > best)) best = h;
  }
  return best;
}

/** The terrain's height at (x, z), past its edge the edge's. */
function terrainGround(t: Terrain, x: number, z: number): number | undefined {
  return terrainHeightAt(t, Math.min(terrainMaxX(t), Math.max(t.minX, x)), Math.min(terrainMaxZ(t), Math.max(t.minZ, z)));
}

/**
 * The night field of `map`, or null for a daylight map. Tree trunks are its blocks of kind `tree`. `night`: whether it is
 * played at night (M33h: the match passes its resolved lighting preset's flag, render/lightingPreset.ts playsAtNight);
 * the map's own `night` when not given.
 */
export function buildNightField(map: MapData, cfg: NightSightConfig, night: boolean = map.night === true): NightField | null {
  if (!night) return null;
  const lights = map.lights ?? [];
  const trees = map.blocks.filter((b) => b.kind === 'tree');
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
  const lightFloors = Float64Array.from(lights, (l) => groundUnder(map, l.position.x, l.position.z, l.position.y) ?? Number.NaN);
  if (!Number.isFinite(x0)) return { sight: cfg, lights, minX: 0, minZ: 0, cell: cfg.canopyCell, cols: 0, rows: 0, canopy: new Uint8Array(0), lightFloors, roofStart: new Uint32Array(1), roofs: new Float64Array(0), terrain: map.terrain };
  const cell = cfg.canopyCell;
  const cols = Math.max(1, Math.ceil((x1 - x0) / cell));
  const rows = Math.max(1, Math.ceil((z1 - z0) / cell));
  const canopy = new Uint8Array(cols * rows);
  const r2 = cfg.canopyRadius * cfg.canopyRadius;
  for (let j = 0; j < rows; j++) {
    const z = z0 + (j + 0.5) * cell;
    for (let i = 0; i < cols; i++) {
      const x = x0 + (i + 0.5) * cell;
      let n = 0;
      for (const t of trees) {
        const dx = t.center.x - x;
        const dz = t.center.z - z;
        if (dx * dx + dz * dz <= r2 && ++n >= cfg.canopyTrees) break;
      }
      if (n >= cfg.canopyTrees) canopy[j * cols + i] = 1;
    }
  }
  const { roofStart, roofs } = buildRoofs(map, x0, z0, cell, cols, rows);
  return { sight: cfg, lights, minX: x0, minZ: z0, cell, cols, rows, canopy, lightFloors, roofStart, roofs, terrain: map.terrain };
}

/** The undersides over each cell's centre (NightField.roofs): every block but trees, lowest first. */
function buildRoofs(map: MapData, x0: number, z0: number, cell: number, cols: number, rows: number): { roofStart: Uint32Array; roofs: Float64Array } {
  const roofStart = new Uint32Array(cols * rows + 1);
  const all: number[] = [];
  const here: number[] = [];
  const solid = map.blocks.filter((b) => b.kind !== 'tree');
  for (let j = 0; j < rows; j++) {
    const z = z0 + (j + 0.5) * cell;
    for (let i = 0; i < cols; i++) {
      const x = x0 + (i + 0.5) * cell;
      here.length = 0;
      for (const b of solid) {
        if (Math.abs(x - b.center.x) > b.size.x / 2 || Math.abs(z - b.center.z) > b.size.z / 2) continue;
        here.push(b.center.y - b.size.y / 2);
      }
      here.sort((a, b) => a - b);
      roofStart[j * cols + i] = all.length;
      all.push(...here);
    }
  }
  roofStart[cols * rows] = all.length;
  return { roofStart, roofs: Float64Array.from(all) };
}

/**
 * Whether `p` (feet) stands in one of the light pools: within the pool's radius across, and on the floor it lights
 * (M34e: from `poolBelow` under that floor to `poolAbove` over it), not on a floor above or below. On terrain the floor is
 * the ground under the feet, as the renderer lights it.
 */
export function inLight(field: NightField, p: Vec3): boolean {
  for (let k = 0; k < field.lights.length; k++) {
    const l = field.lights[k]!;
    const dx = p.x - l.position.x;
    const dz = p.z - l.position.z;
    if (dx * dx + dz * dz > l.radius * l.radius) continue;
    const floor = field.terrain ? (terrainGround(field.terrain, p.x, p.z) ?? Number.NaN) : field.lightFloors[k]!;
    if (Number.isNaN(floor) || (p.y >= floor - field.sight.poolBelow && p.y <= floor + field.sight.poolAbove)) return true;
  }
  return false;
}

/** Whether `p` (feet) stands under a floor or roof (M34e): a block's underside between `roofFrom` and `roofTo` over it. */
export function underRoof(field: NightField, p: Vec3): boolean {
  const i = Math.floor((p.x - field.minX) / field.cell);
  const j = Math.floor((p.z - field.minZ) / field.cell);
  if (i < 0 || j < 0 || i >= field.cols || j >= field.rows) return false;
  const c = j * field.cols + i;
  const lo = p.y + field.sight.roofFrom;
  const hi = p.y + field.sight.roofTo;
  for (let k = field.roofStart[c]!; k < field.roofStart[c + 1]!; k++) {
    const h = field.roofs[k]!;
    if (h > hi) return false;
    if (h >= lo) return true;
  }
  return false;
}

/** Whether `p` is under the trees (outside the grid: no). */
export function underCanopy(field: NightField, p: Vec3): boolean {
  const i = Math.floor((p.x - field.minX) / field.cell);
  const j = Math.floor((p.z - field.minZ) / field.cell);
  if (i < 0 || j < 0 || i >= field.cols || j >= field.rows) return false;
  return field.canopy[j * field.cols + i] === 1;
}

/**
 * How far away someone standing at `p` can be made out at night (m): lit, under the trees, indoors in the dark (M34e),
 * or in the open.
 */
export function nightSightRange(field: NightField, p: Vec3): number {
  if (inLight(field, p)) return field.sight.lit;
  if (underCanopy(field, p)) return field.sight.canopy;
  return underRoof(field, p) ? field.sight.indoor : field.sight.open;
}
