import { BB_VISUALS } from '../../config/render';
import type { WorldQuery } from '../../sim/armament';
import type { BB } from '../../sim/ballistics';
import { length3, vec3 } from '../../sim/vec';

/**
 * How soon a new BB meets the level, for its muzzle convergence (bbRenderer.ts startFromMuzzle, ownShotStarts.ts): one
 * level ray per shot, out of the per-frame code (DX6). Allocation-free.
 */

const dir = vec3();

/** Rough seconds until `bb` hits level geometry (straight line at its launch speed); Infinity if nothing is near. */
export function bbFlightTime(bb: BB, query: WorldQuery): number {
  const v = bb.velocity;
  const speed = length3(v.x, v.y, v.z);
  if (speed <= 0) return Number.POSITIVE_INFINITY;
  dir.x = v.x / speed;
  dir.y = v.y / speed;
  dir.z = v.z / speed;
  const d = query.raycastStatic(bb.prevPosition, dir, speed * BB_VISUALS.muzzleConvergeTime);
  return d < 0 ? Number.POSITIVE_INFINITY : d / speed;
}
