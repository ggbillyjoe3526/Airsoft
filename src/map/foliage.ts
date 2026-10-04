import type { Vec3 } from '../sim/vec';

/**
 * A bush (M33e): an upright ellipsoid of leaves standing on the ground, `radius` across and `height` tall from its
 * foot at (x, y, z). Bushes are concealment, not cover: they hide whoever is in or behind them from sight, but BBs,
 * players and bots pass straight through (no collider, no level-ray surface, no nav obstacle). Any map can have them
 * (`MapData.foliage`); the engine draws them, the minimap marks them and bots can't see through them.
 */
export interface Bush {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
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
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return 0;
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const minZ = Math.min(a.z, b.z);
  const maxZ = Math.max(a.z, b.z);
  let depth = 0;
  for (const bush of bushes) {
    const r = bush.radius;
    const half = bush.height / 2;
    // Bounding-box test first: most bushes are nowhere near the line.
    if (bush.x + r < minX || bush.x - r > maxX || bush.z + r < minZ || bush.z - r > maxZ) continue;
    if (bush.y + bush.height < minY || bush.y > maxY) continue;
    // In the bush's own space it is a unit sphere: solve |p + t d|² = 1 for t on [0, 1].
    const px = (a.x - bush.x) / r;
    const py = (a.y - bush.y - half) / half;
    const pz = (a.z - bush.z) / r;
    const qx = dx / r;
    const qy = dy / half;
    const qz = dz / r;
    const qq = qx * qx + qy * qy + qz * qz;
    const pq = px * qx + py * qy + pz * qz;
    const pp = px * px + py * py + pz * pz;
    const disc = pq * pq - qq * (pp - 1);
    if (disc <= 0) continue;
    const root = Math.sqrt(disc);
    const t0 = Math.max(0, (-pq - root) / qq);
    const t1 = Math.min(1, (-pq + root) / qq);
    if (t1 <= t0) continue;
    depth += (t1 - t0) * len;
    if (depth > limit) return depth;
  }
  return depth;
}
