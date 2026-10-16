import { length3, type Vec3 } from '../sim/vec';

/**
 * A bush (M33e): an upright ellipsoid of leaves standing on the ground, `radius` across and `height` tall from its
 * foot at (x, y, z). Bushes hide whoever is in or behind them from sight, and players and bots walk straight through
 * them (no collider, no level-ray surface, no nav obstacle). BBs push into their leaves (Dev 6 item 44, sim/leaves.ts):
 * deep in, the leaves stop them; through a thin edge they fly on, thrown off their line. Any map can have them
 * (`MapData.foliage`); the engine draws them, the minimap marks them and bots can't see or shoot through them.
 */
export interface Bush {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
}

/**
 * Where a line runs through one bush (bushSpan), as shares of the segment: in at t0, out at t1, and whether it comes out
 * within the segment (`out`) rather than ending among the leaves. Reused, so nothing is allocated.
 */
const span = { t0: 0, t1: 0, out: false };

/**
 * Whether the segment from (ax, ay, az) along (dx, dy, dz) (t from 0 to 1) runs through `bush`, filling `span` with where
 * it goes in and comes out, clipped to the segment. In the bush's own space it is a unit sphere: solve |p + t q|² = 1.
 */
function bushSpan(bush: Bush, ax: number, ay: number, az: number, dx: number, dy: number, dz: number): boolean {
  const r = bush.radius;
  const half = bush.height / 2;
  const px = (ax - bush.x) / r;
  const py = (ay - bush.y - half) / half;
  const pz = (az - bush.z) / r;
  const qx = dx / r;
  const qy = dy / half;
  const qz = dz / r;
  const qq = qx * qx + qy * qy + qz * qz;
  const pq = px * qx + py * qy + pz * qz;
  const pp = px * px + py * py + pz * pz;
  const disc = pq * pq - qq * (pp - 1);
  if (disc <= 0) return false;
  const root = Math.sqrt(disc);
  const t1 = (-pq + root) / qq;
  span.t0 = Math.max(0, (-pq - root) / qq);
  span.t1 = Math.min(1, t1);
  span.out = t1 <= 1;
  return span.t1 > span.t0;
}

/** True if `bush`'s bounding box misses the box from (minX, minY, minZ) to (maxX, maxY, maxZ). */
function outside(bush: Bush, minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): boolean {
  const r = bush.radius;
  return bush.x + r < minX || bush.x - r > maxX || bush.z + r < minZ || bush.z - r > maxZ || bush.y + bush.height < minY || bush.y > maxY;
}

/**
 * How far the segment from `a` to `b` runs through leaves (m), summed over every bush it crosses. Stops counting once
 * past `limit` (pass it when only "more than this?" matters). A sight line that only grazes a bush, or starts just
 * inside one, crosses little leaf: someone at the edge of a bush is seen and can see out; deeper in they are hidden.
 */
export function foliageDepth(bushes: readonly Bush[], a: Vec3, b: Vec3, limit = Number.POSITIVE_INFINITY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = length3(dx, dy, dz);
  if (len < 1e-6) return 0;
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const minZ = Math.min(a.z, b.z);
  const maxZ = Math.max(a.z, b.z);
  let depth = 0;
  for (const bush of bushes) {
    // Bounding-box test first: most bushes are nowhere near the line.
    if (outside(bush, minX, maxX, minY, maxY, minZ, maxZ)) continue;
    if (!bushSpan(bush, a.x, a.y, a.z, dx, dy, dz)) continue;
    depth += (span.t1 - span.t0) * len;
    if (depth > limit) return depth;
  }
  return depth;
}

/**
 * Where a BB's path meets leaves (firstLeaves): metres along it to where it goes in, and to where it comes out or, when
 * the path ends among the leaves (`through` false), to the path's end.
 */
export interface LeafCrossing {
  enter: number;
  exit: number;
  through: boolean;
}

/**
 * Leaves crossed for less than this (m) count as none (firstLeaves): a BB that came out of a bush on its surface last
 * tick, or one grazing a bush's very rim, would otherwise "cross" a sliver of leaf again and again.
 */
const MIN_LEAVES = 1e-3;

/**
 * The first bush the path from `origin` along unit `dir` runs into within `len` metres (or starts inside), into `out`:
 * where along it the path goes in (0 when it starts inside), and where it comes out or, if it is still among the leaves
 * at `len`, `len` with `through` false. False if it meets no leaves (or only a sliver: MIN_LEAVES). The BBs' leaves
 * (sim/bbs.ts): each tick a BB takes on one bush at a time.
 */
export function firstLeaves(bushes: readonly Bush[], origin: Vec3, dir: Vec3, len: number, out: LeafCrossing): boolean {
  if (!(len > MIN_LEAVES)) return false;
  const dx = dir.x * len;
  const dy = dir.y * len;
  const dz = dir.z * len;
  const minX = Math.min(origin.x, origin.x + dx);
  const maxX = Math.max(origin.x, origin.x + dx);
  const minY = Math.min(origin.y, origin.y + dy);
  const maxY = Math.max(origin.y, origin.y + dy);
  const minZ = Math.min(origin.z, origin.z + dz);
  const maxZ = Math.max(origin.z, origin.z + dz);
  let best = Number.POSITIVE_INFINITY;
  for (const bush of bushes) {
    if (outside(bush, minX, maxX, minY, maxY, minZ, maxZ)) continue;
    if (!bushSpan(bush, origin.x, origin.y, origin.z, dx, dy, dz)) continue;
    if ((span.t1 - span.t0) * len < MIN_LEAVES || span.t0 >= best) continue;
    best = span.t0;
    out.enter = span.t0 * len;
    out.exit = span.t1 * len;
    out.through = span.out;
  }
  return Number.isFinite(best);
}

/** Where the line back from a BB in the leaves meets their surface (leafSurface). Reused, so nothing is allocated. */
const back: LeafCrossing = { enter: 0, exit: 0, through: false };
const backDir = { x: 0, y: 0, z: 0 };

/** How far out of a bush (in its radii, and metres up and down) a point still counts as on it (leafFloor). */
const LEAF_FLOOR_REACH = 1.05;
const LEAF_FLOOR_SLACK = 0.05;

/**
 * The ground under the bush `at` is in or on (its base: a bush stands on it), for the leaves a BB knocks out of it to come
 * to rest on (BP5); -Infinity when `at` is in no bush. The lowest base of those it is in, as bushes overlap.
 */
export function leafFloor(bushes: readonly Bush[], at: Vec3): number {
  let floor = Number.POSITIVE_INFINITY;
  for (const b of bushes) {
    const dx = (at.x - b.x) / b.radius;
    const dz = (at.z - b.z) / b.radius;
    if (dx * dx + dz * dz <= LEAF_FLOOR_REACH * LEAF_FLOOR_REACH && at.y >= b.y - LEAF_FLOOR_SLACK && at.y <= b.y + b.height + LEAF_FLOOR_SLACK) floor = Math.min(floor, b.y);
  }
  return floor === Number.POSITIVE_INFINITY ? Number.NEGATIVE_INFINITY : floor;
}

/**
 * Where leaves knocked out by a BB at `at` (stopped inside a bush, or come out of its edge) show, into `out` (Dev 6 item
 * 44; presentation only): where the line from `at` back towards `from` (its shooter) leaves the bush round `at`, so the
 * side the BB went in, where the leaves can be seen. `at` itself when that line is still among the leaves on reaching
 * `from` (a BB fired from inside the bush) or starts in no bush. Allocates nothing.
 */
export function leafSurface(bushes: readonly Bush[], at: Vec3, from: Vec3, out: Vec3): Vec3 {
  out.x = at.x;
  out.y = at.y;
  out.z = at.z;
  const dx = from.x - at.x;
  const dy = from.y - at.y;
  const dz = from.z - at.z;
  const len = length3(dx, dy, dz);
  if (bushes.length === 0 || !(len > 0)) return out;
  backDir.x = dx / len;
  backDir.y = dy / len;
  backDir.z = dz / len;
  // Only the bush `at` is in (or on the surface of): a crossing that starts right there and comes out before `from`.
  if (!firstLeaves(bushes, at, backDir, len, back) || back.enter > MIN_LEAVES || !back.through) return out;
  out.x = at.x + backDir.x * back.exit;
  out.y = at.y + backDir.y * back.exit;
  out.z = at.z + backDir.z * back.exit;
  return out;
}
