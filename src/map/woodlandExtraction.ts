import type { Vec3 } from '../sim/vec';
import type { CaseSpot, ExitZone, ExtractionData, SpawnPoint } from './mapTypes';

/**
 * Woodland's Extraction data (M48), in Woodland's plan coordinates (x 0–120 east, z 0–80 north, as woodland.ts draws
 * them). The field's owner keeps the layout; this file only places the run on it, so woodland.ts passes in how it
 * puts a plan point on the ground. The data tests (extractionData.test.ts, extractionRegens.test.ts) check every point
 * against the real level, so a layout change that moves cover onto one of them fails there.
 *
 * The home team holds the Knoll fort and the cabin, the field's strongholds, so the squad never goes in beside them: at
 * the west camp, or in the south-east corner below the Knoll, behind the end of the sunken track. Two exits, open from
 * the start, sit halfway down the field: the logging track's gate in the north fence beyond the Pine Belt and the cabin
 * road's gate in the south fence below the cabin. A late exit in each far corner of the north woods opens with
 * EXTRACTION.lateExitAt left; the one by the west camp stays closed for a run from there.
 */

/** Plan points to world ones: woodland.ts's own helpers, so every point stands on the terrain the level is built from. */
export interface WoodlandPlacer {
  onGround(x: number, z: number): Vec3;
  spawnAt(s: { x: number; z: number; yaw: number }): SpawnPoint;
  /** The west camp's spawns (world, end 0's): a squad going in there starts where a team would. */
  westCamp: readonly SpawnPoint[];
}

/** A run on Woodland: 15 minutes (plan, section 5), three opponents more than the squad (4 / 5 / 6, plan, section 2). */
const RUN_TIME = 900;
const BASE_OPPONENTS = 3;
/** The plan's 25 m: the field is big enough to keep a returner well clear. */
const REGEN_DISTANCE = 25;
/** Exits are wider than Depot's: a field this size is crossed at a run, not a walk. */
const EXIT_RADIUS = 3;

/** The south-east corner's spawns: in a line below the Knoll, facing up the field to the north-west. */
const SOUTH_EAST = [109, 111.5, 114].map((x) => ({ x, z: 11, yaw: Math.PI * 0.75 }));

const EXITS: readonly { name: string; x: number; z: number; late?: boolean }[] = [
  { name: 'Logging track gate', x: 55, z: 76.5 },
  { name: 'Cabin road gate', x: 66, z: 3.2 },
  { name: 'North-west woods', x: 8, z: 71, late: true },
  { name: 'North-east woods', x: 112, z: 73, late: true },
];

/** The home team's starting points: in the fort, the cabin, and on each lane, the farthest from the insertion first. */
const OPPONENT_STARTS: readonly (readonly [number, number])[] = [
  [100.5, 47],
  [101, 44.5],
  [64.2, 22.5],
  [68.4, 23.8],
  [55, 45.6],
  [76, 46],
  [55, 72],
  [72, 72],
  [38, 69.5],
  [50, 17],
  [34, 17.5],
  [86, 29],
  [24, 62],
  [95, 60],
];

/**
 * Case spots (plan, section 6: the cabin and the Knoll fort are the natural locker spots): the marshal's locker in the
 * cabin's west room or the fort's north-east corner, field cases in the cabin's east room, the fort's south-west corner,
 * by the woodpile, a big boulder and the boulder on the track's climb, and ammo cans by the field's cover along the
 * lanes. Fifteen spots for a run's ten cases at most, so a run never has them all. Yaw is the case's front, as a spawn's
 * facing: its back to the wall or cover beside it.
 */
const LOCKER = ['locker', 'field-case'];
const ROOM = ['field-case', 'ammo-can'];
const LANE = ['ammo-can'];
const NORTH = Math.PI;
const SOUTH = 0;
const EAST = -Math.PI / 2;
const WEST = Math.PI / 2;
const CASE_SPOTS: readonly (readonly [number, number, number, readonly string[]])[] = [
  [63.1, 19.2, EAST, LOCKER], // the cabin's west room, in its south-west corner
  [106.7, 52.7, WEST, LOCKER], // the fort's north-east corner, behind the hut
  [69.3, 25.3, WEST, ROOM], // the cabin's east room
  [95.8, 41.3, EAST, ROOM], // the fort's south-west corner
  [43.5, 63.6, SOUTH, ROOM], // the woodpile on the forest track
  [47, 28.9, SOUTH, ROOM], // the big boulder above the creek
  [104.5, 34.9, SOUTH, ROOM], // the big boulder at the top of the sunken track
  [29, 26.4, NORTH, LANE], // the log pile above the creek
  [91.7, 24.2, SOUTH, LANE], // the log pile by the track
  [80, 38.6, NORTH, LANE], // the big boulder on the meadow's south side
  [60, 54.6, NORTH, LANE], // the big boulder by the Pine Belt
  [40, 51.6, NORTH, LANE], // the big boulder on the meadow's west side
  [42.5, 38.5, SOUTH, LANE], // the fallen tree on the meadow
  [55, 42.3, SOUTH, LANE], // the lone oak
  [73.5, 59.5, NORTH, LANE], // the fallen tree under the Pine Belt
];

/**
 * The home team's regen points: deep in the Pine Belt and the south strip's trees, behind the Knoll's north shoulder,
 * in the cabin and the fort, and behind each camp. A returner takes one at least REGEN_DISTANCE from the squad and out
 * of its sight, so wherever the squad is, the woods keep several usable (extractionRegens.test.ts).
 */
const REGENS: readonly (readonly [number, number, number])[] = [
  [20, 70, SOUTH],
  [42, 75, SOUTH],
  [68, 76, SOUTH],
  [88, 74, SOUTH],
  [100, 64, SOUTH],
  [64.2, 22.5, NORTH],
  [99, 50, SOUTH],
  [20, 4.5, NORTH],
  [44, 4.5, NORTH],
  [84, 4.5, NORTH],
  [104, 18, NORTH],
  [116, 22, WEST],
  [5, 22, EAST],
];

export function woodlandExtraction(at: WoodlandPlacer): ExtractionData {
  return {
    runTime: RUN_TIME,
    baseOpponents: BASE_OPPONENTS,
    insertions: [
      { name: 'West camp', spawns: [...at.westCamp], end: 0 },
      { name: 'South-east woods', spawns: SOUTH_EAST.map(at.spawnAt), end: 1 },
    ],
    exits: EXITS.map((e): ExitZone => ({ name: e.name, position: at.onGround(e.x, e.z), radius: EXIT_RADIUS, ...(e.late ? { late: true } : {}) })),
    opponentStarts: OPPONENT_STARTS.map(([x, z]) => at.spawnAt({ x, z, yaw: 0 })),
    cases: CASE_SPOTS.map(([x, z, yaw, kinds]): CaseSpot => ({ ...at.spawnAt({ x, z, yaw }), kinds: [...kinds] })),
    regens: REGENS.map(([x, z, yaw]) => at.spawnAt({ x, z, yaw })),
    regenDistance: REGEN_DISTANCE,
  };
}
