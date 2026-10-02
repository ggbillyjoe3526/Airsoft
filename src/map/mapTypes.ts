import type { Vec3 } from '../sim/vec';

/**
 * Visual family of a greybox block. Every kind collides as a solid box, except `ramp`: a wedge whose top
 * slopes up along `rise`. Only the tops of floors and ramps are walkable (see map/surfaces.ts).
 */
export type BlockKind = 'floor' | 'ramp' | 'wall' | 'crate' | 'container' | 'barrier';

/** The way a ramp's top goes up: towards +x, -x, +z or -z. */
export type RampRise = '+x' | '-x' | '+z' | '-z';

/** Axis-aligned block. `center` and `size` are in metres. */
export interface MapBlock {
  kind: BlockKind;
  center: Vec3;
  size: Vec3;
  /**
   * Ramps only (required for them): the top runs from the bottom of the box (`center.y - size.y / 2`) at
   * the low edge up to its top at the high edge, the edge this points to.
   */
  rise?: RampRise;
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
