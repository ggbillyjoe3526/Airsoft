import type { BotBehaviour } from '../config/bots';
import { FLAG } from '../config/modes';
import { dropOnLine, floorAt, isWalkableAt } from '../nav/navGrid';
import type { Character } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import { rngNext } from '../sim/rng';
import { type Vec3, vec3 } from '../sim/vec';
import { type Bot, type BotWorld, flagRole, pick, recallHeardOther } from './bot';
import { type CoverSearch, findCover, type TakenSpots } from './cover';
import { bodyPoint, eyeOf, lineClear } from './perception';
import { moveOrder } from './squadOrders';

// Scratch, each used only within one call of the function that fills it.
const holdEye = vec3();
const holdLook = vec3();
const threatEye = vec3();
const sideEye = vec3();
const targetPoint = vec3();

/** Cover searches by a lane point and round the pole (AI-02, AI-06): spots to peek from only (radius set per call). */
const holdSearch: CoverSearch = { radius: 0, randomCandidates: 0, peekable: true };

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
 * Next place to go while advancing: the next lane point (moved a little at random onto walkable
 * ground, so routes vary, and aside from a teammate holding there), or once the lane is swept, a hunt spot. In flag
 * mode nobody hunts: defenders hold their last lane point (no goal) and attackers mark the lane done, which sends them
 * to the pole (see wantsFlag).
 */
function nextAdvanceGoal(b: Bot, w: BotWorld): Vec3 | undefined {
  const lane = w.lanes[b.lane];
  if (!b.hunting && lane && lane.length > 0) {
    const next = b.laneIndex < 0 ? (b.laneDir > 0 ? 0 : lane.length - 1) : b.laneIndex + b.laneDir;
    const walked = b.laneDir > 0 ? next : lane.length - 1 - next; // lane points before `next`
    if (next >= 0 && next < lane.length && walked < b.lanePoints) {
      b.laneIndex = next;
      jitterPoint(b, w, lane[next]!, w.cfg.laneJitter, b.laneGoal);
      staggerHold(b, w);
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

/**
 * Bots sharing a lane (AI-01): if a teammate bot holds at, or is heading for, about the same lane point, this bot's
 * point moves laneHoldOffset to one side (across the way to the enemy), onto walkable ground on the same floor, so the
 * two hold side by side instead of one inside the other.
 */
function staggerHold(b: Bot, w: BotWorld): void {
  const cfg = w.cfg;
  const g = b.laneGoal;
  let crowded = false;
  for (const o of w.bots) {
    if (o === b || o.character.team !== b.character.team || !isInPlay(o.character)) continue;
    const p = o.character.position;
    const heading = o.mode === 'advance' && !o.hunting && o.lane === b.lane;
    if (Math.hypot(p.x - g.x, p.z - g.z) < cfg.laneHoldSpacing || (heading && Math.hypot(o.laneGoal.x - g.x, o.laneGoal.z - g.z) < cfg.laneHoldSpacing)) {
      crowded = true;
      break;
    }
  }
  if (!crowded) return;
  const yaw = w.enemyYaw[b.character.team] ?? 0;
  // The view's right on the ground plane is (cos yaw, 0, -sin yaw) (see stepMovement); try a random side first.
  const first = rngNext(b.rng) < 0.5 ? 1 : -1;
  for (let side = first, k = 0; k < 2; k++, side = -side) {
    const x = g.x + Math.cos(yaw) * cfg.laneHoldOffset * side;
    const z = g.z - Math.sin(yaw) * cfg.laneHoldOffset * side;
    if (!onSameFloor(w, g, x, z)) continue;
    g.x = x;
    g.z = z;
    return;
  }
}

/** True if (x, z) is walkable and on the floor `point` stands on (within a step of its height). */
function onSameFloor(w: BotWorld, point: Vec3, x: number, z: number): boolean {
  return isWalkableAt(w.nav, x, point.y, z) && Math.abs(floorAt(w.nav, x, point.y, z) - point.y) <= w.nav.maxStep;
}

/**
 * Writes `point` moved up to `radius` in a random direction into `out` (unmoved if no walkable spot turns up). The
 * spot stays on `point`'s own floor (AI-08): a lane point near a platform's lip is never moved to the ground below.
 */
export function jitterPoint(b: Bot, w: BotWorld, point: Vec3, radius: number, out: Vec3): void {
  out.x = point.x;
  out.y = point.y;
  out.z = point.z;
  for (let i = 0; i < w.cfg.laneJitterTries; i++) {
    const angle = rngNext(b.rng) * Math.PI * 2;
    const r = Math.sqrt(rngNext(b.rng)) * radius;
    const x = point.x + Math.cos(angle) * r;
    const z = point.z + Math.sin(angle) * r;
    if (!onSameFloor(w, point, x, z)) continue;
    out.x = x;
    out.y = floorAt(w.nav, x, point.y, z);
    out.z = z;
    return;
  }
}

/**
 * True if crouched eyes at `at` (standing on its floor) see holdLookDistance towards the enemy side: worth crouching
 * to hold there (AI-02). Behind crouch cover they don't, so the bot holds standing and looks over it.
 */
function crouchedViewClear(b: Bot, w: BotWorld, at: Vec3): boolean {
  const yaw = w.enemyYaw[b.character.team] ?? 0;
  const floor = floorAt(w.nav, at.x, at.y, at.z);
  holdEye.x = at.x;
  holdEye.y = (Number.isNaN(floor) ? at.y : floor) + w.body.crouchEyeHeight;
  holdEye.z = at.z;
  holdLook.x = holdEye.x - Math.sin(yaw) * w.cfg.holdLookDistance;
  holdLook.y = holdEye.y;
  holdLook.z = holdEye.z - Math.cos(yaw) * w.cfg.holdLookDistance;
  return lineClear(w.query, holdEye, holdLook);
}

/** Starts the pause at the lane point just reached: how long, whether to wait for the team, whether to crouch. */
function startHold(b: Bot, w: BotWorld): void {
  b.holdLeft = pick(b.rng, b.skill.holdTime);
  b.teamWait = 0;
  b.waitForTeam = !b.hunting;
  b.holdCrouch = crouchedViewClear(b, w, b.character.position);
}

/**
 * At a lane point, maybe (the skill's holdCoverChance) pick crouch cover close by to hold from (AI-02): hidden from a
 * point holdCoverThreatDistance towards the enemy side, away from teammates' spots. False to hold where it stands.
 */
function pickHoldCover(b: Bot, w: BotWorld): boolean {
  if (rngNext(b.rng) >= b.skill.holdCoverChance) return false;
  const cfg = w.cfg;
  const p = b.character.position;
  const yaw = w.enemyYaw[b.character.team] ?? 0;
  threatEye.x = p.x - Math.sin(yaw) * cfg.holdCoverThreatDistance;
  threatEye.y = p.y + w.body.standEyeHeight;
  threatEye.z = p.z - Math.cos(yaw) * cfg.holdCoverThreatDistance;
  holdSearch.radius = cfg.holdCoverRadius;
  return findCover(p, threatEye, w, b.rng, b.holdSpot, holdSearch, teammateSpots(b, w)) && b.holdSpot.crouchOnly;
}

/**
 * Flag mode: picks where to be and heads there. The raiser (and a defender retaking) stands at a random spot by the
 * pole; any other attacker guards it from cover within flagGuardRadius (AI-06), hidden from where an enemy was last
 * known (or from the defenders' end), or failing that from a random spot that far out.
 */
export function enterFlagMode(b: Bot, w: BotWorld): void {
  b.mode = 'flag';
  pickFlagSpot(b, w);
}

function pickFlagSpot(b: Bot, w: BotWorld): void {
  const cfg = w.cfg;
  const pole = w.round.flag.position;
  b.flagGuard = flagRole(b, w) === 'attack' && !b.raiser;
  b.teamWait = 0;
  b.routeState = 'none';
  b.route.length = 0;
  if (!b.flagGuard) {
    jitterPoint(b, w, pole, cfg.flagStand, b.flagGoal);
    return;
  }
  if (b.hasLastKnown) {
    threatEye.x = b.lastKnown.x;
    threatEye.z = b.lastKnown.z;
  } else {
    const yaw = w.enemyYaw[b.character.team] ?? 0;
    threatEye.x = pole.x - Math.sin(yaw) * cfg.flagGuardThreatDistance;
    threatEye.z = pole.z - Math.cos(yaw) * cfg.flagGuardThreatDistance;
  }
  threatEye.y = pole.y + w.body.standEyeHeight;
  holdSearch.radius = cfg.flagGuardRadius;
  if (findCover(pole, threatEye, w, b.rng, b.holdSpot, holdSearch, teammateSpots(b, w))) {
    b.flagGoal.x = b.holdSpot.position.x;
    b.flagGoal.y = b.holdSpot.position.y;
    b.flagGoal.z = b.holdSpot.position.z;
  } else {
    jitterPoint(b, w, pole, cfg.flagGuardRadius, b.flagGoal);
  }
  b.holdCrouch = crouchedViewClear(b, w, b.flagGoal);
}

/**
 * A search begins (AI-17): with the skill's flankChance, and a far enough spot, go round by a point flankOffset to one
 * side of the straight way and flankBack short of the spot first (walkable, on that spot's floor), so the bot comes at
 * it from the side.
 */
export function startSearch(b: Bot, w: BotWorld): void {
  const cfg = w.cfg;
  b.searchLookLeft = 0;
  b.flanking = false;
  const p = b.character.position;
  const k = b.lastKnown;
  const d = Math.hypot(k.x - p.x, k.z - p.z);
  if (d < cfg.flankMinDistance || rngNext(b.rng) >= b.skill.flankChance) return;
  const ux = (k.x - p.x) / d;
  const uz = (k.z - p.z) / d;
  const first = rngNext(b.rng) < 0.5 ? 1 : -1;
  for (let side = first, i = 0; i < 2; i++, side = -side) {
    const x = k.x - ux * cfg.flankBack - uz * cfg.flankOffset * side;
    const z = k.z - uz * cfg.flankBack + ux * cfg.flankOffset * side;
    if (!onSameFloor(w, k, x, z)) continue;
    b.flankGoal.x = x;
    b.flankGoal.y = floorAt(w.nav, x, k.y, z);
    b.flankGoal.z = z;
    b.flanking = true;
    return;
  }
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
    if (!planning) b.routeState = 'none';
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

/** Advance mode: lane points with a pause (and maybe cover) at each, then hunting. See moveBot. */
function advance(b: Bot, w: BotWorld, dt: number, atPost: boolean): boolean {
  const cfg = w.cfg;
  if (b.holdLeft > 0) {
    b.holdLeft -= dt;
    b.teamWait += dt;
    b.holding = true;
    return false;
  }
  // At a lane point well ahead of the team: wait for them to catch up. The hold counts towards
  // teamWaitMax, so a bot stands still at a point for at most max(hold, teamWaitMax).
  if (b.waitForTeam && b.teamWait < cfg.teamWaitMax && w.aheadOfTeam(b)) {
    b.teamWait += dt;
    b.holding = true;
    return false;
  }
  b.waitForTeam = false;
  if (b.holdCover) {
    // Stepping into cover by the lane point just reached (AI-02): hold from there once there, or where it got to if
    // there's no way; then on to the next point, picked on arrival.
    if (followRoute(b, w, dt)) return true;
    if (b.routeState === 'wanted') return false;
    b.holdCover = false;
    startHold(b, w);
    b.routeState = 'none';
    wantRoute(b, b.laneGoal, cfg);
    return false;
  }
  if (b.routeState === 'none' || b.routeState === 'failed') {
    if (b.routeState === 'failed') {
      // No way to the last goal (AI-07): wait a moment before asking for the next one, so a bot cut off from its goals
      // can't take every tick's route search, and count a hunt spot it can't reach as checked.
      if (w.time < b.routeRetryAt) return false;
      if (b.hunting) w.markVisited(b, b.routeGoal);
    }
    const arrived = b.routeState === 'none' && b.route.length > 0;
    const goal = nextAdvanceGoal(b, w);
    if (!goal) {
      // A defender at its post holds there (crouched and watching, AI-02); an attacker is off to the pole next tick.
      // Whether to crouch is chosen once, on arrival, and kept while it stays (`atPost`: it was here last tick too).
      if (flagRole(b, w) === 'defend') {
        if (!atPost) b.holdCrouch = crouchedViewClear(b, w, b.character.position);
        b.atPost = true;
        b.holding = true;
        b.teamWait += dt;
      }
      return false;
    }
    b.routeState = 'none';
    if (arrived) {
      if (!b.hunting && pickHoldCover(b, w)) {
        b.holdCover = true;
        wantRoute(b, b.holdSpot.position, cfg);
        return false;
      }
      // Pause at the point just reached, looking ahead, then wait for the team if need be.
      startHold(b, w);
    }
    wantRoute(b, goal, cfg);
  }
  return followRoute(b, w, dt);
}

/** Search mode: to the last-known spot (round by a flank point first, if flanking), then a look round. */
function search(b: Bot, w: BotWorld, cmd: PlayerCommand, dt: number): boolean {
  if (b.searchLookLeft > 0) {
    // Got there and nobody about (AI-14): crouch and look round before giving up.
    b.searchLookLeft -= dt;
    cmd.crouch = true;
    if (b.searchLookLeft <= 0) forgetSearch(b, w);
    return false;
  }
  wantRoute(b, b.flanking ? b.flankGoal : b.lastKnown, w.cfg);
  const moving = followRoute(b, w, dt);
  if (moving) return true;
  if (b.flanking && b.routeState !== 'wanted') {
    // Round the side (or no way round): now for the spot itself.
    b.flanking = false;
    b.routeState = 'none';
    return false;
  }
  if (b.routeState === 'none') {
    // Got there: look round first.
    b.searchLookTime = b.searchLookLeft = pick(b.rng, w.cfg.searchLook);
    b.searchLookYaw = b.aim.yaw;
    cmd.crouch = true;
  } else if (b.routeState === 'failed') {
    forgetSearch(b, w); // can't get there: nobody around, forget it
  }
  return false;
}

/** A search over with nobody found: forget the spot (turning to another enemy heard meanwhile, if any, AI-15). */
function forgetSearch(b: Bot, w: BotWorld): void {
  b.searchLookLeft = 0;
  b.hasLastKnown = false;
  b.heardAt = Number.NEGATIVE_INFINITY;
  if (recallHeardOther(b, w.time, w.cfg)) b.routeState = 'none';
}

/** Flag mode: to the spot by the pole (or the guard spot) and stay there. See enterFlagMode. */
function flag(b: Bot, w: BotWorld, cmd: PlayerCommand, dt: number): boolean {
  const cfg = w.cfg;
  // The raiser changed (hit, or the player took the rope): raise, or guard, instead.
  if (b.flagGuard !== (flagRole(b, w) === 'attack' && !b.raiser)) pickFlagSpot(b, w);
  const p = b.character.position;
  const arrive = b.flagGuard ? cfg.coverArrive : cfg.flagArrive;
  if (Math.hypot(b.flagGoal.x - p.x, b.flagGoal.z - p.z) <= arrive) {
    // At the pole: crouch and stay, working the rope. Guarding: hold there, watching (crouched where that still sees).
    b.routeState = 'none';
    b.holding = b.flagGuard;
    cmd.crouch = b.flagGuard ? b.holdCrouch : true;
    if (b.holding) b.teamWait += dt;
    return false;
  }
  const pole = w.round.flag.position;
  if (b.routeState === 'failed') {
    if (!b.flagGuard && (b.flagGoal.x !== pole.x || b.flagGoal.z !== pole.z)) {
      // No way to that spot: try the foot of the pole itself.
      b.flagGoal.x = pole.x;
      b.flagGoal.z = pole.z;
      b.routeState = 'none';
    } else if (w.time >= b.routeRetryAt) {
      // No way there either (KNOWN_ISSUES): try again every routeRetryDelay rather than stand there for good.
      b.routeState = 'none';
    }
  }
  wantRoute(b, b.flagGoal, cfg);
  return followRoute(b, w, dt);
}

/**
 * Moves according to the mode. Returns whether the bot is walking a route (direction in `b.moveDir`). `target`: who it
 * fights (sidesteps keep them in sight, AI-05).
 */
export function moveBot(b: Bot, w: BotWorld, cmd: PlayerCommand, dt: number, target?: Character): boolean {
  const cfg = w.cfg;
  b.holding = false;
  // Any tick not spent settled at the post (advance sets it again) ends the hold there, so the next is a fresh one.
  const atPost = b.atPost;
  b.atPost = false;
  switch (b.mode) {
    case 'advance':
      return advance(b, w, dt, atPost);
    case 'search':
      return search(b, w, cmd, dt);
    case 'flag':
      return flag(b, w, cmd, dt);
    case 'cover': {
      // Get there, then keep low, standing up only to look over crouch cover. At a corner of full cover,
      // stand right on the spot (a few centimetres decide whether a lean sees round it) and stay upright.
      if (followRoute(b, w, dt)) return true;
      if (b.cover.lean === 0) {
        // Not while still waiting for the route there (AI-13): no crouch-bob before running.
        cmd.crouch = b.routeState === 'none' && b.coverPhase === 'down';
        return false;
      }
      const p = b.character.position;
      const dx = b.cover.position.x - p.x;
      const dz = b.cover.position.z - p.z;
      const d = Math.hypot(dx, dz);
      if (b.routeState !== 'none' || d <= cfg.leanSpotReach || d > cfg.leanSpotApproachMax) return false;
      const reach = Math.min(d, cfg.edgeLookahead) / d;
      if (dropOnLine(w.nav, p.x, p.y, p.z, p.x + dx * reach, p.z + dz * reach)) return false;
      b.moveDir.x = dx / d;
      b.moveDir.z = dz / d;
      cmd.walk = true;
      return true;
    }
    case 'order':
      return moveOrder(b, w, cmd, dt);
    case 'fight': {
      // Fighting over crouch cover: stay put behind it. The raiser at the rope stays on it too (AI-06): a sidestep out
      // of the pole's reach would stop the flag.
      if (b.fromCover || (b.raiser && atPole(b, w))) return false;
      // Otherwise sidestep while shooting.
      b.strafeLeft -= dt;
      if (b.strafeLeft <= 0) {
        b.strafeLeft = pick(b.rng, cfg.strafeTime);
        b.strafeDir = rngNext(b.rng) < 0.5 ? -1 : 1;
      }
      // Never sidestep off a floor, into a wall or out of sight of the target: turn back, or step forward or back if
      // both sides are blocked (so a bot on a narrow walkway doesn't stand still and steady its aim), or stand.
      if (stepBlocked(b, w, b.strafeDir, 0, target)) b.strafeDir = -b.strafeDir;
      if (!stepBlocked(b, w, b.strafeDir, 0, target)) {
        cmd.right = b.strafeDir * cfg.strafeInput;
      } else if (!stepBlocked(b, w, 0, b.strafeDir, target)) {
        cmd.forward = b.strafeDir * cfg.strafeInput;
      } else if (!stepBlocked(b, w, 0, -b.strafeDir, target)) {
        cmd.forward = -b.strafeDir * cfg.strafeInput;
      }
      return false;
    }
  }
}

/** True if the bot is within reach of the flag's rope (FLAG.radius of the pole). */
function atPole(b: Bot, w: BotWorld): boolean {
  const p = b.character.position;
  const pole = w.round.flag.position;
  return Math.hypot(p.x - pole.x, p.z - pole.z) <= FLAG.radius;
}

/**
 * Keeping apart (AI-01; characters pass through each other in the physics): pushes `b` away from everyone in play
 * whose centre is within separationDistance on about its floor, harder the closer they are (two at the same spot split
 * by id). Walking (`moving`), the push bends `b.moveDir` and, where it is against the way, slows the walk; standing
 * still with nothing else to do, the bot walks out of the way. Returns whether the bot now walks (`b.moveDir`).
 */
export function keepApart(b: Bot, w: BotWorld, moving: boolean, cmd: PlayerCommand): boolean {
  const me = b.character;
  const reach = w.cfg.separationDistance;
  let px = 0;
  let pz = 0;
  for (const o of w.characters) {
    if (o === me || !isInPlay(o) || Math.abs(o.position.y - me.position.y) > w.body.height) continue;
    const dx = me.position.x - o.position.x;
    const dz = me.position.z - o.position.z;
    const d = Math.hypot(dx, dz);
    if (d >= reach) continue;
    const k = (reach - d) / reach;
    if (d > 1e-4) {
      px += (dx / d) * k;
      pz += (dz / d) * k;
    } else {
      px += me.id < o.id ? k : -k;
    }
  }
  if (px === 0 && pz === 0) return moving;
  if (moving) {
    const x = b.moveDir.x + px;
    const z = b.moveDir.z + pz;
    const len = Math.hypot(x, z);
    if (len < 1e-6) return moving;
    const scale = len > 1 ? 1 / len : 1; // no faster than the walk, slower where the push is against it
    b.moveDir.x = x * scale;
    b.moveDir.z = z * scale;
    return true;
  }
  if (cmd.forward !== 0 || cmd.right !== 0) return false; // sidestepping in a fight already
  const len = Math.hypot(px, pz);
  b.moveDir.x = px / len;
  b.moveDir.z = pz / len;
  cmd.walk = true;
  return true;
}

/**
 * True if a step to the view's right (`right` 1) or left (-1), or forward (`forward` 1) or back (-1), would soon
 * step off a floor or into a wall (AI-05: the end of the step must be walkable ground), or put the target (if one is
 * given) out of sight of the bot's eyes moved that way.
 */
function stepBlocked(b: Bot, w: BotWorld, right: number, forward: number, target?: Character): boolean {
  // The view's right on the ground plane is (cos yaw, 0, -sin yaw), its forward (-sin yaw, 0, -cos yaw) (stepMovement).
  const yaw = b.aim.yaw;
  const dx = Math.cos(yaw) * right - Math.sin(yaw) * forward;
  const dz = -Math.sin(yaw) * right - Math.cos(yaw) * forward;
  const p = b.character.position;
  const reach = w.cfg.edgeLookahead;
  if (dropOnLine(w.nav, p.x, p.y, p.z, p.x + dx * reach, p.z + dz * reach) || !isWalkableAt(w.nav, p.x + dx * reach, p.y, p.z + dz * reach)) return true;
  if (!target || !b.targetVisible) return false;
  eyeOf(b.character, w.body, w.hits, sideEye);
  sideEye.x += dx * w.cfg.strafeSightOffset;
  sideEye.z += dz * w.cfg.strafeSightOffset;
  return !lineClear(w.query, sideEye, bodyPoint(target, w.hits, b.targetPart, targetPoint));
}
