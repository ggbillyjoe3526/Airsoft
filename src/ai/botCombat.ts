import { aimDirection, canReload } from '../sim/armament';
import { BALLISTICS } from '../config/ballistics';
import { bbMass, muzzleVelocity } from '../config/replicas';
import { flightTimeEstimate } from '../sim/ballistics';
import { type Character, eyeHeight } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import { characterHitVolume, createHitVolume, type HitVolume, rayCharacter } from '../sim/hitbox';
import { type Vec3, vec3, wrapAngle } from '../sim/vec';
import { aimErrorSize, lookAngles, stepAim } from './aim';
import { findHeldAngles, type HeldAngle } from './angles';
import { type Bot, type BotWorld, pick, threatInMind } from './bot';
import { hasReacted } from './botSenses';
import { bodyPoint, lineClear } from './perception';

const DEG = Math.PI / 180;

// Scratch, each used only within one call of the function that fills it.
const look = { yaw: 0, pitch: 0 };
const aimLine = vec3();
const standEye = vec3();
const raisedPoint = vec3();
const mateVolume: HitVolume = createHitVolume();
const lastKnownHead = vec3();

/** How long a bot's BB takes to fly `dist` metres (its primary replica, its factory BBs). */
function bbFlightTime(w: BotWorld, dist: number): number {
  const replica = w.loadout[0]!;
  return flightTimeEstimate(dist, muzzleVelocity(replica), bbMass(replica), BALLISTICS);
}

/**
 * Turns the view from `eye`: at the target (with lead and aim error; the point aimed at is written to
 * `aimPoint`), towards where a threat was, or along the route (`walking`: following `b.moveDir`).
 * Aim is worse while walking or sidestepping (`cmd.right`). Returns how far the view still is from the
 * (erroneous) aim point, or Infinity with no target.
 */
export function aimBot(b: Bot, w: BotWorld, target: Character | undefined, eye: Vec3, aimPoint: Vec3, walking: boolean, cmd: PlayerCommand, dt: number): number {
  const me = b.character;
  const cfg = w.cfg;
  const enemyYaw = w.enemyYaw[me.team] ?? 0;
  if (b.targetVisible && target && b.contact) {
    // Aim at the part of the body it can see, leading the target by part of the BB's flight time (slowed by drag, M30).
    bodyPoint(target, w.hits, b.targetPart, aimPoint);
    const dist = Math.hypot(aimPoint.x - eye.x, aimPoint.y - eye.y, aimPoint.z - eye.z);
    const flight = bbFlightTime(w, dist);
    aimPoint.x += target.velocity.x * flight * b.skill.leadFactor;
    aimPoint.z += target.velocity.z * flight * b.skill.leadFactor;
    lookAngles(eye.x, eye.y, eye.z, aimPoint.x, aimPoint.y, aimPoint.z, look);
    // The target's own speed across the line of sight (the bot's movement is aimErrorMovingDeg).
    const v = target.velocity;
    const sideways = (v.x * (aimPoint.z - eye.z) - v.z * (aimPoint.x - eye.x)) / Math.max(Math.hypot(aimPoint.x - eye.x, aimPoint.z - eye.z), 1e-3);
    const error = aimErrorSize(w.time - b.contact.acquiredAt, walking || cmd.right !== 0, dist, sideways, b.skill);
    return stepAim(b.aim, look.yaw, look.pitch, error, cfg, b.skill, b.rng, dt);
  }
  look.pitch = 0;
  const walkYaw = Math.atan2(-b.moveDir.x, -b.moveDir.z);
  if (b.mode === 'search' && b.searchLookLeft > 0) {
    // At the end of a search (AI-14): look round, one way then the other, from the way it arrived.
    const t = 1 - b.searchLookLeft / b.searchLookTime;
    look.yaw = b.searchLookYaw + Math.sin(2 * Math.PI * t) * cfg.searchLookDeg * DEG;
  } else if (walking && b.careful && b.mode === 'search' && b.hasLastKnown && sliceTowardsLastKnown(b, w, eye, cmd)) {
    // Slicing towards someone heard or lost (M38): while the spot is round a corner, aim at that corner and lean out.
  } else if (b.hasLastKnown && (b.mode === 'search' || b.mode === 'cover' || !walking)) {
    // Watch where the threat was, even while moving there; slicing corners (M38), at head height there.
    const y = b.skill.slicesCorners ? b.lastKnown.y + w.body.standEyeHeight : eye.y;
    lookAngles(eye.x, eye.y, eye.z, b.lastKnown.x, y, b.lastKnown.z, look);
  } else if (b.mode === 'order' && (!walking || (b.order === 'follow' && !b.orderRush))) {
    // A squad order (M22): at its spot, look the way the order says; keeping up behind a leader, keep covering their
    // back on the move too (only hurrying, it looks where it runs).
    look.yaw = b.orderYaw;
  } else if (walking && b.careful && b.mode === 'advance' && slice(b, w, heldAngleLook(b, w, eye, walkYaw, false), cmd)) {
    // Slicing (M38): walking near the enemy, aim at the corner ahead someone could step out of, not where it walks,
    // and lean out past a near one to see round it a slice at a time.
  } else if (walking && !(b.mode === 'advance' && !b.hunting && Math.cos(walkYaw - enemyYaw) < 0)) {
    look.yaw = walkYaw;
  } else {
    // Holding a point, or walking back along the lane: face the enemy side rather than turn our back. Holding, sweep
    // the view slowly across it (AI-02) rather than stare one way.
    look.yaw = enemyYaw;
    // Pro (M37) aims at the corners someone would come round instead of sweeping.
    if (b.holding && !(b.skill.holdsAngles && heldAngleLook(b, w, eye, enemyYaw, false))) {
      look.yaw += Math.sin((2 * Math.PI * b.teamWait) / cfg.holdSweepPeriod) * cfg.holdSweepDeg * DEG;
    }
  }
  stepAim(b.aim, look.yaw, look.pitch, 0, cfg, b.skill, b.rng, dt);
  return Number.POSITIVE_INFINITY;
}

/**
 * Slicing (M38): leans out past `a`, the corner aimed at, once it is within sliceLeanDistance (towards its open side).
 * False if there is no corner to slice.
 */
function slice(b: Bot, w: BotWorld, a: HeldAngle | null, cmd: PlayerCommand): boolean {
  if (!a) return false;
  const p = b.character.position;
  if (Math.hypot(a.point.x - p.x, a.point.z - p.z) <= w.cfg.sliceLeanDistance) cmd.lean = a.side;
  return true;
}

/**
 * Closing in on where someone was heard or last seen (M38): while that spot, at head height, is out of view round a
 * corner, slice the corner nearest its bearing. False once the spot is in plain view (then it watches the spot itself).
 */
function sliceTowardsLastKnown(b: Bot, w: BotWorld, eye: Vec3, cmd: PlayerCommand): boolean {
  lastKnownHead.x = b.lastKnown.x;
  lastKnownHead.y = b.lastKnown.y + w.body.standEyeHeight;
  lastKnownHead.z = b.lastKnown.z;
  if (lineClear(w.query, eye, lastKnownHead)) return false;
  lookAngles(eye.x, eye.y, eye.z, lastKnownHead.x, lastKnownHead.y, lastKnownHead.z, look);
  // Only a corner short of the spot can be the one it is behind (not the far end of a long wall).
  const toSpot = Math.hypot(lastKnownHead.x - eye.x, lastKnownHead.z - eye.z);
  return slice(b, w, heldAngleLook(b, w, eye, look.yaw, true, toSpot), cmd);
}

/**
 * Holding with held angles (M37), or slicing on the move (M38): looks for the corners in view of where it stands, facing
 * about `facingYaw` (again every angleRefresh, or once it has moved), then sets `look` on one of them: if `nearest`,
 * the one nearest `facingYaw` among those within `within` metres, else switching every angleSwitchTime. Returns it, or
 * null if it found none.
 */
function heldAngleLook(b: Bot, w: BotWorld, eye: Vec3, facingYaw: number, nearest: boolean, within = Number.POSITIVE_INFINITY): HeldAngle | null {
  const cfg = w.cfg;
  const p = b.character.position;
  const from = b.heldAnglesFrom;
  if (w.time - b.heldAnglesAt > cfg.angleRefresh || Math.hypot(p.x - from.x, p.z - from.z) > cfg.angleMoveRefresh) {
    b.heldAnglesAt = w.time;
    from.x = p.x;
    from.y = p.y;
    from.z = p.z;
    // The fan runs at standing eye height (over low cover), whatever the bot's own crouch; heads are at the same.
    const head = p.y + eyeHeight(0, w.body);
    standEye.x = p.x;
    standEye.y = head;
    standEye.z = p.z;
    b.heldAngleCount = findHeldAngles(w.query, standEye, head, facingYaw, cfg, b.heldAngles);
  }
  if (b.heldAngleCount === 0) return null;
  let a: HeldAngle | null = b.heldAngles[Math.floor(b.teamWait / cfg.angleSwitchTime) % b.heldAngleCount]!;
  if (nearest) {
    a = null;
    for (let i = 0; i < b.heldAngleCount; i++) {
      const o = b.heldAngles[i]!;
      if (Math.hypot(o.point.x - p.x, o.point.z - p.z) > within) continue;
      if (!a || Math.abs(wrapAngle(o.yaw - facingYaw)) < Math.abs(wrapAngle(a.yaw - facingYaw))) a = o;
    }
    if (!a) return null;
  }
  lookAngles(eye.x, eye.y, eye.z, a.point.x, a.point.y, a.point.z, look);
  return a;
}

/** True if a teammate stands in (or right next to) the line of fire within `dist` metres. */
function friendInLine(b: Bot, w: BotWorld, from: Vec3, dir: Vec3, dist: number): boolean {
  // With friendly fire off (M20) BBs pass teammates by, so there's nothing to hold fire for.
  if (!w.hits.friendlyFire) return false;
  const me = b.character;
  const stray = Math.tan(w.cfg.friendlySpreadSigmas * w.loadout[0]!.spreadDeg * DEG); // metres off the line per metre
  for (const mate of w.characters) {
    if (mate === me || mate.team !== me.team || !isInPlay(mate)) continue;
    // A teammate on the move can run into the BBs' path while they fly: check where they'll be when the BBs pass
    // them too (the flight to them, not to the end of the reach: a far guess put a teammate running across the line
    // already past it, and the BBs met them half-way).
    const along = (mate.position.x - from.x) * dir.x + (mate.position.y - from.y) * dir.y + (mate.position.z - from.z) * dir.z;
    const reach = Math.min(Math.max(0, along), dist);
    const flight = bbFlightTime(w, reach);
    const margin = w.cfg.friendlyMargin + reach * stray;
    const v = mateVolume;
    characterHitVolume(mate, w.hits, v);
    v.body.r += margin;
    v.head.r += margin;
    v.shoulder.r += margin;
    // A leaning mate's tilted torso (audit M-06); radius 0 means upright, with no torso part to widen.
    if (v.torso.r > 0) v.torso.r += margin;
    if (rayCharacter(from, dir, dist, v) >= 0) return true;
    const dx = mate.velocity.x * flight;
    const dz = mate.velocity.z * flight;
    v.body.x += dx;
    v.body.z += dz;
    v.head.x += dx;
    v.head.z += dz;
    v.shoulder.x += dx;
    v.shoulder.z += dz;
    v.torso.ax += dx;
    v.torso.bx += dx;
    v.torso.az += dz;
    v.torso.bz += dz;
    if (rayCharacter(from, dir, dist, v) >= 0) return true;
  }
  return false;
}

/**
 * True if the bot must hold fire at `aimPoint` (`dist` metres away): cover in the way (sight is refreshed
 * 10×/s, so the target may have just stepped behind some), a wall close in front along the aim `dir` (unit),
 * or a teammate in the line of fire `dir`,
 * up to the first wall past the target (a BB that misses flies on, but not through walls).
 */
function lineOfFireBlocked(b: Bot, w: BotWorld, eye: Vec3, aimPoint: Vec3, dir: Vec3, dist: number): boolean {
  if (!lineClear(w.query, eye, aimPoint)) return true;
  const wall = w.query.raycastStatic(eye, dir, dist + w.cfg.friendlyBeyondTarget);
  // The BB flies along the actual aim, not the line to the target: hold fire rather than shoot the wall beside you.
  if (wall >= 0 && wall < dist * w.cfg.aimWallFraction) return true;
  return friendInLine(b, w, eye, dir, friendlyReach(w, eye, dir, dist, wall));
}

/**
 * How far along `dir` (unit) from `eye` a missed BB can still hit someone: cfg.friendlyBeyondTarget past
 * the target (`dist` metres away), or less if a wall is in the way (`hit`: where the line meets geometry
 * within that reach, or -1): cfg.friendlyPastWall past it (a line grazing a corner lets BBs by). Only a wall: what the
 * line meets must also stand cfg.friendlyWallClearance higher right there (BBs can sail over the top of low cover).
 */
function friendlyReach(w: BotWorld, eye: Vec3, dir: Vec3, dist: number, hit: number): number {
  const cfg = w.cfg;
  const reach = dist + cfg.friendlyBeyondTarget;
  if (hit < 0) return reach;
  // Just before the point the line meets, raised: is the same surface there too?
  const back = Math.min(hit, cfg.friendlyWallProbe);
  raisedPoint.x = eye.x + dir.x * (hit - back);
  raisedPoint.y = eye.y + dir.y * (hit - back) + cfg.friendlyWallClearance;
  raisedPoint.z = eye.z + dir.z * (hit - back);
  return w.query.raycastStatic(raisedPoint, dir, back + cfg.friendlyWallProbe) >= 0 ? Math.min(reach, hit + cfg.friendlyPastWall) : reach;
}

/** Bursts at the target from `eye` towards `aimPoint` once reacted and on aim, never with a teammate or cover in the way. */
export function shootBot(b: Bot, w: BotWorld, target: Character | undefined, eye: Vec3, aimPoint: Vec3, offAim: number, cmd: PlayerCommand, dt: number): void {
  const me = b.character;
  const cfg = w.cfg;
  const ready = w.live && hasReacted(b, w) && !cmd.sprint && b.mode !== 'cover';
  if (!ready || !target || offAim >= (cfg.fireCone * Math.PI) / 180) {
    b.pauseLeft = Math.max(0, b.pauseLeft - dt);
    return;
  }
  aimDirection(aimLine, b.aim.yaw, b.aim.pitch);
  const dist = Math.hypot(target.position.x - me.position.x, target.position.z - me.position.z);
  if (lineOfFireBlocked(b, w, eye, aimPoint, aimLine, dist)) return;
  if (b.burstLeft <= 0 && b.pauseLeft <= 0) b.burstLeft = pick(b.rng, b.skill.burst);
  if (b.burstLeft > 0) {
    cmd.fire = true;
    b.burstLeft -= dt;
    if (b.burstLeft <= 0) b.pauseLeft = pick(b.rng, b.skill.burstPause);
  } else {
    b.pauseLeft -= dt;
  }
}

/**
 * Reloads when empty, or swaps a low magazine for a fuller spare when nobody is in sight (the low one goes
 * back in the pouch as it is). With slicesCorners and a threat in mind (M38), a swap on the way to cover waits till
 * it's there (reloadFromCover sends it; with no cover near, it swaps where it stands).
 */
export function reloadBot(b: Bot, w: BotWorld, cmd: PlayerCommand): void {
  const ammo = b.character.armament.ammo[0]!;
  if (!canReload(ammo)) return;
  if (ammo.mag === 0) {
    cmd.reload = true;
    return;
  }
  if (b.targetVisible || !lowOnBBs(b, w.cfg.tacticalReloadFraction)) return;
  if (b.skill.slicesCorners && threatInMind(b, w) && headingForCover(b, w)) return;
  cmd.reload = true;
}

/** True if the magazine holds less than `fraction` of a full one and a spare can top it up. */
export function lowOnBBs(b: Bot, fraction: number): boolean {
  const ammo = b.character.armament.ammo[0]!;
  return canReload(ammo) && ammo.mag < b.character.armament.handling[0]!.magSize * fraction;
}

/** In cover mode and not yet at the spot. */
function headingForCover(b: Bot, w: BotWorld): boolean {
  const p = b.character.position;
  return b.mode === 'cover' && Math.hypot(b.cover.position.x - p.x, b.cover.position.z - p.z) >= w.cfg.coverArrive;
}
