import type { BlockKind, MapBlock } from '../map/mapTypes';
import type { ImpactMaterial } from './sounds';

/**
 * What each kind of greybox block is made of: what a BB ticks off (audio) and whether it bounces (ricochets, M20).
 * Floors and ramps can say otherwise (`MapBlock.surface`: Depot's dock ramps are steel).
 */
export const BLOCK_MATERIALS = {
  floor: 'concrete',
  ramp: 'concrete',
  wall: 'concrete',
  barrier: 'concrete',
  crate: 'wood',
  container: 'metal',
  // Site props (M25b). Moulded plastic ticks hollow, nearest to wood; sand-filled bags and gabions soak BBs up as wood
  // does (no ricochet) with the dullest of the three ticks.
  toilet: 'wood',
  // A pallet rack's faces are its cardboard and film-wrapped load (the steel uprights are thin posts), so BBs land
  // on it as on the wrapped loads: no ricochet (bug pass).
  rack: 'wood',
  gabion: 'wood',
  wrapped: 'wood',
  ibc: 'metal',
  sandbags: 'wood',
  generator: 'metal',
  skip: 'metal',
  // The woods (M33): bark, logs and fence boards soak BBs up; a boulder gives one back like concrete.
  tree: 'wood',
  boulder: 'concrete',
  log: 'wood',
  fence: 'wood',
  // The city's props (M34f) soak BBs up as the site props they stand in for did (Neon Heights' cover kept its ricochets
  // when it was drawn as the city): cabinets, machines, stalls, planters and booths as wood; the van, a container
  // before, as steel.
  cabinet: 'wood',
  vending: 'wood',
  stall: 'wood',
  planter: 'wood',
  booth: 'wood',
  van: 'metal',
} as const satisfies Record<BlockKind, ImpactMaterial>;

/** What the ground of a map with terrain (M33c, map/terrain.ts) is to a BB: soil. */
export const TERRAIN_MATERIAL: ImpactMaterial = 'earth';

/** The material of block `b`. */
export function blockMaterial(b: MapBlock): ImpactMaterial {
  return b.surface ?? BLOCK_MATERIALS[b.kind];
}
