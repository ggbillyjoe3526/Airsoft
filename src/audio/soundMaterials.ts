import { AUDIO } from '../config/audio';
import { blockMaterial, TERRAIN_MATERIAL } from '../config/materials';
import type { FloorSurface, ImpactMaterial } from '../config/sounds';
import { groundAt, type GroundGrid } from '../map/groundSurfaces';
import type { MapBlock } from '../map/mapTypes';
import { surfaceHeightAt } from '../map/surfaces';
import { type Terrain, terrainHeightAt } from '../map/terrain';
import type { Vec3 } from '../sim/vec';

/** How far below the feet (m) a walkable top still counts as the ground underfoot (steps land a little above it). */
const UNDERFOOT_REACH = 0.35;

/** What a step on top of a block that isn't a floor sounds like (BP2): Woodland's logs are wood, its boulders stone. */
const STOOD_ON: Partial<Record<MapBlock['kind'], FloorSurface>> = { log: 'wood', boulder: 'concrete' };

/** The top of `b` under (x, z) if it is a block a character can stand on top of though it isn't a floor (STOOD_ON). */
function stoodOnTop(b: MapBlock, x: number, z: number): number | undefined {
  if (STOOD_ON[b.kind] === undefined || Math.abs(x - b.center.x) > b.size.x / 2 || Math.abs(z - b.center.z) > b.size.z / 2) return undefined;
  return b.center.y + b.size.y / 2;
}

/**
 * The surface under a character's feet at `feet`: the highest floor or ramp top (or a log's or boulder's, STOOD_ON)
 * within reach of them, so a floor overhead or one storey down never counts (map/surfaces.ts). With none, on a map with
 * a ground grid (M33j: the one the terrain is painted from, map/groundSurfaces.ts), the ground's surface there: O(1),
 * allocation-free. Concrete where nothing says otherwise.
 */
export function surfaceUnder(blocks: readonly MapBlock[], feet: Vec3, ground: GroundGrid | null = null): FloorSurface {
  let best: MapBlock | undefined;
  let bestTop = Number.NEGATIVE_INFINITY;
  for (const b of blocks) {
    const top = surfaceHeightAt(b, feet.x, feet.z) ?? stoodOnTop(b, feet.x, feet.z);
    if (top === undefined || top > feet.y + UNDERFOOT_REACH || top < feet.y - UNDERFOOT_REACH || top <= bestTop) continue;
    best = b;
    bestTop = top;
  }
  if (best) return best.surface ?? STOOD_ON[best.kind] ?? 'concrete';
  return ground ? groundAt(ground, feet.x, feet.z) : 'concrete';
}

/** True if `p` is inside block `b` grown by `margin` on every side. */
function nearBlock(b: MapBlock, p: Vec3, margin: number): boolean {
  return (
    Math.abs(p.x - b.center.x) <= b.size.x / 2 + margin &&
    Math.abs(p.y - b.center.y) <= b.size.y / 2 + margin &&
    Math.abs(p.z - b.center.z) <= b.size.z / 2 + margin
  );
}

/**
 * What a BB hitting the level at `p` ticks off: the material of the block it landed on (a floor or ramp by its
 * surface). Where blocks meet, a prop wins over the floor or wall it stands against, since that's what the BB
 * most likely struck. On a map with sloping ground (M33c), a BB that came down on the ground is earth. Concrete if
 * nothing is that close.
 */
export function impactMaterialAt(blocks: readonly MapBlock[], p: Vec3, terrain: Terrain | null = null): ImpactMaterial {
  let found: ImpactMaterial | undefined;
  for (const b of blocks) {
    if (!nearBlock(b, p, AUDIO.impactBlockMargin)) continue;
    const m = blockMaterial(b);
    if (b.kind !== 'floor' && b.kind !== 'ramp' && b.kind !== 'wall') return m;
    found ??= m;
  }
  if (terrain) {
    const ground = terrainHeightAt(terrain, p.x, p.z);
    if (ground !== undefined && Math.abs(p.y - ground) <= AUDIO.impactBlockMargin) return TERRAIN_MATERIAL;
  }
  return found ?? 'concrete';
}
