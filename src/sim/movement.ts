import type { MovementConfig } from '../config/movement';
import type { Character } from './character';
import type { PlayerCommand } from './commands';
import { type Vec3, vec3 } from './vec';

/**
 * Collision resolution for character movement. Implemented by the Rapier physics layer in the
 * game and by simple stubs in tests. Writes the collision-corrected translation into `out`
 * and returns whether the character ends up grounded.
 */
export interface CharacterMover {
  move(c: Character, desired: Vec3, out: Vec3): boolean;
}

/** Reusable vectors so a movement step allocates nothing. One per simulation instance. */
export interface MovementScratch {
  desired: Vec3;
  corrected: Vec3;
}

export function createMovementScratch(): MovementScratch {
  return { desired: vec3(), corrected: vec3() };
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

/** Speed the character is aiming for given current stance and sprint state. */
export function targetSpeed(c: Character, cfg: MovementConfig): number {
  const base = c.sprinting ? cfg.sprintSpeed : cfg.walkSpeed;
  return base + (cfg.crouchSpeed - base) * c.crouchAmount;
}

/** Applies one tick of movement intent, gravity and collision to a character. Pure apart from `mover`. */
export function stepMovement(
  c: Character,
  cmd: PlayerCommand,
  cfg: MovementConfig,
  dt: number,
  mover: CharacterMover,
  scratch: MovementScratch,
): void {
  c.yaw = cmd.yaw;
  c.pitch = Math.max(-cfg.maxPitch, Math.min(cfg.maxPitch, cmd.pitch));

  // Stance.
  c.crouchAmount = approach(c.crouchAmount, cmd.crouch ? 1 : 0, dt / cfg.crouchTransitionTime);
  const crouched = c.crouchAmount >= cfg.crouchedThreshold;

  // Sprint: forward only, never crouched.
  c.sprinting = cmd.sprint && cmd.forward >= cfg.sprintMinForward && !crouched;

  // Wish direction on the ground plane. forward = (-sin, 0, -cos), right = (cos, 0, -sin).
  let f = cmd.forward;
  let r = cmd.right;
  const mag = Math.hypot(f, r);
  if (mag > 1) {
    f /= mag;
    r /= mag;
  }
  const sin = Math.sin(c.yaw);
  const cos = Math.cos(c.yaw);
  const speed = targetSpeed(c, cfg);
  const wishX = (-sin * f + cos * r) * speed;
  const wishZ = (-cos * f - sin * r) * speed;
  const hasInput = mag > cfg.inputDeadzone;

  const accel = c.grounded ? (hasInput ? cfg.groundAccel : cfg.groundDecel) : cfg.airAccel;
  const dvx = wishX - c.velocity.x;
  const dvz = wishZ - c.velocity.z;
  const dvLen = Math.hypot(dvx, dvz);
  if (dvLen > 0) {
    const stepLen = Math.min(dvLen, accel * dt);
    c.velocity.x += (dvx / dvLen) * stepLen;
    c.velocity.z += (dvz / dvLen) * stepLen;
  }

  // Jump: limited by cooldown, not while crouched.
  c.jumpCooldown = Math.max(0, c.jumpCooldown - dt);
  if (cmd.jump && c.grounded && c.jumpCooldown <= 0 && !crouched) {
    c.velocity.y = cfg.jumpSpeed;
    c.grounded = false;
    c.jumpCooldown = cfg.jumpCooldown;
  }

  c.velocity.y = Math.max(-cfg.maxFallSpeed, c.velocity.y - cfg.gravity * dt);

  const { desired, corrected } = scratch;
  desired.x = c.velocity.x * dt;
  desired.y = c.velocity.y * dt;
  desired.z = c.velocity.z * dt;

  const grounded = mover.move(c, desired, corrected);

  c.position.x += corrected.x;
  c.position.y += corrected.y;
  c.position.z += corrected.z;

  // Velocity follows what actually happened, so walls absorb speed instead of storing it.
  c.velocity.x = corrected.x / dt;
  c.velocity.z = corrected.z / dt;
  if (grounded && c.velocity.y < 0) c.velocity.y = 0;
  else if (desired.y > 0 && corrected.y < desired.y * cfg.ceilingBlockFraction) c.velocity.y = 0; // bumped a ceiling
  c.grounded = grounded;
}
