import { type Vec3, vec3 } from '../sim/vec';
import type { BlockKind, MapBlock, MapData, Overlook, RampRise, SpawnPoint } from './mapTypes';

/**
 * "Neon Heights" (M34, the owner's approved concept v1, 2026-10-04): a closed-down neon market block turned airsoft
 * site, 46 × 30 m, three playable storeys (street ±0, Level 1 +3 m, Level 2 +6 m) linked by stairs only. Greybox by
 * day (M34c); night, art and sound follow (M34d-f). Tagged dev until the owner calls it done (map/maps.ts).
 *
 * Neon Avenue runs north–south down the middle. The west half (end 0, the attackers' in Attack / Defend): the West
 * Yard with the spawns, the Arcade with the Capsules hotel over it and a balcony over the avenue, and the Repair Shop
 * block (Repair Shop, Clinic, Studio). The east half (end 1): the Tower, three storeys round an open atrium with the
 * flag on its floor and galleries above, and the East Yard. A Sky Bridge at +6 m crosses the avenue from the Studio to
 * the Tower's Level 2; a footbridge at +3 m crosses Lantern Lane from the Capsules to the Clinic.
 *
 * Four lanes run west to east: North (Noodle Alley, the Back Alley door), Mid (the Arcade, past the van, the bar
 * door), High (the plaza stair, the Studio, the Sky Bridge, the Tower's Level 2 gallery), South (Lantern Lane, the
 * Repair Shop, the Drone Dock, the dock shutter into the lobby).
 *
 * Rules the layout keeps (the Pro difficulty plan's map rules, checked in neonHeights.test.ts): every raised floor has
 * two ways up; every stair top and Sky Bridge end turns a corner; no spot holds two stairs in one angle; the two spawn
 * yards can't see each other; staggered full cover breaks every street line within 22 m. Stairs are 1:2
 * ramps (the physics limit), 1.4 m wide, in switchback stairwells where they climb two storeys. Windows are open
 * frames with a 1.2 m sill; balcony and gallery edges have 1 m rails, except the Capsules balcony's south end, a 3 m
 * drop to the street (bots take the stairs). Roofs are not playable: they are drawn as wall, never as floor.
 *
 * Written in plan coordinates (x to the east, z to the north, as on the concept sketch) and turned into world
 * coordinates (north = -z) at the end, as Depot is.
 */

const HALF_X = 23;
const HALF_Z = 15;
const PERIMETER_HEIGHT = 10;
const PERIMETER_THICKNESS = 0.5;
const GROUND_THICKNESS = 0.5;

/** Storey height: Level 1's floor is at +3 m, Level 2's at +6 m. */
const STOREY = 3;
const SLAB = 0.3;
const WALL = 0.3;
const RAIL = 1;
/** Solid sides (the Sky Bridge, the plaza stair): crouch cover. */
const SIDE = 1.2;
const RAIL_THICKNESS = 0.15;
const DOOR_HEIGHT = 2.2;
const WINDOW_SILL = 1.2;
const WINDOW_TOP = 2.3;
/** A stair climbs one storey over twice its height: 1:2, the steepest ramp the physics walks up. */
const STAIR_RUN = 2 * STOREY;
const CRATE = 1.2;
const FULL_COVER = 2.4;
const SPAWN_WALL_HEIGHT = 2.6;
const ROOF = 0.3;

/** Block from min/max extents, which is how the layout is drawn. */
function box(kind: BlockKind, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): MapBlock {
  return { kind, center: vec3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), size: vec3(x1 - x0, y1 - y0, z1 - z0) };
}

/** A stair flight: a ribbed metal ramp from floor `y0` up one storey, so footsteps on it clank and give you away. */
function stair(x0: number, x1: number, z0: number, z1: number, y0: number, rise: RampRise): MapBlock {
  return { ...box('ramp', x0, x1, y0, y0 + STOREY, z0, z1), rise, surface: 'metal' };
}

/** Crouch cover (1.2 m) with its south-west corner at (x, z) on the floor at `base`. */
const crate = (x: number, z: number, base = 0, w = CRATE, d = CRATE): MapBlock => box('crate', x, x + w, base, base + CRATE, z, z + d);
/** Full cover (2.4 m), `w` east-west by `d` north-south, on the floor at `base`. */
const tall = (kind: BlockKind, x: number, z: number, w: number, d: number, base = 0): MapBlock => box(kind, x, x + w, base, base + FULL_COVER, z, z + d);

/** An opening in a wall: from `a` to `b` along it, open from `lo` to `hi` (heights above the storey's floor). */
interface Opening {
  a: number;
  b: number;
  lo: number;
  hi: number;
}
const door = (a: number, b: number): Opening => ({ a, b, lo: 0, hi: DOOR_HEIGHT });
const window = (a: number, b: number): Opening => ({ a, b, lo: WINDOW_SILL, hi: WINDOW_TOP });

/**
 * One storey of wall (floor `y0` up to the next floor, 3 m), running along `axis` from `from` to `to`, `t0..t1` across,
 * with `openings` (sorted, apart) cut out of it: below each one a sill, above it a lintel.
 */
function storeyWall(axis: 'x' | 'z', t0: number, t1: number, from: number, to: number, y0: number, openings: Opening[] = [], height = STOREY): MapBlock[] {
  const piece = (a: number, b: number, lo: number, hi: number): MapBlock =>
    axis === 'x' ? box('wall', a, b, lo, hi, t0, t1) : box('wall', t0, t1, lo, hi, a, b);
  const out: MapBlock[] = [];
  let at = from;
  for (const o of openings) {
    if (o.a > at) out.push(piece(at, o.a, y0, y0 + height));
    if (o.lo > 0) out.push(piece(o.a, o.b, y0, y0 + o.lo));
    // A door above the street needs a floor across the wall's thickness, between the slabs either side.
    else if (y0 > 0) out.push(axis === 'x' ? box('floor', o.a, o.b, y0 - SLAB, y0, t0, t1) : box('floor', t0, t1, y0 - SLAB, y0, o.a, o.b));
    if (o.hi < height) out.push(piece(o.a, o.b, y0 + o.hi, y0 + height));
    at = o.b;
  }
  if (to > at) out.push(piece(at, to, y0, y0 + height));
  return out;
}

/** A wall along x (constant z band `z0..z1`), storey by storey: `perStorey[s]` holds storey s's openings. */
const wallAlongX = (z0: number, z1: number, x0: number, x1: number, perStorey: Opening[][]): MapBlock[] =>
  perStorey.flatMap((openings, s) => storeyWall('x', z0, z1, x0, x1, s * STOREY, openings));
/** A wall along z (constant x band `x0..x1`), storey by storey. */
const wallAlongZ = (x0: number, x1: number, z0: number, z1: number, perStorey: Opening[][]): MapBlock[] =>
  perStorey.flatMap((openings, s) => storeyWall('z', x0, x1, z0, z1, s * STOREY, openings));

/** Rectangle `x0..x1` × `z0..z1`. */
type Rect = readonly [x0: number, x1: number, z0: number, z1: number];

/**
 * A floor slab with its top at `top` over `area`, with `holes` (stairwells, the atrium) left open: the area is cut
 * along every hole edge and the cells outside the holes are merged into strips running north–south.
 */
function slab(area: Rect, top: number, holes: Rect[] = []): MapBlock[] {
  const xs = [...new Set([area[0], area[1], ...holes.flatMap((h) => [h[0], h[1]])])].filter((x) => x >= area[0] && x <= area[1]).sort((a, b) => a - b);
  const zs = [...new Set([area[2], area[3], ...holes.flatMap((h) => [h[2], h[3]])])].filter((z) => z >= area[2] && z <= area[3]).sort((a, b) => a - b);
  const inHole = (x: number, z: number): boolean => holes.some((h) => x > h[0] && x < h[1] && z > h[2] && z < h[3]);
  const out: MapBlock[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const cx = (xs[i]! + xs[i + 1]!) / 2;
    let start: number | undefined;
    for (let j = 0; j + 1 < zs.length; j++) {
      const solid = !inHole(cx, (zs[j]! + zs[j + 1]!) / 2);
      if (solid && start === undefined) start = zs[j]!;
      if (!solid && start !== undefined) {
        out.push(box('floor', xs[i]!, xs[i + 1]!, top - SLAB, top, start, zs[j]!));
        start = undefined;
      }
    }
    if (start !== undefined) out.push(box('floor', xs[i]!, xs[i + 1]!, top - SLAB, top, start, zs[zs.length - 1]!));
  }
  return out;
}

/** A 1.2 m rail along x (`z0..z1` thick) or along z, standing on the floor at `base`. */
const railX = (z0: number, x0: number, x1: number, base: number): MapBlock => box('barrier', x0, x1, base, base + RAIL, z0, z0 + RAIL_THICKNESS);
const railZ = (x0: number, z0: number, z1: number, base: number): MapBlock => box('barrier', x0, x0 + RAIL_THICKNESS, base, base + RAIL, z0, z1);

/** The level: ground and perimeter. */
function ground(): MapBlock[] {
  const t = PERIMETER_THICKNESS;
  const x = HALF_X + t;
  const z = HALF_Z + t;
  return [
    box('floor', -x, x, -GROUND_THICKNESS, 0, -z, z),
    box('wall', -x, x, 0, PERIMETER_HEIGHT, HALF_Z, z),
    box('wall', -x, x, 0, PERIMETER_HEIGHT, -z, -HALF_Z),
    box('wall', -x, -HALF_X, 0, PERIMETER_HEIGHT, -HALF_Z, HALF_Z),
    box('wall', HALF_X, x, 0, PERIMETER_HEIGHT, -HALF_Z, HALF_Z),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// West: the West Yard, the Arcade with the Capsules over it, Noodle Alley, Lantern Lane, the plaza.

const ARCADE: Rect = [-15, -3.5, -2, 10];
/** The Arcade's stair, street to the Capsules, along its west wall; its top lands against the north wall. */
const ARCADE_STAIR: Rect = [-14.7, -13.3, 2.6, 2.6 + STAIR_RUN];
const BALCONY: Rect = [-3.5, -2, -2, 10];
const FOOTBRIDGE: Rect = [-7.7, -5.5, -5, -2];

function westYard(): MapBlock[] {
  return [
    // The spawn wall, open at both ends.
    box('wall', -18.2, -17.9, 0, SPAWN_WALL_HEIGHT, -5, 6),
    // Cover in front of the buildings, staggered so the yard's edge is no straight line.
    tall('rack', -17.9, -9.5, 1.3, 2.4),
    tall('rack', -17.9, 8.4, 2.1, 1),
    tall('wrapped', -16.6, -1.2, 1.6, 1.2),
  ];
}

function arcade(): MapBlock[] {
  const [x0, x1, z0, z1] = ARCADE;
  const s = ARCADE_STAIR;
  return [
    // Walls, two storeys: street (the arcade) and Level 1 (the Capsules).
    ...wallAlongZ(x0, x0 + WALL, z0, z1, [[door(0.4, 2)], []]),
    ...wallAlongZ(x1 - WALL, x1, z0, z1, [[door(5.2, 6.6)], [window(0, 2), window(3, 5), door(7, 8.4)]]),
    ...wallAlongX(z1 - WALL, z1, x0 + WALL, x1 - WALL, [[door(-9, -7.6)], [window(-12, -10.4), window(-7, -5.4)]]),
    ...wallAlongX(z0, z0 + WALL, x0 + WALL, x1 - WALL, [[door(-12, -10.6)], [door(FOOTBRIDGE[0] + 0.2, FOOTBRIDGE[1] - 0.2)]]),
    // The stair: a corridor along the west wall, entered from the south by the street door; at the top the Capsules'
    // north wall turns you east.
    stair(s[0], s[1], s[2], s[3], 0, '+z'),
    box('wall', s[1], s[1] + WALL, 0, STOREY, s[2], s[3]),
    railZ(s[1], s[2], s[3], STOREY),
    railX(s[2] - RAIL_THICKNESS, s[0], s[1] + WALL, STOREY),
    // Level 1 and the roof (not playable: wall, not floor).
    ...slab([x0 + WALL, x1 - WALL, z0 + WALL, z1 - WALL], STOREY, [[s[0], s[1], s[2], s[3]]]),
    box('wall', x0, x1, 2 * STOREY, 2 * STOREY + ROOF, z0, z1),
    // Arcade cabinets (full cover) and a prize counter (crouch).
    tall('rack', -11.2, 1, 0.6, 3.4),
    tall('rack', -8.2, 4.6, 0.6, 3.4),
    tall('rack', -11.2, 6.8, 2.4, 0.6),
    crate(-6.4, 0.2, 0, 1.6),
    crate(-6, 7.4),
    // Capsules: rows of sleeping pods, crouch cover.
    crate(-11.6, 2.8, STOREY),
    crate(-8.6, 2.8, STOREY),
    crate(-11.6, 6.2, STOREY, 1.6),
    crate(-8.2, 6.6, STOREY),
    crate(-5.6, 0.2, STOREY),
    tall('wrapped', -6.2, 4.2, 1.2, 1.2, STOREY),
  ];
}

/** The Capsules balcony over the avenue: railed, except its south end, a 3 m drop to the street. */
function balcony(): MapBlock[] {
  const [x0, x1, z0, z1] = BALCONY;
  return [...slab([x0, x1, z0, z1], STOREY), railZ(x1 - RAIL_THICKNESS, 0.4, z1, STOREY), railX(z1 - RAIL_THICKNESS, x0, x1 - RAIL_THICKNESS, STOREY)];
}

/** The footbridge from the Capsules to the Clinic over Lantern Lane, railed both sides (the walkway joins it from the west). */
function footbridge(): MapBlock[] {
  const [x0, x1, z0, z1] = FOOTBRIDGE;
  return [...slab([x0, x1, z0, z1], STOREY), railZ(x0, WALKWAY[3], z1, STOREY), railZ(x1 - RAIL_THICKNESS, z0, z1, STOREY)];
}

function noodleAlleyAndLanternLane(): MapBlock[] {
  return [
    // Noodle Alley: a noodle stall against the Arcade and a drinks stand against the perimeter, staggered so the
    // alley is never one straight line; bins and a booth.
    crate(-13.4, 12.6),
    tall('rack', -10.2, 10, 1.4, 2.8),
    tall('rack', -6.6, 12.6, 1.4, 2.4),
    tall('toilet', -4.6, 10.6, 1.0, 1.0),
    // Lantern Lane: a shrine and a cart, full cover, staggered across the lane; crates.
    tall('rack', -13, -5, 1, 1.6),
    tall('rack', -8.6, -3.6, 1, 1.6),
    crate(-10.6, -3.2),
  ];
}

// The Repair Shop block: Repair Shop (street), Clinic (Level 1), Studio (Level 2), a switchback stairwell on its west
// side, an outdoor stair up from the plaza to the Clinic.

const BLOCK: Rect = [-12, -3.5, -15, -5];
/** Stairwell lanes: A climbs street → Level 1 going north, B climbs Level 1 → Level 2 going south. */
const BLOCK_LANE_A: Rect = [-11.7, -10.3, -12.6, -12.6 + STAIR_RUN];
const BLOCK_LANE_B: Rect = [-10.15, -8.75, -12.6, -12.6 + STAIR_RUN];
const BLOCK_STAIRWELL_EAST = -8.75;
const PLAZA_STAIR: Rect = [-14.6, -13.2, -12, -12 + STAIR_RUN];
const PLAZA_LANDING: Rect = [-14.6, -12, -6.6, -3.6];
/** The walkway along the Repair Shop block's north face, over Lantern Lane, from the plaza landing to the footbridge. */
const WALKWAY: Rect = [-12, FOOTBRIDGE[0], -5, -3.6];
const SKY_BRIDGE: Rect = [-3.5, 4.3, -8.2, -6.4];

function repairBlock(): MapBlock[] {
  const [x0, x1, z0, z1] = BLOCK;
  const a = BLOCK_LANE_A;
  const b = BLOCK_LANE_B;
  const e = BLOCK_STAIRWELL_EAST;
  const landingZ = a[3];
  return [
    // Outer walls, three storeys (the south side is the perimeter).
    ...wallAlongZ(x0, x0 + WALL, z0, z1, [[], [], []]),
    ...wallAlongZ(x1 - WALL, x1, z0, z1, [[door(-9, -7.5)], [window(-12, -10)], [window(-12.5, -10.5), door(SKY_BRIDGE[2], SKY_BRIDGE[3])]]),
    ...wallAlongX(z1 - WALL, z1, x0 + WALL, x1 - WALL, [[door(-7.5, -6)], [door(FOOTBRIDGE[0] + 0.2, FOOTBRIDGE[1] - 0.2)], [window(-7, -5)]]),
    // The stairwell: lane A up from the street, a landing, lane B up to Level 2, a divider between them.
    stair(a[0], a[1], a[2], a[3], 0, '+z'),
    stair(b[0], b[1], b[2], b[3], STOREY, '-z'),
    box('wall', b[0], b[1], 0, STOREY, b[2], b[3]),
    // The divider stands a rail's height over Level 2, and a rail closes the well over lane A there: nobody steps off
    // the landing or lane B's top into the shaft.
    box('wall', a[1], b[0], 0, 2 * STOREY + RAIL, a[2], a[3]),
    railX(a[2] - RAIL_THICKNESS, a[0], b[0], 2 * STOREY),
    box('wall', a[0], b[1], 0, STOREY - SLAB, landingZ, z1 - WALL),
    ...slab([a[0], b[1], landingZ, z1 - WALL], STOREY),
    ...slab([a[0], b[1], z0, a[2]], 2 * STOREY),
    // Its east wall: the street door from the Repair Shop, the Level 1 landing into the Clinic, Level 2 into the Studio.
    ...wallAlongZ(e, e + WALL, z0, z1 - WALL, [[door(-14.7, -13.2)], [door(landingZ, z1 - WALL)], [door(-14.7, -13.2)]]),
    // Floors of the rooms, and the roof.
    ...slab([e + WALL, x1 - WALL, z0, z1 - WALL], STOREY),
    ...slab([e + WALL, x1 - WALL, z0, z1 - WALL], 2 * STOREY),
    box('wall', x0, x1, 3 * STOREY, 3 * STOREY + ROOF, z0, z1),
    // Repair Shop: workbenches and a shelf.
    crate(-7.6, -11.4, 0, 1.6),
    tall('rack', -5.2, -14.4, 1.2, 0.6),
    crate(-6.2, -8.2),
    // Clinic: beds and a screen.
    crate(-7.8, -13.6, STOREY, 1.2, 1.6),
    crate(-5.4, -10.6, STOREY),
    tall('wrapped', -7.6, -8.4, 1.2, 0.6, STOREY),
    // Studio: a mixing desk and speaker stacks.
    crate(-6.8, -11.8, 2 * STOREY, 1.6),
    tall('rack', -5, -14.2, 0.8, 0.8, 2 * STOREY),
    crate(-7.6, -7.4, 2 * STOREY),
    // A partition facing the Sky Bridge door: off the bridge you turn a corner, never walk straight in.
    box('wall', -5.2, -4.9, 2 * STOREY, 3 * STOREY, -9.4, -6.6),
  ];
}

/**
 * The plaza's outdoor stair, walled on both sides, up to a landing; from there the walkway runs east along the block's
 * north face to the footbridge and the Clinic's door. Its top is out of sight of the stairwell's.
 */
function plaza(): MapBlock[] {
  const s = PLAZA_STAIR;
  const l = PLAZA_LANDING;
  const w = WALKWAY;
  return [
    stair(s[0], s[1], s[2], s[3], 0, '+z'),
    box('wall', s[0] - WALL, s[0], 0, STOREY + SIDE, s[2], s[3]),
    box('wall', s[1], s[1] + WALL, 0, STOREY + SIDE, s[2], s[3]),
    ...slab([l[0], l[1], l[2], l[3]], STOREY),
    ...slab([w[0], w[1], w[2], w[3]], STOREY),
    railZ(l[0], l[2], l[3], STOREY),
    railX(l[3] - RAIL_THICKNESS, l[0] + RAIL_THICKNESS, w[1] + RAIL_THICKNESS, STOREY),
    crate(-15.6, -13.8),
    crate(-12.4, -4.4 - CRATE),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Neon Avenue and the Sky Bridge.

function avenue(): MapBlock[] {
  const [x0, x1, z0, z1] = SKY_BRIDGE;
  return [
    // A parked van and a kiosk (full cover), and billboard pillars against the walls, so no line runs the avenue's
    // length.
    box('container', -2, 0.2, 0, FULL_COVER, 3, 7.6),
    box('wall', 0.1, 1.5, 0, FULL_COVER, -3, -1.5),
    tall('rack', 2.8, 4.8, 1.2, 1.2),
    tall('rack', 1.4, 8.8, 1.6, 0.8),
    tall('rack', -3.5, -12.6, 1.6, 1),
    tall('rack', 1.4, -12, 2.6, 2),
    tall('toilet', -3.5, -0.8, 1.6, 1.2),
    // A phone booth at Noodle Alley's mouth (full cover, as the Back Alley's parcel stack is to the east) and planters
    // (crouch).
    tall('toilet', -3.4, 13, 1.2, 1.2),
    crate(-2.8, 11.2),
    crate(-1.4, -9.6),
    // The Sky Bridge: solid 1.2 m sides.
    ...slab([x0, x1, z0, z1], 2 * STOREY),
    box('wall', x0, x1, 2 * STOREY, 2 * STOREY + SIDE, z0 - RAIL_THICKNESS, z0),
    box('wall', x0, x1, 2 * STOREY, 2 * STOREY + SIDE, z1, z1 + RAIL_THICKNESS),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// East: the Tower round its atrium, the Back Alley, the Drone Dock, the East Yard.

const TOWER: Rect = [4, 17, -10, 11];
const ATRIUM: Rect = [7, 12, -3, 6];
/** The Tower's stairwell in its north-east corner: lane A up to Level 1 going north, lane B up to Level 2 going south. */
const TOWER_LANE_A: Rect = [15.25, 16.7, 3.6, 3.6 + STAIR_RUN];
const TOWER_LANE_B: Rect = [13.7, 15.1, 3.6, 3.6 + STAIR_RUN];
const TOWER_STAIRWELL_WEST = 13.4;
const TOWER_STAIRWELL_SOUTH = 1.7;
/** The grand stair from the lobby to Level 1 along the south wall, climbing east; its top turns you north. */
const GRAND_STAIR: Rect = [6.3, 6.3 + STAIR_RUN, -9.7, -7.7];
/** The flag: on the atrium floor, under the galleries. */
const POLE = vec3(9.5, 0, 1.5);

function tower(): MapBlock[] {
  const [x0, x1, z0, z1] = TOWER;
  const a = TOWER_LANE_A;
  const b = TOWER_LANE_B;
  const w = TOWER_STAIRWELL_WEST;
  const s = TOWER_STAIRWELL_SOUTH;
  const g = GRAND_STAIR;
  const inner: Rect = [x0 + WALL, x1 - WALL, z0 + WALL, z1 - WALL];
  const stairwell: Rect = [w + WALL, x1 - WALL, s + WALL, z1 - WALL];
  return [
    // Outer walls, three storeys: the bar door and the Level 2 bridge door on the avenue, windows over it on Level 1
    // and 2, the Back Alley door, the dock shutter, two doors to the East Yard.
    ...wallAlongZ(x0, x0 + WALL, z0, z1, [[door(-9.4, -8), door(1, 2.4)], [window(3, 5), window(7, 9)], [door(SKY_BRIDGE[2], SKY_BRIDGE[3]), window(1, 3), window(6, 8)]]),
    ...wallAlongZ(x1 - WALL, x1, z0, s, [[door(-8.6, -7.2), door(-2, -0.6)], [], []]),
    box('wall', x1 - WALL, x1, 0, 3 * STOREY, s, z1),
    ...wallAlongX(z1 - WALL, z1, x0 + WALL, x1 - WALL, [[door(9, 10.4)], [window(8, 10)], []]),
    ...wallAlongX(z0, z0 + WALL, x0 + WALL, x1 - WALL, [[door(13.5, 15.5)], [window(14.4, 16.2)], [window(7.5, 9.5)]]),
    box('wall', x0, x1, 3 * STOREY, 3 * STOREY + ROOF, z0, z1),
    // The stairwell: walls, the two flights, the divider, the Level 1 landing (filled under) and Level 2 landing.
    ...wallAlongZ(w, w + WALL, s, z1 - WALL, [[door(s + WALL, a[2])], [door(a[3], z1 - WALL)], []]),
    ...wallAlongX(s, s + WALL, w, x1 - WALL, [[], [], [door(15, x1 - WALL)]]),
    stair(a[0], a[1], a[2], a[3], 0, '+z'),
    stair(b[0], b[1], b[2], b[3], STOREY, '-z'),
    box('wall', b[0], b[1], 0, STOREY, b[2], b[3]),
    box('wall', b[1], a[0], 0, 2 * STOREY + RAIL, a[2], a[3]),
    railX(a[2] - RAIL_THICKNESS, b[1], stairwell[1], 2 * STOREY),
    box('wall', stairwell[0], stairwell[1], 0, STOREY - SLAB, a[3], stairwell[3]),
    ...slab([stairwell[0], stairwell[1], a[3], stairwell[3]], STOREY),
    box('wall', stairwell[0], stairwell[1], STOREY, 2 * STOREY - SLAB, stairwell[2], a[2]),
    ...slab([stairwell[0], stairwell[1], stairwell[2], a[2]], 2 * STOREY),
    // Level 1 and Level 2 round the atrium (the grand stair's well open on Level 1), railed.
    ...slab(inner, STOREY, [ATRIUM, [g[0], g[1], g[2], g[3]], [w, inner[1], s, inner[3]]]),
    ...slab(inner, 2 * STOREY, [ATRIUM, [w, inner[1], s, inner[3]]]),
    ...atriumRails(STOREY),
    ...atriumRails(2 * STOREY),
    // The grand stair, with a balustrade along its open side stepping up with it (rail height over the stair, and over
    // Level 1 at the top); a wall at its top turns you north.
    stair(g[0], g[1], g[2], g[3], 0, '+x'),
    ...[1, 2, 3].map((i) => box('barrier', g[0] + ((i - 1) * STAIR_RUN) / 3, g[0] + (i * STAIR_RUN) / 3, 0, (i * STOREY) / 3 + RAIL, g[3], g[3] + RAIL_THICKNESS)),
    railZ(g[0] - RAIL_THICKNESS, g[2], g[3] + RAIL_THICKNESS, STOREY),
    box('wall', 13.7, 14, STOREY, 2 * STOREY - SLAB, inner[2], -7),
    // Street: the bar counter, cover under the galleries and on the atrium floor, the store's shelving.
    crate(4.8, 3.4, 0, 0.8, 2.4),
    crate(5.6, -2.4),
    crate(12.3, 3.2),
    crate(8, 3.6),
    crate(10.4, -1.6),
    tall('rack', 14.6, -2.6, 1.4, 0.6),
    tall('rack', 9, 7.8, 1.6, 0.6),
    crate(5.2, -8.2),
    // Level 1: offices and the galleries.
    crate(5, 4.8, STOREY),
    crate(12.3, -1, STOREY),
    tall('wrapped', 5, -6.6, 1.6, 0.6, STOREY),
    crate(9.6, 7.6, STOREY),
    tall('rack', 15, -4.6, 0.6, 1.6, STOREY),
    // Level 2: the gallery's cover.
    crate(4.3, 0.4, 2 * STOREY, 0.9),
    crate(10.4, 8, 2 * STOREY),
    tall('wrapped', 8.6, -6.6, 1.2, 1.2, 2 * STOREY),
    // A partition facing the Sky Bridge door, as in the Studio.
    box('wall', 5.6, 5.9, 2 * STOREY, 3 * STOREY, -8.6, -6),
    crate(5.2, 7.6, 2 * STOREY),
  ];
}

/** Rails round the atrium on the gallery at `base`. */
function atriumRails(base: number): MapBlock[] {
  const [x0, x1, z0, z1] = ATRIUM;
  const t = RAIL_THICKNESS;
  return [railX(z0 - t, x0 - t, x1 + t, base), railX(z1, x0 - t, x1 + t, base), railZ(x0 - t, z0, z1, base), railZ(x1, z0, z1, base)];
}

function eastAlleysAndYard(): MapBlock[] {
  return [
    // Back Alley: parcel stacks against the Tower and racking against the perimeter, staggered; a skip.
    tall('wrapped', 6.4, 11, 1.2, 1.6),
    tall('rack', 12, 12.4, 1.2, 2.6),
    box('skip', 15.2, 16.8, 0, CRATE, 13.4, 14.6),
    // Drone Dock: parcel stacks.
    tall('wrapped', 6, -13.4, 1.2, 1.6),
    crate(10.4, -12.4),
    tall('wrapped', 10.4, -15, 1.2, 1.8),
    tall('wrapped', 15.8, -12.4, 1.2, 1.2),
    // East Yard: the spawn wall, open at both ends.
    box('wall', 18.8, 19.1, 0, SPAWN_WALL_HEIGHT, -5, 6),
    tall('rack', 17, -9.4, 1.8, 1.2),
    tall('wrapped', 17, 8, 1.8, 1.2),
  ];
}

const WEST_SPAWNS: SpawnPoint[] = [-3, -1.5, 0, 1.5, 3].map((z) => ({ position: vec3(-20.2, 0, z), yaw: -Math.PI / 2 }));
const EAST_SPAWNS: SpawnPoint[] = [-3, -1.5, 0, 1.5, 3].map((z) => ({ position: vec3(22.6, 0, z), yaw: Math.PI / 2 }));

/** Dead zones: the far corner of each spawn yard (the west's south-west, the east's north-east), out of every lane. */
const deadZone = (x: number, z: number, dx: number, dz: number, yaw: number): SpawnPoint[] =>
  [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
    [2, 0],
  ].map(([i, j]) => ({ position: vec3(x + i! * dx, 0, z + j! * dz), yaw }));
const WEST_DEAD_ZONE = deadZone(-22.2, -14.2, 0.9, 0.9, -Math.PI / 2);
const EAST_DEAD_ZONE = deadZone(22.2, 14.2, -0.9, -0.9, Math.PI / 2);

/**
 * Advance routes from the west end to the east end (floor points, checked in tests). Defending bots hold the last or
 * the second-last point of their lane.
 */
const LANES: Vec3[][] = [
  // North: Noodle Alley, across the top of the avenue, the Back Alley door, the back hall.
  [vec3(-19.5, 0, 7.5), vec3(-14, 0, 11.8), vec3(-6, 0, 12), vec3(0.5, 0, 12.6), vec3(8, 0, 12.6), vec3(10.3, 0, 9.5), vec3(10.2, 0, 7.2)],
  // Mid: through the Arcade, past the van, the bar door, the atrium.
  [vec3(-19.5, 0, 4.8), vec3(-17, 0, 7), vec3(-16, 0, 1.2), vec3(-13.8, 0, 1.2), vec3(-9.4, 0, 2.2), vec3(-5.4, 0, 5.9), vec3(-2.7, 0, 5.9), vec3(-2.7, 0, 2.2), vec3(1.6, 0, 1.7), vec3(5.4, 0, 1.7), vec3(7.4, 0, 1)],
  // High: the plaza stair, the walkway and the footbridge door into the Clinic, the stairwell to the Studio, the Sky Bridge, the Tower's Level 2.
  [
    vec3(-19.5, 0, -6.5),
    vec3(-13.9, 0, -13),
    vec3(-13.9, STOREY, -5.7),
    vec3(-11, STOREY, -4.3),
    vec3(-6.6, STOREY, -4.3),
    vec3(-6.6, STOREY, -6.2),
    vec3(-9.45, STOREY, -5.95),
    vec3(-9.45, 4.5, -9.6),
    vec3(-10.5, 2 * STOREY, -13.9),
    vec3(-7.6, 2 * STOREY, -13.9),
    vec3(-6, 2 * STOREY, -7.3),
    vec3(-5.05, 2 * STOREY, -5.95),
    vec3(-4.3, 2 * STOREY, -7.3),
    vec3(0.4, 2 * STOREY, -7.3),
    vec3(4.9, 2 * STOREY, -7.3),
    vec3(5, 2 * STOREY, -5.2),
    vec3(6, 2 * STOREY, -3.8),
  ],
  // South: Lantern Lane, the Repair Shop, the avenue, the Drone Dock, the shutter, the lobby.
  [
    vec3(-19.5, 0, -4),
    vec3(-14.2, 0, -3.4),
    vec3(-6.7, 0, -3.6),
    vec3(-6.7, 0, -6.6),
    vec3(-5.2, 0, -9.2),
    vec3(-2.4, 0, -8.3),
    vec3(1.2, 0, -12.4),
    vec3(10, 0, -12.6),
    vec3(14.5, 0, -11.6),
    vec3(14.5, 0, -8.6),
    vec3(11.6, 0, -5.4),
    vec3(9.5, 0, -3.8),
  ],
];

/**
 * The windows, balconies and galleries above each area (the Pro difficulty's watch angles, M36): where someone up
 * there stands to see the area.
 */
const OVERLOOKS: Overlook[] = [
  { name: 'Neon Avenue', area: [-3.5, 4, -15, 15], from: [vec3(-2.6, STOREY, 4), vec3(-4.25, STOREY, -11), vec3(4.75, STOREY, 4)] },
  { name: 'Drone Dock', area: [4, HALF_X, -HALF_Z, -10], from: [vec3(-4.25, STOREY, -11), vec3(-4.25, 2 * STOREY, -11.5)] },
  { name: 'Lantern Lane', area: [-12, -3.5, -5, -2], from: [vec3(4.75, STOREY, 4), vec3(4.75, 2 * STOREY, 2)] },
  { name: 'Noodle Alley', area: [-15, -3.5, 10, HALF_Z], from: [vec3(4.75, STOREY, 8), vec3(4.75, 2 * STOREY, 7)] },
  { name: 'Atrium', area: ATRIUM, from: [vec3(6.4, STOREY, 1.5), vec3(12.6, STOREY, 1.1), vec3(9.5, 2 * STOREY, 6.6), vec3(9.5, 2 * STOREY, -3.6)] },
];

const toWorld = (p: Vec3): Vec3 => vec3(p.x, p.y, -p.z);
const FLIP_RISE: Record<RampRise, RampRise> = { '+x': '+x', '-x': '-x', '+z': '-z', '-z': '+z' };
/**
 * Floors are drawn edge to edge (slab strips, door sills, bridges, landings at a stair's top). Each is grown by this
 * much on every side so the seams overlap: a nav cell whose centre falls exactly on a seam would otherwise, by
 * rounding, be under neither floor and read as a hole.
 */
const SEAM = 0.01;
function blockToWorld(b: MapBlock): MapBlock {
  const grow = b.kind === 'floor' ? 2 * SEAM : 0;
  const w: MapBlock = { kind: b.kind, center: toWorld(b.center), size: vec3(b.size.x + grow, b.size.y, b.size.z + grow) };
  if (b.rise) w.rise = FLIP_RISE[b.rise];
  if (b.surface) w.surface = b.surface;
  return w;
}
/** Mirroring z turns a facing `yaw` (forward = (-sin yaw, -cos yaw)) into π - yaw. */
const spawnToWorld = (s: SpawnPoint): SpawnPoint => ({ position: toWorld(s.position), yaw: Math.atan2(Math.sin(Math.PI - s.yaw), Math.cos(Math.PI - s.yaw)) });
const rectToWorld = (r: Rect): Rect => [r[0], r[1], -r[3], -r[2]];

export const NEON_HEIGHTS: MapData = {
  name: 'Neon Heights',
  blocks: [
    ...ground(),
    ...westYard(),
    ...arcade(),
    ...balcony(),
    ...footbridge(),
    ...noodleAlleyAndLanternLane(),
    ...repairBlock(),
    ...plaza(),
    ...avenue(),
    ...tower(),
    ...eastAlleysAndYard(),
  ].map(blockToWorld),
  killY: -10,
  spawns: [WEST_SPAWNS.map(spawnToWorld), EAST_SPAWNS.map(spawnToWorld)],
  deadZones: [WEST_DEAD_ZONE.map(spawnToWorld), EAST_DEAD_ZONE.map(spawnToWorld)],
  lanes: LANES.map((lane) => lane.map(toWorld)),
  flag: toWorld(POLE),
  storeys: [0, STOREY, 2 * STOREY],
  overlooks: OVERLOOKS.map((o) => ({ name: o.name, area: rectToWorld(o.area), from: o.from.map(toWorld) })),
};

/** Layout facts the tests check against, in world coordinates, so they can't drift from the geometry. */
export const NEON_HEIGHTS_LAYOUT = {
  halfX: HALF_X,
  halfZ: HALF_Z,
  storey: STOREY,
  /** The spawn walls' faces towards the field: the yards are behind them. */
  spawnWalls: [-17.9, 18.8],
  /**
   * Every stair flight: its footprint, its two ends (floor points) and its stairwell (flights sharing one are one way
   * up, taken in turn).
   */
  links: [
    { name: 'Arcade stair', well: 'Arcade', area: ARCADE_STAIR, bottom: vec3(-14, 0, 1.8), top: vec3(-14, STOREY, 9.2) },
    { name: 'Repair stairwell, lower flight', well: 'Repair', area: BLOCK_LANE_A, bottom: vec3(-11, 0, -13.6), top: vec3(-11, STOREY, -5.9) },
    { name: 'Repair stairwell, upper flight', well: 'Repair', area: BLOCK_LANE_B, bottom: vec3(-9.45, STOREY, -5.9), top: vec3(-9.45, 2 * STOREY, -13.6) },
    { name: 'Plaza stair', well: 'Plaza', area: PLAZA_STAIR, bottom: vec3(-13.9, 0, -12.8), top: vec3(-13.9, STOREY, -5.7) },
    { name: 'Tower stairwell, lower flight', well: 'Tower', area: TOWER_LANE_A, bottom: vec3(16, 0, 2.8), top: vec3(16, STOREY, 10.1) },
    { name: 'Tower stairwell, upper flight', well: 'Tower', area: TOWER_LANE_B, bottom: vec3(14.4, STOREY, 10.1), top: vec3(14.4, 2 * STOREY, 2.8) },
    { name: 'Grand stair', well: 'Grand', area: GRAND_STAIR, bottom: vec3(5.6, 0, -8.7), top: vec3(13, STOREY, -8.7) },
  ].map((l) => ({ name: l.name, well: l.well, area: rectToWorld(l.area), bottom: toWorld(l.bottom), top: toWorld(l.top) })),
  /** The bridges between buildings: their footprints, floor heights and two ends. */
  bridges: [
    { name: 'Footbridge', area: FOOTBRIDGE, y: STOREY, ends: [vec3(-6.6, STOREY, -1.6), vec3(-6.6, STOREY, -5.6)] },
    { name: 'Sky Bridge', area: SKY_BRIDGE, y: 2 * STOREY, ends: [vec3(-4.3, 2 * STOREY, -7.3), vec3(4.9, 2 * STOREY, -7.3)] },
  ].map((b) => ({ name: b.name, area: rectToWorld(b.area), y: b.y, ends: b.ends.map(toWorld) })),
  /** The raised floors, each with a spot on it (world coordinates). */
  raised: [
    { name: 'Capsules', at: vec3(-9, STOREY, 1.5) },
    { name: 'Clinic', at: vec3(-6, STOREY, -12) },
    { name: 'Studio', at: vec3(-6, 2 * STOREY, -13) },
    { name: 'Tower Level 1', at: vec3(10, STOREY, -5) },
    { name: 'Tower Level 2', at: vec3(10, 2 * STOREY, -5) },
  ].map((r) => ({ name: r.name, at: toWorld(r.at) })),
} as const;
