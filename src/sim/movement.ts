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
  /**
   * Vertical offset that puts a standing character exactly at rest on the ground beneath it
   * (negative = down, slightly positive if it has crept into the floor), or NaN if there is no
   * ground within `maxDrop` below its feet.
   */
  probeGround(c: Character, maxDrop: number): number;
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

/**
 * Speed the character is aiming for given current stance and pace (walk / run / sprint). A lean slows
 * running smoothly down to walking pace, reached at cfg.leanQuietFrom of a full lean.
 */
export function targetSpeed(c: Character, cfg: MovementConfig): number {
  let base = c.walking ? cfg.walkSpeed : c.sprinting ? cfg.sprintSpeed : cfg.runSpeed;
  const lean = Math.abs(c.lean);
  if (lean > 0 && !c.walking) base += (cfg.walkSpeed - base) * Math.min(1, lean / cfg.leanQuietFrom);
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

  // Walk (slow, quiet) wins over sprint, and so does aiming down sights (sim/aiming.ts). Sprint: forward only,
  // never crouched. Leaning (the actual lean, which the key eases in and walls or a jump can stop) slows you
  // towards walking pace, is quiet from leanQuietFrom of a full lean, and rules out sprinting while the lean key is
  // held: no running out of a peek. Once the key is let go, sprint picks up as the lean eases back under leanQuietFrom
  // instead of waiting for it to reach upright (the lean still slows the sprint until then, targetSpeed).
  const lean = Math.abs(c.lean);
  c.walking = (cmd.walk || c.aiming || lean >= cfg.leanQuietFrom) && !crouched;
  c.sprinting = cmd.sprint && !c.walking && (lean === 0 || cmd.lean === 0) && cmd.forward >= cfg.sprintMinForward && !crouched;
  // The replica is carried, not aimed, while sprinting and for a moment after.
  c.sprintLockout = c.sprinting ? cfg.sprintFireLockout : Math.max(0, c.sprintLockout - dt);

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

  // Jump: limited by cooldown, not while crouched. A press is kept for jumpBuffer, so one made a tick or two before
  // landing, or while standing up from a crouch, still jumps once it can (audit SIM-05).
  c.jumpCooldown = Math.max(0, c.jumpCooldown - dt);
  c.jumpWanted = cmd.jump ? cfg.jumpBuffer : Math.max(0, c.jumpWanted - dt);
  if (c.jumpWanted > 0 && c.grounded && c.jumpCooldown <= 0 && !crouched) {
    c.velocity.y = cfg.jumpSpeed;
    c.grounded = false;
    c.jumpCooldown = cfg.jumpCooldown;
    c.jumpWanted = 0;
    c.airTime = cfg.accuracy.airSpreadDelay; // a deliberate jump gets the in-air spread at once
  }

  // Standing characters move purely horizontally, then settle onto the floor in a separate move.
  // Folding gravity into the main move makes Rapier's controller occasionally reject the whole move
  // when it starts in contact with the floor, which stalls walking for a tick (then re-accelerates).
  const onGround = c.grounded && c.velocity.y <= 0;
  c.velocity.y = onGround ? 0 : Math.max(-cfg.maxFallSpeed, c.velocity.y - cfg.gravity * dt);

  // Climbing a ramp: lengthen the move by what the controller's slide up the slope takes off it (audit SIM-17), from the
  // slope climbed last tick (a tick late at the foot of a ramp; never on the flat, downhill or in the air).
  const climb = onGround && c.groundRise > 0 ? 1 + cfg.rampPace * c.groundRise * c.groundRise : 1;
  const { desired, corrected } = scratch;
  desired.x = c.velocity.x * dt * climb;
  desired.y = c.velocity.y * dt;
  desired.z = c.velocity.z * dt * climb;

  mover.move(c, desired, corrected);
  c.position.x += corrected.x;
  c.position.y += corrected.y;
  c.position.z += corrected.z;

  // Velocity follows what actually happened, so walls absorb speed instead of storing it. A lengthened move never adds
  // speed (the tick that reaches the top of a ramp is on the flat already).
  const paceBefore = Math.hypot(c.velocity.x, c.velocity.z);
  c.velocity.x = corrected.x / dt;
  c.velocity.z = corrected.z / dt;
  if (climb > 1) {
    const pace = Math.hypot(c.velocity.x, c.velocity.z);
    if (pace > paceBefore) {
      c.velocity.x *= paceBefore / pace;
      c.velocity.z *= paceBefore / pace;
    }
  }

  // Only the ground probe decides whether we stand: the controller also reports "ground" for the
  // rounded capsule touching the top edge of cover, which would let players hang on (and hop over)
  // barriers. The probe also lands us exactly at rest height. It runs on every tick we aren't rising, not
  // only when the controller feels ground: Rapier's shape cast very rarely misses a floor right under the
  // probe (a seam on a ramp), and a character dropped that way lands on the next tick instead of floating
  // down until the controller touches the slope (11 ticks seen on a dock ramp).
  let grounded = false;
  let settle = 0;
  if (c.velocity.y <= 0) {
    const dy = mover.probeGround(c, cfg.groundSettleDistance);
    grounded = !Number.isNaN(dy);
    if (grounded) {
      c.position.y += dy;
      c.velocity.y = 0;
      settle = dy;
    }
    // No ground under the probe: walked off an edge, or caught on one. Keep falling (and sliding off).
  } else if (desired.y > 0 && corrected.y < desired.y * cfg.ceilingBlockFraction) {
    c.velocity.y = 0; // bumped a ceiling
  }
  // The slope climbed this tick, for the next one: on the ground before and after, uphill, no steeper than a ramp.
  const moved = Math.hypot(corrected.x, corrected.z);
  const rise = onGround && grounded && moved > 0 ? (corrected.y + settle) / moved : 0;
  c.groundRise = rise > 0 && rise <= cfg.rampMaxRise ? rise : 0;
  // Held up while falling (caught on an edge): fall only as fast as we actually moved, so speed doesn't
  // build up invisibly and fire us downward when we slip off.
  // Clamped to <= 0: when Rapier pushes a wedged capsule out of geometry, corrected.y can be positive,
  // and turning that push into upward velocity launched players metres into the air.
  if (!grounded && desired.y < 0 && corrected.y > desired.y) c.velocity.y = Math.min(0, corrected.y / dt);
  c.grounded = grounded;
}
