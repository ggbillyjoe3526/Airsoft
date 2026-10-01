import { type Vec3, vec3 } from '../sim/vec';
import type { BlockKind, MapBlock, MapData, SpawnPoint } from './mapTypes';

/**
 * "Depot": a roofless warehouse yard, 50 × 32 m inside the walls, mirror-symmetric across x = 0.
 * Blue spawns west (x = -22.7), Orange east. Each spawn yard sits behind a full-height spawn wall with
 * exits at both ends. Three lanes run west–east:
 *
 * - North lane (z 9.6..16): an S-bend around two staggered crate stacks per side. It is separated from
 *   mid by a wall of containers with a walk-through gap near each spawn, a crate "window" (shoot over,
 *   can't pass) and a gap at the centre.
 * - Mid (z -7.4..7.2): crate yard. A container lying across the centre shields the spawns; staggered
 *   full-height crate stacks break up the flanks.
 * - South (z -16..-7.4): an office block for close quarters. Doors and windows open onto mid (including
 *   a centre door); a side door leads from each spawn yard into a corridor that dog-legs around wall
 *   stubs. Behind the corridor wall, a room with two doors leads to an alcove and the central hall.
 *
 * Cover heights: full (≥ 2.4 m) or crouch cover (1.2 m: hides a crouched player, a standing one can
 * shoot over). No straight line along a lane is longer than 26 m, and no line of sight between standable
 * points (0.5 m grid) is longer than 34 m.
 * Layout rules are checked in depot.test.ts.
 */

const HALF_X = 25;
const HALF_Z = 16;
const PERIMETER_HEIGHT = 4;
const PERIMETER_THICKNESS = 0.5;
const FLOOR_THICKNESS = 0.5;

const CRATE = 1.2;
const CONTAINER_HEIGHT = 2.6;
/** Crouch cover: 1.2 m, same as a crate, so every piece of low cover behaves the same. */
const CROUCH_COVER_HEIGHT = CRATE;
const SPAWN_WALL_HEIGHT = 2.6;
const OFFICE_WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.4;
/** Window openings in office walls: crouch-cover sill below, lintel above. */
const WINDOW_SILL = CROUCH_COVER_HEIGHT;
const WINDOW_TOP = 2.0;

// Lane boundaries (also used by the layout tests).
const DIVIDER_Z0 = 7.2;
const DIVIDER_Z1 = 9.6;
const OFFICE_N1 = -7.4;
const OFFICE_N0 = OFFICE_N1 - WALL_THICKNESS;
const OFFICE_W1 = -13.6;
const OFFICE_W0 = OFFICE_W1 - WALL_THICKNESS;
const CORRIDOR_WALL_Z1 = -11.4;
const CORRIDOR_WALL_Z0 = CORRIDOR_WALL_Z1 - WALL_THICKNESS;

const SPAWN_X = 22.7;
const SPAWN_ZS = [-2.3, 0, 2.3];
/** Spawn wall in front of each spawn yard; it hides the yard from everything east of it. */
const SPAWN_WALL_X0 = -17.7;
const SPAWN_WALL_Z = 5.5;

/** Block from min/max extents, which is how the layout is drawn. */
function box(kind: BlockKind, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): MapBlock {
  return {
    kind,
    center: vec3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
    size: vec3(x1 - x0, y1 - y0, z1 - z0),
  };
}

/** A 1.2 m crate with its south-west corner at (x, z). */
function crate(x: number, z: number, level = 0): MapBlock {
  return box('crate', x, x + CRATE, level * CRATE, (level + 1) * CRATE, z, z + CRATE);
}

/** Two crates stacked: full-height cover. */
function crateStack(x: number, z: number): MapBlock[] {
  return [crate(x, z, 0), crate(x, z, 1)];
}

function wall(x0: number, x1: number, z0: number, z1: number, y0 = 0, y1 = OFFICE_WALL_HEIGHT): MapBlock {
  return box('wall', x0, x1, y0, y1, z0, z1);
}

/** Wall section with a window: sill below, lintel above. */
function windowWall(x0: number, x1: number, z0: number, z1: number): MapBlock[] {
  return [wall(x0, x1, z0, z1, 0, WINDOW_SILL), wall(x0, x1, z0, z1, WINDOW_TOP, OFFICE_WALL_HEIGHT)];
}

function mirrorX(b: MapBlock): MapBlock {
  return { kind: b.kind, center: vec3(-b.center.x, b.center.y, b.center.z), size: vec3(b.size.x, b.size.y, b.size.z) };
}

/** West half (Blue side). Mirrored to build the east half. */
const WEST_HALF: MapBlock[] = [
  // Spawn wall: cover for leaving spawn, and it keeps mid from looking straight into the spawn yard.
  wall(SPAWN_WALL_X0, SPAWN_WALL_X0 + WALL_THICKNESS, -SPAWN_WALL_Z, SPAWN_WALL_Z, 0, SPAWN_WALL_HEIGHT),

  // North divider: container, connector gap, container, crate window, container, (centre gap).
  box('container', -HALF_X, -19.4, 0, CONTAINER_HEIGHT, DIVIDER_Z0, DIVIDER_Z1),
  box('container', -16, -9.1, 0, CONTAINER_HEIGHT, DIVIDER_Z0, DIVIDER_Z1),
  box('crate', -9.1, -7.7, 0, CRATE, DIVIDER_Z0 + 0.6, DIVIDER_Z1 - 0.6),
  box('crate', -7.7, -6.3, 0, CRATE, DIVIDER_Z0 + 0.6, DIVIDER_Z1 - 0.6),
  box('container', -6.3, -1.7, 0, CONTAINER_HEIGHT, DIVIDER_Z0, DIVIDER_Z1),

  // North lane S-bend: a stack against the divider, then one against the perimeter wall.
  ...crateStack(-14.1, DIVIDER_Z1),
  ...crateStack(-14.1, DIVIDER_Z1 + CRATE),
  ...crateStack(-14.1, DIVIDER_Z1 + 2 * CRATE),
  ...crateStack(-9.3, HALF_Z - 3 * CRATE),
  ...crateStack(-9.3, HALF_Z - 2 * CRATE),
  ...crateStack(-9.3, HALF_Z - CRATE),
  ...crateStack(-5.7, 11.4), // also blocks long diagonals from the far spawn yard through the crate window
  // North-west corner of the north lane: stops corner-to-corner diagonals into the far office hall.
  crate(-11.7, HALF_Z - CRATE),

  // Just outside the spawn yard's north exit: cover for leaving spawn, and it stops the yard seeing
  // down the length of mid.
  ...crateStack(-16.3, 5),

  // Mid, north flank: staggered stacks (each covers a band of the flank) plus crouch cover.
  ...crateStack(-8.2, 2.5),
  ...crateStack(-13, 3.7),
  ...crateStack(-4.8, 4.8),
  ...crateStack(-10.8, DIVIDER_Z0 - CRATE),
  box('barrier', -11.9, -11.3, 0, CROUCH_COVER_HEIGHT, -1.7, 1.7),
  // South of the centre container: breaks diagonals from the south spawn yard across mid.
  ...crateStack(-4.8, -5.85),

  // Mid, south flank.
  ...crateStack(-8.2, -4.8),
  ...crateStack(-11.8, -6.2),
  ...crateStack(-5.7, OFFICE_N1 + 0.1),
  crate(-14.2, OFFICE_N1 + 0.25), // against the office wall (sealed gap behind it)

  // Office north wall: wall, door, wall, window, wall, (centre door shared with the east half).
  wall(OFFICE_W0, -10.3, OFFICE_N0, OFFICE_N1),
  wall(-8.9, -4.5, OFFICE_N0, OFFICE_N1),
  ...windowWall(-4.5, -2.8, OFFICE_N0, OFFICE_N1),
  wall(-2.8, -0.7, OFFICE_N0, OFFICE_N1),

  // Office west wall with a door from the spawn yard into the corridor.
  wall(OFFICE_W0, OFFICE_W1, -HALF_Z, -11),
  wall(OFFICE_W0, OFFICE_W1, -9.6, OFFICE_N0),

  // Corridor dog-leg: a stub off the north wall, then one off the corridor wall (they overlap in z,
  // so there is no straight line down the corridor).
  wall(-7.1, -7.1 + WALL_THICKNESS, -9.9, OFFICE_N0),
  wall(-3.6, -3.6 + WALL_THICKNESS, CORRIDOR_WALL_Z1, -9.6),

  // Corridor wall with a door into the west room (offset from the mid door so they never line up).
  wall(OFFICE_W1, -12.7, CORRIDOR_WALL_Z0, CORRIDOR_WALL_Z1),
  wall(-11.3, -3.4, CORRIDOR_WALL_Z0, CORRIDOR_WALL_Z1),

  // West room divider with a second door into the alcove (so the room is a route, not a dead end).
  wall(-7.3, -6.9, -HALF_Z, -14.4),
  wall(-7.3, -6.9, -13.2, CORRIDOR_WALL_Z0),

  // Office crouch cover: west room.
  crate(-11.4, -14.9),

  // Spawn yard, between the spawn wall and the office door (also stops the north lane seeing into the
  // yard's far corner through the crate window).
  ...crateStack(-19.6, -11.2),
  // Two stacks against the office's north-west corner: block long diagonals from the yard's far corner
  // across mid to the north lane, while leaving the yard exit and the office door open.
  ...crateStack(-16.8, -8.2),
  ...crateStack(-15.4, -8.2),
];

/** Pieces centred on x = 0 (their own mirror image). */
const CENTRE: MapBlock[] = [
  box('barrier', -1.7, 1.7, 0, CROUCH_COVER_HEIGHT, 12.8, 13.5),
  box('container', -1.2, 1.2, 0, CONTAINER_HEIGHT, -3.6, 3.6),
  // Hall: a stack between the two alcoves.
  ...crateStack(-CRATE / 2, -14.4),
];

function perimeter(): MapBlock[] {
  const h = PERIMETER_HEIGHT;
  const t = PERIMETER_THICKNESS;
  return [
    box('floor', -HALF_X - t, HALF_X + t, -FLOOR_THICKNESS, 0, -HALF_Z - t, HALF_Z + t),
    box('wall', -HALF_X - t, HALF_X + t, 0, h, HALF_Z, HALF_Z + t),
    box('wall', -HALF_X - t, HALF_X + t, 0, h, -HALF_Z - t, -HALF_Z),
    box('wall', -HALF_X - t, -HALF_X, 0, h, -HALF_Z, HALF_Z),
    box('wall', HALF_X, HALF_X + t, 0, h, -HALF_Z, HALF_Z),
  ];
}

/** Blue faces +X (yaw -90°), Orange faces -X (yaw +90°). */
const BLUE_SPAWNS: SpawnPoint[] = SPAWN_ZS.map((z) => ({ position: vec3(-SPAWN_X, 0, z), yaw: -Math.PI / 2 }));
const ORANGE_SPAWNS: SpawnPoint[] = SPAWN_ZS.map((z) => ({ position: vec3(SPAWN_X, 0, z), yaw: Math.PI / 2 }));

/** Dead zone: the back corner of each spawn yard, behind the spawn line and out of every lane. */
const DEAD_ZONE_X = 24.1;
const DEAD_ZONE_SPOTS: readonly [number, number][] = [
  [0, -3.9],
  [0, -4.7],
  [0.8, -4.7],
];
const BLUE_DEAD_ZONE: SpawnPoint[] = DEAD_ZONE_SPOTS.map(([dx, z]) => ({ position: vec3(-DEAD_ZONE_X + dx, 0, z), yaw: -Math.PI / 2 }));
const ORANGE_DEAD_ZONE: SpawnPoint[] = DEAD_ZONE_SPOTS.map(([dx, z]) => ({ position: vec3(DEAD_ZONE_X - dx, 0, z), yaw: Math.PI / 2 }));

/** Advance routes, west to east, one per lane, mirror-symmetric (points hand-picked on the walkable grid, checked in tests). */
const LANES: Vec3[][] = [
  // North: around the S-bend stacks.
  [vec3(-10.8, 0, 10.9), vec3(-4, 0, 14.3), vec3(0, 0, 10.9), vec3(4, 0, 14.3), vec3(10.8, 0, 10.9)],
  // Mid: through the crate yard, either side of the centre container.
  [vec3(-11.9, 0, 2.9), vec3(-5.1, 0, -2.9), vec3(0, 0, 4.4), vec3(5.1, 0, -2.9), vec3(11.9, 0, 2.9)],
  // South: through the office corridors.
  [vec3(-11.9, 0, -9.7), vec3(-7.4, 0, -13.9), vec3(-1.7, 0, -9.7), vec3(1.7, 0, -9.7), vec3(7.4, 0, -13.9), vec3(11.9, 0, -9.7)],
];

/**
 * Flag mode: each team defends a pole in mid on its own side, between the crouch barrier (cover for
 * the defenders, and for attackers crouched at the pole) and the crate yard. About 17 m from the
 * defenders' spawn and 35 m from the attackers', reachable through all three lanes (tested).
 */
const FLAG_X = 9.5;

export const DEPOT: MapData = {
  name: 'Depot',
  blocks: [...perimeter(), ...WEST_HALF, ...WEST_HALF.map(mirrorX), ...CENTRE],
  killY: -10,
  spawns: [BLUE_SPAWNS, ORANGE_SPAWNS],
  deadZones: [BLUE_DEAD_ZONE, ORANGE_DEAD_ZONE],
  lanes: LANES,
  flags: [vec3(-FLAG_X, 0, 0), vec3(FLAG_X, 0, 0)],
};

/** Layout facts the tests check against, exported so they can't drift from the geometry. */
export const DEPOT_LAYOUT = {
  halfX: HALF_X,
  halfZ: HALF_Z,
  crouchCoverHeight: CROUCH_COVER_HEIGHT,
  /** Lane bands in z (inside walls). */
  lanes: {
    north: { minZ: DIVIDER_Z1, maxZ: HALF_Z },
    mid: { minZ: OFFICE_N1, maxZ: DIVIDER_Z0 },
    south: { minZ: -HALF_Z, maxZ: OFFICE_N0 },
  },
} as const;
