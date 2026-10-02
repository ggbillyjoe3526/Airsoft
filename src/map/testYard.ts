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
/** Railings along the platform's edges and the ramps' sides stand this high above the platform. */
const RAIL_HEIGHT = 1;

/**
 * Elevation fixture for headless matches: a walled 40 × 16 m yard whose middle is a 1 m platform wall to
 * wall, reached only by a ramp at each end. A wall in the platform's middle splits it into a north and a
 * south lane and hides the spawns from each other. Teams spawn and wait out on the lower floor, so every
 * fight is on or across the upper level and every walk-off comes back down a ramp. The platform's edges
 * and the ramps' sides are railed: bots sidestep while fighting without looking at the nav grid, and would
 * step off an open edge (KNOWN_ISSUES).
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
    ...rampYardRails(-1),
    ...rampYardRails(1),
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

/** Railings at the west (side -1) or east (side 1) end of the platform: along its edge and both sides of its ramp. */
function rampYardRails(side: number): MapBlock[] {
  const t = WALL_THICKNESS;
  const top = PLATFORM_HEIGHT + RAIL_HEIGHT;
  const edgeLength = RAMP_YARD_HALF_Z - RAMP_HALF_WIDTH - t;
  const edgeZ = RAMP_HALF_WIDTH + t + edgeLength / 2;
  const edgeX = side * (PLATFORM_HALF_X + t / 2);
  const rampX = side * (PLATFORM_HALF_X + RAMP_RUN / 2);
  return [
    { kind: 'wall', center: vec3(edgeX, top / 2, edgeZ), size: vec3(t, top, edgeLength) },
    { kind: 'wall', center: vec3(edgeX, top / 2, -edgeZ), size: vec3(t, top, edgeLength) },
    { kind: 'wall', center: vec3(rampX, top / 2, RAMP_HALF_WIDTH + t / 2), size: vec3(RAMP_RUN, top, t) },
    { kind: 'wall', center: vec3(rampX, top / 2, -RAMP_HALF_WIDTH - t / 2), size: vec3(RAMP_RUN, top, t) },
  ];
}

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
