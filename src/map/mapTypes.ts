import type { Vec3 } from '../sim/vec';

/** Visual family of a greybox block. Every kind collides as a solid box. */
export type BlockKind = 'floor' | 'wall' | 'crate' | 'container' | 'barrier';

/** Axis-aligned block. `center` and `size` are in metres. */
export interface MapBlock {
  kind: BlockKind;
  center: Vec3;
  size: Vec3;
}

export interface SpawnPoint {
  position: Vec3;
  yaw: number;
}

export interface MapData {
  name: string;
  blocks: MapBlock[];
  /** Anything below this height has left the level and is returned to its spawn. */
  killY: number;
  spawns: [SpawnPoint[], SpawnPoint[]];
}
