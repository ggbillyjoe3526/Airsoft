import { type Vec3, vec3 } from '../sim/vec';
import type { BlockKind, MapBlock, MapData, RampRise, SpawnPoint } from './mapTypes';

/**
 * "Depot": a roofless warehouse yard, 50 × 32 m inside the walls, built around three lanes to one flagpole
 * (M11, the owner's approved sketch revision 2, 2026-10-03). The two halves are different on purpose; teams
 * swap ends at half-time in both modes, so the map is fair over a match.
 *
 * - End 0 (the attackers' end in Attack / Defend): the west spawn yard behind a spawn wall, as before.
 * - End 1 (the defenders'): the north-east spawn yard behind its own wall.
 * - The Bay: a walled loading bay on the defenders' side, with the pole. Its west wall of containers has the
 *   Main Gate in it; the North Gate opens from the road, and the office's back door from the south.
 *
 * Three lanes run west to east (coordinates in comments are plan coordinates, z to the north; see toWorld):
 * - 1 Dock Road (north, z 9.6..16): the staging yard's S-bend of pallet racks, then a road along a row of stacked
 *   containers with a loading dock 1.2 m up beside it (a ramp at each end). The containers under the dock are
 *   stacked, so the dock overlooks the road only. The road enters the Bay through the North Gate.
 * - 2 Container Alley (mid): the crate yard, a container across the centre, a ported barricade, then the Main
 *   Gate, watched from inside the Bay by two more barricades.
 * - 3 Office (south, z -16..-7.4): across the car park, in the west door, through three rooms whose doors
 *   never line up, and out of the hall's back door into the Bay about 7.5 m from the pole.
 *
 * Cover heights: full (≥ 2.4 m) or crouch cover (1.2 m: hides a crouched player, a standing one can shoot
 * over). The dock's open edge is a 1.2 m drop (bots use the ramps). No line of sight between standable points
 * is longer than 34 m, and the two spawn yards can't see each other. Layout rules are checked in depot.test.ts.
 *
 * Props (M25b, the owner's approved concept v2, 2026-10-04): most of M11's two-high crate stacks became single
 * full-height site props on the same footprints (portable toilets, pallet racks, HESCO barriers, wrapped pallet
 * loads), six stacks dropped to waist height (two IBC tanks, a generator, three single crates) where that opened
 * the fewest long sightlines, and some single crates became sandbags, IBCs or a generator. Two crate stacks stay: the car park's far corner and the crate yard by the divider.
 */

const HALF_X = 25;
const HALF_Z = 16;
const PERIMETER_HEIGHT = 4;
const PERIMETER_THICKNESS = 0.5;
const FLOOR_THICKNESS = 0.5;

const CRATE = 1.2;
/** Full-height cover: two crates' height, so a site prop replacing a stack hides exactly what the stack hid. */
const FULL_HEIGHT = 2 * CRATE;
const CONTAINER_HEIGHT = 2.6;
/** Two containers stacked: under the dock, so standing on the dock you still can't see over them. */
const STACKED_HEIGHT = 2 * CONTAINER_HEIGHT;
/** Crouch cover: 1.2 m, same as a crate, so every piece of low cover behaves the same. */
const CROUCH_COVER_HEIGHT = CRATE;
/** Plywood barricades with shooting ports: full cover you can see and shoot through at the ports. */
const BARRICADE_HEIGHT = 2.4;
const SPAWN_WALL_HEIGHT = 2.6;
const OFFICE_WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.4;
/** Window openings in office walls: crouch-cover sill below, lintel above. */
const WINDOW_SILL = CROUCH_COVER_HEIGHT;
const WINDOW_TOP = 2.0;

// Lane boundaries (also used by the layout tests).
const DIVIDER_Z0 = 7.2;
const DIVIDER_Z1 = 9.6;
const OFFICE_N0 = -7.4;
const OFFICE_N1 = OFFICE_N0 + WALL_THICKNESS;
const OFFICE_W0 = -8.4;
const OFFICE_E1 = 17.4;

/** The loading dock: a raised floor along the north wall, a ramp at each end. */
const DOCK_HEIGHT = 1.2;
const DOCK_Z0 = 13.2;
const DOCK_X0 = -2;
const DOCK_X1 = 11;
/** 1.2 m over 2.4 m: a 1:2 slope, inside PHYSICS.maxRampSlope. */
const DOCK_RAMP_RUN = 2.4;
const KERB_THICKNESS = 0.2;

/** Block from min/max extents, which is how the layout is drawn. */
function box(kind: BlockKind, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): MapBlock {
  return {
    kind,
    center: vec3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
    size: vec3(x1 - x0, y1 - y0, z1 - z0),
  };
}

/** A 1.2 m crate with its south-west corner at (x, z), standing on a floor at `base`. */
function crate(x: number, z: number, level = 0, base = 0): MapBlock {
  return box('crate', x, x + CRATE, base + level * CRATE, base + (level + 1) * CRATE, z, z + CRATE);
}

/** Two crates stacked: full-height cover. */
function crateStack(x: number, z: number, base = 0): MapBlock[] {
  return [crate(x, z, 0, base), crate(x, z, 1, base)];
}

/**
 * A site prop (M25b, see BlockKind) with its south-west corner at (x, z), `w` east-west by `d` north-south and `h`
 * tall, standing on a floor at `base`.
 */
function prop(kind: BlockKind, x: number, z: number, w: number, d: number, h: number, base = 0): MapBlock {
  return box(kind, x, x + w, base, base + h, z, z + d);
}

function wall(x0: number, x1: number, z0: number, z1: number, y0 = 0, y1 = OFFICE_WALL_HEIGHT): MapBlock {
  return box('wall', x0, x1, y0, y1, z0, z1);
}

/** Wall section with a window: sill below, lintel above. */
function windowWall(x0: number, x1: number, z0: number, z1: number): MapBlock[] {
  return [wall(x0, x1, z0, z1, 0, WINDOW_SILL), wall(x0, x1, z0, z1, WINDOW_TOP, OFFICE_WALL_HEIGHT)];
}

function container(x0: number, x1: number, z0: number, z1: number, height = CONTAINER_HEIGHT): MapBlock {
  return box('container', x0, x1, 0, height, z0, z1);
}

/** A dock ramp: a ribbed steel plate, so footsteps on it clank (M13) and give away someone coming up. */
function ramp(x0: number, x1: number, z0: number, z1: number, height: number, rise: RampRise): MapBlock {
  return { ...box('ramp', x0, x1, 0, height, z0, z1), rise, surface: 'metal' };
}

/**
 * A kerb along the open side of a dock ramp (x0..x1, rising towards `rise`), so you walk on and off a ramp at
 * its foot and never off its side: near the foot that side is a small drop the nav grid allows, and it lifts
 * you off the ground for a moment. Two steps, crouch cover beside the low half and full cover beside the high
 * half, so each stands well above the ramp (more than the physics autostep) even at its high end: nobody on the
 * ramp is stepped up onto it. Both are the map's two cover heights, so from the road they read as cover.
 */
function rampKerb(x0: number, x1: number, rise: '+x' | '-x'): MapBlock[] {
  const mid = (x0 + x1) / 2;
  const [low, high] = rise === '+x' ? [[x0, mid], [mid, x1]] : [[mid, x1], [x0, mid]];
  const z0 = DOCK_Z0 - KERB_THICKNESS;
  return [
    box('barrier', low[0]!, low[1]!, 0, CROUCH_COVER_HEIGHT, z0, DOCK_Z0),
    box('barrier', high[0]!, high[1]!, 0, BARRICADE_HEIGHT, z0, DOCK_Z0),
  ];
}

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

/** The west spawn yard (end 0) and the car park south of it. */
const WEST_YARD: MapBlock[] = [
  // Spawn wall: cover for leaving spawn, and it keeps mid from looking straight into the spawn yard.
  wall(-17.7, -17.7 + WALL_THICKNESS, -5.5, 5.5, 0, SPAWN_WALL_HEIGHT),
  // Just outside the yard's north exit: cover for leaving spawn, and it stops the yard seeing down mid.
  prop('portaloo', -16.3, 5, CRATE, CRATE, FULL_HEIGHT),
  // Car park: two portaloos and a stack by the yard's south exit, a rack, a container and a generator between the
  // yard and the office's west door, and a skip against the south wall.
  prop('portaloo', -19.6, -11.2, CRATE, CRATE, FULL_HEIGHT),
  prop('portaloo', -20.2, -9.0, CRATE, CRATE, FULL_HEIGHT),
  ...crateStack(-22.0, -12.4), // the car park's far corner can't see up to the dock's west ramp
  prop('rack', -16.8, -8.2, 2.6, CRATE, FULL_HEIGHT),
  container(-14.2, -11.8, -14.6, -10.6),
  prop('generator', -10.6, -9.2, CRATE, CRATE, CRATE),
  prop('skip', -19.0, -HALF_Z, 3.0, 1.8, CRATE),
];

/** Lane 1, Dock Road: the divider from mid, the staging yard's S-bend, the road and the loading dock. */
const DOCK_ROAD: MapBlock[] = [
  // Divider from mid: container, connector gap, container, crate window (shoot over, can't pass), a gap from
  // mid to the dock's west ramp, the stacked row under the dock, the North Gate gap, container.
  container(-HALF_X, -19.4, DIVIDER_Z0, DIVIDER_Z1),
  container(-16, -10, DIVIDER_Z0, DIVIDER_Z1),
  prop('sandbags', -10, DIVIDER_Z0 + 0.6, 2.4, CRATE, CRATE),
  container(-5.8, 11.4, DIVIDER_Z0, DIVIDER_Z1, STACKED_HEIGHT),
  container(13.8, 18.2, DIVIDER_Z0, DIVIDER_Z1),

  // Staging yard S-bend: a rack against the divider, then one against the perimeter wall.
  prop('rack', -14.1, DIVIDER_Z1, CRATE, 3 * CRATE, FULL_HEIGHT),
  prop('rack', -9.3, HALF_Z - 3 * CRATE, CRATE, 3 * CRATE, FULL_HEIGHT),
  prop('ibc', -11.7, HALF_Z - CRATE, CRATE, CRATE, CRATE),
  prop('ibc', -6.6, 11.6, CRATE, CRATE, CRATE),

  // The dock and its ramps (the west one from the staging yard, the east one down to the North Gate).
  box('floor', DOCK_X0, DOCK_X1, 0, DOCK_HEIGHT, DOCK_Z0, HALF_Z),
  ramp(DOCK_X0 - DOCK_RAMP_RUN, DOCK_X0, DOCK_Z0, HALF_Z, DOCK_HEIGHT, '+x'),
  ramp(DOCK_X1, DOCK_X1 + DOCK_RAMP_RUN, DOCK_Z0, HALF_Z, DOCK_HEIGHT, '-x'),
  ...rampKerb(DOCK_X0 - DOCK_RAMP_RUN, DOCK_X0, '+x'),
  ...rampKerb(DOCK_X1, DOCK_X1 + DOCK_RAMP_RUN, '-x'),
  // Cover on the dock. Between them they span its width, so nobody on the ground sees along it.
  prop('sandbags', DOCK_X0 + 0.4, HALF_Z - CRATE, CRATE, CRATE, CRATE, DOCK_HEIGHT), // cover at the top of the west ramp
  prop('ibc', 1.2, 13.6, CRATE, CRATE, CRATE, DOCK_HEIGHT),
  crate(5.0, HALF_Z - CRATE, 0, DOCK_HEIGHT),
  crate(7.6, DOCK_Z0, 0, DOCK_HEIGHT),
  // Cover on the road below.
  prop('hesco', 2.4, DIVIDER_Z1, CRATE, 2 * CRATE, FULL_HEIGHT),
  prop('hesco', 7.2, 12.0, CRATE, CRATE, FULL_HEIGHT),
];

/** Lane 2, Container Alley: the crate yard between the divider and the office. */
const CONTAINER_ALLEY: MapBlock[] = [
  prop('hesco', -13, 3.7, CRATE, CRATE, FULL_HEIGHT),
  ...crateStack(-11.4, DIVIDER_Z0 - CRATE),
  prop('hesco', -8.2, 2.3, CRATE, CRATE, FULL_HEIGHT),
  prop('wrapped', -8.4, 5.4, CRATE, CRATE, FULL_HEIGHT),
  box('barrier', -11.9, -11.3, 0, CROUCH_COVER_HEIGHT, -1.7, 1.7),
  prop('hesco', -8.2, -4.6, CRATE, CRATE, FULL_HEIGHT),
  prop('wrapped', -12.0, -5.8, CRATE, CRATE, FULL_HEIGHT), // with the load against the office wall, nothing sees along the wall
  // Across the line into the Main Gate: no straight look from the yard into the Bay.
  container(-1.4, 1.0, -2.6, 4.2),
  box('barrier', -4.6, -4.0, 0, CROUCH_COVER_HEIGHT, 2.6, 5.6),
  box('barrier', -6.0, -5.7, 0, BARRICADE_HEIGHT, 2.8, 5.2),
  prop('hesco', -4.4, -5.4, CRATE, CRATE, FULL_HEIGHT),
  prop('wrapped', -6.6, OFFICE_N1, CRATE, CRATE, FULL_HEIGHT),
];

/** The Bay (the pole) and the defenders' spawn yard (end 1) north-east of it, and the back lot. */
const THE_BAY: MapBlock[] = [
  // West wall of containers, with the Main Gate between them.
  container(3.6, 6.0, 2.2, DIVIDER_Z0),
  container(3.6, 6.0, OFFICE_N1, -2.4),
  // Inside: crouch cover east of the pole, two ported barricades watching the Main Gate, a rack.
  box('barrier', 13.6, 14.2, 0, CROUCH_COVER_HEIGHT, -2.6, 0.6),
  box('barrier', 8.0, 8.3, 0, BARRICADE_HEIGHT, 2.6, 5.0),
  box('barrier', 9.0, 9.3, 0, BARRICADE_HEIGHT, -5.8, -3.6),
  prop('rack', 12.4, 4.6, CRATE, CRATE, FULL_HEIGHT),
  // East side: shields the defenders' way out of their yard from the Main Gate's line, and the back lot from
  // the office's back door.
  container(15.8, 17.2, -5.0, 2.0),

  // Defenders' spawn wall, and a container along the south edge of their yard.
  wall(18.2, 18.2 + WALL_THICKNESS, 3.0, 12.6, 0, SPAWN_WALL_HEIGHT),
  container(21.0, HALF_X, 0.4, 2.8),

  // Back lot, east of the office.
  container(20.6, 23.0, -10.0, -3.6),
  prop('generator', 18.6, -14.2, CRATE, CRATE, CRATE),
  prop('ibc', 23.6, -1.8, CRATE, CRATE, CRATE),
];

/** Lane 3, Office: x -8.4..17.4, z -16..-7.4. West room, the hall, and the stores. */
const OFFICE: MapBlock[] = [
  // North wall: the mid door, a window, the back door into the Bay, a window onto the Bay.
  wall(OFFICE_W0, -4.4, OFFICE_N0, OFFICE_N1),
  wall(-3.0, 0.4, OFFICE_N0, OFFICE_N1),
  ...windowWall(0.4, 2.0, OFFICE_N0, OFFICE_N1),
  wall(2.0, 6.4, OFFICE_N0, OFFICE_N1),
  wall(7.8, 12.4, OFFICE_N0, OFFICE_N1),
  ...windowWall(12.4, 14.0, OFFICE_N0, OFFICE_N1),
  wall(14.0, OFFICE_E1, OFFICE_N0, OFFICE_N1),
  // West wall with the door from the car park, east wall with the door from the back lot.
  wall(OFFICE_W0, OFFICE_W0 + WALL_THICKNESS, -HALF_Z, -12.6),
  wall(OFFICE_W0, OFFICE_W0 + WALL_THICKNESS, -11.2, OFFICE_N0),
  wall(OFFICE_E1 - WALL_THICKNESS, OFFICE_E1, -HALF_Z, -12.6),
  wall(OFFICE_E1 - WALL_THICKNESS, OFFICE_E1, -11.2, OFFICE_N0),
  // Partition between the west room and the hall (door at its north end), and between the hall and the
  // stores (door at its south end).
  wall(-1.2, -0.8, -HALF_Z, -10.0),
  wall(-1.2, -0.8, -8.6, OFFICE_N0),
  wall(8.6, 9.0, -HALF_Z, -15.4),
  wall(8.6, 9.0, -14.0, OFFICE_N0),
  // West room: a stub wall and crouch cover.
  wall(-5.0, -4.6, -HALF_Z, -13.0),
  crate(-6.6, -9.6),
  // The hall.
  crate(2.0, -11.0),
  crate(5.0, -13.6),
  // The stores.
  crate(12.0, -11.0),
  crate(14.8, -9.6),
];

/** Spawns: west yard facing east (yaw -90°), north-east yard facing west (yaw +90°). */
const WEST_SPAWNS: SpawnPoint[] = [-2.3, 0, 2.3].map((z) => ({ position: vec3(-22.7, 0, z), yaw: -Math.PI / 2 }));
const EAST_SPAWNS: SpawnPoint[] = [6.6, 8.9, 11.2].map((z) => ({ position: vec3(22.7, 0, z), yaw: Math.PI / 2 }));

/** Dead zones: a back corner of each spawn yard, behind the spawn line and out of every lane. */
const WEST_DEAD_ZONE: SpawnPoint[] = [
  [-24.1, -3.9],
  [-24.1, -4.7],
  [-23.3, -4.7],
].map(([x, z]) => ({ position: vec3(x!, 0, z!), yaw: -Math.PI / 2 }));
const EAST_DEAD_ZONE: SpawnPoint[] = [
  [24.1, 3.6],
  [24.1, 4.4],
  [23.3, 3.6],
].map(([x, z]) => ({ position: vec3(x!, 0, z!), yaw: Math.PI / 2 }));

/**
 * Advance routes from the west end to the east end, one per lane (points hand-picked on the walkable grid,
 * checked in tests). Defending bots hold the last or the second-last point of their lane.
 */
const LANES: Vec3[][] = [
  // Dock Road: staging yard, up the west ramp, along the dock, down to the North Gate.
  [vec3(-17.7, 0, 8.4), vec3(-11.8, 0, 11.4), vec3(-6.0, 0, 14.4), vec3(0.4, DOCK_HEIGHT, 14.6), vec3(9.9, DOCK_HEIGHT, 14.4), vec3(16.0, 0, 11.0)],
  // Container Alley: through the crate yard and the Main Gate.
  [vec3(-14.6, 0, 0.0), vec3(-7.0, 0, -2.4), vec3(-3.0, 0, -1.2), vec3(2.6, 0, 0.0), vec3(8.0, 0, -0.6), vec3(15.0, 0, 2.6)],
  // Office: car park, the west door, the west room, the hall, the stores.
  [vec3(-15.0, 0, -6.6), vec3(-11.0, 0, -11.9), vec3(-6.6, 0, -11.9), vec3(-1.0, 0, -9.3), vec3(4.0, 0, -10.0), vec3(7.2, 0, -9.0), vec3(12.8, 0, -13.2)],
];

/** The pole: in the Bay, about 16 m from the east spawns and 38 m from the west ones (tested). */
const POLE = vec3(11.5, 0, -1.0);

/**
 * Everything above is written in plan coordinates, as drawn on the approved sketch: x to the east, z to the
 * north. In the game's world north is -z (seen from above with east to the right, three.js has -z at the top),
 * so the map is built with z negated. In play the layout then matches the sketch, not its mirror image: from
 * the west spawn, facing east, the dock is on your left and the office on your right.
 */
const toWorld = (p: Vec3): Vec3 => vec3(p.x, p.y, -p.z);
const FLIP_RISE: Record<RampRise, RampRise> = { '+x': '+x', '-x': '-x', '+z': '-z', '-z': '+z' };
function blockToWorld(b: MapBlock): MapBlock {
  const w: MapBlock = { kind: b.kind, center: toWorld(b.center), size: vec3(b.size.x, b.size.y, b.size.z) };
  if (b.rise) w.rise = FLIP_RISE[b.rise];
  if (b.surface) w.surface = b.surface;
  return w;
}
/** Mirroring z turns a facing `yaw` (forward = (-sin yaw, -cos yaw)) into π - yaw. */
const spawnToWorld = (s: SpawnPoint): SpawnPoint => ({ position: toWorld(s.position), yaw: Math.atan2(Math.sin(Math.PI - s.yaw), Math.cos(Math.PI - s.yaw)) });

export const DEPOT: MapData = {
  name: 'Depot',
  blocks: [...perimeter(), ...WEST_YARD, ...DOCK_ROAD, ...CONTAINER_ALLEY, ...THE_BAY, ...OFFICE].map(blockToWorld),
  killY: -10,
  spawns: [WEST_SPAWNS.map(spawnToWorld), EAST_SPAWNS.map(spawnToWorld)],
  deadZones: [WEST_DEAD_ZONE.map(spawnToWorld), EAST_DEAD_ZONE.map(spawnToWorld)],
  lanes: LANES.map((lane) => lane.map(toWorld)),
  flag: toWorld(POLE),
};

/** Layout facts the tests check against (in world coordinates), exported so they can't drift from the geometry. */
export const DEPOT_LAYOUT = {
  halfX: HALF_X,
  halfZ: HALF_Z,
  crouchCoverHeight: CROUCH_COVER_HEIGHT,
  dockHeight: DOCK_HEIGHT,
  /** The dock's edge over the road, and its ramps' x ranges (the dock runs from the edge to the north wall). */
  dock: { edgeZ: -DOCK_Z0, ramps: [[DOCK_X0 - DOCK_RAMP_RUN, DOCK_X0], [DOCK_X1, DOCK_X1 + DOCK_RAMP_RUN]] },
  /** Lane bands in z (inside walls): Dock Road to the north (-z), the Office to the south (+z). */
  lanes: {
    north: { minZ: -HALF_Z, maxZ: -DIVIDER_Z1 },
    mid: { minZ: -DIVIDER_Z0, maxZ: -OFFICE_N1 },
    south: { minZ: -OFFICE_N0, maxZ: HALF_Z },
  },
} as const;
