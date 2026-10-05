import type { LightingPreset, LightingPresetId } from '../config/render';
import type { FloorSurface } from '../config/sounds';
import type { Vec3 } from '../sim/vec';
import type { Bush } from './foliage';
import type { MapLight } from './nightSight';
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
   * The field is played at night (M33): glowing BBs by default (config/glowBBs.ts), bots see less far in the dark
   * (map/nightSight.ts), and later night lighting. Absent or false: daylight.
   */
  night?: boolean;
  /**
   * Ground that rises and falls (M33c, map/terrain.ts): walkable everywhere it is drawn, with no floor or ramp block
   * over it. Absent: the map's ground is its floor blocks, as on Depot.
   */
  terrain?: Terrain;
  /**
   * Bushes (M33e, map/foliage.ts): they hide whoever is in or behind them, but BBs and people pass through. Absent: none.
   */
  foliage?: readonly Bush[];
  /**
   * Pools of light on a night field (M33g, map/nightSight.ts): camp fires and lanterns. Anyone standing in one is seen from
   * as far as in daylight. Absent: none.
   */
  lights?: readonly MapLight[];
  /**
   * How the map is lit (M33f, render/lightingPreset.ts): the lighting presets it can be played under, the first by
   * default (later a match-start choice picks among them, M34), and `moonOver`, a world point (x, z) the key light is
   * turned towards from the field's centre (keeping its height), so a low moon rims that hill's top. `overrides` tweaks a
   * preset's values for this map only. Absent: day.
   */
  lighting?: MapLighting;
  /**
   * Extraction (M43): where a squad goes in, where it can get out and where the home team starts. Maps without one
   * can't be played in Extraction.
   */
  extraction?: ExtractionData;
  /**
   * Floor heights of a map with several storeys (M34c), lowest first (Neon Heights: street, +3, +6). The minimap draws
   * the storey you stand on and marks teammates on other storeys as above or below. Absent: one storey.
   */
  storeys?: number[];
  /**
   * Where a floor can be watched from above (M34c, the pro layout's watch-angle list): each area of the ground with
   * the windows and balconies that overlook it. Map data for bots and for the layout tests.
   */
  overlooks?: Overlook[];
}

/**
 * One watched area (M34c): `area` is [x0, x1, z0, z1] on the floor below, `from` the standing spots (feet) above it
 * that see into it.
 */
export interface Overlook {
  name: string;
  area: readonly [number, number, number, number];
  from: Vec3[];
}

/** A tweak of a lighting preset for one map: any group's values (MapData.lighting.overrides). */
export type LightingOverride = { [K in keyof LightingPreset]?: LightingPreset[K] extends object ? Partial<LightingPreset[K]> : LightingPreset[K] };

/** How a map is lit (MapData.lighting, M33f). */
export interface MapLighting {
  presets: readonly [LightingPresetId, ...LightingPresetId[]];
  moonOver?: { x: number; z: number };
  overrides?: Partial<Record<LightingPresetId, LightingOverride>>;
}

/** A way off the field in Extraction: stand inside it for EXTRACTION.extractTime to be counted out. */
export interface ExitZone {
  /** What the HUD calls it ("Car park gate"). */
  name: string;
  /** Floor point at its middle. */
  position: Vec3;
  /** Radius (metres, horizontal) a squad member must be within. */
  radius: number;
  /** Opens only when EXTRACTION.lateExitAt seconds are left. */
  late?: boolean;
}

/** A place a squad can go in at: its spawn points (one per member) and the end of the map whose lanes lead out of it. */
export interface Insertion {
  name: string;
  spawns: SpawnPoint[];
  /** The end (0 or 1) this insertion counts as, for lanes and dead zones: the home team plays from the other end. */
  end: number;
}

/** A map's Extraction data (M43). The run's seed picks the insertion; exits near it are closed for that run. */
export interface ExtractionData {
  /** Seconds a run lasts on this map. */
  runTime: number;
  /** Opponents in play at once before the squad's share: base + squad size (Depot: 2, so 3 / 4 / 5). */
  baseOpponents: number;
  insertions: Insertion[];
  exits: ExitZone[];
  /** Where the home team starts a run: at least base + 3 points, picked far from the insertion. */
  opponentStarts: SpawnPoint[];
  /** Where cases can stand (M44): each run's seed places its cases on some of them (pool/caches.ts). */
  cases: CaseSpot[];
  /**
   * The home team's regen points (M45): a hit opponent comes back in the next wave at one at least `regenDistance` m
   * from every squad member and out of their sight. Several, spread over the map, so one is always free.
   */
  regens: SpawnPoint[];
  /** How far a regen point must be from every squad member (m): the plan's 25, Depot's 15 for a small field. */
  regenDistance: number;
}

/**
 * A place a case can stand in an Extraction run (M44), facing `yaw` (its front, where you open it), and the kinds of
 * case that suit it (pool.md's Caches Keys: a locker wants a wall at its back). The point is on walkable floor.
 */
export interface CaseSpot {
  position: Vec3;
  yaw: number;
  kinds: string[];
}
