import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import type { MapData, SpawnPoint } from '../map/mapTypes';
import { buildDistanceField, buildNavGrid, createNavSearch, findPath, type NavGrid, nearestWalkable, nodeX, nodeZ } from '../nav/navGrid';
import { buildLevelRay, castLevelRay, type LevelRay } from '../sim/levelRay';
import { type Vec3, vec3 } from '../sim/vec';

/**
 * A map's layout, measured (CT2, the content toolkit's map checks): what a player standing anywhere on it can see and
 * how far they walk. Built from the same nav grid the bots walk and the same ray the BBs and the bots' sight use
 * (sim/levelRay.ts: blocks and terrain). Bushes are left out, so a line through one measures as open, though they hide
 * people and stop BBs deep inside them (Dev 6 item 44). Pure over the map's data; allocates while measuring, so it is
 * for checks and reports, never for play.
 */

/** Where an eye is above the floor: a character stands PHYSICS.groundRestGap above it. */
export const STANDING_EYE = PHYSICS.groundRestGap + BODY.standEyeHeight;
export const CROUCHED_EYE = PHYSICS.groundRestGap + BODY.crouchEyeHeight;

/** One map's measuring tools: its nav grid and its ray, built once. */
export interface MapGeometry {
  map: MapData;
  nav: NavGrid;
  level: LevelRay;
}

const built = new WeakMap<MapData, MapGeometry>();

/** The map's nav grid and ray (built once per map data). */
export function mapGeometry(map: MapData): MapGeometry {
  let g = built.get(map);
  if (!g) {
    g = { map, nav: buildNavGrid(map, NAV), level: buildLevelRay(map.blocks, PHYSICS.rayGridCell, map.terrain ?? null) };
    built.set(map, g);
  }
  return g;
}

/** A place a player can stand: a walkable nav node and its floor point. */
export interface StandPoint {
  node: number;
  x: number;
  y: number;
  z: number;
}

/**
 * Places a player can stand, one per `spacing` square of the map on each floor (the first walkable node in it), so a
 * measure over them is the same however fine the nav grid is.
 */
export function standPoints(geo: MapGeometry, spacing: number): StandPoint[] {
  const g = geo.nav;
  const per = Math.max(1, Math.round(spacing / g.cell));
  const out: StandPoint[] = [];
  const taken = new Set<string>();
  for (let k = 0; k < g.floorY.length; k++) {
    if (g.walkable[k] !== 1) continue;
    const c = g.nodeCell[k]!;
    const i = c % g.cols;
    const j = (c - i) / g.cols;
    // A square's floors are told apart by their height (a storey is far more than a stair's step).
    const key = `${Math.floor(i / per)},${Math.floor(j / per)},${Math.round(g.floorY[k]! / 1.5)}`;
    if (taken.has(key)) continue;
    taken.add(key);
    out.push({ node: k, x: nodeX(g, k), y: g.floorY[k]!, z: nodeZ(g, k) });
  }
  return out;
}

const from = vec3();
const dir = vec3();

/** Whether an eye `eyeA` above floor point `a` has a clear line to one `eyeB` above `b`. */
export function sees(geo: MapGeometry, a: Readonly<Vec3>, b: Readonly<Vec3>, eyeA = STANDING_EYE, eyeB = eyeA): boolean {
  from.x = a.x;
  from.y = a.y + eyeA;
  from.z = a.z;
  dir.x = b.x - a.x;
  dir.y = b.y + eyeB - from.y;
  dir.z = b.z - a.z;
  const d = Math.hypot(dir.x, dir.y, dir.z);
  if (d < 1e-6) return true;
  dir.x /= d;
  dir.y /= d;
  dir.z /= d;
  return castLevelRay(geo.level, from, dir, d) < 0;
}

/** A clear line between two standing eyes, and how long it is (m, across the ground). */
export interface Sightline {
  metres: number;
  from: StandPoint;
  to: StandPoint;
}

/**
 * The longest clear line from a standing eye to a standing eye between any two of `points` (the horizontal distance,
 * as a player judges range). Each point tries the others farthest first and stops at its first clear one, or once the
 * rest are no longer than the longest found, so it costs far fewer casts than every pair.
 */
export function longestSightline(geo: MapGeometry, points: readonly StandPoint[]): Sightline | null {
  let best: Sightline | null = null;
  const order = new Int32Array(points.length);
  const dist = new Float64Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    let n = 0;
    for (let j = 0; j < points.length; j++) {
      if (j === i) continue;
      const b = points[j]!;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d <= (best?.metres ?? 0)) continue;
      dist[j] = d;
      order[n++] = j;
    }
    const cand = Array.from(order.subarray(0, n)).sort((p, q) => dist[q]! - dist[p]!);
    for (const j of cand) {
      if (dist[j]! <= (best?.metres ?? 0)) break;
      if (sees(geo, a, points[j]!)) {
        best = { metres: dist[j]!, from: a, to: points[j]! };
        break;
      }
    }
  }
  return best;
}

/**
 * A sightline found on a coarse grid of stand points, stretched to its full length: every walkable cell within `reach`
 * of either end (on its floor) is tried against every one near the other, longest first, and the best clear pair
 * becomes the new line; repeated until it stops growing (at most `rounds` times). A grid of spacing s can miss up to
 * about 2s of a line's length; this finds it back without measuring the whole map at the nav grid's own cell.
 */
export function stretchSightline(geo: MapGeometry, line: Sightline, reach: number, rounds = 4): Sightline {
  const cells = standPoints(geo, geo.nav.cell);
  const near = (p: StandPoint): StandPoint[] => cells.filter((q) => Math.abs(q.x - p.x) <= reach && Math.abs(q.z - p.z) <= reach && Math.abs(q.y - p.y) < 1.5);
  let best = line;
  for (let round = 0; round < rounds; round++) {
    const ends: [StandPoint[], StandPoint[]] = [near(best.from), near(best.to)];
    const pairs: { a: StandPoint; b: StandPoint; d: number }[] = [];
    for (const a of ends[0]) {
      for (const b of ends[1]) {
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > best.metres) pairs.push({ a, b, d });
      }
    }
    pairs.sort((p, q) => q.d - p.d);
    const found = pairs.find((p) => sees(geo, p.a, p.b));
    if (!found) break;
    best = { metres: found.d, from: found.a, to: found.b };
  }
  return best;
}

/** The places a player can stand within `radius` of any of `spawns` (an end's spawn yard), on a `spacing` grid. */
export function spawnYard(geo: MapGeometry, spawns: readonly SpawnPoint[], radius: number, spacing: number): StandPoint[] {
  return standPoints(geo, spacing).filter((p) => spawns.some((s) => Math.hypot(p.x - s.position.x, p.z - s.position.z) <= radius && Math.abs(p.y - s.position.y) < 1.5));
}

/** The first line found from one end's spawn yard into the other's, standing or crouched; null when there is none. */
export function spawnYardsSeen(geo: MapGeometry, radius: number, spacing: number): { from: StandPoint; to: StandPoint; eye: 'standing' | 'crouched' } | null {
  const [west, east] = [0, 1].map((end) => spawnYard(geo, geo.map.spawns[end]!, radius, spacing)) as [StandPoint[], StandPoint[]];
  for (const [eye, h] of [['standing', STANDING_EYE], ['crouched', CROUCHED_EYE]] as const) {
    for (const a of west) for (const b of east) if (sees(geo, a, b, h)) return { from: a, to: b, eye };
  }
  return null;
}

/** Walking distance (m) from every nav node to the nearest of `to`, Infinity where none is reached. */
export function walkField(geo: MapGeometry, to: readonly Vec3[]): Float32Array {
  const field = buildDistanceField(geo.nav, to, NAV.snap);
  for (let k = 0; k < field.length; k++) field[k]! *= geo.nav.cell;
  return field;
}

/** The walking distance (m) from `p` read off a walk field (Infinity off the grid or out of reach). */
export function walkFrom(geo: MapGeometry, field: Float32Array, p: Readonly<Vec3>): number {
  const k = nearestWalkable(geo.nav, p.x, p.y, p.z, NAV.snap);
  return k >= 0 ? field[k]! : Number.POSITIVE_INFINITY;
}

/** Whether a bot's route search finds a way from `a` to `b` that ends at `b` (within the route snap). */
export function routeBetween(geo: MapGeometry, a: Readonly<Vec3>, b: Readonly<Vec3>): boolean {
  const out: Vec3[] = [];
  if (!findPath(geo.nav, createNavSearch(geo.nav), a, b, NAV.snap, out)) return false;
  const last = out[out.length - 1] ?? a;
  return Math.hypot(last.x - b.x, last.z - b.z) < NAV.snap;
}
