import type { BotConfig } from '../config/bots';
import type { BodyConfig } from '../config/movement';
import { isWalkableAt, type NavGrid } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import { type RngState, rngNext } from '../sim/rng';
import { type Vec3, vec3 } from '../sim/vec';
import { lineClear } from './perception';

const standingEye = vec3();
const crouchedEye = vec3();

export interface CoverSpot {
  position: Vec3;
  /** True if only crouching hides you here (you can stand up to shoot over it). */
  crouchOnly: boolean;
}

/**
 * Looks for a nearby spot hidden from `threatEye`: random walkable points within cfg.coverRadius of
 * `from`, keeping the closest that hides a crouched (preferably standing) player and doesn't mean
 * running towards the threat. Returns false if none of the candidates works.
 */
export function findCover(
  from: Vec3,
  threatEye: Vec3,
  nav: NavGrid,
  query: WorldQuery,
  cfg: BotConfig,
  body: BodyConfig,
  rng: RngState,
  out: CoverSpot,
): boolean {
  const threatDist = Math.hypot(threatEye.x - from.x, threatEye.z - from.z);
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cfg.coverCandidates; i++) {
    const angle = rngNext(rng) * Math.PI * 2;
    const r = cfg.coverMinRadius + rngNext(rng) * (cfg.coverRadius - cfg.coverMinRadius);
    const x = from.x + Math.cos(angle) * r;
    const z = from.z + Math.sin(angle) * r;
    if (!isWalkableAt(nav, x, z)) continue;
    // Don't pick cover that means running at the threat.
    const toThreat = Math.hypot(threatEye.x - x, threatEye.z - z);
    if (toThreat < Math.min(threatDist * cfg.coverTowardThreatFraction, threatDist - cfg.coverTowardThreatMetres)) continue;

    crouchedEye.x = standingEye.x = x;
    crouchedEye.z = standingEye.z = z;
    crouchedEye.y = from.y + body.crouchEyeHeight;
    standingEye.y = from.y + body.standEyeHeight;
    if (lineClear(query, threatEye, crouchedEye)) continue; // not cover at all
    const crouchOnly = lineClear(query, threatEye, standingEye);
    // Closest wins; crouch cover gets a small bonus.
    const score = r - (crouchOnly ? cfg.crouchCoverBonus : 0);
    if (score < bestScore) {
      bestScore = score;
      out.position.x = x;
      out.position.y = from.y;
      out.position.z = z;
      out.crouchOnly = crouchOnly;
    }
  }
  return Number.isFinite(bestScore);
}
