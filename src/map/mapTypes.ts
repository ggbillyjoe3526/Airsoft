import type { FloorSurface } from '../config/sounds';
import type { Vec3 } from '../sim/vec';
import type { Terrain } from './terrain';

/**
 * Visual family of a greybox block. Every kind collides as a solid box, except `ramp`: a wedge whose top
 * slopes up along `rise`. Only the tops of floors and ramps are walkable (see map/surfaces.ts).
 *
 * The site props (M25b) are drawn as more than a box (render/mapMeshes.ts), always inside their bounds, so what
 * you see is what stops you and your BBs:
 * - full height (2.4 m): `toilet` (a portable site toilet), `rack` (pallet racking loaded with stock, or shelving
 *   indoors), `gabion` (a wire-mesh barrier filled with sand), `wrapped` (a pallet load shrink-wrapped in film);
 * - crouch height (1.2 m): `ibc` (a water tank in a steel cage), `sandbags`, `generator`, `skip`.
 *
 * The woods (M33, Woodland): `tree` (a trunk; canopies come with Woodland's look), `boulder`, `log` (fallen trees,
 * log piles, log walls and the cabin) and `fence` (the field's edge).
 */
export type BlockKind =
  | 'floor'
  | 'ramp'
  | 'wall'
  | 'crate'
  | 'container'
  | 'barrier'
  | 'toilet'
  | 'rack'
  | 'gabion'
  | 'wrapped'
  | 'ibc'
  | 'sandbags'
  | 'generator'
  | 'skip'
  | 'tree'
  | 'boulder'
  | 'log'
  | 'fence';

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
  /** Floors and ramps: what footsteps on it sound like (concrete if not given). Presentation only. */
  surface?: FloorSurface;
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
  /**
   * Per end of the map (0 = west, 1 = east), the spawn points of the team starting there, one per player. Teams
   * swap ends at half-time (sim/round.ts teamEnd); in Attack / Defend the attackers start at end 0.
   */
  spawns: [SpawnPoint[], SpawnPoint[]];
  /**
   * Per end, spots in that end's dead zone where hit players wait for the next round. Out of the way of play
   * (a corner of the spawn yard), one per player.
   */
  deadZones: [SpawnPoint[], SpawnPoint[]];
  /**
   * Routes across the map, each an ordered list of floor points from end 0 to end 1. Bots advance along one
   * (from their own end); empty on maps without bots.
   */
  lanes: Vec3[][];
  /**
   * Attack / Defend: the foot of the flagpole, on the side of end 1 (the defenders' end). Maps without one can
   * only be played in Elimination.
   */
  flag?: Vec3;
  /**
   * The field is played at night (M33): glowing BBs by default (config/glowBBs.ts), and later night lighting. Absent
   * or false: daylight.
   */
  night?: boolean;
  /**
   * Ground that rises and falls (M33c, map/terrain.ts): walkable everywhere it is drawn, with no floor or ramp block
   * over it. Absent: the map's ground is its floor blocks, as on Depot.
   */
  terrain?: Terrain;
}
