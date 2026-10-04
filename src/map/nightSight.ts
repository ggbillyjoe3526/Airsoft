import type { Vec3 } from '../sim/vec';
import type { MapData } from './mapTypes';

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
  /** Ground counts as under the trees when at least `canopyTrees` tree trunks stand within `canopyRadius` m of it. */
  canopyTrees: number;
  canopyRadius: number;
  /** The canopy is worked out on a grid of this cell size (m). */
  canopyCell: number;
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
}

/** The night field of `map`, or null for a daylight map. Tree trunks are its blocks of kind `tree`. */
export function buildNightField(map: MapData, cfg: NightSightConfig): NightField | null {
  if (!map.night) return null;
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
  if (!Number.isFinite(x0)) return { sight: cfg, lights, minX: 0, minZ: 0, cell: cfg.canopyCell, cols: 0, rows: 0, canopy: new Uint8Array(0) };
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
  return { sight: cfg, lights, minX: x0, minZ: z0, cell, cols, rows, canopy };
}

/** Whether `p` stands in one of the light pools (horizontal distance within the pool's radius). */
export function inLight(field: NightField, p: Vec3): boolean {
  for (const l of field.lights) {
    const dx = p.x - l.position.x;
    const dz = p.z - l.position.z;
    if (dx * dx + dz * dz <= l.radius * l.radius) return true;
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

/** How far away someone standing at `p` can be made out at night (m): lit, under the trees, or in the open. */
export function nightSightRange(field: NightField, p: Vec3): number {
  if (inLight(field, p)) return field.sight.lit;
  return underCanopy(field, p) ? field.sight.canopy : field.sight.open;
}
