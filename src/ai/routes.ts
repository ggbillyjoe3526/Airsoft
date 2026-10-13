import type { BotBehaviour } from '../config/bots';
import { MOVEMENT } from '../config/movement';
import { PHYSICS } from '../config/physics';
import type { PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import { copy, type Vec3, vec3 } from '../sim/vec';
import { dropOnLine, floorAt } from '../nav/navGrid';
import { isVaultLeg } from '../nav/vaultLinks';
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
 * while a new one is wanted (a goal on the move), rather than stopping until it comes. A leg over a low obstacle (a
 * vault link, M102) sets `b.vaultLeg`: it is walked straight, and its end counts as reached once past it.
 */
export function followRoute(b: Bot, w: BotWorld, dt: number, whilePlanning = false): boolean {
  b.vaultLeg = false;
  const planning = whilePlanning && b.routeState === 'wanted';
  if (b.routeState !== 'ok' && !planning) return false;
  const p = b.character.position;
  while (b.routeLeg < b.route.length) {
    const wp = b.route[b.routeLeg]!;
    const d = Math.hypot(wp.x - p.x, wp.z - p.z);
    // A vault's end is reached once past it along the leg, wherever the fall off the obstacle set the body down (the
    // next leg rejoins from there, as from a push off a leg).
    const vaulted = d > w.cfg.waypointReach;
    if (vaulted && !(legShare(b.routeFrom, wp, p, w.cfg.waypointReach) >= 1 && isVaultLeg(w.nav, b.routeFrom, wp))) break;
    // Reached from aside (G11): where cutting the corner to the next waypoint would take a ledge (down off a stair's
    // foot and back up its side), walk onto this one first.
    const next = b.route[b.routeLeg + 1];
    if (!vaulted && next && d > w.cfg.routeOffLeg && ledgeOnWay(w, p, next)) break;
    copy(b.routeFrom, wp);
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
  let wp = b.route[b.routeLeg]!;
  // Over a low obstacle (M102): straight at the leg's end, and while the obstacle is still ahead (the first half of the
  // leg) the brain presses Jump once the vault is there.
  const vault = isVaultLeg(w.nav, b.routeFrom, wp);
  b.vaultLeg = vault && legShare(b.routeFrom, wp, p, 0) < 0.5;
  // Pushed off the leg (G11): the straight way on from here is not the one the planner checked. Where it takes no ledge
  // the leg doesn't (a leg onto a stair grazes the stair's foot too), it is the leg from now on; where it would, step
  // back onto the leg a little ahead and walk it from there (a fresh route only if that way takes one too). By the
  // leg's start, within waypointReach, the bot is on it: the loop above checked the way on when it got there.
  const on = legPoint(b.routeFrom, wp, p, 0);
  const off = Math.hypot(p.x - on.x, p.z - on.z) > w.cfg.routeOffLeg;
  if (!vault && off && Math.hypot(p.x - b.routeFrom.x, p.z - b.routeFrom.z) > w.cfg.waypointReach) {
    if (!ledgeOnWay(w, p, wp) || ledgeOnWay(w, b.routeFrom, wp)) copy(b.routeFrom, p);
    else if (!ledgeOnWay(w, p, legPoint(b.routeFrom, wp, p, w.cfg.routeRejoinAhead))) wp = REJOIN;
    else {
      b.routeState = 'wanted';
      b.stuckFor = 0;
      return false;
    }
  }
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
    // Held up at a vault (a teammate in the way, a fight that turned it): the next routes go round for a while.
    if (vault) b.vaultsOffUntil = w.time + w.cfg.vaultRetryDelay;
  }
  return true;
}

/** How far along the leg from `a` to `b` the point `p` is, `reach` metres on (0 at `a`, 1 at `b`; 1 for no leg). */
function legShare(a: Vec3, b: Vec3, p: Vec3, reach: number): number {
  const ex = b.x - a.x;
  const ez = b.z - a.z;
  const len2 = ex * ex + ez * ez;
  return len2 > 0 ? ((p.x - a.x) * ex + (p.z - a.z) * ez + reach * Math.sqrt(len2)) / len2 : 1;
}

/** legPoint's answer (one per module: bots step one at a time). */
const REJOIN = vec3();

/**
 * The point on the leg `a`-`b` nearest `p` on the ground plane, moved `ahead` metres on along it (at most to `b`), at
 * the leg's height there. Written to REJOIN, which it returns.
 */
function legPoint(a: Vec3, b: Vec3, p: Vec3, ahead: number): Vec3 {
  const ex = b.x - a.x;
  const ez = b.z - a.z;
  const len2 = ex * ex + ez * ez;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.z - a.z) * ez + ahead * Math.sqrt(len2)) / len2)) : 1;
  REJOIN.x = a.x + ex * t;
  REJOIN.y = a.y + (b.y - a.y) * t;
  REJOIN.z = a.z + ez * t;
  return REJOIN;
}

/**
 * True if walking straight from `p` to `to` would take a ledge: under the body's middle a drop, or a side low enough to
 * ride up onto (a taller block stops the body without harm: it slides along); or, a body's radius out to either side,
 * a floor that much higher than the one under its middle (a capsule half over a low stair's or ramp's side rides up
 * onto it, then drops off as the side climbs away). A way that climbs a ramp or stair from near its foot has the same
 * floor under its middle and sides, so it counts only where the body straddles the side.
 */
function ledgeOnWay(w: BotWorld, p: Vec3, to: Vec3): boolean {
  const g = w.nav;
  const wall = PHYSICS.autostepHeight;
  if (dropOnLine(g, p.x, p.y, p.z, to.x, to.z, wall)) return true;
  const dx = to.x - p.x;
  const dz = to.z - p.z;
  const len = Math.hypot(dx, dz);
  const r = w.body.radius / (len || 1);
  const steps = Math.ceil(len / (g.cell * 0.5));
  let y = p.y;
  for (let s = 0; s <= steps; s++) {
    const x = p.x + (dx * s) / (steps || 1);
    const z = p.z + (dz * s) / (steps || 1);
    y = floorAt(g, x, y, z);
    for (let k = -r; k <= r; k += 2 * r) {
      const rise = floorAt(g, x - dz * k, y, z + dx * k) - y;
      if (rise > g.maxStep && rise <= wall) return true;
    }
  }
  return false;
}

/**
 * The last few centimetres onto `spot` once its route is done, walking straight at it: a lean spot, where a few
 * centimetres decide whether a lean sees round the corner, or a guard's post (M55, audit AI-01). True while stepping
 * (direction in `b.moveDir`) or coasting onto it (no push: `b.moveDir` zero); false once at rest within leanSpotReach,
 * further off than leanSpotApproachMax, with a drop on the way, or once blocked for stuckTime.
 */
export function stepOnto(b: Bot, w: BotWorld, spot: Vec3, cmd: PlayerCommand, dt: number): boolean {
  const cfg = w.cfg;
  const p = b.character.position;
  const v = b.character.velocity;
  const dx = spot.x - p.x;
  const dz = spot.z - p.z;
  const d = Math.hypot(dx, dz);
  if (d > cfg.leanSpotApproachMax) return false;
  const speed = Math.hypot(v.x, v.z);
  // Where it would come to rest with no push: a walk carries on a few centimetres, enough to slide a lean's sight line
  // onto the corner it was picked to clear. It lets go short of the spot and coasts onto it, and counts as there (its
  // lean chosen) only once still.
  const coast = speed / (2 * MOVEMENT.groundDecel);
  if (Math.hypot(dx - v.x * coast, dz - v.z * coast) <= cfg.leanSpotReach) {
    if (speed < cfg.stuckSpeed) return false;
    b.moveDir.x = 0;
    b.moveDir.z = 0;
    cmd.walk = true;
    return true;
  }
  // Blocked on the way (a teammate, or a corner the nav grid rounds off): it stops where it got to, as a route does.
  if (b.stuckFor > cfg.stuckTime) return false;
  b.stuckFor = speed < cfg.stuckSpeed ? b.stuckFor + dt : 0;
  const reach = Math.min(d, cfg.edgeLookahead) / d;
  if (dropOnLine(w.nav, p.x, p.y, p.z, p.x + dx * reach, p.z + dz * reach)) return false;
  b.moveDir.x = dx / d;
  b.moveDir.z = dz / d;
  cmd.walk = true;
  return true;
}
