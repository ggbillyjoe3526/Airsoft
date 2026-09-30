import type { BotConfig } from '../config/bots';
import type { HitConfig } from '../config/hits';
import type { BodyConfig } from '../config/movement';
import type { ReplicaConfig } from '../config/replicas';
import type { NavGrid } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import type { Character } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import { characterHitVolume, rayCharacter, type VerticalCapsule } from '../sim/hitbox';
import { createRng, type RngState, rngNext } from '../sim/rng';
import { type Vec3, vec3 } from '../sim/vec';
import { type AimState, aimErrorSize, createAim, lookAngles, stepAim } from './aim';
import { type CoverSpot, findCover } from './cover';
import { bodyPoint, eyeOf, lineClear, visiblePart } from './perception';

/**
 * One bot's mind. Bots are ordinary characters driven through PlayerCommands; this decides those
 * commands from what the bot has seen and heard. Modes:
 * - advance: walk a lane towards the enemy side, pausing at lane points to look ahead; once the lane
 *   is swept, hunt: head for the parts of the map the team has checked least recently;
 * - fight: someone is in sight: react, aim, shoot in bursts, sidestep;
 * - cover: under fire or reloading: move to a spot hidden from the threat, wait, then peek;
 * - search: lost sight of (or heard) someone: go to where they were last known.
 */
export type BotMode = 'advance' | 'fight' | 'cover' | 'search';

export interface Bot {
  character: Character;
  rng: RngState;
  aim: AimState;
  mode: BotMode;
  thinkLeft: number;

  // What it knows. Sight and hearing are tracked apart: only sight counts as "the same contact".
  targetId: number;
  targetVisible: boolean;
  /** Which part of the target is visible, as a fraction of its height (aim there). */
  targetPart: number;
  lastSeenAt: number;
  heardAt: number;
  /** Who was last heard, and the error of the guess of where they are (kept for the whole contact). */
  heardFromId: number;
  heardOffsetX: number;
  heardOffsetZ: number;
  lastKnown: Vec3;
  hasLastKnown: boolean;
  acquiredAt: number;
  reactionLeft: number;
  lastThreatAt: number;
  suppressedAt: number;

  // Firing.
  burstLeft: number;
  pauseLeft: number;

  // Moving.
  lane: number;
  laneIndex: number;
  laneDir: number;
  /** Swept the whole lane: now hunting the least recently checked parts of the map. */
  hunting: boolean;
  holdLeft: number;
  route: Vec3[];
  routeLeg: number;
  routeGoal: Vec3;
  /** 'none': no route; 'wanted': waiting for the planner; 'ok': following `route`; 'failed': no route exists. */
  routeState: 'none' | 'wanted' | 'ok' | 'failed';
  stuckFor: number;
  cover: CoverSpot;
  coverLeft: number;
  /** Time left before giving up on cover altogether (unreachable spot, endless reload...). */
  coverGiveUp: number;
  /** Seconds spent at the cover spot so far. */
  coverHeld: number;
  coverCooldown: number;
  strafeDir: number;
  strafeLeft: number;
}

/** Everything a bot's decisions depend on besides its own state. */
export interface BotWorld {
  characters: readonly Character[];
  query: WorldQuery;
  nav: NavGrid;
  lanes: readonly (readonly Vec3[])[];
  body: BodyConfig;
  hits: HitConfig;
  loadout: readonly ReplicaConfig[];
  cfg: BotConfig;
  /** Per team, the yaw that faces the enemy's side of the map. */
  enemyYaw: readonly number[];
  /** Picks somewhere worth checking for `bot`'s team (least recently visited); false if none. */
  huntPoint(bot: Bot, out: Vec3): boolean;
  /** Simulation time now (s). */
  time: number;
  /** False after the round is decided (cease-fire). */
  live: boolean;
}

export function createBot(character: Character, seed: number, laneCount: number, cfg: BotConfig): Bot {
  const bot: Bot = {
    character,
    rng: createRng(seed),
    aim: createAim(character.yaw),
    mode: 'advance',
    thinkLeft: 0,
    targetId: -1,
    targetVisible: false,
    targetPart: cfg.aimHeightFraction,
    lastSeenAt: Number.NEGATIVE_INFINITY,
    heardAt: Number.NEGATIVE_INFINITY,
    heardFromId: -1,
    heardOffsetX: 0,
    heardOffsetZ: 0,
    lastKnown: vec3(),
    hasLastKnown: false,
    acquiredAt: 0,
    reactionLeft: 0,
    lastThreatAt: Number.NEGATIVE_INFINITY,
    suppressedAt: Number.NEGATIVE_INFINITY,
    burstLeft: 0,
    pauseLeft: 0,
    lane: 0,
    laneIndex: -1,
    laneDir: 1,
    hunting: false,
    holdLeft: 0,
    route: [],
    routeLeg: 0,
    routeGoal: vec3(),
    routeState: 'none',
    stuckFor: 0,
    cover: { position: vec3(), crouchOnly: false },
    coverLeft: 0,
    coverGiveUp: 0,
    coverHeld: 0,
    coverCooldown: 0,
    strafeDir: 1,
    strafeLeft: 0,
  };
  resetBot(bot, laneCount, cfg);
  return bot;
}

/** Fresh round: forget everything, pick a lane and head for its first point on the way to the enemy. */
export function resetBot(b: Bot, laneCount: number, cfg: BotConfig): void {
  const c = b.character;
  b.aim = createAim(c.yaw);
  b.mode = 'advance';
  b.thinkLeft = rngNext(b.rng) * cfg.thinkInterval; // stagger perception across bots
  forgetTarget(b);
  b.hasLastKnown = false;
  b.heardAt = Number.NEGATIVE_INFINITY;
  b.heardFromId = -1;
  b.lastThreatAt = Number.NEGATIVE_INFINITY;
  b.suppressedAt = Number.NEGATIVE_INFINITY;
  b.burstLeft = 0;
  b.pauseLeft = 0;
  b.lane = laneCount > 0 ? Math.floor(rngNext(b.rng) * laneCount) : -1;
  // Blue (team 0) advances west → east through lane points, Orange the other way.
  b.laneDir = c.team === 0 ? 1 : -1;
  b.laneIndex = -1;
  b.hunting = false;
  b.holdLeft = 0;
  b.routeState = 'none';
  b.route.length = 0;
  b.stuckFor = 0;
  b.coverLeft = 0;
  b.coverCooldown = 0;
}

function forgetTarget(b: Bot): void {
  b.targetId = -1;
  b.targetVisible = false;
  b.lastSeenAt = Number.NEGATIVE_INFINITY;
}

const range = (rng: RngState, r: readonly [number, number]): number => r[0] + rngNext(rng) * (r[1] - r[0]);

// Scratch vectors, one per role, so no step depends on another step having filled them.
const myEye = vec3();
const aimAt = vec3();
const aimDir = vec3();
const threatEye = vec3();
const huntGoal = vec3();
const look = { yaw: 0, pitch: 0 };
const move = { x: 0, z: 0 };
const mateBody: VerticalCapsule = { x: 0, z: 0, y0: 0, y1: 0, r: 0 };
const mateHead: VerticalCapsule = { x: 0, z: 0, y0: 0, y1: 0, r: 0 };

/** Asks the planner for a route to `goal`, unless the current (or failed) one already goes about there. */
function wantRoute(b: Bot, goal: Vec3, cfg: BotConfig): void {
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
 * Updates what the bot sees: the closest enemy in sight becomes its target. A new contact (or one out
 * of sight for longer than contactGrace) restarts the reaction delay and aim settling. Hearing never
 * counts as contact.
 */
function perceive(b: Bot, w: BotWorld): void {
  const me = b.character;
  const cfg = w.cfg;
  let best: Character | undefined;
  let bestPart = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (const other of w.characters) {
    if (other.team === me.team || !isInPlay(other)) continue;
    const d = Math.hypot(other.position.x - me.position.x, other.position.z - me.position.z);
    if (d >= bestD) continue;
    const part = visiblePart(me, other, w.query, cfg, w.body, w.hits);
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
      const part = visiblePart(me, cur, w.query, cfg, w.body, w.hits);
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
  if (best.id !== b.targetId || w.time - b.lastSeenAt > cfg.contactGrace) {
    b.reactionLeft = range(b.rng, cfg.reactionTime);
    b.acquiredAt = w.time;
    b.burstLeft = 0;
    b.pauseLeft = 0;
  }
  b.targetId = best.id;
  b.targetVisible = true;
  b.targetPart = bestPart;
  b.lastSeenAt = w.time;
  b.lastThreatAt = w.time;
  b.lastKnown.x = best.position.x;
  b.lastKnown.y = best.position.y;
  b.lastKnown.z = best.position.z;
  b.hasLastKnown = true;
}

/** The current target if it's still in play and hasn't been forgotten. */
function currentTarget(b: Bot, w: BotWorld): Character | undefined {
  if (b.targetId < 0) return undefined;
  if (w.time - b.lastSeenAt > w.cfg.memoryTime) {
    forgetTarget(b);
    return undefined;
  }
  for (const c of w.characters) {
    if (c.id !== b.targetId) continue;
    if (isInPlay(c)) return c;
    // They're out: nothing left to hunt there.
    forgetTarget(b);
    b.hasLastKnown = false;
    return undefined;
  }
  return undefined;
}

/** True if a teammate stands in (or right next to) the line of fire before the target. */
function friendInLine(b: Bot, w: BotWorld, from: Vec3, dir: Vec3, dist: number): boolean {
  const me = b.character;
  for (const mate of w.characters) {
    if (mate === me || mate.team !== me.team || !isInPlay(mate)) continue;
    characterHitVolume(mate, w.hits, mateBody, mateHead);
    mateBody.r += w.cfg.friendlyMargin;
    mateHead.r += w.cfg.friendlyMargin;
    if (rayCharacter(from, dir, dist, mateBody, mateHead) >= 0) return true;
  }
  return false;
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
  return w.huntPoint(b, huntGoal) ? huntGoal : undefined;
}

/**
 * Follows the current route: writes the world direction to walk into `move` and returns true, or
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
  move.x = dx / d;
  move.z = dz / d;
  // Blocked (e.g. by another player): after a moment, ask for a fresh route.
  const speed = Math.hypot(b.character.velocity.x, b.character.velocity.z);
  b.stuckFor = speed < w.cfg.stuckSpeed ? b.stuckFor + dt : 0;
  if (b.stuckFor > w.cfg.stuckTime) {
    b.stuckFor = 0;
    b.routeState = 'wanted';
  }
  return true;
}

/** Picks the mode for this tick from what the bot knows and how it's doing. */
function chooseMode(b: Bot, w: BotWorld, target: Character | undefined, dt: number): void {
  const me = b.character;
  const cfg = w.cfg;
  const seeing = b.targetVisible && target !== undefined;
  const armament = me.armament;
  const reloading = armament.reload > 0;
  const suppressed = w.time - b.suppressedAt < cfg.suppressionTime;

  if (seeing && target && (suppressed || reloading || armament.ammo[0]!.mag === 0) && b.mode !== 'cover' && b.coverCooldown <= 0) {
    b.coverCooldown = cfg.coverCooldown;
    eyeOf(target, w.body, threatEye);
    if (findCover(me.position, threatEye, w.nav, w.query, cfg, w.body, b.rng, b.cover)) {
      b.mode = 'cover';
      b.coverLeft = range(b.rng, cfg.coverTime);
      b.coverGiveUp = cfg.coverMaxTime;
      b.coverHeld = 0;
      b.routeState = 'none';
      wantRoute(b, b.cover.position, cfg);
      return;
    }
  }
  if (b.mode === 'cover') {
    const atCover = Math.hypot(b.cover.position.x - me.position.x, b.cover.position.z - me.position.z) < cfg.coverArrive;
    if (atCover) {
      b.coverLeft -= dt;
      b.coverHeld += dt;
    }
    b.coverGiveUp -= dt;
    // Settled in cover but still in sight of an enemy (flanked, or the spot doesn't hide us): fight back.
    const exposed = b.coverHeld >= cfg.coverSettle && seeing && !reloading;
    const done = exposed || (b.coverLeft <= 0 && !reloading) || b.coverGiveUp <= 0 || b.routeState === 'failed';
    if (!done) return;
    b.routeState = 'none';
  }
  const remembered = b.hasLastKnown && w.time - Math.max(b.lastSeenAt, b.heardAt) < cfg.memoryTime;
  if (seeing) {
    b.mode = 'fight';
  } else if (remembered) {
    if (b.mode !== 'search') b.routeState = 'none';
    b.mode = 'search';
  } else if (b.mode !== 'advance') {
    b.hasLastKnown = false;
    b.mode = 'advance';
    b.routeState = 'none';
    if (!b.hunting && b.laneIndex >= 0) b.laneIndex -= b.laneDir; // re-take the lane point we left
  }
}

/** Moves according to the mode. Returns whether the bot is walking a route (direction in `move`). */
function moveBot(b: Bot, w: BotWorld, cmd: PlayerCommand, dt: number): boolean {
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
        if (arrived) b.holdLeft = range(b.rng, cfg.holdTime); // pause at the point just reached, looking ahead
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
        b.strafeLeft = range(b.rng, cfg.strafeTime);
        b.strafeDir = rngNext(b.rng) < 0.5 ? -1 : 1;
      }
      cmd.right = b.strafeDir * cfg.strafeInput;
      return false;
  }
}

/**
 * Turns the view from `eye`: at the target (with lead and aim error; the point aimed at is written to
 * `aimPoint`), towards where a threat was, or along the route. Returns how far the view still is from
 * the (erroneous) aim point, or Infinity with no target.
 */
function aimBot(b: Bot, w: BotWorld, target: Character | undefined, eye: Vec3, aimPoint: Vec3, moving: boolean, strafing: boolean, dt: number): number {
  const me = b.character;
  const cfg = w.cfg;
  const enemyYaw = w.enemyYaw[me.team] ?? 0;
  if (b.targetVisible && target) {
    // Aim at the part of the body it can see, leading the target by part of the BB's flight time.
    bodyPoint(target, w.hits, b.targetPart, aimPoint);
    const dist = Math.hypot(aimPoint.x - eye.x, aimPoint.y - eye.y, aimPoint.z - eye.z);
    const flight = dist / w.loadout[0]!.muzzleVelocity;
    aimPoint.x += target.velocity.x * flight * cfg.leadFactor;
    aimPoint.z += target.velocity.z * flight * cfg.leadFactor;
    lookAngles(eye.x, eye.y, eye.z, aimPoint.x, aimPoint.y, aimPoint.z, look);
    return stepAim(b.aim, look.yaw, look.pitch, aimErrorSize(w.time - b.acquiredAt, moving || strafing, cfg), cfg, b.rng, dt);
  }
  look.pitch = 0;
  if (b.hasLastKnown && (b.mode === 'search' || b.mode === 'cover' || !moving)) {
    // Watch where the threat was, even while moving there.
    lookAngles(eye.x, eye.y, eye.z, b.lastKnown.x, eye.y, b.lastKnown.z, look);
  } else if (moving && !(b.mode === 'advance' && !b.hunting && Math.cos(Math.atan2(-move.x, -move.z) - enemyYaw) < 0)) {
    look.yaw = Math.atan2(-move.x, -move.z);
  } else {
    // Holding a point, or walking back along the lane: face the enemy side rather than turn our back.
    look.yaw = enemyYaw;
  }
  stepAim(b.aim, look.yaw, look.pitch, 0, cfg, b.rng, dt);
  return Number.POSITIVE_INFINITY;
}

/** Bursts at the target from `eye` towards `aimPoint` once reacted and on aim, never with a teammate or cover in the way. */
function shootBot(b: Bot, w: BotWorld, target: Character | undefined, eye: Vec3, aimPoint: Vec3, offAim: number, cmd: PlayerCommand, dt: number): void {
  const me = b.character;
  const cfg = w.cfg;
  const ready = w.live && b.targetVisible && b.reactionLeft <= 0 && !cmd.sprint && b.mode !== 'cover';
  if (!ready || !target || offAim >= (cfg.fireCone * Math.PI) / 180) {
    b.pauseLeft = Math.max(0, b.pauseLeft - dt);
    return;
  }
  const cp = Math.cos(b.aim.pitch);
  aimDir.x = -Math.sin(b.aim.yaw) * cp;
  aimDir.y = Math.sin(b.aim.pitch);
  aimDir.z = -Math.cos(b.aim.yaw) * cp;
  const dist = Math.hypot(target.position.x - me.position.x, target.position.z - me.position.z);
  // Sight is refreshed 10×/s; don't fire into cover the target has just stepped behind.
  if (friendInLine(b, w, eye, aimDir, dist) || !lineClear(w.query, eye, aimPoint)) return;
  if (b.burstLeft <= 0 && b.pauseLeft <= 0) b.burstLeft = range(b.rng, cfg.burst);
  if (b.burstLeft > 0) {
    cmd.fire = true;
    b.burstLeft -= dt;
    if (b.burstLeft <= 0) b.pauseLeft = range(b.rng, cfg.burstPause);
  } else {
    b.pauseLeft -= dt;
  }
}

/** Reloads when empty, or tops up when nobody is in sight. */
function reloadBot(b: Bot, w: BotWorld, cmd: PlayerCommand): void {
  const ammo = b.character.armament.ammo[0]!;
  const replica = w.loadout[0]!;
  if (ammo.reserve <= 0) return;
  if (ammo.mag === 0 || (!b.targetVisible && ammo.mag < replica.magSize * w.cfg.tacticalReloadFraction)) cmd.reload = true;
}

/**
 * One tick of decisions for bot `b`, written into `cmd`. Characters out of play are driven by the
 * simulation's hit-calling routine instead, so this only keeps the view in sync for them.
 */
export function thinkBot(b: Bot, w: BotWorld, cmd: PlayerCommand, dt: number): void {
  const me = b.character;
  const cfg = w.cfg;
  cmd.forward = 0;
  cmd.right = 0;
  cmd.sprint = false;
  cmd.crouch = false;
  cmd.jump = false;
  cmd.fire = false;
  cmd.reload = false;
  cmd.switchTo = 0; // bots use their primary
  if (!isInPlay(me)) {
    b.mode = 'advance';
    b.aim.yaw = cmd.yaw = me.yaw;
    b.aim.pitch = cmd.pitch = me.pitch;
    return;
  }

  b.thinkLeft -= dt;
  if (b.thinkLeft <= 0) {
    b.thinkLeft += cfg.thinkInterval;
    if (w.live) perceive(b, w);
    else b.targetVisible = false;
  }
  const target = currentTarget(b, w);
  if (!target) b.targetVisible = false;
  if (b.targetVisible) b.reactionLeft -= dt;
  b.coverCooldown -= dt;

  chooseMode(b, w, target, dt);
  const moving = moveBot(b, w, cmd, dt);
  if (moving) {
    // World direction → command axes relative to the current view.
    cmd.forward = -Math.sin(b.aim.yaw) * move.x - Math.cos(b.aim.yaw) * move.z;
    cmd.right = Math.cos(b.aim.yaw) * move.x - Math.sin(b.aim.yaw) * move.z;
    const calm = w.time - b.lastThreatAt > cfg.sprintWhenCalmFor;
    cmd.sprint = b.mode === 'advance' && calm && cmd.forward > cfg.sprintForward;
  }
  eyeOf(me, w.body, myEye);
  const offAim = aimBot(b, w, target, myEye, aimAt, moving, cmd.right !== 0, dt);
  cmd.yaw = b.aim.yaw;
  cmd.pitch = b.aim.pitch;
  shootBot(b, w, target, myEye, aimAt, offAim, cmd, dt);
  reloadBot(b, w, cmd);
}
