import { GPU_FOREST, type GpuDressingTier } from '../../../config/gpuDressing';
import type { SkylinePiece } from '../../../map/mapTypes';
import { createRng, rngNext } from '../../../sim/rng';
import { skylineClear } from '../../skyline';

/**
 * Where the tree stand-ins beyond the fence stand (WebGPU overhaul W5, MapDressing.forest; drawn by
 * forestStandIns.ts): scattered at random but never closer than GPU_FOREST.apart to each other, between the field's
 * bounds (GPU_FOREST.fence m out from them) and GPU_FOREST.reach m from its middle, clear of every skyline piece that
 * keeps trees off (render/skyline.ts skylineClear), on a skyline hill's slope where they stand on one. Seeded, so a
 * map's wood is the same every time; a preset with fewer takes the first of them (the order is random, so the wood
 * thins evenly). Pure: unit-tested in forestLayout.test.ts.
 */

/** One stand-in: its foot (world), its height (m), which picture (0 .. GPU_FOREST.variants − 1) and its shade (×). */
export interface StandIn {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly height: number;
  readonly variant: number;
  readonly shade: number;
}

/** The field's bounds on the ground (world x, z). */
export interface FieldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * The ground's height on the skyline's hills at (x, z) (0 off them): each hill is the top of a squashed sphere sunk a
 * metre (render/skyline.ts), so its smooth surface; the drawn one is a little lower between its vertices, which a
 * stand-in's foot, sunk GPU_FOREST.sink, covers.
 */
export function hillHeight(pieces: readonly SkylinePiece[], x: number, z: number): number {
  let y = 0;
  for (const p of pieces) {
    if (p.kind !== 'hill') continue;
    const r2 = ((x - p.x) / (p.width / 2)) ** 2 + ((z - p.z) / (p.depth / 2)) ** 2;
    if (r2 < 1) y = Math.max(y, (p.height + 1) * Math.sqrt(1 - r2) - 1);
  }
  return y;
}

/** How many stand-ins `tier` draws of a wood of `trees`. */
export function forestCount(trees: number, tier: GpuDressingTier): number {
  return Math.round(trees * GPU_FOREST.share[tier]);
}

/** Up to `trees` stand-ins round `field` (fewer only if the band can't fit them `apart`). */
export function placeForest(trees: number, field: FieldBounds, skyline: readonly SkylinePiece[]): StandIn[] {
  const F = GPU_FOREST;
  const rng = createRng(F.seed);
  const cx = (field.minX + field.maxX) / 2;
  const cz = (field.minZ + field.maxZ) / 2;
  const out: StandIn[] = [];
  // A grid of cells `apart` wide holds every placed tree's index, so each try checks only its neighbours.
  const cell = F.apart;
  const span = Math.ceil((2 * F.reach) / cell) + 1;
  const grid = new Map<number, number[]>();
  const key = (i: number, j: number): number => j * span + i;
  const clear = (x: number, z: number): boolean => {
    const i = Math.floor((x - cx + F.reach) / cell);
    const j = Math.floor((z - cz + F.reach) / cell);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        for (const k of grid.get(key(i + di, j + dj)) ?? []) if (Math.hypot(out[k]!.x - x, out[k]!.z - z) < F.apart) return false;
      }
    }
    return true;
  };
  const tries = trees * 30;
  for (let t = 0; t < tries && out.length < trees; t++) {
    const x = cx + (rngNext(rng) * 2 - 1) * F.reach;
    const z = cz + (rngNext(rng) * 2 - 1) * F.reach;
    const height = F.height[0] + rngNext(rng) * (F.height[1] - F.height[0]);
    const variant = Math.min(F.variants - 1, Math.floor(rngNext(rng) * F.variants));
    const shade = 1 + (rngNext(rng) * 2 - 1) * F.jitter;
    if (Math.hypot(x - cx, z - cz) > F.reach) continue;
    // Outside the field by `fence` m on whichever side it lies.
    const out0 = Math.max(field.minX - x, x - field.maxX, field.minZ - z, z - field.maxZ);
    if (out0 < F.fence || !skylineClear(skyline, x, z) || !clear(x, z)) continue;
    const k = out.length;
    out.push({ x, y: hillHeight(skyline, x, z) - F.sink, z, height, variant, shade });
    const g = key(Math.floor((x - cx + F.reach) / cell), Math.floor((z - cz + F.reach) / cell));
    const list = grid.get(g);
    if (list) list.push(k);
    else grid.set(g, [k]);
  }
  return out;
}
