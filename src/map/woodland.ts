import { VAULT_WALL_HEIGHT } from '../config/vault';
import { createRng, rngNext } from '../sim/rng';
import { type Vec3, vec3 } from '../sim/vec';
import type { Bush } from './foliage';
import type { MapLight } from './nightSight';
import type { BlockKind, GroundPatch, MapArea, MapBlock, MapData, MapGround, SpawnPoint } from './mapTypes';
import { buildTerrain, type Terrain, terrainHeightAt } from './terrain';
import { WOODLAND_DRESSING } from './woodlandDressing';
import { woodlandExtraction } from './woodlandExtraction';

/**
 * "Woodland" (M33, the owner's pick, 2026-10-04; concept sketch v1 approved at 18:07 with its defaults): a wide wood at
 * night, 120 × 80 m (six Depots), mostly open, with sparse cover: trees and logs (no boulders since WL2). Still being
 * built: dev content (M35, map/maps.ts), listed only while the Dev tab's Dev content switch is on.
 *
 * The ground (map/terrain.ts) rises gently from end 0 to the Knoll, so one team starts downhill and the other uphill;
 * the ends swap at half-time. Three lanes run west to east (plan coordinates, as on the sketch: x 0–120 to the east,
 * z 0–80 to the north; see toWorld):
 * - 1 Pine Belt (north, z 62–80): close pines and a forest track, the long way round to the Knoll's wooded north
 *   shoulder. Cover everywhere, sight short.
 * - 2 Meadow (mid, z 25–62): open grass with fallen trunks (crouch cover) and a woodpile. The fast, exposed way.
 * - 3 Creek (south): along the north bank of a dry stream bed 0.7 m below the field, past the hunter's cabin (two log
 *   rooms with doors, a window and a low west wall you vault), then up a sunken track to the Knoll's south side.
 * - The Knoll (x 86–116, z 30–64): a hill 3.8 m over the field's slope, its top +6.5 m, with a log fort around the
 *   flag (Attack / Defend). Its west face is the steepest slope on the map (about 1:2.3).
 * - End 0 camp (west, +1 m, behind the West Rise, a low ridge across the meadow) and end 1 camp (east, about +2.5 m,
 *   behind the Knoll's crest): log barricades as spawn walls. Neither camp sees the other, nor anyone within 8 m of
 *   its spawns (M88, playtest note 13).
 *
 * Every slope stays walkable (no steeper than a ramp, PHYSICS.maxRampSlope), checked in the tests. Bushes (M33e) hide
 * you from sight, but BBs and people pass through them. Night lighting, the camp fires and lanterns, tree canopies and
 * the woodland look come in later M33 tasks.
 */

/** The field's extent in plan coordinates (m). */
const SIZE_X = 120;
const SIZE_Z = 80;
/** Terrain vertices every metre: fine enough for the creek's banks. */
const TERRAIN_CELL = 1;

/** Cover heights, as on Depot: crouch cover hides a crouched player (1.2 m), full cover a standing one (2.4 m). */
const CROUCH = 1.2;
const FULL = 2.4;
/** The perimeter fence: you can't see over it standing. */
const FENCE_HEIGHT = 2.4;
const FENCE_THICKNESS = 0.4;
/** Fence sections are this long, so each follows the ground's height. */
const FENCE_SECTION = 8;
/** Blocks sit this far into the ground at their lowest corner, so no gap shows under them on a slope. */
const SINK = 0.03;
/** Cabin walls. */
const CABIN_WALL = 0.4;
/** MS1: 3 m (was 2.6), so a body vaulting the west wall clears the roof over it (M102). */
const CABIN_HEIGHT = 3.0;
/** A tin roof's shape (m) and paint: its ridge's height over the walls' top, and how far its eaves reach past them. */
interface TinRoof {
  readonly ridge: number;
  readonly overhang: number;
  readonly paint: number;
}
/** MS1: the cabin's tin roof: its ridge `ridge` m over the walls' top, the eaves `overhang` m out, in weathered grey `paint` (rust red read as a team colour). */
const CABIN_ROOF: TinRoof = { ridge: 1.4, overhang: 0.45, paint: 0x5d5a52 };
/** WL2: the fort's hut gets the cabin's tin roof, its ridge lower over the hut's 4 m span (owner: "doesn't have a roof"). */
const HUT_ROOF: TinRoof = { ...CABIN_ROOF, ridge: 0.9 };
/** The fort's hut (plan x0..x1 × z0..z1), behind its east gap, and its walls' height (WL2: "a little bit taller", was 2.4). */
const HUT = { x0: 104, x1: 107, z0: 45.5, z1: 49.5, height: 3 } as const;
/**
 * WL2: the fort's outer log walls (were full height, 2.4 m): chest high, under a standing eye (MOVEMENT.standEyeHeight
 * 1.62), so a defender stands to shoot over them and ducks behind them. At crouch height (1.2) Hard attackers won 76 %.
 */
const FORT_WALL = 1.5;
const WINDOW_SILL = CROUCH;
const WINDOW_TOP = 2.0;

// --- The ground --------------------------------------------------------------------------------------------------

/** End 0's camp is flat to here, at WEST_LIFT; the slope rises from it. */
const SLOPE_X0 = 11;
/**
 * End 0's camp sits a metre up (M88, playtest note 13), so the end 1 camp's height edge over it at the start is about
 * 1.5 m, not 3.5 m. The slope to the Knoll's foot is gentler for it (a 2 % rise).
 */
const WEST_LIFT = 1;
/** The foot of the Knoll, and the field's height there. */
const SLOPE_X1 = 85;
const SLOPE_RISE = 2.5;
/** East of the Knoll's foot the ground keeps rising a little, to its height under the Knoll's top (EAST_TOP_X)... */
const EAST_RISE = 0.5;
const EAST_TOP_X = 101;
/**
 * ...and then falls by EAST_FALL to the east fence (M88), so end 1's camp sits lower behind the Knoll's crest. Kept
 * small: the fall adds to the Knoll's east face, which must stay walkable.
 */
const EAST_FALL = 0.75;

/**
 * The West Rise (M88, playtest note 13): a low ridge across the meadow in front of end 0's camp, so the two camps start
 * hidden from each other: from the Knoll's shoulder by end 1's camp you look over the meadow but not over the rise into
 * the camp behind it. Its crest runs north to south along plan x = RISE.x from z0 to z1 and falls off over RISE_FALL
 * metres all round (half a cosine), gentle enough to walk over anywhere.
 */
const RISE = { x: 22, z0: 28, z1: 60 };
/**
 * WL3, West Hill (owner, 2026-10-17: "a small hill (enough to stop the other side immediately seeing them)"): the
 * crest is RISE_PEAK m at its middle and RISE_END m at its two ends (was 2.6 m all along), with a longer RISE_FALL
 * (was 10 m) so its steepest face stays under a ramp's slope.
 */
const RISE_END = 2.2;
const RISE_PEAK = 3.4;
const RISE_FALL = 12.5;
/** The West Hill crest's height at plan z: RISE_END at z0 and z1, RISE_PEAK half way (half a sine). */
const riseCrest = (z: number): number => RISE_END + (RISE_PEAK - RISE_END) * Math.sin(Math.PI * Math.min(1, Math.max(0, (z - RISE.z0) / (RISE.z1 - RISE.z0))));

/**
 * WL3: a low swell on the meadow (owner: "any other elevation changes should be small"), SWELL m high, by the meadow
 * lane's west half. The concept had a second at (66, 37): with both, the downhill end won 37.5 % of Pro Elimination's
 * decided rounds (40–60 %), with this one alone 45.8 %.
 */
const SWELLS = [{ x: 46, z: 53 }] as const;
const SWELL = { height: 0.6, top: 1.5, fall: 6 } as const;

/** The Knoll: a flat top of radius KNOLL_TOP round its centre, falling off over KNOLL_FALL metres. */
const KNOLL = { x: 101, z: 47 };
const KNOLL_HEIGHT = 3.8;
const KNOLL_TOP = 6;
const KNOLL_FALL = 13.5;

/**
 * The creek: its bed follows z = 12 + 3·sin(x / 14) and it ends before the Knoll. WL3 (owner: "one side of the map should
 * have a more significant elevation change") made it a dry ravine, CREEK_DEPTH m down with a 3.2 m bed and 8 m banks
 * (was 0.7 m, 2 m and 2.8 m), so the creek lane along its north bank sits lower than the meadow. It is CREEK_DEPTH_WEST m deep
 * west of CREEK_DEEPENS[0] and deepens to CREEK_DEPTH by CREEK_DEEPENS[1], so where West Hill's south end falls towards
 * it the two slopes together stay under a ramp's.
 */
const CREEK_DEPTH = 2.2;
const CREEK_DEPTH_WEST = 1;
const CREEK_DEEPENS = [20, 40] as const;
const CREEK_BED = 1.6;
const CREEK_BANK = 8;
const CREEK_END = [86, 94] as const;
const creekZ = (x: number): number => 12 + 3 * Math.sin(x / 14);

/** The sunken track from the cabin towards the Knoll's south side: 0.6 m down, fading out where the hill starts. */
const TRACK = { from: { x: 71, z: 23 }, to: { x: 94, z: 34 } };
const TRACK_DEPTH = 0.6;
const TRACK_BED = 1.2;
const TRACK_BANK = 2.4;
const TRACK_FADE = [86, 94] as const;

/** 0 below a, 1 above b, smooth between. */
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** A dip of `depth` within `bed` of a line, easing up to nothing over `bank` (half a cosine). */
function dip(distance: number, depth: number, bed: number, bank: number): number {
  if (distance <= bed) return depth;
  if (distance >= bed + bank) return 0;
  return (depth * (1 + Math.cos((Math.PI * (distance - bed)) / bank))) / 2;
}

/** Distance from (x, z) to the segment a–b. */
function segmentDistance(x: number, z: number, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}

/** The field's height at plan point (x, z). */
function woodlandHeight(x: number, z: number): number {
  const slope =
    x <= SLOPE_X0
      ? WEST_LIFT
      : x <= SLOPE_X1
        ? WEST_LIFT + ((SLOPE_RISE - WEST_LIFT) * (x - SLOPE_X0)) / (SLOPE_X1 - SLOPE_X0)
        : SLOPE_RISE + EAST_RISE * Math.min(1, (x - SLOPE_X1) / (SIZE_X - SLOPE_X1)) - EAST_FALL * smoothstep(EAST_TOP_X, SIZE_X, x);
  const rise = dip(segmentDistance(x, z, { x: RISE.x, z: RISE.z0 }, { x: RISE.x, z: RISE.z1 }), riseCrest(z), 0, RISE_FALL);
  const swells = SWELLS.reduce((sum, w) => sum + dip(Math.hypot(x - w.x, z - w.z), SWELL.height, SWELL.top, SWELL.fall), 0);
  const r = Math.hypot(x - KNOLL.x, z - KNOLL.z);
  const knoll = r <= KNOLL_TOP ? KNOLL_HEIGHT : r >= KNOLL_TOP + KNOLL_FALL ? 0 : (KNOLL_HEIGHT * (1 + Math.cos((Math.PI * (r - KNOLL_TOP)) / KNOLL_FALL))) / 2;
  const creekDepth = CREEK_DEPTH_WEST + (CREEK_DEPTH - CREEK_DEPTH_WEST) * smoothstep(CREEK_DEEPENS[0], CREEK_DEEPENS[1], x);
  const creek = dip(Math.abs(z - creekZ(x)), creekDepth, CREEK_BED, CREEK_BANK) * (1 - smoothstep(CREEK_END[0], CREEK_END[1], x));
  const track = dip(segmentDistance(x, z, TRACK.from, TRACK.to), TRACK_DEPTH, TRACK_BED, TRACK_BANK) * (1 - smoothstep(TRACK_FADE[0], TRACK_FADE[1], x));
  return slope + rise + swells + knoll - creek - track;
}

// --- Plan to world -----------------------------------------------------------------------------------------------

/**
 * Plan coordinates as on the sketch (x east, z north, the south-west corner at 0, 0) to the world's: centred on the
 * field, and north is -z in the world (as on Depot, map/depot.ts toWorld), so the map isn't built mirrored.
 */
const worldX = (x: number): number => x - SIZE_X / 2;
const worldZ = (z: number): number => SIZE_Z / 2 - z;

const TERRAIN: Terrain = buildTerrain(-SIZE_X / 2, -SIZE_Z / 2, TERRAIN_CELL, SIZE_X / TERRAIN_CELL, SIZE_Z / TERRAIN_CELL, (wx, wz) =>
  woodlandHeight(wx + SIZE_X / 2, SIZE_Z / 2 - wz),
);

/** The ground's height under plan point (x, z), on the terrain's triangles (what you stand on). */
const ground = (x: number, z: number): number => terrainHeightAt(TERRAIN, worldX(x), worldZ(z)) ?? woodlandHeight(x, z);

/** A point on the ground at plan (x, z), in world coordinates. */
const onGround = (x: number, z: number): Vec3 => vec3(worldX(x), ground(x, z), worldZ(z));

/** The lowest and the middle ground height under a plan footprint (corners, edge midpoints and centre). */
function footprintGround(x0: number, x1: number, z0: number, z1: number): { low: number; mid: number } {
  let low = Number.POSITIVE_INFINITY;
  for (const x of [x0, (x0 + x1) / 2, x1]) for (const z of [z0, (z0 + z1) / 2, z1]) low = Math.min(low, ground(x, z));
  return { low, mid: ground((x0 + x1) / 2, (z0 + z1) / 2) };
}

/**
 * A block standing on the ground over plan footprint x0..x1 × z0..z1: from just under the lowest ground beneath it to
 * `height` over the ground at its middle (from `from` over it, for a window's lintel).
 */
function standing(kind: BlockKind, x0: number, x1: number, z0: number, z1: number, height: number, from = 0, level?: number): MapBlock {
  const g = footprintGround(x0, x1, z0, z1);
  // `level` (MS1): the height everything is measured from, where blocks must line up (the cabin's walls under its roof).
  const mid = level ?? g.mid;
  const y0 = from > 0 ? mid + from : g.low - SINK;
  const y1 = mid + height;
  return { kind, center: vec3(worldX((x0 + x1) / 2), (y0 + y1) / 2, worldZ((z0 + z1) / 2)), size: vec3(x1 - x0, y1 - y0, z1 - z0) };
}

/** A block of `w` × `d` centred on plan (x, z). */
const centred = (kind: BlockKind, x: number, z: number, w: number, d: number, h: number): MapBlock => standing(kind, x - w / 2, x + w / 2, z - d / 2, z + d / 2, h);

// --- Lanes, spawns, the flag -------------------------------------------------------------------------------------

/**
 * Advance routes from end 0 to end 1 (plan points); defending bots hold the last or second-last point of theirs.
 * Inside the fort each lane has only those two: a bot pauses at every lane point it reaches, and end 1 walks its lanes
 * from the fort out, so a third point there (one at each baffle, until 2026-10-11) kept end 1 a pause a lane longer on
 * its way to the middle, and Elimination's downhill end won 68 % of rounds at Normal (M88 QA). The nav finds the way
 * round a baffle.
 */
const LANE_POINTS: readonly (readonly [number, number])[][] = [
  // Pine Belt: out of the camp's north gap, along the forest track, down the Knoll's north shoulder into the fort.
  [[13, 51], [24, 62], [38, 69.5], [55, 72], [72, 72], [86, 67], [95, 60], [101, 57], [98.3, 52.7], [98.3, 48.5]],
  // Meadow: straight across, past the meadow's fallen trunks, up the Knoll's west face.
  [[13, 44], [30, 46.5], [49, 47.5], [62, 46.5], [76, 46], [89, 46.5], [95.8, 44.2], [98.5, 44.2]],
  // Creek: down to the creek's north bank, past the cabin's south and east sides, up the sunken track into the fort.
  [[13, 36], [22, 24], [34, 17.5], [50, 17], [60, 16], [73, 16.5], [76, 24], [86, 29], [94, 36], [101, 37], [103.8, 41.3], [103.8, 44]],
];

/** The flagpole: on the Knoll's top, inside the fort. */
const FLAG = { x: 101, z: 47 };

/**
 * The overtime flag (Dev 6 item 45): in the open in the middle of the field, on the East meadow, where each end's camp
 * walks about 58 m (content check map.overtimeFlag): seen from cover all round, so whoever goes for it shows themselves.
 */
const OVERTIME_FLAG = { x: 62, z: 41.5 };

/**
 * Six spawns a side (Woodland plays 5v5, up to 6v6: owner, 2026-10-06), each camp facing the other way down the field.
 * End 0's stand behind the West Rise; end 1's as far behind the Knoll's crest as the fence allows (M88).
 */
const END0_SPAWNS = [37, 39.5, 42, 44.5, 47, 49.5].map((z) => ({ x: 6.5, z, yaw: -Math.PI / 2 }));
const END1_SPAWNS = [38.5, 41, 43.5, 46, 48.5, 51].map((z) => ({ x: 117.5, z, yaw: Math.PI / 2 }));
/** Dead zones: each camp's back corner, behind its barricades and away from every lane; a spot for each spawn. */
const END0_DEAD = [[2, 64], [3, 64], [2, 65], [3, 65], [2.5, 66], [3.5, 66]].map(([x, z]) => ({ x: x!, z: z!, yaw: -Math.PI / 2 }));
const END1_DEAD = [[118, 64], [117, 64], [118, 65], [117, 65], [117.5, 66], [116.5, 66]].map(([x, z]) => ({ x: x!, z: z!, yaw: Math.PI / 2 }));

/** Mirroring z turns a facing `yaw` (forward = (-sin yaw, -cos yaw)) into π - yaw, as on Depot. */
const spawnAt = (s: { x: number; z: number; yaw: number }): SpawnPoint => ({ position: onGround(s.x, s.z), yaw: Math.atan2(Math.sin(Math.PI - s.yaw), Math.cos(Math.PI - s.yaw)) });

// --- Cover --------------------------------------------------------------------------------------------------------

/** End 0's camp: log barricades along x 11 with gaps for the three lanes. */
const END0_CAMP: MapBlock[] = [
  standing('log', 10.6, 11.4, 53, 58, FULL),
  standing('log', 10.6, 11.4, 39.5, 42.5, FULL),
  standing('log', 10.6, 11.4, 45.5, 48.5, CROUCH),
  standing('log', 10.6, 11.4, 28, 34, FULL),
];

/** End 1's camp, behind the Knoll's crest: barricades along x 111. */
const END1_CAMP: MapBlock[] = [
  standing('log', 110.6, 111.4, 53, 61, FULL),
  standing('log', 110.6, 111.4, 29, 36, FULL),
  standing('log', 112, 113, 43.5, 46.5, CROUCH),
];

/**
 * The log fort round the flag, open on all four sides. Just inside the west, north and south gaps a full-height log
 * baffle turns whoever comes in left or right, and the hut stands behind the east gap, so no one spot inside sees all
 * four ways in (at most two of the gaps' middles; the Pro difficulty plan's rule, owner 19:08: holding a hill is the
 * most defender-friendly setup there is). WL2 (owner, Beta 1: "make the walls around the structure on the hill lower"):
 * the outer walls are FORT_WALL high, so you fight over them; the baffles and the hut stay taller than anyone.
 */
const FORT: MapBlock[] = [
  // North-west corner.
  standing('log', 94, 95, 50, 54, FORT_WALL),
  standing('log', 95, 99.5, 53.5, 54.5, FORT_WALL),
  // South-west.
  standing('log', 94, 95, 40, 44, FORT_WALL),
  standing('log', 95, 99.5, 39.5, 40.5, FORT_WALL),
  // North-east.
  standing('log', 102.5, 107.5, 53.5, 54.5, FORT_WALL),
  standing('log', 107.5, 108.5, 50, 54.5, FORT_WALL),
  // South-east.
  standing('log', 102.5, 107.5, 39.5, 40.5, FORT_WALL),
  standing('log', 107.5, 108.5, 39.5, 44, FORT_WALL),
  // The baffles inside the west, north and south gaps (1.6 m in from the wall); the hut and its roof follow (WL2).
  standing('log', 96.6, 97.4, 45, 49, FULL),
  standing('log', 99, 103, 51.1, 51.9, FULL),
  standing('log', 99, 103, 42.1, 42.9, FULL),
  ...hut(),
];

/** The fort's hut: a solid block of logs under a tin roof like the cabin's (WL2), its ridge along x. */
function hut(): MapBlock[] {
  const walls = [standing('log', HUT.x0, HUT.x1, HUT.z0, HUT.z1, HUT.height)];
  return [...walls, ...tinRoof(walls, HUT.x0, HUT.x1, HUT.z0, HUT.z1, HUT_ROOF)];
}

/**
 * The hunter's cabin (x 62–70.4, z 18–26.4): log walls, two rooms joined by a doorway, a door on the north side, one
 * on the east (towards the track), a window in the south wall, and the west wall broken down to a low wall you vault
 * (M102): a way in from the west, and through the cabin to the track.
 */
function cabin(): MapBlock[] {
  const x0 = 62;
  const x1 = 70.4;
  const z0 = 18;
  const z1 = 26.4;
  const t = CABIN_WALL;
  const h = CABIN_HEIGHT;
  // MS1: every wall from the cabin's one floor level, so their tops meet the roof without a gap or a step.
  const level = footprintGround(x0, x1, z0, z1).mid;
  const wall = (ax: number, bx: number, az: number, bz: number): MapBlock => standing('log', ax, bx, az, bz, h, 0, level);
  const sill = (ax: number, bx: number, az: number, bz: number): MapBlock[] => [standing('log', ax, bx, az, bz, WINDOW_SILL, 0, level), standing('log', ax, bx, az, bz, h, WINDOW_TOP, level)];
  const mid = 66.2;
  const walls: MapBlock[] = [
    // North wall, with the door into the west room.
    wall(x0, 64.2, z1 - t, z1),
    wall(65.4, x1, z1 - t, z1),
    // South wall, with a window into the east room.
    wall(x0, 67.4, z0, z0 + t),
    ...sill(67.4, 68.8, z0, z0 + t),
    wall(68.8, x1, z0, z0 + t),
    // West wall, with a low stretch to vault (no lintel: a body going over needs its full height clear).
    wall(x0, x0 + t, z0 + t, 21),
    // On its own ground, not the cabin's level: its height over the ground each side is the vault's (M102).
    standing('log', x0, x0 + t, 21, 23, VAULT_WALL_HEIGHT),
    wall(x0, x0 + t, 23, z1 - t),
    // East wall, with the door towards the track.
    wall(x1 - t, x1, z0 + t, 20.6),
    wall(x1 - t, x1, 21.8, z1 - t),
    // The wall between the rooms, with its doorway.
    wall(mid, mid + t, z0 + t, 21.8),
    wall(mid, mid + t, 23, z1 - t),
  ];
  return [...walls, ...tinRoof(walls, x0, x1, z0, z1, CABIN_ROOF)];
}

/**
 * MS1: a pitched tin roof (the cabin's, and since WL2 the fort hut's) of two ramps meeting at a ridge along x, from the
 * highest wall's top, its eaves `R.overhang` m past the walls. Solid like the walls (BBs and sight stop on it); nobody
 * can reach its top.
 */
function tinRoof(walls: readonly MapBlock[], x0: number, x1: number, z0: number, z1: number, R: TinRoof): MapBlock[] {
  const base = Math.max(...walls.map((b) => b.center.y + b.size.y / 2));
  const zm = (z0 + z1) / 2;
  const ax = x0 - R.overhang;
  const bx = x1 + R.overhang;
  const half = (za: number, zb: number, rise: '+z' | '-z'): MapBlock => ({
    kind: 'ramp',
    rise,
    center: vec3(worldX((ax + bx) / 2), base + R.ridge / 2, worldZ((za + zb) / 2)),
    size: vec3(bx - ax, R.ridge, zb - za),
    finish: 'cladding',
    paint: R.paint,
    surface: 'metal',
  });
  // Plan +z is world −z: the south half rises north (world −z), the north half south.
  return [half(z0 - R.overhang, zm, '-z'), half(zm, z1 + R.overhang, '+z')];
}

/**
 * A big log pile's footprint (m). WL2 (owner, Beta 1 playtest: "completely remove all boulders. I hate them."): the
 * tall grey boulders on the fort's approaches became log piles of the same size and height (full cover).
 */
const LOG_PILE = { w: 2.4, d: 2 } as const;

/**
 * A fallen trunk where a big boulder stood on the meadow (WL2: no boulders), crouch cover: shorter than the meadow's
 * two fallen trees.
 */
const FALLEN = { length: 4, girth: 0.9 } as const;

/**
 * Logs: two fallen trees on the meadow and six shorter trunks where its big boulders and one small one stood (WL2),
 * the woodpile on the forest track, a log pile above the creek and one by the track. The other small boulders on the
 * meadow went with no stand-in.
 */
const LOGS: MapBlock[] = [
  ...(
    [
      [80, 37, 'x'],
      [47, 30.5, 'x'],
      [60, 53, 'x'],
      [40, 50, 'x'],
      // Across the West Rise's slope: lying down it, its uphill end was low enough to vault (as M102's Knoll log).
      [27, 41.5, 'z'],
      // Where a small boulder broke the corner-to-corner line across the meadow and the Knoll (map.sightline, 141 m).
      [75, 50.4, 'x'],
    ] as const
  ).map(([x, z, along]) => (along === 'x' ? centred('log', x, z, FALLEN.length, FALLEN.girth, CROUCH) : centred('log', x, z, FALLEN.girth, FALLEN.length, CROUCH))),
  centred('log', 42.5, 39.5, 7, 0.9, CROUCH),
  centred('log', 73.5, 58.5, 7, 0.9, CROUCH),
  standing('log', 36, 42, 63, 64.5, CROUCH),
  standing('log', 42.5, 44.5, 64.5, 66, FULL),
  standing('log', 27, 31, 24, 25.5, CROUCH),
  standing('log', 90, 93.5, 25, 26.5, CROUCH),
];

/**
 * Cover on the last 20 m of each way up to the fort (the Pro difficulty plan, owner 19:08): a log or a log pile
 * every few metres beside the Pine Belt's descent, the Meadow's climb and the sunken track, so attackers can bound up
 * from cover to cover instead of crossing open ground under the fort's guns. WL2: every boulder here is now a log pile
 * of its size and height (as crouch cover the three full-height ones let Pro attackers fall to 39 %).
 */
const APPROACH_COVER: MapBlock[] = [
  // Pine Belt, down the north shoulder.
  centred('log', 97, 60.9, 3, 0.9, CROUCH),
  centred('log', 92, 64.5, LOG_PILE.w, LOG_PILE.d, FULL),
  centred('log', 86.5, 68.9, 1.6, 1.4, CROUCH),
  // Across the slope, clear of the pile beside it (M55, audit SIM-05: the two once stood 0.2 m into each other). It
  // lay down the slope until M102: its top level, it stood 1.6 m over the ground at its low end and 0.6 m at its high
  // end, where it was no cover and low enough to vault.
  centred('log', 103.6, 57.3, 2.8, 0.9, CROUCH),
  centred('log', 102.6, 59.4, 1.6, 1.4, CROUCH),
  // Meadow, up the west face.
  centred('log', 76.5, 43.7, 1.6, 1.4, CROUCH),
  centred('log', 82.5, 48.8, LOG_PILE.w, LOG_PILE.d, FULL),
  centred('log', 87.5, 44, 1.6, 1.4, CROUCH),
  centred('log', 91.5, 49.3, 0.9, 3, CROUCH),
  // Creek, up the sunken track.
  // Against the meadow tree beside it (M55, audit SIM-05: the trunk grew out of what was a boulder).
  centred('log', 84.95, 31.8, 1.6, 1.4, CROUCH),
  centred('log', 91, 31.8, 1.6, 1.4, CROUCH),
  centred('log', 93.6, 32.6, 3, 0.9, CROUCH),
  centred('log', 97.5, 34.6, 3, 0.9, CROUCH),
  centred('log', 104.5, 36.5, LOG_PILE.w, LOG_PILE.d, FULL),
];

/** Trees standing on the meadow, picked off the sketch. */
const MEADOW_TREES: readonly (readonly [number, number])[] = [
  [31, 53],
  [19, 50.5],
  [21.5, 31.5],
  [25, 29.5],
  [76, 52.5],
  [79, 55.5],
  [16, 52],
  [47, 23],
  [83, 22],
  [86, 31.5],
];

/** A pine's trunk (m): you can hide behind it, but only just. */
const TRUNK = 0.5;
const TRUNK_HEIGHT = 9;

/** Places in plan coordinates no generated tree stands (the camps, the cabin, the fort, the creek bed). */
const CLEAR: readonly { x0: number; x1: number; z0: number; z1: number }[] = [
  { x0: 0, x1: 12.5, z0: 26, z1: 62 },
  { x0: 109.5, x1: 120, z0: 26, z1: 68 },
  { x0: 59, x1: 73, z0: 15, z1: 29 },
  { x0: 92, x1: 110, z0: 38, z1: 56 },
];

/** How close (m) a generated tree may stand to a lane, to another tree, or to another block. */
const TREE_LANE_GAP = 2.4;
const TREE_SPACING = 3;
const TREE_BLOCK_GAP = 1.6;

/**
 * The woods: close pines in the Pine Belt (z 62–80) and on the Knoll's north shoulder, and a looser strip along the
 * south fence (z 0–7). Scattered by a fixed seed, so the map is the same every time; no tree stands on a lane, in the
 * creek bed, in a camp, by the cabin or in the fort, nor too close to another tree or block.
 */
function woods(lanes: readonly (readonly (readonly [number, number])[])[], blocks: readonly MapBlock[]): MapBlock[] {
  const rng = createRng(33);
  const placed: { x: number; z: number }[] = MEADOW_TREES.map(([x, z]) => ({ x, z }));
  const out: MapBlock[] = MEADOW_TREES.map(([x, z]) => centred('tree', x, z, TRUNK, TRUNK, TRUNK_HEIGHT));
  const nearLane = (x: number, z: number): boolean =>
    lanes.some((lane) => lane.some((p, i) => i > 0 && segmentDistance(x, z, { x: lane[i - 1]![0], z: lane[i - 1]![1] }, { x: p[0], z: p[1] }) < TREE_LANE_GAP));
  const nearBlock = (x: number, z: number): boolean =>
    blocks.some((b) => Math.abs(worldX(x) - b.center.x) < b.size.x / 2 + TREE_BLOCK_GAP && Math.abs(worldZ(z) - b.center.z) < b.size.z / 2 + TREE_BLOCK_GAP);
  const areas: readonly { x0: number; x1: number; z0: number; z1: number; count: number }[] = [
    { x0: 1.5, x1: 118.5, z0: 62, z1: 78.5, count: 150 },
    { x0: 84, x1: 110, z0: 54, z1: 62, count: 22 },
    { x0: 1.5, x1: 118.5, z0: 1.5, z1: 7, count: 45 },
  ];
  for (const a of areas) {
    for (let tries = 0, n = 0; n < a.count && tries < a.count * 40; tries++) {
      const x = a.x0 + rngNext(rng) * (a.x1 - a.x0);
      const z = a.z0 + rngNext(rng) * (a.z1 - a.z0);
      if (CLEAR.some((c) => x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1)) continue;
      if (Math.abs(z - creekZ(x)) < CREEK_BED + 0.8) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < TREE_SPACING) || nearLane(x, z) || nearBlock(x, z)) continue;
      placed.push({ x, z });
      out.push(centred('tree', x, z, TRUNK, TRUNK, TRUNK_HEIGHT));
      n++;
    }
  }
  return out;
}

/**
 * A bush's size (m): radius across, height from its foot. MS1 (owner: "small and decorative", were 0.8–1.4 by 1.2–1.8):
 * the taller ones still hide a crouched player; nobody standing is hidden by one.
 */
const BUSH_RADIUS = [0.5, 0.85] as const;
const BUSH_HEIGHT = [0.9, 1.25] as const;
/** How close (m) a bush's edge may come to a lane's line, another bush's edge, or a block; how deep its foot sits. */
const BUSH_LANE_GAP = 0.8;
const BUSH_GAP = 0.4;
const BUSH_BLOCK_GAP = 0.2;
const BUSH_SINK = 0.1;

/**
 * The bushes (M33e): along the Pine Belt's edge, scattered on the meadow, on the creek's banks and round the Knoll's
 * shoulders, for hiding in and ambushing from. Scattered by a fixed seed; none on a lane, in the creek bed, in a camp,
 * by the cabin or in the fort, nor inside a block or another bush.
 */
function bushes(lanes: readonly (readonly (readonly [number, number])[])[], blocks: readonly MapBlock[]): Bush[] {
  const rng = createRng(34);
  const out: Bush[] = [];
  const laneDistance = (x: number, z: number): number =>
    Math.min(...lanes.flatMap((lane) => lane.slice(1).map((p, i) => segmentDistance(x, z, { x: lane[i]![0], z: lane[i]![1] }, { x: p[0], z: p[1] }))));
  const nearBlock = (x: number, z: number, r: number): boolean =>
    blocks.some((b) => Math.abs(worldX(x) - b.center.x) < b.size.x / 2 + r + BUSH_BLOCK_GAP && Math.abs(worldZ(z) - b.center.z) < b.size.z / 2 + r + BUSH_BLOCK_GAP);
  const areas: readonly { x0: number; x1: number; z0: number; z1: number; count: number }[] = [
    { x0: 12, x1: 108, z0: 58, z1: 66, count: 22 },
    { x0: 14, x1: 88, z0: 26, z1: 58, count: 16 },
    { x0: 14, x1: 90, z0: 6, z1: 24, count: 20 },
    { x0: 84, x1: 110, z0: 28, z1: 38, count: 6 },
    { x0: 84, x1: 110, z0: 56, z1: 64, count: 6 },
  ];
  for (const a of areas) {
    for (let tries = 0, n = 0; n < a.count && tries < a.count * 40; tries++) {
      const x = a.x0 + rngNext(rng) * (a.x1 - a.x0);
      const z = a.z0 + rngNext(rng) * (a.z1 - a.z0);
      const radius = BUSH_RADIUS[0] + rngNext(rng) * (BUSH_RADIUS[1] - BUSH_RADIUS[0]);
      const height = BUSH_HEIGHT[0] + rngNext(rng) * (BUSH_HEIGHT[1] - BUSH_HEIGHT[0]);
      if (CLEAR.some((c) => x >= c.x0 - radius && x <= c.x1 + radius && z >= c.z0 - radius && z <= c.z1 + radius)) continue;
      if (Math.abs(z - creekZ(x)) < CREEK_BED + radius) continue;
      if (laneDistance(x, z) < radius + BUSH_LANE_GAP || nearBlock(x, z, radius)) continue;
      if (out.some((b) => Math.hypot(worldX(x) - b.x, worldZ(z) - b.z) < b.radius + radius + BUSH_GAP)) continue;
      // Its foot at the lowest ground under its rim, so a bush on a slope doesn't hang over the downhill side.
      const foot = Math.min(ground(x, z), ground(x + radius, z), ground(x - radius, z), ground(x, z + radius), ground(x, z - radius));
      out.push({ x: worldX(x), y: foot - BUSH_SINK, z: worldZ(z), radius, height });
      n++;
    }
  }
  return out;
}

/** The fence round the field, in sections that follow the ground. */
function fence(): MapBlock[] {
  const out: MapBlock[] = [];
  const t = FENCE_THICKNESS;
  for (let x = 0; x < SIZE_X; x += FENCE_SECTION) {
    const x1 = Math.min(SIZE_X, x + FENCE_SECTION);
    out.push(fenceSection(x, x1, -t, 0), fenceSection(x, x1, SIZE_Z, SIZE_Z + t));
  }
  for (let z = 0; z < SIZE_Z; z += FENCE_SECTION) {
    const z1 = Math.min(SIZE_Z, z + FENCE_SECTION);
    out.push(fenceSection(-t, 0, z, z1), fenceSection(SIZE_X, SIZE_X + t, z, z1));
  }
  return out;
}

/** One fence section just outside the field: from under the lowest ground along it to FENCE_HEIGHT over the highest. */
function fenceSection(x0: number, x1: number, z0: number, z1: number): MapBlock {
  const cx = Math.min(SIZE_X, Math.max(0, x0));
  const cX = Math.min(SIZE_X, Math.max(0, x1));
  const cz = Math.min(SIZE_Z, Math.max(0, z0));
  const cZ = Math.min(SIZE_Z, Math.max(0, z1));
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (let i = 0; i <= 8; i++) {
    const h = ground(cx + ((cX - cx) * i) / 8, cz + ((cZ - cz) * i) / 8);
    low = Math.min(low, h);
    high = Math.max(high, h);
  }
  const y0 = low - 1;
  const y1 = high + FENCE_HEIGHT;
  return { kind: 'fence', center: vec3(worldX((x0 + x1) / 2), (y0 + y1) / 2, worldZ((z0 + z1) / 2)), size: vec3(x1 - x0, y1 - y0, z1 - z0) };
}

/** Fire and lantern light (hex RGB) and how far each lights the ground (m). */
const FIRE = { colour: 0xff9a4a, radius: 7, height: 0.5 };
const LANTERN = { colour: 0xffd27a, radius: 5.5, height: 2.2 };

/**
 * The light pools (M33g): a camp fire behind each end's spawns, a lantern on the fort's north and south baffles and one
 * by the cabin's north door. Anyone in one is seen from as far as by day; the rest of the field is moonlit or, under the
 * trees, dark.
 */
const LIGHTS: readonly MapLight[] = [
  ...[[4.5, 52], [115.5, 52]].map(([x, z]) => ({ position: vec3(worldX(x!), ground(x!, z!) + FIRE.height, worldZ(z!)), radius: FIRE.radius, colour: FIRE.colour, kind: 'fire' as const })),
  // MS1: the cabin lit up: a lantern on the east room's inner wall (spilling out of its window and door) and one by the
  // east door, towards the track.
  ...[[101, 52], [101, 42], [66, 27.5], [67, 24.6], [71.1, 22.6]].map(([x, z]) => ({ position: vec3(worldX(x!), ground(x!, z!) + LANTERN.height, worldZ(z!)), radius: LANTERN.radius, colour: LANTERN.colour, kind: 'lantern' as const })),
];

// --- The ground (M33i) ---------------------------------------------------------------------------------------------

/** Plan points to world ones, for a ground patch's path. */
const pathOf = (points: readonly (readonly [number, number])[]): { x: number; z: number }[] => points.map(([x, z]) => ({ x: worldX(x), z: worldZ(z) }));

/** The creek bed's line, every CREEK_STEP m of plan x, to where it ends. */
const CREEK_STEP = 2;
const creekLine = (): (readonly [number, number])[] => Array.from({ length: Math.floor(CREEK_END[1] / CREEK_STEP) + 1 }, (_, k) => [k * CREEK_STEP, creekZ(k * CREEK_STEP)] as const);

/** Widths (m): the creek's gravel reaches a little up its banks; tracks are worn a little wider than a person. */
const GRAVEL_WIDTH = 2 * (CREEK_BED + 0.6);
const FOREST_TRACK_WIDTH = 2;
const SUNKEN_TRACK_WIDTH = 2 * TRACK_BED;
/** Trampled earth round each camp's fire. The spawns stay on grass: at night the tone mapping crushes a brown under the
 * blue moon to near black, and a figure must read on the ground it starts on (KNOWN_ISSUES, M33i). */
const FIRE_CLEARING = 4;

/**
 * Woodland's ground (M33i): meadow grass, leaf litter wherever the trees close overhead, the creek's dry gravel bed, the
 * forest track along the Pine Belt lane and the sunken track as worn earth, trampled earth round the camp fires and in
 * the fort, and the cabin's boards.
 */
const GROUND: MapGround = {
  base: 'grass',
  underTrees: 'leaves',
  patches: [
    { surface: 'earth', path: pathOf(LANE_POINTS[0]!.slice(1, 7)), width: FOREST_TRACK_WIDTH },
    { surface: 'earth', path: pathOf([[TRACK.from.x, TRACK.from.z], [TRACK.to.x, TRACK.to.z]]), width: SUNKEN_TRACK_WIDTH },
    { surface: 'earth', path: pathOf([[4.5, 52]]), width: FIRE_CLEARING },
    { surface: 'earth', path: pathOf([[115.5, 52]]), width: FIRE_CLEARING },
    { surface: 'earth', box: [worldX(95), worldX(107.5), worldZ(53.5), worldZ(40.5)] },
    { surface: 'gravel', path: pathOf(creekLine()), width: GRAVEL_WIDTH },
    { surface: 'wood', box: [worldX(62 + CABIN_WALL), worldX(70.4 - CABIN_WALL), worldZ(18 + CABIN_WALL), worldZ(26.4 - CABIN_WALL)] },
  ] satisfies GroundPatch[],
};

const SPAWNS: [SpawnPoint[], SpawnPoint[]] = [END0_SPAWNS.map(spawnAt), END1_SPAWNS.map(spawnAt)];

const COVER: MapBlock[] = [...END0_CAMP, ...END1_CAMP, ...FORT, ...cabin(), ...LOGS, ...APPROACH_COVER];
const BLOCKS: MapBlock[] = [...fence(), ...COVER, ...woods(LANE_POINTS, COVER)];

/**
 * Named areas (CL1): what the bots call ("Contact, Oak!") and the minimap's caption shows, as plan boxes [x0, x1, z0, z1].
 * The first that holds a point names it, so the fort comes before the Knoll round it and the cabin before the creek.
 * Together they cover the field (map.areas, content rules).
 */
const AREAS: readonly (readonly [string, number, number, number, number])[] = [
  ['Fort', 94, 109, 39, 55],
  ['Cabin', 61, 72, 17, 28],
  ['Woodpile', 34, 47, 61, 68],
  ['Sunken track', 72, 95, 20, 37],
  ['West camp', 0, 13, 0, SIZE_Z],
  ['East camp', 111, SIZE_X, 0, SIZE_Z],
  ['Knoll', 86, 111, 25, 64],
  ['North shoulder', 86, 111, 64, SIZE_Z],
  ['West pines', 13, 55, 62, SIZE_Z],
  ['East pines', 55, 86, 62, SIZE_Z],
  ['West Rise', 13, 30, 25, 62],
  ['West meadow', 30, 58, 25, 62],
  ['East meadow', 58, 86, 25, 62],
  ['Creek', 13, 111, 0, 25],
];

export const WOODLAND: MapData = {
  name: 'Woodland',
  blocks: BLOCKS,
  killY: -10,
  spawns: SPAWNS,
  deadZones: [END0_DEAD.map(spawnAt), END1_DEAD.map(spawnAt)],
  lanes: LANE_POINTS.map((lane) => lane.map(([x, z]) => onGround(x, z))),
  flag: onGround(FLAG.x, FLAG.z),
  overtimeFlag: onGround(OVERTIME_FLAG.x, OVERTIME_FLAG.z),
  night: true,
  // Lit by night (M33f): the moon low over the Knoll, so it rims the hill's top while the face towards end 0 stays dark.
  // MS1 (owner, Dev 6 playtest: "still a bit too dark"): a brighter moon and fill, and more exposure, on this map only.
  lighting: { presets: ['night'], moonOver: { x: worldX(KNOLL.x), z: worldZ(KNOLL.z) }, overrides: { night: { hemi: { intensity: 1.4 }, key: { intensity: 1.35 }, exposureScale: 1.55 } } },
  terrain: TERRAIN,
  foliage: bushes(LANE_POINTS, BLOCKS),
  lights: LIGHTS,
  ground: GROUND,
  // The woods' sounds (M33j): wind in the pines, and by night insects, an owl and the camp fires crackling.
  ambience: 'woods',
  // Extraction (M48): the run's own data, placed on this layout in woodlandExtraction.ts.
  extraction: woodlandExtraction({ onGround, spawnAt, westCamp: SPAWNS[0] }),
  // G9: the woods' set dressing (look only: map/woodlandDressing.ts).
  dressing: WOODLAND_DRESSING,
  areas: AREAS.map(([name, x0, x1, z0, z1]): MapArea => ({ name, box: [worldX(x0), worldX(x1), worldZ(z1), worldZ(z0)] })),
};

/** Layout facts the tests check against (world coordinates), exported so they can't drift from the geometry. */
export const WOODLAND_LAYOUT = {
  halfX: SIZE_X / 2,
  halfZ: SIZE_Z / 2,
  crouchCoverHeight: CROUCH,
  fullCoverHeight: FULL,
  /** The Knoll's top (its flat part), round the flag. */
  knoll: { x: worldX(KNOLL.x), z: worldZ(KNOLL.z), topRadius: KNOLL_TOP, height: KNOLL_HEIGHT },
  /** The West Rise's crest (M88): its middle, world coordinates, on the ground. */
  riseCrest: onGround(RISE.x, (RISE.z0 + RISE.z1) / 2),
  /** The camps' barricade lines (world x): end 0's to the west, end 1's to the east. */
  campLines: [worldX(11), worldX(111)],
  /**
   * The fort round the flag: its inside (world x0..x1 × z0..z1, between the walls) and a point just outside each of its
   * four gaps (west, north, south, east), where the ways in start.
   */
  fort: {
    inside: { x0: worldX(95), x1: worldX(107.5), z0: worldZ(53.5), z1: worldZ(40.5) },
    entrances: [onGround(93, 47), onGround(101, 55.5), onGround(101, 38.5), onGround(109.5, 47)],
  },
} as const;
