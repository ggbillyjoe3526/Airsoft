import { AUDIO } from '../config/audio';
import { blockMaterial, TERRAIN_MATERIAL } from '../config/materials';
import { CITY_PROPS } from '../config/renderSurfaces';
import type { ImpactMaterial } from '../config/sounds';
import type { MapBlock } from '../map/mapTypes';
import { type Terrain, terrainHeightAt } from '../map/terrain';
import type { Vec3 } from '../sim/vec';

/**
 * Blocks whose top is leaves, by how deep the leaves go, as drawn (Dev 6 item 44): a planter's shrubs fill the top of its
 * box (render/field/mapPieces/cityProps.ts). A BB that lands that high on one rustles in the leaves (impactMaterialAt); the box still
 * stops it as before.
 */
const LEAFY_TOPS: Readonly<Partial<Record<MapBlock['kind'], number>>> = { planter: CITY_PROPS.planter.foliage };

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
 * surface), or leaves in the top of a planter (LEAFY_TOPS). Where blocks meet, a prop wins over the floor or wall it
 * stands against, since that's what the BB most likely struck. On a map with sloping ground (M33c), a BB that came down
 * on the ground is earth. Concrete if nothing is that close.
 */
export function impactMaterialAt(blocks: readonly MapBlock[], p: Vec3, terrain: Terrain | null = null): ImpactMaterial {
  let found: ImpactMaterial | undefined;
  for (const b of blocks) {
    if (!nearBlock(b, p, AUDIO.impactBlockMargin)) continue;
    const m = blockMaterial(b);
    const leafy = LEAFY_TOPS[b.kind];
    if (leafy !== undefined && p.y >= b.center.y + b.size.y / 2 - leafy) return 'leaves';
    if (b.kind !== 'floor' && b.kind !== 'ramp' && b.kind !== 'wall') return m;
    found ??= m;
  }
  if (terrain) {
    const ground = terrainHeightAt(terrain, p.x, p.z);
    if (ground !== undefined && Math.abs(p.y - ground) <= AUDIO.impactBlockMargin) return TERRAIN_MATERIAL;
  }
  return found ?? 'concrete';
}
