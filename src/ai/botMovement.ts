import type { BotConfig } from '../config/bots';
import type { PlayerCommand } from '../sim/commands';
import { rngNext } from '../sim/rng';
import type { Vec3 } from '../sim/vec';
import { type Bot, type BotWorld, pick } from './bot';

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

/** Next place to go while advancing: the next lane point, or once the lane is swept, a hunt spot. */
function nextAdvanceGoal(b: Bot, w: BotWorld): Vec3 | undefined {
  const lane = w.lanes[b.lane];
  if (!b.hunting && lane && lane.length > 0) {
    const next = b.laneIndex < 0 ? (b.laneDir > 0 ? 0 : lane.length - 1) : b.laneIndex + b.laneDir;
    if (next >= 0 && next < lane.length) {
      b.laneIndex = next;
      return lane[next];
    }
  }
  b.hunting = true;
  return w.huntPoint(b, b.huntGoal) ? b.huntGoal : undefined;
}

/**
 * Follows the current route: writes the world direction to walk into `b.moveDir` and returns true, or
 * false when there is nothing to walk (no route, or arrived).
 */
function followRoute(b: Bot, w: BotWorld, dt: number): boolean {
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
        return false;
      }
      if (b.routeState === 'none' || b.routeState === 'failed') {
        const arrived = b.routeState === 'none' && b.route.length > 0;
        const goal = nextAdvanceGoal(b, w);
        if (!goal) return false;
        if (arrived) b.holdLeft = pick(b.rng, cfg.holdTime); // pause at the point just reached, looking ahead
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
    case 'cover': {
      // Get there, then keep low until it's time to peek (fight mode stands up again).
      const moving = followRoute(b, w, dt);
      cmd.crouch = !moving;
      return moving;
    }
    case 'fight':
      // Sidestep while shooting.
      b.strafeLeft -= dt;
      if (b.strafeLeft <= 0) {
        b.strafeLeft = pick(b.rng, cfg.strafeTime);
        b.strafeDir = rngNext(b.rng) < 0.5 ? -1 : 1;
      }
      cmd.right = b.strafeDir * cfg.strafeInput;
      return false;
  }
}

