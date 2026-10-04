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
} as const satisfies Record<BlockKind, ImpactMaterial>;

/** The material of block `b`. */
export function blockMaterial(b: MapBlock): ImpactMaterial {
  return b.surface ?? BLOCK_MATERIALS[b.kind];
}
