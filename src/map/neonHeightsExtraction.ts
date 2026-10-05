import { type Vec3, vec3 } from '../sim/vec';
import { FACING, placeRun, type RunPlan, SPOT_KINDS } from './extractionBlock';
import type { ExtractionData, SpawnPoint } from './mapTypes';

/**
 * Neon Heights' Extraction data (M48), in the map's plan coordinates (x east, z north, y the floor: street 0, Level 1
 * +3, Level 2 +6, as neonHeights.ts draws them). The map's owner keeps the layout; this file only places the run on it,
 * so neonHeights.ts passes in how it turns a plan point into a world one. The data tests (extractionData.test.ts,
 * extractionRegens.test.ts) check every point against the real level.
 *
 * Vertical loot (plan, section 6): the marshal's locker stands on Level 2, in the Studio or on the Tower's top floor,
 * field cases on Level 1, ammo cans on the street; the exits are all on the street. The squad goes in at either yard.
 * The street is narrow, so an exit is one at each corner of the site: Noodle Alley and the Back Alley open from the
 * start, the plaza and the Drone Dock late, and the two by the squad's own yard stay closed for the run.
 */

/** Plan points to world ones: neonHeights.ts's own helpers. */
export interface NeonHeightsPlacer {
  toWorld(p: Vec3): Vec3;
  spawnToWorld(s: SpawnPoint): SpawnPoint;
  /** The yards' spawns (world), end 0's then end 1's: the squad goes in where a team would start. */
  yards: readonly (readonly SpawnPoint[])[];
}

/** A run in the city: 10 minutes (plan, section 5), two opponents more than the squad (3 / 4 / 5), as on Depot. */
const RUN_TIME = 600;
const BASE_OPPONENTS = 2;
/** Depot's 15 m: the site is as small, and its floors hide a returner as well as distance does. */
const REGEN_DISTANCE = 15;
/** The alleys are narrow: Depot's 2.5 m exits wouldn't fit between their walls. */
const EXIT_RADIUS = 2;

const STREET = 0;
const LEVEL_1 = 3;
const LEVEL_2 = 6;

const EXITS: RunPlan['exits'] = [
  { name: 'Noodle Alley gate', at: [-15, STREET, 12.5] },
  { name: 'Back Alley gate', at: [10.6, STREET, 13.4] },
  { name: 'Plaza gate', at: [-18.4, STREET, -10.8], late: true },
  { name: 'Drone Dock gate', at: [13.6, STREET, -13.2], late: true },
];

/** The home team's starting points: in each building on each floor, and on the lanes, the farthest from the insertion first. */
const OPPONENT_STARTS: RunPlan['opponentStarts'] = [
  [9.5, STREET, -1.4],
  [10, LEVEL_1, -5],
  [10, LEVEL_2, -5],
  [-6, LEVEL_2, -13],
  [-6, LEVEL_1, -12],
  [-9, LEVEL_1, 1.5],
  [-2.7, STREET, 2.2],
  [8, STREET, 12.6],
  [8, STREET, -12.6],
  [-5.2, STREET, -9.2],
  [-6, STREET, 12],
];

/**
 * Case spots: the locker on Level 2 (the Studio's south wall, or the Tower's top floor in its south-east corner),
 * field cases on Level 1 (the Capsules, the Clinic, the Tower's offices) and in the Repair Shop, ammo cans on the
 * street and the Capsules balcony. Sixteen spots for a run's ten cases at most. Yaw is the case's front, as a spawn's
 * facing: its back to the wall beside it.
 */
const { locker: LOCKER, room: ROOM, lane: LANE } = SPOT_KINDS;
const { north: NORTH, south: SOUTH, east: EAST, west: WEST } = FACING;
const CASE_SPOTS: RunPlan['cases'] = [
  [-7.6, LEVEL_2, -14.4, NORTH, LOCKER], // the Studio, against the south wall
  [16.1, LEVEL_2, -9.1, WEST, LOCKER], // the Tower's Level 2, in its south-east corner
  [-13.8, LEVEL_1, -1, EAST, ROOM], // the Capsules, in the south-west corner
  [-4.4, LEVEL_1, -14.4, NORTH, ROOM], // the Clinic, in the south-east corner
  [4.9, LEVEL_1, -9.2, NORTH, ROOM], // the Tower's Level 1 office, by the grand stair's top
  [12.6, LEVEL_2, 10.1, SOUTH, ROOM], // the Tower's Level 2 gallery, its north-east end
  [-4.4, STREET, -6, SOUTH, ROOM], // the Repair Shop, in its north-east corner
  [-4.3, STREET, 9.3, SOUTH, LANE], // the Arcade, in its north-east corner
  [4.9, STREET, 10.2, SOUTH, LANE], // the Tower's bar, in its north-west corner
  [-7.4, STREET, 14.3, WEST, LANE], // Noodle Alley, by the drinks stand
  [8.8, STREET, -14.3, NORTH, LANE], // the Drone Dock
  [2.2, STREET, -2.2, EAST, LANE], // the kiosk on the avenue
  [15, STREET, 11.8, SOUTH, LANE], // the Back Alley, by the skip
  [-2.75, LEVEL_1, 9.3, SOUTH, LANE], // the Capsules balcony's north end
  [-17, STREET, -14.3, NORTH, LANE], // the plaza, by the south wall
  [16.2, STREET, -3.4, WEST, LANE], // the Tower's store, by the east wall
];

/**
 * The home team's regen points: rooms on every floor of both buildings, the alleys behind them and the yards behind
 * their spawn walls. A returner takes one at least REGEN_DISTANCE from the squad and out of its sight.
 */
const REGENS: RunPlan['regens'] = [
  [-6, LEVEL_2, -12.6, NORTH],
  [-6, LEVEL_1, -11.8, NORTH],
  [-6.4, STREET, -12.6, NORTH],
  [-12, LEVEL_1, 8.6, SOUTH],
  [-12, STREET, 9.2, SOUTH],
  [10, LEVEL_2, -8.6, NORTH],
  [15.6, LEVEL_1, -8.4, WEST],
  [15.6, STREET, -6, WEST],
  [5.4, STREET, 8.6, EAST],
  [-21.8, STREET, 9.5, EAST],
  [21.8, STREET, -9.5, WEST],
  [-21.8, STREET, -6.5, EAST],
  [3, STREET, 13.6, SOUTH],
];

export function neonHeightsExtraction(at: NeonHeightsPlacer): ExtractionData {
  return placeRun(
    {
      runTime: RUN_TIME,
      baseOpponents: BASE_OPPONENTS,
      regenDistance: REGEN_DISTANCE,
      exitRadius: EXIT_RADIUS,
      insertions: [
        { name: 'West Yard', spawns: at.yards[0]!, end: 0 },
        { name: 'East Yard', spawns: at.yards[1]!, end: 1 },
      ],
      exits: EXITS,
      opponentStarts: OPPONENT_STARTS,
      cases: CASE_SPOTS,
      regens: REGENS,
    },
    { point: ([x, y, z]) => at.toWorld(vec3(x, y, z)), spawn: ([x, y, z], yaw) => at.spawnToWorld({ position: vec3(x, y, z), yaw }) },
  );
}
