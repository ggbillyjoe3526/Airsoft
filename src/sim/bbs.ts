import type { BallisticsConfig } from '../config/ballistics';
import type { HitConfig } from '../config/hits';
import { firstLeaves, type LeafCrossing } from '../map/foliage';
import type { SurfaceHit, WorldQuery } from './armament';
import { airModel } from './air';
import { type BB, type BBPool, stepFlight } from './ballistics';
import type { Character } from './character';
import { type EliminationContext, eliminate, isInPlay } from './elimination';
import type { GameEvent } from './events';
import { characterHitVolume, createHitVolume, type HitVolume, rayCharacter } from './hitbox';
import { deflectInLeaves } from './leaves';
import { type PropNoiseContext, ringProp } from './propNoise';
import { firstRangeTargetHit, hitRangeTarget, type RangeTarget, type RangeTargetHit } from './rangeTargets';
import { ricochet } from './ricochet';
import type { RngState } from './rng';
import { copy, length3, type Vec3, vec3 } from './vec';

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
/** Where this tick's segment of a BB runs through a bush (firstLeaves); reused. */
const crossing: LeafCrossing = { enter: 0, exit: 0, through: false };

/** Who BBs can hit this tick, and what happens to them. */
export interface BBTargets {
  characters: Character[];
  hits: HitConfig;
  elimination: EliminationContext;
  /** Practice range targets (M21; none in a match). */
  rangeTargets?: RangeTarget[];
  /**
   * The round is decided (a cease-fire, as after the end whistle at a site): BBs still in the air stop on whoever they
   * reach, as on a wall, and knock nobody out. Range targets are left alone.
   */
  ceaseFire?: boolean;
}

/** Builds this tick's hit volumes and team lookup (see `volumes`). */
function prepareTargets(t: BBTargets): void {
  const characters = t.characters;
  while (volumes.length < characters.length) volumes.push(createHitVolume());
  for (let i = 0; i < characters.length; i++) {
    const c = characters[i]!;
    teamOf.set(c.id, c.team);
    characterHitVolume(c, t.hits, volumes[i]!);
  }
}

/** The body a BB reached this tick (firstBody): who, and how far along the segment; reused, so a hit allocates nothing. */
const reached: { body: Character | undefined; at: number } = { body: undefined, at: 0 };

/**
 * The first body along the BB's segment this tick (before `maxT`), into `reached` (body undefined if none). Needs
 * prepareTargets first. Every body on the field stops a BB (M85, the owner's playtest note 17): someone in play, and
 * also someone already hit (calling, walking off, leaving, out), a teammate when friendly fire is off, and everyone in
 * a cease-fire; whether the body is knocked out is the caller's (knocksOut). Only a Ghost (Dev settings, M24) lets BBs
 * through. The shooter is skipped only until the BB first bounces (its first segment starts at their eye, inside
 * them): a ricochet can come back and hit them (audit SIM-07), under the same rules as anyone on their team.
 */
function firstBody(bb: BB, len: number, maxT: number, t: BBTargets): void {
  reached.body = undefined;
  let best = Math.min(len, maxT);
  const characters = t.characters;
  for (let i = 0; i < characters.length; i++) {
    const c = characters[i]!;
    if ((c.id === bb.ownerId && bb.bounces === 0) || c.ghost) continue;
    const d = rayCharacter(bb.prevPosition, segmentDir, best, volumes[i]!);
    if (d >= 0 && d <= best) {
      best = d;
      reached.body = c;
    }
  }
  reached.at = best;
}

/**
 * Whether a BB from `ownerId` that reaches `body` knocks it out (or, as a ricochet that doesn't count, ticks it): only a
 * body in play, outside a cease-fire, and not on the shooter's own team when friendly fire is off. Any other body just
 * stops the BB.
 */
function knocksOut(body: Character, ownerId: number, t: BBTargets): boolean {
  if (t.ceaseFire || !isInPlay(body)) return false;
  return t.hits.friendlyFire || body.team !== (teamOf.get(ownerId) ?? -1);
}

/**
 * Moves every BB in flight one tick and stops it at whatever its path crosses first this tick: a body (firstBody), a
 * bush's leaves once it has pushed through stopDepth of them (bbImpact event with `leaves`, Dev 6 item 44), or a level
 * surface (bbImpact event), where a hard surface bounces it off instead (a ricochet, M20; it flies on from there next
 * tick). A BB that comes out of a bush having crossed less flies on from where it came out, slowed and thrown off its
 * line (bbLeaves event, sim/leaves.ts); as with a bounce, the rest of that tick's travel is dropped. A body in play is knocked out (characterHit event; knocksOut says who can be); any other body (already
 * hit, a teammate with friendly fire off, anyone in a cease-fire) stops the BB as a wall would (bbImpact event), so a BB
 * never goes on through someone to whoever is behind (M85). A ricochet only knocks someone out when the match counts
 * ricochets (HitConfig.ricochetsCount); otherwise it ticks them and stops (ricochetTick event), and they play on. On the
 * practice range a BB also stops at the first target it reaches (targetHit event, M21). BBs that fall out of the world
 * or get too old are removed (bbLost event). A BB never hits whoever fired it until it has bounced. `rng` scatters
 * bounces (the simulation's seeded stream); `wind` (m/s) drifts every BB (M30). With `noise` (NP1), a BB that lands hard
 * on a prop that rings (a skip, a container) rings it (sim/propNoise.ts ringProp).
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
  noise?: PropNoiseContext,
): void {
  let prepared = false;
  const air = airModel(cfg);
  const leaves = query.foliage;
  for (const bb of pool.bbs) {
    if (!bb.active) continue;
    copy(bb.prevPosition, bb.position);
    stepFlight(bb, air, dt, wind);

    const dx = bb.position.x - bb.prevPosition.x;
    const dy = bb.position.y - bb.prevPosition.y;
    const dz = bb.position.z - bb.prevPosition.z;
    const len = length3(dx, dy, dz);
    if (len > 1e-9) {
      segmentDir.x = dx / len;
      segmentDir.y = dy / len;
      segmentDir.z = dz / len;
      const t = query.raycastSurface ? query.raycastSurface(bb.prevPosition, segmentDir, len, surface) : query.raycastStatic(bb.prevPosition, segmentDir, len);
      // Leaves before the surface (Dev 6 item 44): where the BB stops in them, or comes out of them, ends its path here;
      // a path that ends still among them (`inLeaves` m of them crossed) flies on through them next tick.
      let leafEnd = -1;
      let leafStop = false;
      let inLeaves = 0;
      if (leaves && leaves.length > 0 && firstLeaves(leaves, bb.prevPosition, segmentDir, t >= 0 ? t : len, crossing)) {
        const left = Math.max(0, cfg.leaves.stopDepth - bb.leaf);
        leafStop = crossing.exit - crossing.enter >= left;
        if (leafStop) leafEnd = crossing.enter + left;
        else if (crossing.through) leafEnd = crossing.exit;
        else inLeaves = crossing.exit - crossing.enter;
      }
      const clear = leafEnd >= 0 ? leafEnd : t >= 0 ? t : len;
      if (targets && !prepared) {
        prepareTargets(targets);
        prepared = true;
      }
      if (targets) firstBody(bb, len, clear, targets);
      const hit = targets ? reached.body : undefined;
      if (targets?.rangeTargets && targets.rangeTargets.length > 0 && !targets.ceaseFire) {
        firstRangeTargetHit(bb.prevPosition, segmentDir, hit ? reached.at : clear, targets.rangeTargets, targets.hits, targetHit);
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
          hitRangeTarget(target, rng);
          events.push({ type: 'targetHit', targetId: target.id, kind: target.kind, shooterId: bb.ownerId, position: vec3(bb.position.x, bb.position.y, bb.position.z), ricochet: bb.bounces > 0 });
          continue;
        }
      }
      if (hit) {
        // The BB stops on the body, whatever happens to its owner (M85: it never travels on, nor bounces off a body).
        bb.position.x = bb.prevPosition.x + segmentDir.x * reached.at;
        bb.position.y = bb.prevPosition.y + segmentDir.y * reached.at;
        bb.position.z = bb.prevPosition.z + segmentDir.z * reached.at;
        bb.active = false;
        const position = vec3(bb.position.x, bb.position.y, bb.position.z);
        // Someone already hit, a teammate with friendly fire off, or a cease-fire: it stops there with no hit, as on a wall.
        if (!knocksOut(hit, bb.ownerId, targets!)) {
          events.push({ type: 'bbImpact', position, ownerId: bb.ownerId, bodyId: hit.id });
          continue;
        }
        const direction = vec3(segmentDir.x, segmentDir.y, segmentDir.z);
        const ricocheted = bb.bounces > 0;
        if (ricocheted && !targets!.hits.ricochetsCount) {
          events.push({ type: 'ricochetTick', victimId: hit.id, shooterId: bb.ownerId, position, direction });
          continue;
        }
        // Extraction's insertion grace (Audit 2, SIM-03): a BB on, or from, a squad member just in stops with no hit.
        if (hit.grace > 0 || inGrace(targets!.characters, bb.ownerId)) {
          events.push({ type: 'bbImpact', position, ownerId: bb.ownerId, bodyId: hit.id });
          continue;
        }
        eliminate(hit, bb.ownerId, targets!.characters, targets!.elimination);
        events.push({ type: 'characterHit', victimId: hit.id, shooterId: bb.ownerId, position, direction, ricochet: ricocheted });
        continue;
      }
      if (leafEnd >= 0) {
        bb.position.x = bb.prevPosition.x + segmentDir.x * leafEnd;
        bb.position.y = bb.prevPosition.y + segmentDir.y * leafEnd;
        bb.position.z = bb.prevPosition.z + segmentDir.z * leafEnd;
        const depth = leafEnd - crossing.enter;
        bb.leaf += depth;
        if (leafStop) {
          bb.active = false;
          events.push({ type: 'bbImpact', position: vec3(bb.position.x, bb.position.y, bb.position.z), ownerId: bb.ownerId, leaves: true, from: bouncedFrom(bb) });
          continue;
        }
        // Out of the bush (through its edge, or the last of a crossing that took more than a tick): it flies on from here
        // next tick, slowed and off its line.
        deflectInLeaves(bb, depth, cfg.leaves, rng);
        events.push({ type: 'bbLeaves', position: vec3(bb.position.x, bb.position.y, bb.position.z), ownerId: bb.ownerId, from: bouncedFrom(bb) });
        continue;
      }
      if (t >= 0) {
        bb.position.x = bb.prevPosition.x + segmentDir.x * t;
        bb.position.y = bb.prevPosition.y + segmentDir.y * t;
        bb.position.z = bb.prevPosition.z + segmentDir.z * t;
        if (inLeaves > 0) {
          // It met the surface still among the leaves: what it crossed on the way counts, and slows it before it lands
          // (KI1). Not turned: the line it met the surface on is the one already traced.
          bb.leaf += inLeaves;
          deflectInLeaves(bb, inLeaves, cfg.leaves);
        }
        events.push({ type: 'bbImpact', position: vec3(bb.position.x, bb.position.y, bb.position.z), ownerId: bb.ownerId, from: bouncedFrom(bb) });
        if (noise) ringProp(bb.position, length3(bb.velocity.x, bb.velocity.y, bb.velocity.z), bb.ownerId, noise);
        // A bounce flies on from the surface next tick: the rest of this tick's travel is dropped, so a ricochet
        // arrives at most one tick (1/60 s) late, which nobody can see at these speeds.
        if (query.raycastSurface && ricochet(bb, surface, cfg.ricochet, rng)) continue;
        bb.active = false;
        continue;
      }
      if (inLeaves > 0) {
        // Still among the leaves at the end of its path: it pushes on through them, slowed and turned by what it crossed.
        bb.leaf += inLeaves;
        deflectInLeaves(bb, inLeaves, cfg.leaves, rng);
      }
    }
    if (bb.age > cfg.maxLifetime || bb.position.y < killY) {
      bb.active = false;
      events.push({ type: 'bbLost', position: vec3(bb.position.x, bb.position.y, bb.position.z), ownerId: bb.ownerId });
    }
  }
}

/**
 * Where a BB that has bounced came from this tick (its path's start), for its impact's grit and leaves to fly back
 * towards (KI2); undefined before a bounce, when that side is its shooter's. Allocates only for a bounced BB's impact.
 */
function bouncedFrom(bb: BB): Vec3 | undefined {
  return bb.bounces > 0 ? vec3(bb.prevPosition.x, bb.prevPosition.y, bb.prevPosition.z) : undefined;
}

/** Whether the character with `id` (a BB's owner) is in its insertion grace. */
function inGrace(characters: readonly Character[], id: number): boolean {
  for (const c of characters) if (c.id === id) return c.grace > 0;
  return false;
}
