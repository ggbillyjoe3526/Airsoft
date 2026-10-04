import type { BallisticsConfig } from '../config/ballistics';
import type { HitConfig } from '../config/hits';
import type { SurfaceHit, WorldQuery } from './armament';
import { type BB, type BBPool, stepBBFlight } from './ballistics';
import type { Character } from './character';
import { type EliminationContext, eliminate, isInPlay } from './elimination';
import type { GameEvent } from './events';
import { characterHitVolume, createHitVolume, rayCharacter } from './hitbox';
import { firstRangeTargetHit, hitRangeTarget, type RangeTarget } from './rangeTargets';
import { ricochet } from './ricochet';
import type { RngState } from './rng';
import { copy, vec3 } from './vec';

const segmentDir = vec3();
const volume = createHitVolume();
const surface: SurfaceHit = { normal: vec3(), material: 'concrete' };
const targetHit = { index: -1, at: 0 };

/** Who BBs can hit this tick, and what happens to them. */
export interface BBTargets {
  characters: Character[];
  hits: HitConfig;
  elimination: EliminationContext;
  /** Practice range targets (M21; none in a match). */
  rangeTargets?: RangeTarget[];
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
 * Moves every BB in flight one tick and stops it at whatever its path crosses first this tick: a character in play
 * (characterHit event; the character is eliminated) or a level surface (bbImpact event), where a hard surface bounces
 * it off instead (a ricochet, M20; it flies on from there next tick). A ricochet only knocks someone out when the
 * match counts ricochets (HitConfig.ricochetsCount); otherwise it ticks them and stops (ricochetTick event), and they
 * play on. On the practice range a BB also stops at the first target it reaches (targetHit event, M21). BBs that fall
 * out of the world or get too old just vanish. A BB never hits whoever fired it, nor anyone
 * already hit. `rng` scatters bounces (the simulation's seeded stream).
 */
export function stepBBs(
  pool: BBPool,
  cfg: BallisticsConfig,
  query: WorldQuery,
  killY: number,
  events: GameEvent[],
  dt: number,
  targets?: BBTargets,
  rng?: RngState,
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
      const t = query.raycastSurface ? query.raycastSurface(bb.prevPosition, segmentDir, len, surface) : query.raycastStatic(bb.prevPosition, segmentDir, len);
      const hit = targets ? firstCharacterHit(bb, len, t >= 0 ? t : len, targets) : undefined;
      if (targets?.rangeTargets && targets.rangeTargets.length > 0) {
        firstRangeTargetHit(bb.prevPosition, segmentDir, hit ? hit.at : t >= 0 ? t : len, targets.rangeTargets, targets.hits, targetHit);
        if (targetHit.index >= 0) {
          const target = targets.rangeTargets[targetHit.index]!;
          bb.position.x = bb.prevPosition.x + segmentDir.x * targetHit.at;
          bb.position.y = bb.prevPosition.y + segmentDir.y * targetHit.at;
          bb.position.z = bb.prevPosition.z + segmentDir.z * targetHit.at;
          bb.active = false;
          hitRangeTarget(target);
          events.push({ type: 'targetHit', targetId: target.id, kind: target.kind, shooterId: bb.ownerId, position: vec3(bb.position.x, bb.position.y, bb.position.z), ricochet: bb.bounces > 0 });
          continue;
        }
      }
      if (hit) {
        bb.position.x = bb.prevPosition.x + segmentDir.x * hit.at;
        bb.position.y = bb.prevPosition.y + segmentDir.y * hit.at;
        bb.position.z = bb.prevPosition.z + segmentDir.z * hit.at;
        bb.active = false;
        const position = vec3(bb.position.x, bb.position.y, bb.position.z);
        const direction = vec3(segmentDir.x, segmentDir.y, segmentDir.z);
        const ricocheted = bb.bounces > 0;
        if (ricocheted && !targets!.hits.ricochetsCount) {
          events.push({ type: 'ricochetTick', victimId: hit.victim.id, shooterId: bb.ownerId, position, direction });
          continue;
        }
        eliminate(hit.victim, bb.ownerId, targets!.characters, targets!.elimination);
        events.push({ type: 'characterHit', victimId: hit.victim.id, shooterId: bb.ownerId, position, direction, ricochet: ricocheted });
        continue;
      }
      if (t >= 0) {
        bb.position.x = bb.prevPosition.x + segmentDir.x * t;
        bb.position.y = bb.prevPosition.y + segmentDir.y * t;
        bb.position.z = bb.prevPosition.z + segmentDir.z * t;
        events.push({ type: 'bbImpact', position: vec3(bb.position.x, bb.position.y, bb.position.z), ownerId: bb.ownerId });
        // A bounce flies on from the surface next tick: the rest of this tick's travel is dropped, so a ricochet
        // arrives at most one tick (1/60 s) late, which nobody can see at these speeds.
        if (query.raycastSurface && ricochet(bb, surface, cfg.ricochet, rng)) continue;
        bb.active = false;
        continue;
      }
    }
    if (bb.age > cfg.maxLifetime || bb.position.y < killY) bb.active = false;
  }
}
