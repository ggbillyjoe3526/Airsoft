import type { BallisticsConfig } from '../config/ballistics';
import type { HitConfig } from '../config/hits';
import type { SurfaceHit, WorldQuery } from './armament';
import { airModel } from './air';
import { type BB, type BBPool, stepFlight } from './ballistics';
import type { Character } from './character';
import { type EliminationContext, eliminate, isInPlay } from './elimination';
import type { GameEvent } from './events';
import { characterHitVolume, createHitVolume, type HitVolume, rayCharacter } from './hitbox';
import { firstRangeTargetHit, hitRangeTarget, type RangeTarget, type RangeTargetHit } from './rangeTargets';
import { ricochet } from './ricochet';
import type { RngState } from './rng';
import { copy, type Vec3, vec3 } from './vec';

const segmentDir = vec3();
/**
 * This tick's hit volume of each character in play, by index in BBTargets.characters, and every character's team by
 * id: characters don't move while BBs fly, so they're built once per tick (prepareTargets), not once per BB. Grown
 * to the roster's size once, then reused.
 */
const volumes: HitVolume[] = [];
// Never cleared, only overwritten: a BB's owner is always in the roster (characters are never removed mid-match), so
// a stale entry can't be read.
const teamOf = new Map<number, number>();
const surface: SurfaceHit = { normal: vec3(), material: 'concrete' };
const targetHit: RangeTargetHit = { index: -1, at: 0, post: false };

/** Who BBs can hit this tick, and what happens to them. */
export interface BBTargets {
  characters: Character[];
  hits: HitConfig;
  elimination: EliminationContext;
  /** Practice range targets (M21; none in a match). */
  rangeTargets?: RangeTarget[];
}

/** Builds this tick's hit volumes and team lookup (see `volumes`). */
function prepareTargets(t: BBTargets): void {
  const characters = t.characters;
  while (volumes.length < characters.length) volumes.push(createHitVolume());
  for (let i = 0; i < characters.length; i++) {
    const c = characters[i]!;
    teamOf.set(c.id, c.team);
    if (isInPlay(c)) characterHitVolume(c, t.hits, volumes[i]!);
  }
}

/**
 * The first character in play along the BB's segment this tick (before `maxT`), or undefined. Needs prepareTargets
 * first. A character hit earlier in the tick is out of play, so no later BB hits it.
 */
function firstCharacterHit(bb: BB, len: number, maxT: number, t: BBTargets): { victim: Character; at: number } | undefined {
  const ownerTeam = teamOf.get(bb.ownerId) ?? -1;
  let victim: Character | undefined;
  let best = Math.min(len, maxT);
  const characters = t.characters;
  for (let i = 0; i < characters.length; i++) {
    const c = characters[i]!;
    if (c.id === bb.ownerId || c.ghost || !isInPlay(c)) continue;
    if (!t.hits.friendlyFire && c.team === ownerTeam) continue;
    const d = rayCharacter(bb.prevPosition, segmentDir, best, volumes[i]!);
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
 * out of the world or get too old are removed (bbLost event). A BB never hits whoever fired it, nor anyone
 * already hit. `rng` scatters bounces (the simulation's seeded stream); `wind` (m/s) drifts every BB (M30).
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
  wind?: Readonly<Vec3>,
): void {
  let prepared = false;
  const air = airModel(cfg);
  for (const bb of pool.bbs) {
    if (!bb.active) continue;
    copy(bb.prevPosition, bb.position);
    stepFlight(bb, air, dt, wind);

    const dx = bb.position.x - bb.prevPosition.x;
    const dy = bb.position.y - bb.prevPosition.y;
    const dz = bb.position.z - bb.prevPosition.z;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-9) {
      segmentDir.x = dx / len;
      segmentDir.y = dy / len;
      segmentDir.z = dz / len;
      const t = query.raycastSurface ? query.raycastSurface(bb.prevPosition, segmentDir, len, surface) : query.raycastStatic(bb.prevPosition, segmentDir, len);
      if (targets && !prepared) {
        prepareTargets(targets);
        prepared = true;
      }
      const hit = targets ? firstCharacterHit(bb, len, t >= 0 ? t : len, targets) : undefined;
      if (targets?.rangeTargets && targets.rangeTargets.length > 0) {
        firstRangeTargetHit(bb.prevPosition, segmentDir, hit ? hit.at : t >= 0 ? t : len, targets.rangeTargets, targets.hits, targetHit);
        if (targetHit.index >= 0) {
          const target = targets.rangeTargets[targetHit.index]!;
          bb.position.x = bb.prevPosition.x + segmentDir.x * targetHit.at;
          bb.position.y = bb.prevPosition.y + segmentDir.y * targetHit.at;
          bb.position.z = bb.prevPosition.z + segmentDir.z * targetHit.at;
          bb.active = false;
          if (targetHit.post) {
            // A plate's post: the BB stops on it, as on a wall (a miss where it stopped).
            events.push({ type: 'bbImpact', position: vec3(bb.position.x, bb.position.y, bb.position.z), ownerId: bb.ownerId });
            continue;
          }
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
    if (bb.age > cfg.maxLifetime || bb.position.y < killY) {
      bb.active = false;
      events.push({ type: 'bbLost', position: vec3(bb.position.x, bb.position.y, bb.position.z), ownerId: bb.ownerId });
    }
  }
}
