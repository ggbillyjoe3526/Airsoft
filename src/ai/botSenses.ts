import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import { vec3, wrapAngle } from '../sim/vec';
import { type Bot, type BotWorld, type Contact, forgetTarget, lastSeenAt, pick, recallHeardOther } from './bot';
import { freshAimError, lookAngles } from './aim';
import { bodyPoint, eyeOf, visiblePart } from './perception';

const DEG = Math.PI / 180;
// Scratch for aimedAt (used only within one call).
const eye = vec3();
const seen = vec3();
const look = { yaw: 0, pitch: 0 };

/**
 * Updates what the bot sees: the closest enemy in sight becomes its target. Someone not seen within
 * contactGrace is a new contact: the reaction delay and aim settling start over. Switching back to
 * someone seen moments ago is not (each enemy is remembered separately). Hearing never counts as contact.
 */
export function perceive(b: Bot, w: BotWorld): void {
  const me = b.character;
  const cfg = w.cfg;
  let best: Character | undefined;
  let bestPart = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (const other of w.characters) {
    if (other.team === me.team || !isInPlay(other)) continue;
    const d = Math.hypot(other.position.x - me.position.x, other.position.z - me.position.z);
    if (d >= bestD) continue;
    const part = visiblePart(me, other, w.query, cfg, w.body, w.hits, w.sight);
    if (part > 0) {
      best = other;
      bestPart = part;
      bestD = d;
    }
  }
  // Stay on the current target while it's in sight, unless someone else is clearly closer.
  if (best && best.id !== b.targetId && b.targetId >= 0) {
    for (const cur of w.characters) {
      if (cur.id !== b.targetId || !isInPlay(cur)) continue;
      const d = Math.hypot(cur.position.x - me.position.x, cur.position.z - me.position.z);
      if (d - bestD >= cfg.targetSwitchMargin) break;
      const part = visiblePart(me, cur, w.query, cfg, w.body, w.hits, w.sight);
      if (part > 0) {
        best = cur;
        bestPart = part;
        bestD = d;
      }
    }
  }
  if (!best) {
    b.targetVisible = false;
    return;
  }
  const contact = contactFor(b, best.id);
  if (w.time - contact.seenAt > cfg.contactGrace) {
    // Someone stepping out where the bot already aims (a held angle, M37) is answered sooner and with a steadier aim.
    const preAimed = aimedAt(b, w, best, bestPart);
    contact.reactAt = w.time + pick(b.rng, preAimed ? b.skill.preAimReactionTime : b.skill.reactionTime);
    contact.acquiredAt = w.time - (preAimed ? b.skill.preAimSettled * b.skill.aimSettleTime : 0);
    contact.firstSeenAt = w.time;
    contact.held = b.skill.holdsAngles && b.holding && preAimed;
    freshAimError(b.aim, cfg, b.rng, true);
  } else if (contact !== b.contact) {
    // Back on someone seen moments ago: no new reaction delay, but the aim error is this target's, not the last one's.
    freshAimError(b.aim, cfg, b.rng);
  }
  if (contact !== b.contact) {
    b.burstLeft = 0;
    b.pauseLeft = 0;
  }
  contact.seenAt = w.time;
  b.contact = contact;
  b.targetId = best.id;
  b.targetVisible = true;
  b.targetPart = bestPart;
  b.lastThreatAt = w.time;
  b.lastKnown.x = best.position.x;
  b.lastKnown.y = best.position.y;
  b.lastKnown.z = best.position.z;
  b.hasLastKnown = true;
}

/** True if the bot's view already points within preAimConeDeg of the part of `target` it sees. */
function aimedAt(b: Bot, w: BotWorld, target: Character, part: number): boolean {
  eyeOf(b.character, w.body, w.hits, eye);
  bodyPoint(target, w.hits, part, seen);
  lookAngles(eye.x, eye.y, eye.z, seen.x, seen.y, seen.z, look);
  return Math.hypot(wrapAngle(look.yaw - b.aim.yaw), look.pitch - b.aim.pitch) <= w.cfg.preAimConeDeg * DEG;
}

/** The bot's record of enemy `id` (created on first sight, then reused for the rest of the match). */
function contactFor(b: Bot, id: number): Contact {
  let c = b.contacts.get(id);
  if (!c) {
    c = { seenAt: Number.NEGATIVE_INFINITY, acquiredAt: 0, firstSeenAt: Number.NEGATIVE_INFINITY, held: false, reactAt: 0 };
    b.contacts.set(id, c);
  }
  return c;
}

/** The current target if it's still in play and hasn't been forgotten. */
export function currentTarget(b: Bot, w: BotWorld): Character | undefined {
  if (b.targetId < 0) return undefined;
  if (w.time - lastSeenAt(b) > w.cfg.memoryTime) {
    forgetTarget(b);
    return undefined;
  }
  for (const c of w.characters) {
    if (c.id !== b.targetId) continue;
    if (isInPlay(c)) return c;
    // They're out: nothing left to hunt there, but another enemy heard during the fight is worth a look.
    forgetTarget(b);
    b.hasLastKnown = false;
    recallHeardOther(b, w.time, w.cfg);
    return undefined;
  }
  return undefined;
}

/** True once the bot has reacted to its current (visible) target and may fire. */
export function hasReacted(b: Bot, w: BotWorld): boolean {
  return b.targetVisible && b.contact !== undefined && w.time >= b.contact.reactAt;
}
