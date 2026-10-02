import type { BallisticsConfig } from '../config/ballistics';
import type { HitConfig } from '../config/hits';
import type { WorldQuery } from './armament';
import { type BB, type BBPool, stepBBFlight } from './ballistics';
import type { Character } from './character';
import { type EliminationContext, eliminate, isInPlay } from './elimination';
import type { GameEvent } from './events';
import { characterHitVolume, createHitVolume, rayCharacter } from './hitbox';
import { copy, vec3 } from './vec';

const segmentDir = vec3();
const volume = createHitVolume();

/** Who BBs can hit this tick, and what happens to them. */
export interface BBTargets {
  characters: Character[];
  hits: HitConfig;
  elimination: EliminationContext;
}

/** The first character in play along the BB's segment this tick (before `maxT`), or undefined. */
function firstCharacterHit(bb: BB, len: number, maxT: number, t: BBTargets): { victim: Character; at: number } | undefined {
  let ownerTeam = -1;
  for (const c of t.characters) if (c.id === bb.ownerId) ownerTeam = c.team;
  let victim: Character | undefined;
  let best = Math.min(len, maxT);
  for (const c of t.characters) {
    if (c.id === bb.ownerId || !isInPlay(c)) continue;
    if (!t.hits.friendlyFire && c.team === ownerTeam) continue;
    characterHitVolume(c, t.hits, volume);
    const d = rayCharacter(bb.prevPosition, segmentDir, best, volume);
    if (d >= 0 && d <= best) {
      best = d;
      victim = c;
    }
  }
  return victim ? { victim, at: best } : undefined;
}

/**
 * Moves every BB in flight one tick and stops it at whatever its path crosses first this tick: a level
 * surface (bbImpact event) or a character in play (characterHit event; the character is eliminated).
 * BBs that fall out of the world or get too old just vanish. A BB never hits whoever fired it, nor
 * anyone already hit.
 */
export function stepBBs(
  pool: BBPool,
  cfg: BallisticsConfig,
  query: WorldQuery,
  killY: number,
  events: GameEvent[],
  dt: number,
  targets?: BBTargets,
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
      const hit = targets ? firstCharacterHit(bb, len, t >= 0 ? t : len, targets) : undefined;
      if (hit) {
        bb.position.x = bb.prevPosition.x + segmentDir.x * hit.at;
        bb.position.y = bb.prevPosition.y + segmentDir.y * hit.at;
        bb.position.z = bb.prevPosition.z + segmentDir.z * hit.at;
        bb.active = false;
        eliminate(hit.victim, bb.ownerId, targets!.characters, targets!.elimination);
        events.push({
          type: 'characterHit',
          victimId: hit.victim.id,
          shooterId: bb.ownerId,
          position: vec3(bb.position.x, bb.position.y, bb.position.z),
          direction: vec3(segmentDir.x, segmentDir.y, segmentDir.z),
        });
        continue;
      }
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
