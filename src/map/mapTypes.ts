import type { BakeFileId } from './bakes/files';
import type { AmbienceId } from '../config/audio';
import type { LightingPreset, LightingPresetId } from '../config/render';
import type { BlockSurface } from '../config/sounds';
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
 *
 * The city (M34f, render/cityProps.ts), solid to their bounds like the rest: `cabinet` (a row of arcade cabinets back
 * to back), `vending` (a vending machine, its front on both long sides), `stall` (a market stall, cart or shrine: a
 * counter under an awning), `planter` (a timber planter, crouch height), `booth` (a phone booth or kiosk: glass in a
 * frame) and `van` (a parked van).
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
  | 'fence'
  | 'cabinet'
  | 'vending'
  | 'stall'
  | 'planter'
  | 'booth'
  | 'van';

/**
 * How a block is finished (M34f, any map): drawn in this surface instead of its kind's, in `MapBlock.paint` if given.
 * `plaster`: smooth painted render; `cladding`: standing-seam metal panels; `tiles`: small glazed tiles; `asphalt`: a
 * road; `paving`: square paving slabs. Drawing only: what a block is to BBs and footsteps is its kind and `surface`.
 */
export type BlockFinish = 'plaster' | 'cladding' | 'tiles' | 'asphalt' | 'paving';

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
  surface?: BlockSurface;
  /**
   * Its finish (M34f): a finished block is drawn as one box in that surface (a wall keeps its coping), not as its kind's
   * prop. Absent: its kind's look, as before.
   */
  finish?: BlockFinish;
  /** Its colour (sRGB hex, M34f), in place of its kind's palette; it still varies a touch by position. */
  paint?: number;
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
   * Signs and windows on the walls (M34e, render/mapSigns.ts): flat panels that glow by Night and are painted boards
   * and dark glass by Day. Presentation only: they light nobody for the bots (light pools do). Absent: none.
   */
  signs?: readonly MapSign[];
  /**
   * Look-only blocks (M34f, render/mapMeshes.ts): drawn as blocks are (kind, finish, paint), never collided, walked,
   * seen through, heard or mapped; play reads `blocks` only. For a surface laid on a floor, such as a road on a street's
   * slab, a few millimetres proud of it, so the floor under it stays one block and plays as it did. Absent: none.
   */
  decor?: readonly MapBlock[];
  /**
   * Baked bounce light (G6, render/bakedLight.ts): the map ships a probe file (src/map/bakes/, written by
   * `node pipeline/bake-light.mjs`) and is drawn with it under the bake's lighting preset (config/bake.ts). Look only.
   * Absent: no baked light (the night maps, lit by their own lamps).
   */
  bakedLight?: { file: BakeFileId };
  /**
   * How the map is lit (M33f, render/lightingPreset.ts): the lighting presets it can be played under, the first by
   * default (later a match-start choice picks among them, M34), and `moonOver`, a world point (x, z) the key light is
   * turned towards from the field's centre (keeping its height), so a low moon rims that hill's top. `overrides` tweaks a
   * preset's values for this map only. Absent: day.
   */
  lighting?: MapLighting;
  /**
   * What the ground is (M33i, map/groundSurfaces.ts): grass, leaf litter, earth, gravel or boards, on one grid the
   * terrain is painted from and footsteps read (M33j, audio/soundMaterials.ts), so what you see and hear underfoot
   * agree. Absent: the ground is drawn as before and footsteps on it are concrete.
   */
  ground?: MapGround;
  /**
   * What the field sounds like round you (M33j, config/audio.ts AMBIENCES): its bed, and its calls by day (birds) or by
   * night (never birds), picked by the lighting preset's night flag. Absent: the yard, as on Depot.
   */
  ambience?: AmbienceId;
  /**
   * Extraction (M43): where a squad goes in, where it can get out and where the home team starts. Maps without one
   * can't be played in Extraction.
   */
  extraction?: ExtractionData;
  /**
   * Set dressing (G8, render/mapDressing.ts): dirt, junk, puddles, marks, glow strips, the skyline round the field and
   * its smoke, the motes' tint and the dust feet kick up. Look only: nothing in it collides, is walked on, hides anyone
   * or is read by play (physics, nav, cover, sight and sound read `blocks`). Absent: none, the map draws as before.
   */
  dressing?: MapDressing;
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

/** What a patch of ground is (M33i): what it looks like, and what it sounds like underfoot (M33j). */
export type GroundSurface = 'grass' | 'leaves' | 'earth' | 'gravel' | 'wood';

/**
 * One patch of a map's ground (M33i): a band `width` metres wide along `path` (world x, z points; one point is a disc
 * of that width), or the box `box` ([x0, x1, z0, z1], world metres).
 */
export interface GroundPatch {
  surface: GroundSurface;
  path?: readonly { x: number; z: number }[];
  width?: number;
  box?: readonly [number, number, number, number];
}

/**
 * A map's ground (MapData.ground, M33i): `base` everywhere, `underTrees` where the trees close overhead (the night
 * sight's canopy rule, map/nightSight.ts), then each patch in order over that (a later one wins).
 */
export interface MapGround {
  base: GroundSurface;
  underTrees?: GroundSurface;
  patches: readonly GroundPatch[];
}

/**
 * A sign or a lit window (M34e): a `width` × `height` panel standing upright with its middle at `centre`, on the face
 * of a wall that looks along `facing` (its front is that way). `neon`: a sign in `colour`; `window`: a window lit from
 * inside, its glow `colour` (black: a dark window). M34f: `paint`, a marking painted in `colour` that never glows (lit
 * like the surface under it), and `facing: '+y'`, lying flat on a floor's top, `width` along x and `height` along z.
 */
export interface MapSign {
  centre: Vec3;
  width: number;
  height: number;
  facing: '+x' | '-x' | '+z' | '-z' | '+y';
  colour: number;
  kind: 'neon' | 'window' | 'paint';
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
  /**
   * No case within this of the squad's insertion is guarded or patrolled (m; Audit 2, BAL-05). Absent: the bots' shared
   * BOT_BEHAVIOUR.insertionBerth, sized for Depot; a bigger field sets its own.
   */
  insertionBerth?: number;
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

/**
 * A map's set dressing (G8, MapData.dressing). Every random choice (which faces get dirt or junk, which kind, which
 * logo, the puddles' outlines) comes from `seed`, so the same map always looks the same. Each part is optional.
 */
export interface MapDressing {
  seed: number;
  /**
   * Clutter on the floors (map detail): the chance each slot along a block's foot gets a bank of dirt, and loose junk
   * (no taller than DRESSING.junk.maxHeight, against the face, never in a lane, a doorway or by a spawn); `litter`, the
   * chance each square of open floor gets scraps of paper.
   */
  clutter?: { dirt: number; junk: number; litter: number };
  /** Puddles on the floor (map detail): the middle (world x, z) and the size (m); never under a block. */
  puddles?: readonly DressingPuddle[];
  /** Marks (map detail): the chance a container gets a shipping line's logo, and a 4 m bay of wall a spray or a sign. */
  marks?: { logos: number; walls: number };
  /** Small glow strips on block faces (map detail): self-lit by day and night, as signs are placed (MapSign). */
  strips?: readonly GlowStrip[];
  /** The skyline round the field (Trees: Detailed), with smoke from its chimneys. */
  skyline?: readonly SkylinePiece[];
  /** The dust motes' colour (sRGB). */
  motes?: { tint: number };
  /** Dust kicked up by sprinting and landing feet (Impact grit): its colour (sRGB) and size (1: DRESSING.kickedDust). */
  kickedDust?: { tint: number; scale: number };
}

/** A puddle (MapDressing.puddles): `width` along x and `depth` along z, its outline seeded. */
export interface DressingPuddle {
  x: number;
  z: number;
  width: number;
  depth: number;
}

/** A small glow strip (MapDressing.strips): a sign's panel that is always lit. */
export type GlowStrip = Omit<MapSign, 'kind'>;

/**
 * A building or structure beyond the field (MapDressing.skyline), standing on the ground at (x, z): `width` along x and
 * `depth` along z (swapped when `turned`), `height` tall, in `colour` (sRGB, the kind's own if absent). A shed's doors
 * and a crane's beam face the field. A chimney with `smoke` smokes. A power line runs its pylons through `points`.
 */
export type SkylinePiece =
  | { kind: 'shed' | 'waterTower' | 'crane' | 'containers'; x: number; z: number; width: number; depth: number; height: number; turned?: boolean; colour?: number }
  | { kind: 'chimney'; x: number; z: number; width: number; depth: number; height: number; smoke?: boolean; colour?: number }
  | { kind: 'powerLine'; points: readonly { x: number; z: number }[]; height: number };
