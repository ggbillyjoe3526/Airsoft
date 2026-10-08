import type { BotBehaviour } from '../config/bots';
import type { PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import { type Vec3, vec3 } from '../sim/vec';
import { dropOnLine } from '../nav/navGrid';
import type { Bot, BotWorld } from './bot';
import type { TakenSpots } from './cover';

/**
 * The route helpers the movement code (botMovement) and the squad orders (squadOrders) both walk with: asking for a
 * route, following it, the last step onto a spot, and the teammates' spots a cover search keeps off. Split out of
 * botMovement so the two files don't import each other (M79, audit CORE-08).
 */

/** Teammates' spots a cover search keeps away from (AI-01), refilled per search. */
const taken: TakenSpots = { points: [], count: 0, minGap: 0 };

/** Asks the planner for a route to `goal`, unless the current (or failed) one already goes about there. */
export function wantRoute(b: Bot, goal: Vec3, cfg: BotBehaviour): void {
  const moved = Math.hypot(goal.x - b.routeGoal.x, goal.z - b.routeGoal.z);
  if (b.routeState === 'wanted') {
    b.routeGoal.x = goal.x;
    b.routeGoal.z = goal.z;
    return;
  }
  if ((b.routeState === 'ok' || b.routeState === 'failed') && moved < cfg.replanDistance) return;
  b.routeGoal.x = goal.x;
  b.routeGoal.y = goal.y;
  b.routeGoal.z = goal.z;
  b.routeState = 'wanted';
}

/**
 * Where `b`'s teammates stand or are heading for cover, as spots a cover search for `b` must keep away from (AI-01):
 * every teammate in play (the player too), plus the cover, lane-hold or pole-guard spot each teammate bot is making for.
 */
export function teammateSpots(b: Bot, w: BotWorld): TakenSpots {
  const me = b.character;
  taken.count = 0;
  taken.minGap = 2 * w.body.radius + w.cfg.coverSpacingMargin;
  for (const c of w.characters) {
    if (c !== me && c.team === me.team && isInPlay(c)) addTaken(c.position);
  }
  for (const o of w.bots) {
    if (o === b || o.character.team !== me.team || !isInPlay(o.character)) continue;
    if (o.mode === 'cover') addTaken(o.cover.position);
    else if (o.mode === 'advance' && o.holdCover) addTaken(o.holdSpot.position);
    else if (o.mode === 'flag') addTaken(o.flagGoal);
    else if (o.role === 'guard') addTaken(o.post);
    else if (o.orderCovering) addTaken(o.orderGoal);
  }
  return taken;
}

function addTaken(p: Vec3): void {
  let slot = taken.points[taken.count];
  if (!slot) {
    slot = vec3();
    taken.points.push(slot); // grows once to the most teammates seen, then reused
  }
  slot.x = p.x;
  slot.y = p.y;
  slot.z = p.z;
  taken.count++;
}

/**
 * Follows the current route: writes the world direction to walk into `b.moveDir` and returns true, or
 * false when there is nothing to walk (no route, or arrived). `whilePlanning`: keep walking the current route
 * while a new one is wanted (a goal on the move), rather than stopping until it comes.
 */
export function followRoute(b: Bot, w: BotWorld, dt: number, whilePlanning = false): boolean {
  const planning = whilePlanning && b.routeState === 'wanted';
  if (b.routeState !== 'ok' && !planning) return false;
  const p = b.character.position;
  while (b.routeLeg < b.route.length) {
    const wp = b.route[b.routeLeg]!;
    if (Math.hypot(wp.x - p.x, wp.z - p.z) > w.cfg.waypointReach) break;
    b.routeLeg++;
  }
  if (b.routeLeg >= b.route.length) {
    if (!planning) {
      b.routeState = 'none';
      // Arrived: a step onto the spot after it (stepOnto) gets its own stuckTime, not what is left of the route's (BP2).
      b.stuckFor = 0;
    }
    return false;
  }
  const wp = b.route[b.routeLeg]!;
  const dx = wp.x - p.x;
  const dz = wp.z - p.z;
  const d = Math.hypot(dx, dz);
  b.moveDir.x = dx / d;
  b.moveDir.z = dz / d;
  // Blocked (e.g. by another player): after a moment, ask for a fresh route.
  const speed = Math.hypot(b.character.velocity.x, b.character.velocity.z);
  b.stuckFor = speed < w.cfg.stuckSpeed ? b.stuckFor + dt : 0;
  if (b.stuckFor > w.cfg.stuckTime) {
    b.stuckFor = 0;
    b.routeState = 'wanted';
  }
  return true;
}

/**
 * The last few centimetres onto `spot` once its route is done, walking straight at it: a lean spot, where a few
 * centimetres decide whether a lean sees round the corner, or a guard's post (M55, audit AI-01). True while stepping
 * (direction in `b.moveDir`); false once within leanSpotReach, further off than leanSpotApproachMax, with a drop on
 * the way, or once blocked for stuckTime.
 */
export function stepOnto(b: Bot, w: BotWorld, spot: Vec3, cmd: PlayerCommand, dt: number): boolean {
  const cfg = w.cfg;
  const p = b.character.position;
  const dx = spot.x - p.x;
  const dz = spot.z - p.z;
  const d = Math.hypot(dx, dz);
  if (d <= cfg.leanSpotReach || d > cfg.leanSpotApproachMax) return false;
  // Blocked on the way (a teammate, or a corner the nav grid rounds off): it stops where it got to, as a route does.
  if (b.stuckFor > cfg.stuckTime) return false;
  const speed = Math.hypot(b.character.velocity.x, b.character.velocity.z);
  b.stuckFor = speed < cfg.stuckSpeed ? b.stuckFor + dt : 0;
  const reach = Math.min(d, cfg.edgeLookahead) / d;
  if (dropOnLine(w.nav, p.x, p.y, p.z, p.x + dx * reach, p.z + dz * reach)) return false;
  b.moveDir.x = dx / d;
  b.moveDir.z = dz / d;
  cmd.walk = true;
  return true;
}
