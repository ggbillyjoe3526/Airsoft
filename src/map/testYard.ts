import { vec3 } from '../sim/vec';
import type { MapBlock, MapData } from './mapTypes';

/** Half the inner width of the yard (metres). */
export const TEST_YARD_HALF_SIZE = 15;
const HALF = TEST_YARD_HALF_SIZE;
const WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.4;
const FLOOR_THICKNESS = 0.5;

/** Four walls enclosing a square floor, so nobody can leave the play area. */
function perimeter(half: number): MapBlock[] {
  const h = WALL_HEIGHT / 2;
  const t = WALL_THICKNESS;
  const len = half * 2 + t * 2;
  return [
    { kind: 'wall', center: vec3(0, h, -half - t / 2), size: vec3(len, WALL_HEIGHT, t) },
    { kind: 'wall', center: vec3(0, h, half + t / 2), size: vec3(len, WALL_HEIGHT, t) },
    { kind: 'wall', center: vec3(-half - t / 2, h, 0), size: vec3(t, WALL_HEIGHT, half * 2) },
    { kind: 'wall', center: vec3(half + t / 2, h, 0), size: vec3(t, WALL_HEIGHT, half * 2) },
  ];
}

/** Minimal walled yard with a crate: a small, predictable fixture for physics and lighting tests. */
export const TEST_YARD: MapData = {
  name: 'Test Yard',
  blocks: [
    {
      kind: 'floor',
      center: vec3(0, -FLOOR_THICKNESS / 2, 0),
      size: vec3(HALF * 2 + WALL_THICKNESS * 2, FLOOR_THICKNESS, HALF * 2 + WALL_THICKNESS * 2),
    },
    ...perimeter(HALF),
    { kind: 'crate', center: vec3(0, 0.6, -6), size: vec3(1.2, 1.2, 1.2) },
  ],
  killY: -10,
  spawns: [[{ position: vec3(0, 0, 4), yaw: 0 }], []],
  deadZones: [[{ position: vec3(-8, 0, 8), yaw: 0 }], []],
  lanes: [],
};

/** Ramp Yard: half length and half width of the floor, and the raised platform across its middle (metres). */
const RAMP_YARD_HALF_X = 20;
const RAMP_YARD_HALF_Z = 8;
const PLATFORM_HALF_X = 6;
const PLATFORM_HEIGHT = 1;
/** Each ramp rises the platform height over this run (1:2, 26.6°) and is this wide. */
const RAMP_RUN = 2;
const RAMP_HALF_WIDTH = 1.5;

/**
 * Elevation fixture for headless matches: a walled 40 × 16 m yard whose middle is a 1 m platform wall to
 * wall, reached only by a ramp at each end. A wall in the platform's middle splits it into a north and a
 * south lane and hides the spawns from each other. Teams spawn and wait out on the lower floor, so every
 * fight is on or across the upper level and every walk-off comes back down a ramp. The platform's edges
 * and the ramps' sides are open drops, as a loading dock's are: bots must fight up there without
 * stepping off.
 */
export const RAMP_YARD: MapData = {
  name: 'Ramp Yard',
  blocks: [
    {
      kind: 'floor',
      center: vec3(0, -FLOOR_THICKNESS / 2, 0),
      size: vec3(RAMP_YARD_HALF_X * 2, FLOOR_THICKNESS, RAMP_YARD_HALF_Z * 2),
    },
    { kind: 'floor', center: vec3(0, PLATFORM_HEIGHT / 2, 0), size: vec3(PLATFORM_HALF_X * 2, PLATFORM_HEIGHT, RAMP_YARD_HALF_Z * 2) },
    {
      kind: 'ramp',
      center: vec3(-PLATFORM_HALF_X - RAMP_RUN / 2, PLATFORM_HEIGHT / 2, 0),
      size: vec3(RAMP_RUN, PLATFORM_HEIGHT, RAMP_HALF_WIDTH * 2),
      rise: '+x',
    },
    {
      kind: 'ramp',
      center: vec3(PLATFORM_HALF_X + RAMP_RUN / 2, PLATFORM_HEIGHT / 2, 0),
      size: vec3(RAMP_RUN, PLATFORM_HEIGHT, RAMP_HALF_WIDTH * 2),
      rise: '-x',
    },
    { kind: 'wall', center: vec3(0, PLATFORM_HEIGHT + WALL_HEIGHT / 2, 0), size: vec3(WALL_THICKNESS, WALL_HEIGHT, 8) },
    // Crate-high cover on the platform, one per lane and side.
    { kind: 'crate', center: vec3(-4.5, PLATFORM_HEIGHT + 0.6, 5.5), size: vec3(1.2, 1.2, 1.2) },
    { kind: 'crate', center: vec3(4.5, PLATFORM_HEIGHT + 0.6, 5.5), size: vec3(1.2, 1.2, 1.2) },
    { kind: 'crate', center: vec3(-4.5, PLATFORM_HEIGHT + 0.6, -5.5), size: vec3(1.2, 1.2, 1.2) },
    { kind: 'crate', center: vec3(4.5, PLATFORM_HEIGHT + 0.6, -5.5), size: vec3(1.2, 1.2, 1.2) },
    ...rampYardPerimeter(),
  ],
  killY: -10,
  spawns: [
    [-2, 0, 2].map((z) => ({ position: vec3(-17, 0, z), yaw: -Math.PI / 2 })),
    [-2, 0, 2].map((z) => ({ position: vec3(17, 0, z), yaw: Math.PI / 2 })),
  ],
  deadZones: [
    [6.5, 5.5, 4.5].map((z) => ({ position: vec3(-18.5, 0, z), yaw: -Math.PI / 2 })),
    [6.5, 5.5, 4.5].map((z) => ({ position: vec3(18.5, 0, z), yaw: Math.PI / 2 })),
  ],
  lanes: [
    [vec3(-11, 0, 0), vec3(-2, PLATFORM_HEIGHT, 6), vec3(2, PLATFORM_HEIGHT, 6), vec3(11, 0, 0)],
    [vec3(-11, 0, 0), vec3(-2, PLATFORM_HEIGHT, -6), vec3(2, PLATFORM_HEIGHT, -6), vec3(11, 0, 0)],
  ],
};

function rampYardPerimeter(): MapBlock[] {
  const h = WALL_HEIGHT / 2;
  const t = WALL_THICKNESS;
  return [
    { kind: 'wall', center: vec3(0, h, -RAMP_YARD_HALF_Z - t / 2), size: vec3(RAMP_YARD_HALF_X * 2 + t * 2, WALL_HEIGHT, t) },
    { kind: 'wall', center: vec3(0, h, RAMP_YARD_HALF_Z + t / 2), size: vec3(RAMP_YARD_HALF_X * 2 + t * 2, WALL_HEIGHT, t) },
    { kind: 'wall', center: vec3(-RAMP_YARD_HALF_X - t / 2, h, 0), size: vec3(t, WALL_HEIGHT, RAMP_YARD_HALF_Z * 2) },
    { kind: 'wall', center: vec3(RAMP_YARD_HALF_X + t / 2, h, 0), size: vec3(t, WALL_HEIGHT, RAMP_YARD_HALF_Z * 2) },
  ];
}

/** Stack House: half length and half width of the yard, and the building's upper floor (metres). */
const STACK_HALF_X = 20;
const STACK_HALF_Z = 8;
const STACK_WALL_HEIGHT = 7;
const STOREY = 3;
const SLAB = 0.3;
const UPPER_HALF_X = 6;
/** Each stair rises a storey over this run (1:2, the physics limit) and is this wide. */
const STAIR_RUN = 6;
const STAIR_WIDTH = 2;
const RAIL = 1.2;
const PILLAR = 0.4;

/**
 * Floors stacked over each other (M34b): a walled 40 × 16 m yard with a covered hall in the middle, 12 m long and wall to
 * wall, whose roof is an upper floor 3 m up. One stair (a 1:2 ramp, 6 m long) climbs to it at the north-west corner,
 * another at the south-east, so the upper floor has two ways up. A wall splits the upper floor into a north and a south
 * half joined at both ends; rails run along its east and west edges except a 3 m open stretch each side, the drop a
 * balcony has. The hall below has pillars and crates, so fights happen on both floors and across them. Teams spawn and
 * wait out on the ground at the ends; walk-offs from upstairs come down a stair.
 */
export const STACK_HOUSE: MapData = {
  name: 'Stack House',
  blocks: [
    { kind: 'floor', center: vec3(0, -FLOOR_THICKNESS / 2, 0), size: vec3(STACK_HALF_X * 2, FLOOR_THICKNESS, STACK_HALF_Z * 2) },
    // The upper floor: a slab whose top is one storey up, over the hall.
    { kind: 'floor', center: vec3(0, STOREY - SLAB / 2, 0), size: vec3(UPPER_HALF_X * 2, SLAB, STACK_HALF_Z * 2) },
    // Stairs: north-west rising east, south-east rising west, each ending at the slab's edge.
    {
      kind: 'ramp',
      center: vec3(-UPPER_HALF_X - STAIR_RUN / 2, STOREY / 2, STACK_HALF_Z - 1 - STAIR_WIDTH / 2),
      size: vec3(STAIR_RUN, STOREY, STAIR_WIDTH),
      rise: '+x',
      surface: 'metal',
    },
    {
      kind: 'ramp',
      center: vec3(UPPER_HALF_X + STAIR_RUN / 2, STOREY / 2, -STACK_HALF_Z + 1 + STAIR_WIDTH / 2),
      size: vec3(STAIR_RUN, STOREY, STAIR_WIDTH),
      rise: '-x',
      surface: 'metal',
    },
    // Upstairs: the splitting wall and crate cover in each half.
    { kind: 'wall', center: vec3(0, STOREY + (STOREY - SLAB) / 2, 0), size: vec3(WALL_THICKNESS, STOREY - SLAB, 6) },
    { kind: 'crate', center: vec3(-3, STOREY + 0.6, 4), size: vec3(1.2, 1.2, 1.2) },
    { kind: 'crate', center: vec3(3, STOREY + 0.6, -4), size: vec3(1.2, 1.2, 1.2) },
    ...stackRails(),
    // Downstairs: four pillars holding the slab, and crate cover.
    ...[-3, 3].flatMap((x) =>
      [-4, 4].map((z): MapBlock => ({ kind: 'wall', center: vec3(x, (STOREY - SLAB) / 2, z), size: vec3(PILLAR, STOREY - SLAB, PILLAR) })),
    ),
    { kind: 'crate', center: vec3(0, 0.6, 2.5), size: vec3(1.2, 1.2, 1.2) },
    { kind: 'crate', center: vec3(0, 0.6, -2.5), size: vec3(1.2, 1.2, 1.2) },
    // Crate cover in the yards between the ends and the hall.
    { kind: 'crate', center: vec3(-11, 0.6, -3), size: vec3(1.2, 1.2, 1.2) },
    { kind: 'crate', center: vec3(11, 0.6, 3), size: vec3(1.2, 1.2, 1.2) },
    ...stackPerimeter(),
  ],
  killY: -10,
  spawns: [
    [-2, 0, 2].map((z) => ({ position: vec3(-17, 0, z), yaw: -Math.PI / 2 })),
    [-2, 0, 2].map((z) => ({ position: vec3(17, 0, z), yaw: Math.PI / 2 })),
  ],
  deadZones: [
    [-6.5, -5.5, -4.5].map((z) => ({ position: vec3(-18.5, 0, z), yaw: -Math.PI / 2 })),
    [6.5, 5.5, 4.5].map((z) => ({ position: vec3(18.5, 0, z), yaw: Math.PI / 2 })),
  ],
  lanes: [
    // Through the hall, under the upper floor.
    [vec3(-12, 0, 0), vec3(-4.5, 0, 0), vec3(4.5, 0, 0), vec3(12, 0, 0)],
    // Up the north-west stair, across the upper floor round the wall, down the south-east stair.
    [vec3(-13.5, 0, 6), vec3(-4, STOREY, 6), vec3(4, STOREY, -6), vec3(13.5, 0, -6)],
  ],
};

/**
 * Rails along the upper floor's east and west edges, 1.2 m high, except where a stair lands and a 3 m open stretch
 * (z 1 to 4 on the west edge, -4 to -1 on the east): a drop to the hall's entrance, as from a balcony.
 */
function stackRails(): MapBlock[] {
  const t = 0.2;
  const rail = (x: number, z0: number, z1: number): MapBlock => ({
    kind: 'barrier',
    center: vec3(x, STOREY + RAIL / 2, (z0 + z1) / 2),
    size: vec3(t, RAIL, z1 - z0),
  });
  const w = -UPPER_HALF_X + t / 2;
  const e = UPPER_HALF_X - t / 2;
  const stairEdge = STACK_HALF_Z - 1 - STAIR_WIDTH;
  return [rail(w, -STACK_HALF_Z, 1), rail(w, 4, stairEdge), rail(e, -stairEdge, -4), rail(e, -1, STACK_HALF_Z)];
}

function stackPerimeter(): MapBlock[] {
  const h = STACK_WALL_HEIGHT / 2;
  const t = WALL_THICKNESS;
  return [
    { kind: 'wall', center: vec3(0, h, -STACK_HALF_Z - t / 2), size: vec3(STACK_HALF_X * 2 + t * 2, STACK_WALL_HEIGHT, t) },
    { kind: 'wall', center: vec3(0, h, STACK_HALF_Z + t / 2), size: vec3(STACK_HALF_X * 2 + t * 2, STACK_WALL_HEIGHT, t) },
    { kind: 'wall', center: vec3(-STACK_HALF_X - t / 2, h, 0), size: vec3(t, STACK_WALL_HEIGHT, STACK_HALF_Z * 2) },
    { kind: 'wall', center: vec3(STACK_HALF_X + t / 2, h, 0), size: vec3(t, STACK_WALL_HEIGHT, STACK_HALF_Z * 2) },
  ];
}
