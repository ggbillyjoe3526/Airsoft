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
import { bodyPoint, canSee, eyeOf } from './perception';

/**
 * One bot's mind. Bots are ordinary characters driven through PlayerCommands; this decides those
 * commands from what the bot has seen and heard. Modes:
 * - advance: walk a lane towards the enemy side, pausing at lane points to look ahead;
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

  // What it knows.
  targetId: number;
  targetVisible: boolean;
  lastSeenAt: number;
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
  holdLeft: number;
  route: Vec3[];
  routeLeg: number;
  routeGoal: Vec3;
  /** 'none': no route; 'wanted': waiting for the planner; 'ok': following `route`; 'failed': no route exists. */
  routeState: 'none' | 'wanted' | 'ok' | 'failed';
  stuckFor: number;
  cover: CoverSpot;
  coverLeft: number;
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
  /** Simulation time now (s). */
  time: number;
  /** False after the round is decided (cease-fire). */
  live: boolean;
}

export function createBot(character: Character, seed: number, laneCount: number): Bot {
  const rng = createRng(seed);
  const bot: Bot = {
    character,
    rng,
    aim: createAim(character.yaw),
    mode: 'advance',
    thinkLeft: 0,
    targetId: -1,
    targetVisible: false,
    lastSeenAt: Number.NEGATIVE_INFINITY,
    lastKnown: vec3(),
    hasLastKnown: false,
    acquiredAt: 0,
    reactionLeft: 0,
    lastThreatAt: Number.NEGATIVE_INFINITY,
    suppressedAt: Number.NEGATIVE_INFINITY,
    burstLeft: 0,
    pauseLeft: 0,
    lane: 0,
    laneIndex: 0,
    laneDir: 1,
    holdLeft: 0,
    route: [],
    routeLeg: 0,
    routeGoal: vec3(),
    routeState: 'none',
    stuckFor: 0,
    cover: { position: vec3(), crouchOnly: false },
    coverLeft: 0,
    coverCooldown: 0,
    strafeDir: 1,
    strafeLeft: 0,
  };
  resetBot(bot, laneCount);
  return bot;
}

/** Fresh round: forget everything, pick a lane and head for its first point on the way to the enemy. */
export function resetBot(b: Bot, laneCount: number): void {
  const c = b.character;
  b.aim = createAim(c.yaw);
  b.mode = 'advance';
  b.thinkLeft = rngNext(b.rng) * 0.1; // stagger perception across bots
  b.targetId = -1;
  b.targetVisible = false;
  b.lastSeenAt = Number.NEGATIVE_INFINITY;
  b.hasLastKnown = false;
  b.lastThreatAt = Number.NEGATIVE_INFINITY;
  b.suppressedAt = Number.NEGATIVE_INFINITY;
  b.burstLeft = 0;
  b.pauseLeft = 0;
  b.lane = laneCount > 0 ? Math.floor(rngNext(b.rng) * laneCount) : -1;
  // Blue (team 0) advances west → east through lane points, Orange the other way.
  b.laneDir = c.team === 0 ? 1 : -1;
  b.laneIndex = -1; // set on the first advance step
  b.holdLeft = 0;
  b.routeState = 'none';
  b.route.length = 0;
  b.stuckFor = 0;
  b.coverLeft = 0;
  b.coverCooldown = 0;
}

const range = (rng: RngState, r: readonly [number, number]): number => r[0] + rngNext(rng) * (r[1] - r[0]);

const eye = vec3();
const aimPoint = vec3();
const aimDir = vec3();
const look = { yaw: 0, pitch: 0 };
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
  if (b.routeState === 'ok' && moved < cfg.replanDistance) return;
  if (b.routeState === 'failed' && moved < cfg.replanDistance) return;
  b.routeGoal.x = goal.x;
  b.routeGoal.y = goal.y;
  b.routeGoal.z = goal.z;
  b.routeState = 'wanted';
}

/**
 * Updates what the bot sees: the closest enemy in sight becomes its target. A new contact (or one
 * out of sight for longer than contactGrace) restarts the reaction delay and aim settling.
 */
function perceive(b: Bot, w: BotWorld): void {
  const me = b.character;
  let best: Character | undefined;
  let bestD = Number.POSITIVE_INFINITY;
  for (const other of w.characters) {
    if (other.team === me.team || !isInPlay(other)) continue;
    const d = Math.hypot(other.position.x - me.position.x, other.position.z - me.position.z);
    if (d >= bestD) continue;
    if (canSee(me, other, w.query, w.cfg, w.body, w.hits)) {
      best = other;
      bestD = d;
    }
  }
  if (!best) {
    b.targetVisible = false;
    return;
  }
  if (best.id !== b.targetId || w.time - b.lastSeenAt > w.cfg.contactGrace) {
    b.reactionLeft = range(b.rng, w.cfg.reactionTime);
    b.acquiredAt = w.time;
    b.burstLeft = 0;
    b.pauseLeft = 0;
  }
  b.targetId = best.id;
  b.targetVisible = true;
  b.lastSeenAt = w.time;
  b.lastThreatAt = w.time;
  b.lastKnown.x = best.position.x;
  b.lastKnown.y = best.position.y;
  b.lastKnown.z = best.position.z;
  b.hasLastKnown = true;
}

function targetOf(b: Bot, w: BotWorld): Character | undefined {
  if (b.targetId < 0) return undefined;
  for (const c of w.characters) if (c.id === b.targetId) return isInPlay(c) ? c : undefined;
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

/** Next lane point to walk to, flipping direction at the lane's ends. */
function nextLanePoint(b: Bot, w: BotWorld): Vec3 | undefined {
  const lane = w.lanes[b.lane];
  if (!lane || lane.length === 0) return undefined;
  if (b.laneIndex < 0) {
    // Start at the end of the lane on our own side.
    b.laneIndex = b.laneDir > 0 ? 0 : lane.length - 1;
  } else {
    let i = b.laneIndex + b.laneDir;
    if (i < 0 || i >= lane.length) {
      b.laneDir = -b.laneDir; // swept the whole lane: come back along it
      i = b.laneIndex + b.laneDir;
    }
    b.laneIndex = Math.max(0, Math.min(lane.length - 1, i));
  }
  return lane[b.laneIndex];
}

/**
 * Follows the current route: returns the world direction to walk (unit, in `out`) or false when there
 * is nothing to walk (no route, or arrived).
 */
function followRoute(b: Bot, w: BotWorld, dt: number, out: { x: number; z: number }): boolean {
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
  out.x = dx / d;
  out.z = dz / d;
  // Blocked (e.g. by another player): after a moment, ask for a fresh route.
  const speed = Math.hypot(b.character.velocity.x, b.character.velocity.z);
  b.stuckFor = speed < w.cfg.stuckSpeed ? b.stuckFor + dt : 0;
  if (b.stuckFor > w.cfg.stuckTime) {
    b.stuckFor = 0;
    b.routeState = 'wanted';
  }
  return true;
}

const move = { x: 0, z: 0 };

/**
 * One tick of decisions for bot `b`, written into `cmd`. Characters out of play are driven by the
 * simulation's hit-calling routine instead, so this does nothing for them.
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
    b.aim.yaw = me.yaw;
    b.aim.pitch = me.pitch;
    cmd.yaw = me.yaw;
    cmd.pitch = me.pitch;
    return;
  }

  b.thinkLeft -= dt;
  if (b.thinkLeft <= 0) {
    b.thinkLeft += cfg.thinkInterval;
    if (w.live) perceive(b, w);
    else b.targetVisible = false;
  }
  const target = targetOf(b, w);
  if (!target) {
    b.targetVisible = false;
    if (b.targetId >= 0) b.hasLastKnown = false; // they're out: nothing to hunt
    b.targetId = -1;
  }
  const seeing = b.targetVisible && target !== undefined;
  if (seeing) b.reactionLeft -= dt;
  b.coverCooldown -= dt;

  const armament = me.armament;
  const ammo = armament.ammo[0]!;
  const reloading = armament.reload > 0;
  const suppressed = w.time - b.suppressedAt < cfg.suppressionTime;

  // ---- Choose what to do -----------------------------------------------------------------------
  if (seeing && (suppressed || reloading || ammo.mag === 0) && b.mode !== 'cover' && b.coverCooldown <= 0) {
    b.coverCooldown = cfg.coverCooldown;
    eyeOf(target, w.body, eye);
    if (findCover(me.position, eye, w.nav, w.query, cfg, w.body, b.rng, b.cover)) {
      b.mode = 'cover';
      b.coverLeft = range(b.rng, cfg.coverTime);
      b.routeState = 'none';
      wantRoute(b, b.cover.position, cfg);
    }
  }
  if (b.mode === 'cover') {
    const atCover = Math.hypot(b.cover.position.x - me.position.x, b.cover.position.z - me.position.z) < cfg.coverArrive;
    if (atCover) b.coverLeft -= dt;
    if (b.coverLeft <= 0 && !reloading) b.mode = seeing ? 'fight' : 'search';
  } else if (seeing) {
    b.mode = 'fight';
  } else if (b.hasLastKnown && w.time - b.lastSeenAt < cfg.memoryTime) {
    if (b.mode !== 'search') b.routeState = 'none';
    b.mode = 'search';
  } else if (b.mode !== 'advance') {
    b.hasLastKnown = false;
    b.mode = 'advance';
    b.routeState = 'none';
    b.laneIndex = Math.max(-1, b.laneIndex - b.laneDir); // re-take the lane point we left
  }

  // ---- Move --------------------------------------------------------------------------------------
  let moving = false;
  let lookAlongMove = true;
  switch (b.mode) {
    case 'advance': {
      if (b.holdLeft > 0) {
        b.holdLeft -= dt;
        lookAlongMove = false;
        break;
      }
      if (b.routeState === 'none' || b.routeState === 'failed') {
        const p = nextLanePoint(b, w);
        if (p) {
          if (b.routeState === 'none' && b.laneIndex >= 0 && b.route.length > 0) b.holdLeft = range(b.rng, cfg.holdTime);
          wantRoute(b, p, cfg);
          if (b.routeState === 'failed') b.routeState = 'none';
        }
      }
      moving = followRoute(b, w, dt, move);
      break;
    }
    case 'search':
      wantRoute(b, b.lastKnown, cfg);
      moving = followRoute(b, w, dt, move);
      if (!moving && b.routeState === 'none') b.hasLastKnown = false; // got there: nobody around
      break;
    case 'cover':
      // Get there, then keep low until it's time to peek (fight mode stands up again).
      moving = followRoute(b, w, dt, move);
      cmd.crouch = !moving;
      break;
    case 'fight': {
      // Sidestep while shooting; stand still-ish otherwise.
      b.strafeLeft -= dt;
      if (b.strafeLeft <= 0) {
        b.strafeLeft = range(b.rng, cfg.strafeTime);
        b.strafeDir = rngNext(b.rng) < 0.5 ? -1 : 1;
      }
      cmd.right = b.strafeDir * cfg.strafeInput;
      lookAlongMove = false;
      break;
    }
  }
  if (moving) {
    // World direction → command axes relative to the current view.
    const f = -Math.sin(b.aim.yaw) * move.x - Math.cos(b.aim.yaw) * move.z;
    const r = Math.cos(b.aim.yaw) * move.x - Math.sin(b.aim.yaw) * move.z;
    cmd.forward = f;
    cmd.right = r;
    const calm = w.time - b.lastThreatAt > cfg.sprintWhenCalmFor;
    cmd.sprint = b.mode === 'advance' && calm && f > 0.9;
  }

  // ---- Look and aim ------------------------------------------------------------------------------
  eyeOf(me, w.body, eye);
  let offAim = Number.POSITIVE_INFINITY;
  if (seeing && target) {
    // Aim at the chest, leading the target a little by the BB's flight time.
    bodyPoint(target, w.hits, cfg.aimHeightFraction, aimPoint);
    const dist = Math.hypot(aimPoint.x - eye.x, aimPoint.y - eye.y, aimPoint.z - eye.z);
    const flight = dist / w.loadout[0]!.muzzleVelocity;
    aimPoint.x += target.velocity.x * flight * cfg.leadFactor;
    aimPoint.z += target.velocity.z * flight * cfg.leadFactor;
    lookAngles(eye.x, eye.y, eye.z, aimPoint.x, aimPoint.y, aimPoint.z, look);
    const err = aimErrorSize(w.time - b.acquiredAt, moving || cmd.right !== 0, cfg);
    offAim = stepAim(b.aim, look.yaw, look.pitch, err, cfg, b.rng, dt);
  } else {
    if (moving && lookAlongMove) {
      look.yaw = Math.atan2(-move.x, -move.z);
      look.pitch = 0;
    } else if (b.hasLastKnown) {
      lookAngles(eye.x, eye.y, eye.z, b.lastKnown.x, eye.y, b.lastKnown.z, look);
    } else {
      look.yaw = me.team === 0 ? -Math.PI / 2 : Math.PI / 2; // towards the enemy side
      look.pitch = 0;
    }
    stepAim(b.aim, look.yaw, look.pitch, 0, cfg, b.rng, dt);
  }
  cmd.yaw = b.aim.yaw;
  cmd.pitch = b.aim.pitch;

  // ---- Shoot -------------------------------------------------------------------------------------
  const readyToShoot = w.live && seeing && b.reactionLeft <= 0 && !cmd.sprint && b.mode !== 'cover';
  if (readyToShoot && target && offAim < (cfg.fireCone * Math.PI) / 180) {
    const cp = Math.cos(b.aim.pitch);
    aimDir.x = -Math.sin(b.aim.yaw) * cp;
    aimDir.y = Math.sin(b.aim.pitch);
    aimDir.z = -Math.cos(b.aim.yaw) * cp;
    const dist = Math.hypot(target.position.x - me.position.x, target.position.z - me.position.z);
    if (!friendInLine(b, w, eye, aimDir, dist)) {
      if (b.burstLeft <= 0 && b.pauseLeft <= 0) b.burstLeft = range(b.rng, cfg.burst);
      if (b.burstLeft > 0) {
        cmd.fire = true;
        b.burstLeft -= dt;
        if (b.burstLeft <= 0) b.pauseLeft = range(b.rng, cfg.burstPause);
      } else {
        b.pauseLeft -= dt;
      }
    }
  } else {
    b.pauseLeft = Math.max(0, b.pauseLeft - dt);
  }

  // ---- Reload --------------------------------------------------------------------------------------
  const replica = w.loadout[0];
  if (ammo.mag === 0 && ammo.reserve > 0) cmd.reload = true;
  else if (!seeing && replica && ammo.mag < replica.magSize * cfg.tacticalReloadFraction && ammo.reserve > 0) cmd.reload = true;
}
