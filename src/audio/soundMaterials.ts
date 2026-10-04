import { AUDIO } from '../config/audio';
import { blockMaterial } from '../config/materials';
import type { FloorSurface, ImpactMaterial } from '../config/sounds';
import type { MapBlock } from '../map/mapTypes';
import { surfaceHeightAt } from '../map/surfaces';
import type { Vec3 } from '../sim/vec';

/** How far below the feet (m) a walkable top still counts as the ground underfoot (steps land a little above it). */
const UNDERFOOT_REACH = 0.35;

/**
 * The surface under a character's feet at `feet`: the highest floor or ramp top at or just below them (maps keep
 * one walkable surface per point, see map/surfaces.ts). Concrete where nothing says otherwise.
 */
export function surfaceUnder(blocks: readonly MapBlock[], feet: Vec3): FloorSurface {
  let best: MapBlock | undefined;
  let bestTop = Number.NEGATIVE_INFINITY;
  for (const b of blocks) {
    const top = surfaceHeightAt(b, feet.x, feet.z);
    if (top === undefined || top > feet.y + UNDERFOOT_REACH || top < feet.y - UNDERFOOT_REACH || top <= bestTop) continue;
    best = b;
    bestTop = top;
  }
  return best?.surface ?? 'concrete';
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
 * most likely struck. Concrete if no block is that close.
 */
export function impactMaterialAt(blocks: readonly MapBlock[], p: Vec3): ImpactMaterial {
  let found: ImpactMaterial | undefined;
  for (const b of blocks) {
    if (!nearBlock(b, p, AUDIO.impactBlockMargin)) continue;
    const m = blockMaterial(b);
    if (b.kind !== 'floor' && b.kind !== 'ramp' && b.kind !== 'wall') return m;
    found ??= m;
  }
  return found ?? 'concrete';
}
