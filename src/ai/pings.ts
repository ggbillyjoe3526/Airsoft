import type { BotBehaviour } from '../config/bots';
import { PINGS } from '../config/pings';
import { nearestWalkable, nodeX, nodeZ } from '../nav/navGrid';
import { aimDirection } from '../sim/armament';
import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import { copy, type Vec3, vec3 } from '../sim/vec';
import type { Bot, BotWorld } from './bot';
import { startSearch } from './botMovement';
import { bodyPoint, eyeOf, visiblePart } from './perception';

/**
 * Pings (PG1): a player marks where they look for their team, and the bot teammates take the spot as somewhere worth a
 * look, as each one's personality plays a noise there (BotController.ping). What the marker shows is the presentation's
 * (ui/pingMarkers.ts); what the bots answer is the callouts' (ai/callouts.ts).
 */

/** What a ping marks: a spot on the field, or an enemy seen there (a contact). */
export type PingKind = 'spot' | 'enemy';

export interface Ping {
  kind: PingKind;
  /** Where the marker goes: the point the view met, or the enemy's chest. */
  point: Vec3;
  /** The floor spot the bots go to or watch: the nearest walkable one to the point, or the enemy's feet. */
  spot: Vec3;
  /** The enemy pinged (character id), or -1. */
  enemyId: number;
}

export function createPing(): Ping {
  return { kind: 'spot', point: vec3(), spot: vec3(), enemyId: -1 };
}

// Scratch, each used only within one call.
const eye = vec3();
const dir = vec3();
const part = vec3();

/** The bots' sight rules (`cfg`) for a player's eyes, as far as a ping reaches: what aimPing judges a contact by. */
export function pingSight(cfg: BotBehaviour): BotBehaviour {
  return { ...cfg, viewDistance: PINGS.range };
}

/**
 * Where `leader`'s view (`yaw`, `pitch`: what their screen shows) points, into `out`; false if it meets nothing within
 * PINGS.range. An enemy in play under the crosshair, nearer than what the view meets behind them and seen by the bots'
 * sight rules from the leader's eyes (`sight`, pingSight: so not one hidden in a bush or in the dark), makes it a
 * contact.
 */
export function aimPing(leader: Character, yaw: number, pitch: number, w: BotWorld, sight: BotBehaviour, out: Ping): boolean {
  eyeOf(leader, w.body, w.hits, eye);
  aimDirection(dir, yaw, pitch);
  const hit = w.query.raycastStatic(eye, dir, PINGS.range);
  const enemy = enemyUnderView(leader, hit < 0 ? PINGS.range : hit, w, sight);
  if (enemy) {
    out.kind = 'enemy';
    out.enemyId = enemy.id;
    bodyPoint(enemy, w.hits, w.cfg.aimHeightFraction, out.point);
    copy(out.spot, enemy.position);
    return true;
  }
  if (hit < 0) return false;
  out.kind = 'spot';
  out.enemyId = -1;
  out.point.x = eye.x + dir.x * hit;
  out.point.y = eye.y + dir.y * hit;
  out.point.z = eye.z + dir.z * hit;
  // The floor in front of what the view met (a wall, a crate's side, a window), on the level the view reached.
  const back = Math.min(PINGS.backOff, hit);
  const x = out.point.x - dir.x * back;
  const y = out.point.y - dir.y * back;
  const z = out.point.z - dir.z * back;
  const k = nearestWalkable(w.nav, x, y, z, PINGS.spotSnap);
  if (k >= 0) {
    out.spot.x = nodeX(w.nav, k);
    out.spot.y = w.nav.floorY[k]!;
    out.spot.z = nodeZ(w.nav, k);
  } else {
    copy(out.spot, out.point);
  }
  return true;
}

/**
 * The enemy in play nearest the line of `leader`'s view (`dir` from `eye`, set by aimPing) within `reach` metres: one
 * whose chest or head the line passes within PINGS.enemyConeDeg of (or PINGS.enemyReach metres, up close), and that
 * the bots' sight rules let the leader see. Undefined if none.
 */
function enemyUnderView(leader: Character, reach: number, w: BotWorld, sight: BotBehaviour): Character | undefined {
  const cone = Math.tan((PINGS.enemyConeDeg * Math.PI) / 180);
  let best: Character | undefined;
  let bestOff = Number.POSITIVE_INFINITY;
  for (const c of w.characters) {
    if (c.team === leader.team || !isInPlay(c)) continue;
    // How far off the line the nearer of their chest and head is, as a slope (across / along).
    let off = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 2; i++) {
      bodyPoint(c, w.hits, i === 0 ? sight.aimHeightFraction : sight.headHeightFraction, part);
      const px = part.x - eye.x;
      const py = part.y - eye.y;
      const pz = part.z - eye.z;
      const along = px * dir.x + py * dir.y + pz * dir.z;
      if (along <= 0 || along > reach) continue;
      const across = Math.hypot(px - dir.x * along, py - dir.y * along, pz - dir.z * along);
      if (across <= Math.max(PINGS.enemyReach, along * cone)) off = Math.min(off, across / along);
    }
    if (off >= bestOff || visiblePart(leader, c, w.query, sight, w.body, w.hits, w.sight, w.characters) === 0) continue;
    best = c;
    bestOff = off;
  }
  return best;
}

/**
 * Bot `b` hears a teammate's ping (PG1): its spot becomes the bot's last-known one, as a noise heard there exactly, and
 * the bot's own play decides what it does (chooseMode): a search, the way its personality searches (a rusher runs, a
 * flanker may go round, a careful bot walks in slicing corners); a defender or an anchor holding watches it from its
 * post when it is far; under a squad order it keeps the order and watches it. A contact is a threat (lastThreatAt), a
 * spot isn't. A bot in a fight or in cover, or out of play, ignores it: returns false.
 */
export function takePing(b: Bot, ping: Ping, w: BotWorld): boolean {
  if (!isInPlay(b.character) || b.targetVisible || b.mode === 'fight' || b.mode === 'cover') return false;
  copy(b.lastKnown, ping.spot);
  copy(b.pingSpot, ping.spot);
  b.hasLastKnown = true;
  b.heardAt = w.time;
  b.pingAt = w.time;
  if (ping.kind === 'enemy') b.lastThreatAt = w.time;
  b.watchUntil = Number.NEGATIVE_INFINITY;
  if (b.mode === 'search') {
    // A search under way starts afresh for the new spot (and may go round it), as if it had just set off.
    b.routeState = 'none';
    startSearch(b, w);
  }
  return true;
}
