import type { BotConfig } from '../config/bots';
import { dropOnLine, isWalkableAt } from '../nav/navGrid';
import type { PlayerCommand } from '../sim/commands';
import { rngNext } from '../sim/rng';
import type { Vec3 } from '../sim/vec';
import { type Bot, type BotWorld, flagRole, pick } from './bot';
import { moveOrder } from './squadOrders';

/** Asks the planner for a route to `goal`, unless the current (or failed) one already goes about there. */
export function wantRoute(b: Bot, goal: Vec3, cfg: BotConfig): void {
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
 * Next place to go while advancing: the next lane point (moved a little at random onto walkable
 * ground, so routes vary), or once the lane is swept, a hunt spot. In flag mode nobody hunts:
 * defenders hold their last lane point (no goal) and attackers mark the lane done, which sends them to
 * the pole (see wantsFlag).
 */
function nextAdvanceGoal(b: Bot, w: BotWorld): Vec3 | undefined {
  const lane = w.lanes[b.lane];
  if (!b.hunting && lane && lane.length > 0) {
    const next = b.laneIndex < 0 ? (b.laneDir > 0 ? 0 : lane.length - 1) : b.laneIndex + b.laneDir;
    const walked = b.laneDir > 0 ? next : lane.length - 1 - next; // lane points before `next`
    if (next >= 0 && next < lane.length && walked < b.lanePoints) {
      b.laneIndex = next;
      jitterPoint(b, w, lane[next]!, w.cfg.laneJitter, b.laneGoal);
      return b.laneGoal;
    }
  }
  const role = flagRole(b, w);
  if (role === 'defend') return undefined;
  if (role === 'attack') {
    b.laneDone = true;
    return undefined;
  }
  b.hunting = true;
  return w.huntPoint(b, b.huntGoal) ? b.huntGoal : undefined;
}

/** Writes `point` moved up to `radius` in a random direction into `out` (unmoved if no walkable spot turns up). */
function jitterPoint(b: Bot, w: BotWorld, point: Vec3, radius: number, out: Vec3): void {
  out.x = point.x;
  out.y = point.y;
  out.z = point.z;
  for (let i = 0; i < w.cfg.laneJitterTries; i++) {
    const angle = rngNext(b.rng) * Math.PI * 2;
    const r = Math.sqrt(rngNext(b.rng)) * radius;
    const x = point.x + Math.cos(angle) * r;
    const z = point.z + Math.sin(angle) * r;
    if (!isWalkableAt(w.nav, x, z)) continue;
    out.x = x;
    out.z = z;
    return;
  }
}

/** Flag mode: picks a spot by the pole to stand at and heads there. */
export function enterFlagMode(b: Bot, w: BotWorld): void {
  b.mode = 'flag';
  jitterPoint(b, w, w.round.flag.position, w.cfg.flagStand, b.flagGoal);
  b.routeState = 'none';
  b.route.length = 0;
}

/**
 * Follows the current route: writes the world direction to walk into `b.moveDir` and returns true, or
 * false when there is nothing to walk (no route, or arrived).
 */
export function followRoute(b: Bot, w: BotWorld, dt: number): boolean {
  if (b.routeState !== 'ok') return false;
  const p = b.character.position;
  while (b.routeLeg < b.route.length) {
    const wp = b.route[b.routeLeg]!;
    if (Math.hypot(wp.x - p.x, wp.z - p.z) > w.cfg.waypointReach) break;
    b.routeLeg++;
  }
  if (b.routeLeg >= b.route.length) {
    b.routeState = 'none';
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

/** Moves according to the mode. Returns whether the bot is walking a route (direction in `b.moveDir`). */
export function moveBot(b: Bot, w: BotWorld, cmd: PlayerCommand, dt: number): boolean {
  const cfg = w.cfg;
  switch (b.mode) {
    case 'advance': {
      if (b.holdLeft > 0) {
        b.holdLeft -= dt;
        b.teamWait += dt;
        return false;
      }
      // At a lane point well ahead of the team: wait for them to catch up. The hold counts towards
      // teamWaitMax, so a bot stands still at a point for at most max(hold, teamWaitMax).
      if (b.waitForTeam && b.teamWait < cfg.teamWaitMax && w.aheadOfTeam(b)) {
        b.teamWait += dt;
        return false;
      }
      b.waitForTeam = false;
      if (b.routeState === 'none' || b.routeState === 'failed') {
        const arrived = b.routeState === 'none' && b.route.length > 0;
        const goal = nextAdvanceGoal(b, w);
        if (!goal) return false;
        if (arrived) {
          // Pause at the point just reached, looking ahead, then wait for the team if need be.
          b.holdLeft = pick(b.rng, cfg.holdTime);
          b.teamWait = 0;
          b.waitForTeam = !b.hunting;
        }
        b.routeState = 'none';
        wantRoute(b, goal, cfg);
      }
      return followRoute(b, w, dt);
    }
    case 'search': {
      wantRoute(b, b.lastKnown, cfg);
      const moving = followRoute(b, w, dt);
      // Got there (or can't get there): nobody around, forget it.
      if ((!moving && b.routeState === 'none') || b.routeState === 'failed') {
        b.hasLastKnown = false;
        b.heardAt = Number.NEGATIVE_INFINITY;
      }
      return moving;
    }
    case 'flag': {
      // At the spot by the pole: crouch and stay, working the rope.
      const p = b.character.position;
      if (Math.hypot(b.flagGoal.x - p.x, b.flagGoal.z - p.z) <= cfg.flagArrive) {
        b.routeState = 'none';
        cmd.crouch = true;
        return false;
      }
      if (b.routeState === 'failed' && (b.flagGoal.x !== w.round.flag.position.x || b.flagGoal.z !== w.round.flag.position.z)) {
        // No way to that spot: try the foot of the pole itself, once.
        b.flagGoal.x = w.round.flag.position.x;
        b.flagGoal.z = w.round.flag.position.z;
        b.routeState = 'none';
      }
      wantRoute(b, b.flagGoal, cfg);
      return followRoute(b, w, dt);
    }
    case 'cover': {
      // Get there, then keep low, standing up only to look over crouch cover. At a corner of full cover,
      // stand right on the spot (a few centimetres decide whether a lean sees round it) and stay upright.
      if (followRoute(b, w, dt)) return true;
      if (b.cover.lean === 0) {
        cmd.crouch = b.coverPhase === 'down';
        return false;
      }
      const p = b.character.position;
      const dx = b.cover.position.x - p.x;
      const dz = b.cover.position.z - p.z;
      const d = Math.hypot(dx, dz);
      if (b.routeState !== 'none' || d <= cfg.leanSpotReach || d > cfg.leanSpotApproachMax) return false;
      const reach = Math.min(d, cfg.edgeLookahead) / d;
      if (dropOnLine(w.nav, p.x, p.z, p.x + dx * reach, p.z + dz * reach)) return false;
      b.moveDir.x = dx / d;
      b.moveDir.z = dz / d;
      cmd.walk = true;
      return true;
    }
    case 'order':
      return moveOrder(b, w, cmd, dt);
    case 'fight':
      // Fighting over crouch cover: stay put behind it.
      if (b.fromCover) return false;
      // Otherwise sidestep while shooting.
      b.strafeLeft -= dt;
      if (b.strafeLeft <= 0) {
        b.strafeLeft = pick(b.rng, cfg.strafeTime);
        b.strafeDir = rngNext(b.rng) < 0.5 ? -1 : 1;
      }
      // Never sidestep off a floor: turn back from a drop, or stand still between two.
      if (strafeDrops(b, w, b.strafeDir)) b.strafeDir = -b.strafeDir;
      cmd.right = strafeDrops(b, w, b.strafeDir) ? 0 : b.strafeDir * cfg.strafeInput;
      return false;
  }
}

/** True if sidestepping to the right (dir 1) or left (dir -1) of the bot's view would step off a floor soon. */
function strafeDrops(b: Bot, w: BotWorld, dir: number): boolean {
  // The view's right on the ground plane is (cos yaw, 0, -sin yaw) (see stepMovement).
  const reach = dir * w.cfg.edgeLookahead;
  const p = b.character.position;
  return dropOnLine(w.nav, p.x, p.z, p.x + Math.cos(b.aim.yaw) * reach, p.z - Math.sin(b.aim.yaw) * reach);
}
