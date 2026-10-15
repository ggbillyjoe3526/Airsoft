import type { FloorSurface } from '../config/sounds';
import type { Vec3 } from '../sim/vec';
import { groundAt, type GroundGrid } from './groundSurfaces';
import type { MapBlock } from './mapTypes';
import { surfaceHeightAt } from './surfaces';

/**
 * What is underfoot (M33j; NP1): the one answer footsteps' sound (audio/sfx.ts) and how far they carry (WorldQuery
 * .surfaceUnder, physics/physicsWorld.ts) both read, so what you hear underfoot is what the bots hear. Pure data.
 */

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
