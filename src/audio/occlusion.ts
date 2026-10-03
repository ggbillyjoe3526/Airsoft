import { AUDIO } from '../config/audio';
import type { Vec3 } from '../sim/vec';

/** What muffling needs from the world: the distance to the first level surface along a ray, or -1 for none. */
export interface OcclusionQuery {
  raycastStatic(origin: Vec3, dir: Vec3, maxDist: number): number;
}

/** A sound's muffling: a low-pass corner (Hz) and a level (linear). */
export interface Muffle {
  hz: number;
  gain: number;
}

const dir = { x: 0, y: 0, z: 0 };

/** True if level geometry blocks the straight line from `from` to `to`, ignoring the last `gap` metres. */
export function lineBlocked(query: OcclusionQuery, from: Vec3, to: Vec3, gap = 0): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dy, dz);
  const reach = dist - gap;
  if (reach <= 0) return false;
  dir.x = dx / dist;
  dir.y = dy / dist;
  dir.z = dz / dist;
  return query.raycastStatic(from, dir, reach) >= 0;
}

const point = { x: 0, y: 0, z: 0 };

/**
 * The share (0..1) of the rays from `listener` to a character standing at `feet` that level geometry blocks, one
 * ray per AUDIO.occlusion.rayHeights: 0 in the open, 0.5 behind low cover, 1 behind a wall.
 */
export function blockedShare(query: OcclusionQuery, listener: Vec3, feet: Vec3): number {
  const heights = AUDIO.occlusion.rayHeights;
  let blocked = 0;
  for (const h of heights) {
    point.x = feet.x;
    point.y = feet.y + h;
    point.z = feet.z;
    if (lineBlocked(query, listener, point)) blocked++;
  }
  return blocked / heights.length;
}

/**
 * How a sound is muffled when `share` of it is blocked: the low-pass corner glides from open to muffled on a
 * log scale (each step sounds about as big as the last) and the level falls linearly.
 */
export function muffleFor(share: number, out: Muffle = { hz: 0, gain: 0 }): Muffle {
  const o = AUDIO.occlusion;
  const s = Math.min(1, Math.max(0, share));
  out.hz = o.openHz * (o.muffledHz / o.openHz) ** s;
  out.gain = 1 - s * (1 - o.muffledGain);
  return out;
}
