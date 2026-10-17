import { AUDIO } from '../config/audio';
import { NOISE } from '../config/noise';
import { floorAt } from '../nav/navGrid';
import { shotHeardScale } from '../sim/armament';
import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import type { GameEvent } from '../sim/events';
import { rngNext } from '../sim/rng';
import { blockedShare } from '../sim/soundPath';
import type { GameState } from '../sim/state';
import { length3, type Vec3, vec3 } from '../sim/vec';
import { type Bot, type BotWorld, lastSeenAt } from './bot';
import { bodyPoint, eyeOf } from './perception';

/**
 * What the bots hear and feel of a tick (DX7, out of ai/botController.ts): gunfire, a teammate's hit call, footsteps,
 * noisy props (NP1), a case being opened, and BBs landing near them or ringing off them. `BotController.observe` hands
 * each of a tick's events to `hearEvent` after the tick; everything else it reads of the events stays there. Reads the
 * state and writes only the bots' memory of noises (`Bot.lastKnown`, `heardAt`, `heardOther`, `suppressedAt`, the trade).
 */

const chest = vec3();
const ear = vec3();
/** Where a hit call points to (AI-09). */
const callGuess = vec3();

/** The character with id `id` in `state`, if any. */
export function characterById(state: Readonly<GameState>, id: number): Character | undefined {
  for (const c of state.characters) if (c.id === id) return c;
  return undefined;
}

/** After a simulation tick: what the bots (`w.bots`) hear and feel of event `e`. Other events pass by. */
export function hearEvent(e: GameEvent, state: Readonly<GameState>, w: BotWorld): void {
  const time = state.time;
  const cfg = w.cfg;
  if (e.type === 'shot') {
    const shooter = characterById(state, e.characterId);
    // A silencer (M29b) shortens how far the shot carries.
    if (shooter) hear(w, shooter.team, e.position, shooter.position, time, shooter.position, cfg.hearingDistance * shotHeardScale(shooter), shooter.id);
  } else if (e.type === 'characterHit') {
    // Teammates near someone who calls a hit turn towards where it came from; not from a BB fired by someone hit
    // since (they are walking off, not where the threat is). A "HIT!" tells them which way the BB came, not how far
    // (AI-09): the guess is back along the BB's path from the victim, no further than gunfire carries.
    const victim = characterById(state, e.victimId);
    const shooter = characterById(state, e.shooterId);
    if (victim && shooter && isInPlay(shooter) && victim.team !== shooter.team) {
      const g = callGuess;
      const flat = Math.hypot(e.direction.x, e.direction.z);
      const back = Math.min(cfg.hearingDistance, Math.hypot(shooter.position.x - victim.position.x, shooter.position.z - victim.position.z));
      g.x = victim.position.x - (flat > 1e-6 ? (e.direction.x / flat) * back : 0);
      g.y = victim.position.y;
      g.z = victim.position.z - (flat > 1e-6 ? (e.direction.z / flat) * back : 0);
      hear(w, shooter.team, victim.position, victim.position, time, g, cfg.hearingDistance, shooter.id, undefined, true);
    }
  } else if (e.type === 'ricochetTick') {
    // A ricochet that doesn't count still tells its victim they're under fire, unless it was their own (SIM-07).
    if (e.victimId === e.shooterId) return;
    for (const b of w.bots) {
      if (b.character.id !== e.victimId) continue;
      b.suppressedAt = time;
      b.lastThreatAt = time;
    }
  } else if (e.type === 'footstep') {
    const walker = characterById(state, e.characterId);
    const range =
      e.kind === 'sprint'
        ? cfg.footstepHearingSprint
        : e.kind === 'vault'
          ? cfg.footstepHearingVault
          : e.kind === 'land'
            ? cfg.footstepHearingLand
            : e.kind === 'rattle'
              ? cfg.footstepHearingRattle
              : cfg.footstepHearingRun;
    // Steps on noisy ground carry further (NP1): gravel, steel plate.
    const carry = e.surface ? NOISE.ground[e.surface] : 1;
    if (walker && isInPlay(walker)) hear(w, walker.team, walker.position, walker.position, time, walker.position, range * carry, walker.id);
  } else if (e.type === 'propNoise') {
    // NP1: someone ran into a noisy prop, heard as far as the prop carries, from them; or a BB of theirs rang off one,
    // heard where it rang, and only by a bot with no fresher news (a look that never pulls one off a fight).
    const maker = characterById(state, e.characterId);
    if (maker && isInPlay(maker)) {
      if (e.shot) hear(w, maker.team, e.position, e.position, time, e.position, e.range, maker.id, undefined, false, true);
      else hear(w, maker.team, e.position, maker.position, time, maker.position, e.range, maker.id);
    }
  } else if (e.type === 'caseNoise') {
    // Extraction (M44): a case being opened carries as far as its kind's Heard m (data/pool.md Caches), walls muffling it.
    const opener = characterById(state, e.characterId);
    if (opener && isInPlay(opener)) hear(w, opener.team, e.position, opener.position, time, opener.position, e.range, opener.id);
  } else if (e.type === 'bbImpact') {
    // Only enemy fire suppresses: a bot's own BB (or a teammate's) landing near it is no threat.
    const shooter = characterById(state, e.ownerId);
    for (const b of w.bots) {
      if (shooter && shooter.team === b.character.team) continue;
      const p = bodyPoint(b.character, w.hits, cfg.aimHeightFraction, chest);
      if (length3(e.position.x - p.x, e.position.y - p.y, e.position.z - p.z) <= cfg.suppressionRadius) {
        b.suppressedAt = time;
        b.lastThreatAt = time;
        // A near miss gives away roughly where it came from, however far off the shot was (AI-04): the bot hears the
        // BB land by its own feet, so the range test always passes.
        if (shooter && isInPlay(shooter)) hear(w, shooter.team, b.character.position, shooter.position, time, shooter.position, Number.POSITIVE_INFINITY, shooter.id, b);
      }
    }
  }
}

/**
 * Bots not on `shooterTeam` within `range` of `heardAt` (gunfire, a hit call, footsteps, a near miss) learn roughly
 * where the source (character `sourceId`, at `shooterPos`) is; `only`: just that bot. The guess is off by up to
 * hearingError × distance and is kept while the noise keeps coming from about there (bursts and nearby shooters don't
 * make it jump). A bot fighting someone else keeps it aside for when that fight is over (AI-15); one already watching
 * the source learns nothing. Hearing is not sight: it never skips a bot's reaction when the shooter then appears. Walls
 * between the bot and whoever made the sound (standing at `sourceFeet`) shorten the range (wallHearing, M22).
 *
 * `call` marks a teammate's hit call, which a bot that heard it and plays as a team (M38) goes to trade (see
 * tradeTime). A teamPlay bot shares where it heard someone with its teamPlay teammates (M38). A `faint` noise (a BB
 * ringing off a prop, NP1) is heard only by a bot with nobody in sight and nothing seen or heard within
 * hearingContactTime, and isn't shared: it draws an idle bot's look, never one busy with real news.
 */
function hear(w: BotWorld, shooterTeam: number, heardAt: Vec3, sourceFeet: Vec3, time: number, shooterPos: Vec3, range: number, sourceId: number, only?: Bot, call = false, faint = false): void {
  const cfg = w.cfg;
  for (const b of w.bots) {
    if (only && b !== only) continue;
    const c = b.character;
    if (c.team === shooterTeam || !isInPlay(c) || (b.targetVisible && b.targetId === sourceId)) continue;
    if (faint && (b.targetVisible || time - Math.max(lastSeenAt(b), b.heardAt) < cfg.hearingContactTime)) continue;
    const heard = Math.hypot(heardAt.x - c.position.x, heardAt.z - c.position.z);
    if (heard > range) continue;
    // Within the range a wall leaves, nothing to check; beyond it, cast the rays.
    if (heard > range * cfg.wallHearing) {
      const share = blockedShare(w.query, eyeOf(c, w.body, w.hits, ear), sourceFeet, AUDIO.occlusion.rayHeights);
      if (heard > range * (1 - share * (1 - cfg.wallHearing))) continue;
    }
    const dist = Math.hypot(shooterPos.x - c.position.x, shooterPos.z - c.position.z);
    if (b.targetVisible) {
      // Busy with someone else: remember this one for later (a flanker), but keep fighting.
      guess(w, b, shooterPos, dist, b.heardOther);
      b.heardOtherAt = time;
      continue;
    }
    // Gunfire from within the current guess's margin of error (any shooter) is the same noise: keep
    // the guess. Only a clearly different source makes a new one; the guess never tracks anyone.
    const margin = dist * cfg.hearingError + cfg.replanDistance;
    const sameNoise = b.hasLastKnown && time - b.heardAt < cfg.hearingContactTime && Math.hypot(shooterPos.x - b.lastKnown.x, shooterPos.z - b.lastKnown.z) <= margin;
    if (!sameNoise) guess(w, b, shooterPos, dist, b.lastKnown);
    b.hasLastKnown = true;
    b.heardAt = time;
    b.lastThreatAt = time;
    if (!b.skill.teamPlay || faint) continue;
    if (call) {
      b.tradeAt = time;
      b.tradeTried = false;
    }
    shareHeard(w, b, time);
  }
}

/**
 * Teamplay (M38): bot `b` tells its teamPlay teammates where it heard someone, the bots' version of the player's
 * minimap patches. A teammate fighting, or with fresher news of its own, keeps its own; nobody trades on hearsay.
 */
function shareHeard(w: BotWorld, b: Bot, time: number): void {
  const cfg = w.cfg;
  for (const m of w.bots) {
    if (m === b || !m.skill.teamPlay || m.character.team !== b.character.team || !isInPlay(m.character) || m.targetVisible) continue;
    if (m.hasLastKnown && time - Math.max(lastSeenAt(m), m.heardAt) < cfg.hearingContactTime) continue;
    m.lastKnown.x = b.lastKnown.x;
    m.lastKnown.y = b.lastKnown.y;
    m.lastKnown.z = b.lastKnown.z;
    m.hasLastKnown = true;
    m.heardAt = time;
    m.lastThreatAt = time;
  }
}

/**
 * A heard guess of `source` (`dist` metres from bot `b`) into `out`: off by up to hearingError × dist, on the floor
 * there (another level's floor if the noise came from one; the bot's own height off the grid).
 */
function guess(w: BotWorld, b: Bot, source: Vec3, dist: number, out: Vec3): void {
  const angle = rngNext(b.rng) * Math.PI * 2;
  const off = Math.sqrt(rngNext(b.rng)) * dist * w.cfg.hearingError;
  out.x = source.x + Math.cos(angle) * off;
  out.z = source.z + Math.sin(angle) * off;
  const floor = floorAt(w.nav, out.x, source.y, out.z);
  out.y = Number.isNaN(floor) ? b.character.position.y : floor;
}
