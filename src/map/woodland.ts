import { createRng, rngNext } from '../sim/rng';
import { type Vec3, vec3 } from '../sim/vec';
import type { Bush } from './foliage';
import type { MapLight } from './nightSight';
import type { BlockKind, GroundPatch, MapBlock, MapData, MapGround, SpawnPoint } from './mapTypes';
import { buildTerrain, type Terrain, terrainHeightAt } from './terrain';
import { WOODLAND_DRESSING } from './woodlandDressing';
import { woodlandExtraction } from './woodlandExtraction';

/**
 * "Woodland" (M33, the owner's pick, 2026-10-04; concept sketch v1 approved at 18:07 with its defaults): a wide wood at
 * night, 120 × 80 m (six Depots), mostly open, with sparse cover: trees, boulders and logs. Still being built: dev
 * content (M35, map/maps.ts), listed only while the Dev tab's Dev content switch is on.
 *
 * The ground (map/terrain.ts) rises gently from end 0 to the Knoll, so one team starts downhill and the other uphill;
 * the ends swap at half-time. Three lanes run west to east (plan coordinates, as on the sketch: x 0–120 to the east,
 * z 0–80 to the north; see toWorld):
 * - 1 Pine Belt (north, z 62–80): close pines and a forest track, the long way round to the Knoll's wooded north
 *   shoulder. Cover everywhere, sight short.
 * - 2 Meadow (mid, z 25–62): open grass with boulders (crouch and full cover), a lone oak, two fallen trees and a
 *   woodpile. The fast, exposed way.
 * - 3 Creek (south): along the north bank of a dry stream bed 0.7 m below the field, past the hunter's cabin (two log
 *   rooms with doors and windows), then up a sunken track to the Knoll's south side.
 * - The Knoll (x 86–116, z 30–64): a hill 3.8 m over the field's slope, its top +6.5 m, with a log fort around the
 *   flag (Attack / Defend). Its west face is the steepest slope on the map (about 1:2.3).
 * - End 0 camp (west, ±0 m) and end 1 camp (east, about +3.5 m, behind the Knoll's crest): log barricades as spawn
 *   walls.
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
const CABIN_HEIGHT = 2.6;
const WINDOW_SILL = CROUCH;
const WINDOW_TOP = 2.0;

// --- The ground --------------------------------------------------------------------------------------------------

/** End 0's camp is flat to here; the slope rises from it. */
const SLOPE_X0 = 11;
/** The foot of the Knoll, and the field's height there (a 3.4% rise). */
const SLOPE_X1 = 85;
const SLOPE_RISE = 2.5;
/** East of the Knoll's foot the ground keeps rising a little, to +3 m at the east fence. */
const EAST_RISE = 0.5;

/** The Knoll: a flat top of radius KNOLL_TOP round its centre, falling off over KNOLL_FALL metres. */
const KNOLL = { x: 101, z: 47 };
const KNOLL_HEIGHT = 3.8;
const KNOLL_TOP = 6;
const KNOLL_FALL = 13.5;

/** The creek: its bed follows z = 12 + 3·sin(x / 14), 0.7 m down, 2 m wide, with 2.8 m banks; it ends before the Knoll. */
const CREEK_DEPTH = 0.7;
const CREEK_BED = 1;
const CREEK_BANK = 2.8;
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
  const slope = x <= SLOPE_X0 ? 0 : x <= SLOPE_X1 ? (SLOPE_RISE * (x - SLOPE_X0)) / (SLOPE_X1 - SLOPE_X0) : SLOPE_RISE + EAST_RISE * Math.min(1, (x - SLOPE_X1) / (SIZE_X - SLOPE_X1));
  const r = Math.hypot(x - KNOLL.x, z - KNOLL.z);
  const knoll = r <= KNOLL_TOP ? KNOLL_HEIGHT : r >= KNOLL_TOP + KNOLL_FALL ? 0 : (KNOLL_HEIGHT * (1 + Math.cos((Math.PI * (r - KNOLL_TOP)) / KNOLL_FALL))) / 2;
  const creek = dip(Math.abs(z - creekZ(x)), CREEK_DEPTH, CREEK_BED, CREEK_BANK) * (1 - smoothstep(CREEK_END[0], CREEK_END[1], x));
  const track = dip(segmentDistance(x, z, TRACK.from, TRACK.to), TRACK_DEPTH, TRACK_BED, TRACK_BANK) * (1 - smoothstep(TRACK_FADE[0], TRACK_FADE[1], x));
  return slope + knoll - creek - track;
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
function standing(kind: BlockKind, x0: number, x1: number, z0: number, z1: number, height: number, from = 0): MapBlock {
  const g = footprintGround(x0, x1, z0, z1);
  const y0 = from > 0 ? g.mid + from : g.low - SINK;
  const y1 = g.mid + height;
  return { kind, center: vec3(worldX((x0 + x1) / 2), (y0 + y1) / 2, worldZ((z0 + z1) / 2)), size: vec3(x1 - x0, y1 - y0, z1 - z0) };
}

/** A block of `w` × `d` centred on plan (x, z). */
const centred = (kind: BlockKind, x: number, z: number, w: number, d: number, h: number): MapBlock => standing(kind, x - w / 2, x + w / 2, z - d / 2, z + d / 2, h);

// --- Lanes, spawns, the flag -------------------------------------------------------------------------------------

/** Advance routes from end 0 to end 1 (plan points); defending bots hold the last or second-last point of theirs. */
const LANE_POINTS: readonly (readonly [number, number])[][] = [
  // Pine Belt: out of the camp's north gap, along the forest track, down the Knoll's north shoulder into the fort.
  [[13, 51], [24, 62], [38, 69.5], [55, 72], [72, 72], [86, 67], [95, 60], [101, 57], [101, 52.7], [98.3, 52.7], [98.3, 48.5]],
  // Meadow: straight across, past the lone oak's north side, up the Knoll's west face.
  [[13, 44], [30, 46.5], [49, 47.5], [62, 46.5], [76, 46], [89, 46.5], [95.8, 47], [95.8, 44.2], [98.5, 44.2]],
  // Creek: down to the creek's north bank, past the cabin's south and east sides, up the sunken track into the fort.
  [[13, 36], [22, 24], [34, 17.5], [50, 17], [60, 16], [73, 16.5], [76, 24], [86, 29], [94, 36], [101, 37], [101, 41.3], [103.8, 41.3], [103.8, 44]],
];

/** The flagpole: on the Knoll's top, inside the fort. */
const FLAG = { x: 101, z: 47 };

/** Five spawns a side (Woodland plays 4v4, up to 5v5), each camp facing the other way down the field. */
const END0_SPAWNS = [38.5, 41, 43.5, 46, 48.5].map((z) => ({ x: 6.5, z, yaw: -Math.PI / 2 }));
const END1_SPAWNS = [39, 41.5, 44, 46.5, 49].map((z) => ({ x: 116.5, z, yaw: Math.PI / 2 }));
/** Dead zones: each camp's back corner, behind its barricades and away from every lane. */
const END0_DEAD = [[2, 64], [3, 64], [2, 65], [3, 65], [2.5, 66]].map(([x, z]) => ({ x: x!, z: z!, yaw: -Math.PI / 2 }));
const END1_DEAD = [[118, 64], [117, 64], [118, 65], [117, 65], [117.5, 66]].map(([x, z]) => ({ x: x!, z: z!, yaw: Math.PI / 2 }));

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
 * most defender-friendly setup there is).
 */
const FORT: MapBlock[] = [
  // North-west corner.
  standing('log', 94, 95, 50, 54, FULL),
  standing('log', 95, 99.5, 53.5, 54.5, FULL),
  // South-west.
  standing('log', 94, 95, 40, 44, FULL),
  standing('log', 95, 99.5, 39.5, 40.5, FULL),
  // North-east.
  standing('log', 102.5, 107.5, 53.5, 54.5, FULL),
  standing('log', 107.5, 108.5, 50, 54.5, FULL),
  // South-east.
  standing('log', 102.5, 107.5, 39.5, 40.5, FULL),
  standing('log', 107.5, 108.5, 39.5, 44, FULL),
  // The hut, and the baffles inside the west, north and south gaps (1.6 m in from the wall).
  standing('log', 104, 107, 45.5, 49.5, FULL),
  standing('log', 96.6, 97.4, 45, 49, FULL),
  standing('log', 99, 103, 51.1, 51.9, FULL),
  standing('log', 99, 103, 42.1, 42.9, FULL),
];

/**
 * The hunter's cabin (x 62–70.4, z 18–26.4): log walls, two rooms joined by a doorway, a door on the north side, one
 * on the east (towards the track), and a window in the west and the south walls.
 */
function cabin(): MapBlock[] {
  const x0 = 62;
  const x1 = 70.4;
  const z0 = 18;
  const z1 = 26.4;
  const t = CABIN_WALL;
  const h = CABIN_HEIGHT;
  const wall = (ax: number, bx: number, az: number, bz: number): MapBlock => standing('log', ax, bx, az, bz, h);
  const sill = (ax: number, bx: number, az: number, bz: number): MapBlock[] => [standing('log', ax, bx, az, bz, WINDOW_SILL), standing('log', ax, bx, az, bz, h, WINDOW_TOP)];
  const mid = 66.2;
  return [
    // North wall, with the door into the west room.
    wall(x0, 64.2, z1 - t, z1),
    wall(65.4, x1, z1 - t, z1),
    // South wall, with a window into the east room.
    wall(x0, 67.4, z0, z0 + t),
    ...sill(67.4, 68.8, z0, z0 + t),
    wall(68.8, x1, z0, z0 + t),
    // West wall, with a window.
    wall(x0, x0 + t, z0 + t, 21),
    ...sill(x0, x0 + t, 21, 23),
    wall(x0, x0 + t, 23, z1 - t),
    // East wall, with the door towards the track.
    wall(x1 - t, x1, z0 + t, 20.6),
    wall(x1 - t, x1, 21.8, z1 - t),
    // The wall between the rooms, with its doorway.
    wall(mid, mid + t, z0 + t, 21.8),
    wall(mid, mid + t, 23, z1 - t),
  ];
}

/** Boulders on the meadow and round the field: crouch cover, and big ones that are full cover. */
const BOULDERS: MapBlock[] = [
  ...(
    [
      [33, 56.5],
      [52, 56],
      [29, 50],
      [64, 50],
      [75, 49.5],
      [84, 43],
      [68, 42.5],
      [36, 41],
      [58, 37],
      [22, 37.5],
      [14, 27],
      [44, 59],
      [88, 52],
    ] as const
  ).map(([x, z]) => centred('boulder', x, z, 1.6, 1.4, CROUCH)),
  ...(
    [
      [80, 37],
      [47, 30.5],
      [60, 53],
      [40, 50],
      [27, 41.5],
    ] as const
  ).map(([x, z]) => centred('boulder', x, z, 2.4, 2, FULL)),
];

/** Logs: two fallen trees on the meadow, the woodpile on the forest track, a log pile above the creek and one by the track. */
const LOGS: MapBlock[] = [
  centred('log', 42.5, 39.5, 7, 0.9, CROUCH),
  centred('log', 73.5, 58.5, 7, 0.9, CROUCH),
  standing('log', 36, 42, 63, 64.5, CROUCH),
  standing('log', 42.5, 44.5, 64.5, 66, FULL),
  standing('log', 27, 31, 24, 25.5, CROUCH),
  standing('log', 90, 93.5, 25, 26.5, CROUCH),
];

/**
 * Cover on the last 20 m of each way up to the fort (the Pro difficulty plan, owner 19:08): a log pile or a boulder
 * every few metres beside the Pine Belt's descent, the Meadow's climb and the sunken track, so attackers can bound up
 * from cover to cover instead of crossing open ground under the fort's guns.
 */
const APPROACH_COVER: MapBlock[] = [
  // Pine Belt, down the north shoulder.
  centred('log', 97, 60.9, 3, 0.9, CROUCH),
  centred('boulder', 92, 64.5, 2.4, 2, FULL),
  centred('boulder', 86.5, 68.9, 1.6, 1.4, CROUCH),
  // Ends against the boulder beside it (M55, audit SIM-05: the two stood 0.2 m into each other).
  centred('log', 103.6, 57.3, 0.9, 2.8, CROUCH),
  centred('boulder', 102.6, 59.4, 1.6, 1.4, CROUCH),
  // Meadow, up the west face.
  centred('boulder', 76.5, 43.7, 1.6, 1.4, CROUCH),
  centred('boulder', 82.5, 48.8, 2.4, 2, FULL),
  centred('boulder', 87.5, 44, 1.6, 1.4, CROUCH),
  centred('log', 91.5, 49.3, 0.9, 3, CROUCH),
  // Creek, up the sunken track.
  // Against the meadow tree beside it (M55, audit SIM-05: the trunk grew out of it).
  centred('boulder', 84.95, 31.8, 1.6, 1.4, CROUCH),
  centred('boulder', 91, 31.8, 1.6, 1.4, CROUCH),
  centred('log', 93.6, 32.6, 3, 0.9, CROUCH),
  centred('log', 97.5, 34.6, 3, 0.9, CROUCH),
  centred('boulder', 104.5, 36.5, 2.4, 2, FULL),
];

/** The lone oak in the middle of the meadow: a trunk you can hide behind. */
const OAK = centred('tree', 55, 43.5, 1.2, 1.2, 12);

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

/** A bush's size (m): radius across, height from its foot. Most hide a crouched player; a standing one shows a head. */
const BUSH_RADIUS = [0.8, 1.4] as const;
const BUSH_HEIGHT = [1.2, 1.8] as const;
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
  ...[[101, 52], [101, 42], [66, 27.5]].map(([x, z]) => ({ position: vec3(worldX(x!), ground(x!, z!) + LANTERN.height, worldZ(z!)), radius: LANTERN.radius, colour: LANTERN.colour, kind: 'lantern' as const })),
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

const COVER: MapBlock[] = [...END0_CAMP, ...END1_CAMP, ...FORT, ...cabin(), ...BOULDERS, ...LOGS, ...APPROACH_COVER, OAK];
const BLOCKS: MapBlock[] = [...fence(), ...COVER, ...woods(LANE_POINTS, COVER)];

export const WOODLAND: MapData = {
  name: 'Woodland',
  blocks: BLOCKS,
  killY: -10,
  spawns: SPAWNS,
  deadZones: [END0_DEAD.map(spawnAt), END1_DEAD.map(spawnAt)],
  lanes: LANE_POINTS.map((lane) => lane.map(([x, z]) => onGround(x, z))),
  flag: onGround(FLAG.x, FLAG.z),
  night: true,
  // Lit by night (M33f): the moon low over the Knoll, so it rims the hill's top while the face towards end 0 stays dark.
  lighting: { presets: ['night'], moonOver: { x: worldX(KNOLL.x), z: worldZ(KNOLL.z) } },
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
};

/** Layout facts the tests check against (world coordinates), exported so they can't drift from the geometry. */
export const WOODLAND_LAYOUT = {
  halfX: SIZE_X / 2,
  halfZ: SIZE_Z / 2,
  crouchCoverHeight: CROUCH,
  fullCoverHeight: FULL,
  /** The Knoll's top (its flat part), round the flag. */
  knoll: { x: worldX(KNOLL.x), z: worldZ(KNOLL.z), topRadius: KNOLL_TOP, height: KNOLL_HEIGHT },
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
