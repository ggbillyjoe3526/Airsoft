import { aimDirection, canReload } from '../sim/armament';
import { muzzleVelocity } from '../config/replicas';
import type { Character } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import { characterHitVolume, createHitVolume, type HitVolume, rayCharacter } from '../sim/hitbox';
import { type Vec3, vec3 } from '../sim/vec';
import { aimErrorSize, lookAngles, stepAim } from './aim';
import { type Bot, type BotWorld, pick } from './bot';
import { hasReacted } from './botSenses';
import { bodyPoint, lineClear } from './perception';

// Scratch, each used only within one call of the function that fills it.
const look = { yaw: 0, pitch: 0 };
const aimLine = vec3();
const raisedPoint = vec3();
const mateVolume: HitVolume = createHitVolume();

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
    // Aim at the part of the body it can see, leading the target by part of the BB's flight time.
    bodyPoint(target, w.hits, b.targetPart, aimPoint);
    const dist = Math.hypot(aimPoint.x - eye.x, aimPoint.y - eye.y, aimPoint.z - eye.z);
    const flight = dist / muzzleVelocity(w.loadout[0]!);
    aimPoint.x += target.velocity.x * flight * cfg.leadFactor;
    aimPoint.z += target.velocity.z * flight * cfg.leadFactor;
    lookAngles(eye.x, eye.y, eye.z, aimPoint.x, aimPoint.y, aimPoint.z, look);
    // The target's own speed across the line of sight (the bot's movement is aimErrorMovingDeg).
    const v = target.velocity;
    const sideways = (v.x * (aimPoint.z - eye.z) - v.z * (aimPoint.x - eye.x)) / Math.max(Math.hypot(aimPoint.x - eye.x, aimPoint.z - eye.z), 1e-3);
    const error = aimErrorSize(w.time - b.contact.acquiredAt, walking || cmd.right !== 0, dist, sideways, cfg);
    return stepAim(b.aim, look.yaw, look.pitch, error, cfg, b.rng, dt);
  }
  look.pitch = 0;
  const walkYaw = Math.atan2(-b.moveDir.x, -b.moveDir.z);
  if (b.hasLastKnown && (b.mode === 'search' || b.mode === 'cover' || !walking)) {
    // Watch where the threat was, even while moving there.
    lookAngles(eye.x, eye.y, eye.z, b.lastKnown.x, eye.y, b.lastKnown.z, look);
  } else if (walking && !(b.mode === 'advance' && !b.hunting && Math.cos(walkYaw - enemyYaw) < 0)) {
    look.yaw = walkYaw;
  } else {
    // Holding a point, or walking back along the lane: face the enemy side rather than turn our back.
    look.yaw = enemyYaw;
  }
  stepAim(b.aim, look.yaw, look.pitch, 0, cfg, b.rng, dt);
  return Number.POSITIVE_INFINITY;
}

/** True if a teammate stands in (or right next to) the line of fire within `dist` metres. */
function friendInLine(b: Bot, w: BotWorld, from: Vec3, dir: Vec3, dist: number): boolean {
  const me = b.character;
  // A teammate on the move can run into the BBs' path while they fly: check where they'll be too.
  const flight = dist / muzzleVelocity(w.loadout[0]!);
  for (const mate of w.characters) {
    if (mate === me || mate.team !== me.team || !isInPlay(mate)) continue;
    const v = mateVolume;
    characterHitVolume(mate, w.hits, v);
    v.body.r += w.cfg.friendlyMargin;
    v.head.r += w.cfg.friendlyMargin;
    v.shoulder.r += w.cfg.friendlyMargin;
    if (rayCharacter(from, dir, dist, v) >= 0) return true;
    const dx = mate.velocity.x * flight;
    const dz = mate.velocity.z * flight;
    v.body.x += dx;
    v.body.z += dz;
    v.head.x += dx;
    v.head.z += dz;
    v.shoulder.x += dx;
    v.shoulder.z += dz;
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
 * within that reach, or -1). Only a wall: what the line meets must
 * also stand cfg.friendlyWallClearance higher right there (BBs can sail over the top of low cover).
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
  return w.query.raycastStatic(raisedPoint, dir, back + cfg.friendlyWallProbe) >= 0 ? hit : reach;
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
  if (b.burstLeft <= 0 && b.pauseLeft <= 0) b.burstLeft = pick(b.rng, cfg.burst);
  if (b.burstLeft > 0) {
    cmd.fire = true;
    b.burstLeft -= dt;
    if (b.burstLeft <= 0) b.pauseLeft = pick(b.rng, cfg.burstPause);
  } else {
    b.pauseLeft -= dt;
  }
}

/**
 * Reloads when empty, or swaps a low magazine for a fuller spare when nobody is in sight (the low one goes
 * back in the pouch as it is).
 */
export function reloadBot(b: Bot, w: BotWorld, cmd: PlayerCommand): void {
  const ammo = b.character.armament.ammo[0]!;
  const magSize = b.character.armament.handling[0]!.magSize;
  if (!canReload(ammo)) return;
  if (ammo.mag === 0 || (!b.targetVisible && ammo.mag < magSize * w.cfg.tacticalReloadFraction)) cmd.reload = true;
}
