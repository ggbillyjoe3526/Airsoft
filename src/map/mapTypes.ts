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
  /**
   * Per team, spots in that team's dead zone where hit players wait for the next round. Out of the
   * way of play (a corner of the spawn yard), one per player.
   */
  deadZones: [SpawnPoint[], SpawnPoint[]];
  /**
   * Routes across the map, each an ordered list of floor points from the west (Blue) side to the east
   * (Orange) side. Bots advance along one; empty on maps without bots.
   */
  lanes: Vec3[][];
  /**
   * Flag mode: per team, the foot of the flagpole that team defends (on its own side of the map). Maps
   * without flags can only be played in elimination.
   */
  flags?: [Vec3, Vec3];
}
