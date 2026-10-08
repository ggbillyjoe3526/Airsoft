import { length3, type Vec3 } from './vec';

/**
 * Whether level geometry stands between a sound and an ear, for the player's audio (muffling, M13) and the bots'
 * hearing (M22) alike, so both "hear" through the same walls. Pure: the world is only a static ray cast.
 */

/** The distance to the first level surface along a ray, or -1 for none. */
export interface SoundPathQuery {
  raycastStatic(origin: Vec3, dir: Vec3, maxDist: number): number;
}

const dir = { x: 0, y: 0, z: 0 };

/** True if level geometry blocks the straight line from `from` to `to`, ignoring the last `gap` metres. */
export function lineBlocked(query: SoundPathQuery, from: Vec3, to: Vec3, gap = 0): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = length3(dx, dy, dz);
  const reach = dist - gap;
  if (reach <= 0) return false;
  dir.x = dx / dist;
  dir.y = dy / dist;
  dir.z = dz / dist;
  return query.raycastStatic(from, dir, reach) >= 0;
}

const point = { x: 0, y: 0, z: 0 };

/**
 * The share (0..1) of the rays from `ear` to a character standing at `feet` that level geometry blocks, one ray per
 * height above their feet in `heights`: 0 in the open, 0.5 behind low cover (with knee and head rays), 1 behind a wall.
 */
export function blockedShare(query: SoundPathQuery, ear: Vec3, feet: Vec3, heights: readonly number[]): number {
  let blocked = 0;
  for (const h of heights) {
    point.x = feet.x;
    point.y = feet.y + h;
    point.z = feet.z;
    if (lineBlocked(query, ear, point)) blocked++;
  }
  return blocked / heights.length;
}
