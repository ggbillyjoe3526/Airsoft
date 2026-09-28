import type { BallisticsConfig } from '../config/ballistics';
import type { WorldQuery } from './armament';
import { type BBPool, stepBBFlight } from './ballistics';
import type { GameEvent } from './events';
import { copy, vec3 } from './vec';

const segmentDir = vec3();

/**
 * Moves every BB in flight one tick and stops it at the first level surface its path crosses this
 * tick (reported as a bbImpact event). BBs that fall out of the world or get too old just vanish.
 * Characters are not hit yet; hit rules come with hit calling.
 */
export function stepBBs(
  pool: BBPool,
  cfg: BallisticsConfig,
  query: WorldQuery,
  killY: number,
  events: GameEvent[],
  dt: number,
): void {
  for (const bb of pool.bbs) {
    if (!bb.active) continue;
    copy(bb.prevPosition, bb.position);
    stepBBFlight(bb, cfg, dt);

    const dx = bb.position.x - bb.prevPosition.x;
    const dy = bb.position.y - bb.prevPosition.y;
    const dz = bb.position.z - bb.prevPosition.z;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-9) {
      segmentDir.x = dx / len;
      segmentDir.y = dy / len;
      segmentDir.z = dz / len;
      const t = query.raycastStatic(bb.prevPosition, segmentDir, len);
      if (t >= 0) {
        bb.position.x = bb.prevPosition.x + segmentDir.x * t;
        bb.position.y = bb.prevPosition.y + segmentDir.y * t;
        bb.position.z = bb.prevPosition.z + segmentDir.z * t;
        bb.active = false;
        events.push({ type: 'bbImpact', position: vec3(bb.position.x, bb.position.y, bb.position.z) });
        continue;
      }
    }
    if (bb.age > cfg.maxLifetime || bb.position.y < killY) bb.active = false;
  }
}
