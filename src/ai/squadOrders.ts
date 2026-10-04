import { SQUAD_ORDERS, type SquadOrderKind } from '../config/squad';
import { clearLine, floorAt, isWalkableAt } from '../nav/navGrid';
import { aimDirection } from '../sim/armament';
import type { Character } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { type Vec3, vec3, wrapAngle } from '../sim/vec';
import { type Bot, type BotWorld, flagRole } from './bot';
import { followRoute, wantRoute } from './botMovement';
import { eyeOf } from './perception';

/**
 * Squad orders (M22): how bot teammates carry out Follow me, Hold here and Regroup from a player on their team. The
 * controller hands them out (`giveOrder`); each tick the brain puts an ordered bot in 'order' mode between fights and
 * `moveOrder` walks it there.
 */

const DEG = Math.PI / 180;
const eye = vec3();
const view = vec3();

/** Sets `b` carrying out `kind` for `leader` as the `slot`th of the teammates given it. */
export function startOrder(b: Bot, leader: Character, kind: SquadOrderKind, slot: number): void {
  b.order = kind;
  b.orderLeader = leader;
  b.orderSlot = slot;
  b.orderYaw = leader.yaw;
  b.orderHeading = leader.yaw;
  b.orderRush = false;
  b.orderSettled = false;
  b.orderCatchingUp = false;
  b.orderDroppingBack = false;
  b.routeState = 'none';
  b.route.length = 0;
}

/**
 * Back to the team plan. Mid-round in Elimination the bot hunts from where it is (its lane is behind it by now); in
 * Attack / Defend it takes up its post or the pole again.
 */
export function endOrder(b: Bot, w: BotWorld): void {
  if (b.order === 'none') return;
  b.order = 'none';
  b.orderLeader = undefined;
  b.orderRush = false;
  if (flagRole(b, w) === 'none') b.hunting = true;
}

/**
 * Hold here: the spot `leader` looks at (on walkable ground, short of the wall they look at, stepping back towards
 * them until the ground is walkable), into `out` with true; false if they look at nothing within holdRange or no
 * walkable ground is on that line.
 */
export function holdPoint(leader: Character, w: BotWorld, out: Vec3): boolean {
  eyeOf(leader, w.body, w.hits, eye);
  aimDirection(view, leader.yaw, leader.pitch);
  const hit = w.query.raycastStatic(eye, view, SQUAD_ORDERS.holdRange);
  if (hit < 0) return false;
  const flat = Math.hypot(view.x, view.z);
  if (flat < 1e-3) return false;
  // How far along the ground the line of sight goes before it meets something.
  const reach = hit * flat - SQUAD_ORDERS.holdWallGap;
  for (let back = 0; back <= reach; back += w.nav.cell) {
    const d = reach - back;
    const x = leader.position.x + (view.x / flat) * d;
    const z = leader.position.z + (view.z / flat) * d;
    if (!isWalkableAt(w.nav, x, z)) continue;
    out.x = x;
    out.y = floorAt(w.nav, x, z);
    out.z = z;
    return true;
  }
  return false;
}

/**
 * Hold here for the teammates `bots` (by their place across `leader`'s view, left to right): each its own spot across
 * the line of sight from `point`, holdSpacing apart (the point itself where that isn't walkable), or with no point, the
 * spot it stands on. All of them then look the way the leader looks.
 */
export function placeHold(bots: readonly Bot[], leader: Character, point: Vec3 | undefined, w: BotWorld): void {
  const rightX = Math.cos(leader.yaw);
  const rightZ = -Math.sin(leader.yaw);
  bots.forEach((b, k) => {
    const g = b.orderGoal;
    if (!point) {
      g.x = b.character.position.x;
      g.y = b.character.position.y;
      g.z = b.character.position.z;
      return;
    }
    const across = (k - (bots.length - 1) / 2) * SQUAD_ORDERS.holdSpacing;
    const x = point.x + rightX * across;
    const z = point.z + rightZ * across;
    const walkable = isWalkableAt(w.nav, x, z) && Math.abs(floorAt(w.nav, x, z) - point.y) <= w.nav.maxStep;
    g.x = walkable ? x : point.x;
    g.y = point.y;
    g.z = walkable ? z : point.z;
  });
}

/** Where the middle of the held spots is (for moving a hold), into `out`; false if nobody holds for `leader`. */
export function heldCentre(bots: readonly Bot[], leader: Character, out: Vec3): boolean {
  let n = 0;
  out.x = 0;
  out.y = 0;
  out.z = 0;
  for (const b of bots) {
    if (b.order !== 'hold' || b.orderLeader !== leader) continue;
    out.x += b.orderGoal.x;
    out.y += b.orderGoal.y;
    out.z += b.orderGoal.z;
    n++;
  }
  out.x /= Math.max(1, n);
  out.y /= Math.max(1, n);
  out.z /= Math.max(1, n);
  return n > 0;
}

/**
 * Follow me: the spot behind the leader's heading for follower `slot` into `out`: followers pair up either side of
 * straight behind, each further pair a row back. Where that spot isn't walkable, the leader's own.
 */
export function followSpot(leader: Character, heading: number, slot: number, w: BotWorld, out: Vec3): Vec3 {
  const side = slot % 2 === 0 ? 1 : -1;
  const angle = heading + Math.PI + side * SQUAD_ORDERS.followSpreadDeg * DEG;
  const dist = SQUAD_ORDERS.followDistance + Math.floor(slot / 2) * SQUAD_ORDERS.followRowGap;
  const p = leader.position;
  const x = p.x - Math.sin(angle) * dist;
  const z = p.z - Math.cos(angle) * dist;
  const walkable = isWalkableAt(w.nav, x, z) && Math.abs(floorAt(w.nav, x, z) - p.y) <= w.nav.maxStep;
  out.x = walkable ? x : p.x;
  out.y = p.y;
  out.z = walkable ? z : p.z;
  return out;
}

/** True if `b` got to the end of a route planned for about `goal` and is standing there (nothing to replan). */
function arrivedFor(b: Bot, goal: Vec3, w: BotWorld): boolean {
  return b.routeState === 'none' && b.route.length > 0 && Math.hypot(goal.x - b.routeGoal.x, goal.z - b.routeGoal.z) < w.cfg.replanDistance;
}

/**
 * Walks to `goal` until within `arrive`, or until at the end of a route planned for about there (`settle`: a goal
 * that stays put); returns whether the bot is walking a route (see moveBot).
 */
function walkTo(b: Bot, w: BotWorld, goal: Vec3, arrive: number, dt: number, settle = true): boolean {
  const p = b.character.position;
  if (Math.hypot(goal.x - p.x, goal.z - p.z) <= arrive || (settle && arrivedFor(b, goal, w))) {
    if (b.routeState !== 'wanted') b.routeState = 'none';
    return false;
  }
  wantRoute(b, goal, w.cfg);
  // A leader on the move shifts the goal every few metres: keep walking the old route until the new one comes,
  // rather than stopping for a tick at each replan (a stutter, and a sprint cut short).
  return followRoute(b, w, dt, true);
}

/**
 * Follow me's moving (the spot is in `b.orderGoal`): settle at the spot while the leader stands still; otherwise make
 * for it, straight there when the ground in between is clear (no route needed, so no stop at each replan) and round
 * walls by route, at the leader's own pace: walking with a leader who walks or crouches, sprinting with one who
 * sprints, a pace faster while catching up on the spot. Sets `b.orderRush` (sprinting) and `cmd.walk`.
 */
function followMove(b: Bot, w: BotWorld, leader: Character, away: number, wasRushing: boolean, cmd: PlayerCommand, dt: number): boolean {
  const o = SQUAD_ORDERS;
  const p = b.character.position;
  const g = b.orderGoal;
  const d = Math.hypot(g.x - p.x, g.z - p.z);
  const v = leader.velocity;
  const leaderSpeed = Math.hypot(v.x, v.z);
  const leaderMoving = leaderSpeed >= o.headingSpeed;
  b.orderSettled = !leaderMoving && (d <= o.followArrive || (b.orderSettled && d <= o.followArrive + o.followSettle));
  // How far the spot is ahead of the bot along the leader's way (negative: the bot is ahead of it).
  const behind = leaderMoving ? ((g.x - p.x) * v.x + (g.z - p.z) * v.z) / leaderSpeed : 0;
  b.orderCatchingUp = behind > o.catchUpGap || (b.orderCatchingUp && behind > 0);
  b.orderDroppingBack = behind < -o.catchUpGap || (b.orderDroppingBack && behind < 0);
  if (b.orderSettled) {
    if (b.routeState !== 'wanted') b.routeState = 'none';
    return false;
  }
  // Pace: 0 walk, 1 run, 2 sprint. Making for the spot with the leader still: run, and walk the last stretch.
  let pace = leaderMoving ? (leader.sprinting ? 2 : leader.walking || leader.crouchAmount > 0.5 ? 0 : 1) : d > o.followSettle * 3 ? 1 : 0;
  if (b.orderCatchingUp && leaderMoving) pace = Math.min(2, pace + 1);
  // Ahead of the spot: a pace slower, so it drops back into place (from a walk, it waits for the spot to come by).
  else if (b.orderDroppingBack) pace--;
  if (pace < 0) {
    if (b.routeState !== 'wanted') b.routeState = 'none';
    return false;
  }
  if (away > o.catchUp - (wasRushing ? o.rushEase : 0)) pace = 2;
  b.orderRush = pace === 2;
  cmd.walk = pace === 0;
  if (clearLine(w.nav, p.x, p.z, g.x, g.z)) {
    b.routeState = 'none';
    b.route.length = 0;
    // Straight at the spot while the leader stands; with the leader on the move, go their way and close on the spot
    // (pursuit: their velocity plus a pull towards the spot), so the direction stays steady as the spot slides along.
    const pull = leaderMoving ? o.followPull : 1;
    const dx = (leaderMoving ? v.x : 0) + (g.x - p.x) * pull;
    const dz = (leaderMoving ? v.z : 0) + (g.z - p.z) * pull;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return false;
    b.moveDir.x = dx / len;
    b.moveDir.z = dz / len;
    return true;
  }
  return walkTo(b, w, g, 0, dt, false);
}

/** Moves an ordered bot for this tick (moveBot's 'order' mode). Returns whether it walks a route. */
export function moveOrder(b: Bot, w: BotWorld, cmd: PlayerCommand, dt: number): boolean {
  const leader = b.orderLeader;
  const wasRushing = b.orderRush;
  b.orderRush = false;
  if (!leader || b.order === 'none') return false;
  if (b.order === 'hold') {
    // No way there: hold where it got to.
    if (b.routeState === 'failed') {
      b.orderGoal.x = b.character.position.x;
      b.orderGoal.y = b.character.position.y;
      b.orderGoal.z = b.character.position.z;
      b.routeState = 'none';
    }
    return walkTo(b, w, b.orderGoal, SQUAD_ORDERS.holdArrive, dt);
  }
  const p = b.character.position;
  const lp = leader.position;
  const away = Math.hypot(lp.x - p.x, lp.z - p.z);
  if (b.order === 'regroup') {
    // Sprint back; once close the controller turns it into Follow me.
    b.orderRush = away > SQUAD_ORDERS.regroupArrive;
    b.orderGoal.x = lp.x;
    b.orderGoal.y = lp.y;
    b.orderGoal.z = lp.z;
    b.orderYaw = leader.yaw;
    return walkTo(b, w, b.orderGoal, SQUAD_ORDERS.regroupArrive, dt);
  }
  // Follow me: keep a spot behind the way the leader moves, and cover their back once there.
  const v = leader.velocity;
  if (Math.hypot(v.x, v.z) >= SQUAD_ORDERS.headingSpeed) {
    // Eased, so the spots swing round behind a leader who turns rather than jump to the other side.
    const turn = wrapAngle(Math.atan2(-v.x, -v.z) - b.orderHeading);
    const most = SQUAD_ORDERS.headingTurnRate * dt;
    b.orderHeading = wrapAngle(b.orderHeading + Math.max(-most, Math.min(most, turn)));
  }
  followSpot(leader, b.orderHeading, b.orderSlot, w, b.orderGoal);
  const watch = SQUAD_ORDERS.followWatchDeg;
  b.orderYaw = b.orderHeading + watch[b.orderSlot % watch.length]! * DEG;
  return followMove(b, w, leader, away, wasRushing, cmd, dt);
}
