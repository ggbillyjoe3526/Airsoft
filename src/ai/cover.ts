import type { BotConfig } from '../config/bots';
import type { BodyConfig } from '../config/movement';
import type { MapBlock } from '../map/mapTypes';
import { isWalkableAt, type NavGrid } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import { type RngState, rngNext } from '../sim/rng';
import { type Vec3, vec3 } from '../sim/vec';
import { lineClear } from './perception';

const standingEye = vec3();
const crouchedEye = vec3();

/** A low block (footprint centre and half extents): hides a crouched player, a standing one sees over it. */
export interface LowCoverBlock {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
}

/**
 * The map's low cover: blocks standing on the floor (bottom within `floorGap` of y = 0) whose top is
 * above a crouched player's eyes but below a standing player's (crates, barriers, window sills).
 */
export function lowCoverBlocks(blocks: readonly MapBlock[], body: BodyConfig, floorGap: number): LowCoverBlock[] {
  const out: LowCoverBlock[] = [];
  for (const b of blocks) {
    if (b.kind === 'floor') continue;
    const bottom = b.center.y - b.size.y / 2;
    const top = b.center.y + b.size.y / 2;
    if (Math.abs(bottom) > floorGap || top <= body.crouchEyeHeight || top >= body.standEyeHeight) continue;
    out.push({ x: b.center.x, z: b.center.z, halfX: b.size.x / 2, halfZ: b.size.z / 2 });
  }
  return out;
}

export interface CoverSpot {
  position: Vec3;
  /** True if only crouching hides you here (you can stand up to shoot over it). */
  crouchOnly: boolean;
}

/**
 * Looks for a nearby spot hidden from `threatEye`: random walkable points within cfg.coverRadius of
 * `from`, plus the spot right behind each low block in reach (as seen from the threat; random points
 * rarely land in a crate's small shadow). Keeps the closest that hides a crouched (preferably
 * standing up to shoot over) player and doesn't mean running towards the threat. Returns false if
 * none of the candidates works.
 */
export function findCover(
  from: Vec3,
  threatEye: Vec3,
  nav: NavGrid,
  query: WorldQuery,
  cfg: BotConfig,
  body: BodyConfig,
  rng: RngState,
  lowCover: readonly LowCoverBlock[],
  out: CoverSpot,
): boolean {
  const threatDist = Math.hypot(threatEye.x - from.x, threatEye.z - from.z);
  let bestScore = Number.POSITIVE_INFINITY;
  const consider = (x: number, z: number): void => {
    if (!isWalkableAt(nav, x, z)) return;
    const r = Math.hypot(x - from.x, z - from.z);
    if (r > cfg.coverRadius) return;
    // Don't pick cover that means running at the threat.
    const toThreat = Math.hypot(threatEye.x - x, threatEye.z - z);
    if (toThreat < Math.min(threatDist * cfg.coverTowardThreatFraction, threatDist - cfg.coverTowardThreatMetres)) return;

    crouchedEye.x = standingEye.x = x;
    crouchedEye.z = standingEye.z = z;
    crouchedEye.y = from.y + body.crouchEyeHeight;
    standingEye.y = from.y + body.standEyeHeight;
    if (lineClear(query, threatEye, crouchedEye)) return; // not cover at all
    const crouchOnly = lineClear(query, threatEye, standingEye);
    // Closest wins; crouch cover (you can stand up and shoot back) gets a bonus.
    const score = r - (crouchOnly ? cfg.crouchCoverBonus : 0);
    if (score < bestScore) {
      bestScore = score;
      out.position.x = x;
      out.position.y = from.y;
      out.position.z = z;
      out.crouchOnly = crouchOnly;
    }
  };
  for (let i = 0; i < cfg.coverCandidates; i++) {
    const angle = rngNext(rng) * Math.PI * 2;
    const r = cfg.coverMinRadius + rngNext(rng) * (cfg.coverRadius - cfg.coverMinRadius);
    consider(from.x + Math.cos(angle) * r, from.z + Math.sin(angle) * r);
  }
  for (const b of lowCover) {
    // Behind the block from the threat: past its far edge (along the threat→block line) by the gap.
    const dx = b.x - threatEye.x;
    const dz = b.z - threatEye.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6 || Math.hypot(b.x - from.x, b.z - from.z) > cfg.coverRadius + cfg.lowCoverGap + Math.max(b.halfX, b.halfZ)) continue;
    const ux = dx / d;
    const uz = dz / d;
    const reach = Math.abs(ux) * b.halfX + Math.abs(uz) * b.halfZ + cfg.lowCoverGap;
    consider(b.x + ux * reach, b.z + uz * reach);
  }
  return Number.isFinite(bestScore);
}

/** True if a player crouched at `spot` (standing on its floor) is hidden from `threatEye`. */
export function hidesFrom(spot: Vec3, threatEye: Vec3, query: WorldQuery, body: BodyConfig): boolean {
  crouchedEye.x = spot.x;
  crouchedEye.y = spot.y + body.crouchEyeHeight;
  crouchedEye.z = spot.z;
  return !lineClear(query, threatEye, crouchedEye);
}
