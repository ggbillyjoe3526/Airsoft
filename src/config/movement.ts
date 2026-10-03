/** Character movement tuning. Units: metres, seconds, radians. */
export interface MovementConfig {
  /** Normal pace, with no modifier key. */
  runSpeed: number;
  /** Walking (hold the walk key): slow and quiet, for sneaking and holding angles. */
  walkSpeed: number;
  sprintSpeed: number;
  crouchSpeed: number;
  /** Horizontal acceleration while grounded and pushing a direction (m/s^2). */
  groundAccel: number;
  /** Horizontal deceleration while grounded and not pushing (m/s^2). */
  groundDecel: number;
  airAccel: number;
  gravity: number;
  /** Terminal fall speed (m/s). Keeps falls readable and collision stable. */
  maxFallSpeed: number;
  jumpSpeed: number;
  /** Minimum time between jumps, keeps jumping "limited" and bunny-hop free. */
  jumpCooldown: number;
  /** Sprint only counts when forward input is at least this. */
  sprintMinForward: number;
  /** Seconds after a sprint ends before the replica can fire (sprinting itself always blocks firing). */
  sprintFireLockout: number;
  /** Seconds to go fully between standing and crouched (eye height blend). */
  crouchTransitionTime: number;
  /** At or above this crouch amount the character counts as crouched: no sprinting or jumping. */
  crouchedThreshold: number;
  /**
   * While rising, if the collision-corrected upward move is below this fraction of the intended one,
   * we hit a ceiling and stop rising. Sliding along walls trims upward moves by tiny amounts, so a
   * strict comparison would kill jumps next to cover.
   */
  ceilingBlockFraction: number;
  /**
   * A standing character stays glued to ground up to this far below its feet (so it follows small
   * drops such as stepping off a ledge). Larger drops become a fall.
   */
  groundSettleDistance: number;
  /** Movement input magnitude below this is treated as no input. */
  inputDeadzone: number;
  maxPitch: number;
  /** Seconds to go from upright to a full lean (Q / E held). */
  leanTime: number;
  /** A leaning head stays at least this far from walls (metres), so you never see or shoot through them. */
  leanWallClearance: number;
  /** From this much of a full lean (0..1) you move at walking pace, quietly; less slows you part of the way. */
  leanQuietFrom: number;
  /** How a shooter's stance and movement scale their replica's spread (see sim/accuracy.ts). */
  accuracy: AccuracyConfig;
}

/**
 * Accuracy by stance and movement: multipliers on a replica's spreadDeg. Standing still is the
 * reference (1); crouching steadies; walking, running, jumping and sprinting shake the aim. The
 * multiplier jumps up at once when you start moving. Once you stop walking or running it locks back on
 * almost at once (lockTime); the moments just after a sprint or a landing stay shaky (settleTime).
 */
export interface AccuracyConfig {
  /** Below this horizontal speed (m/s) a character counts as still. */
  stillBelow: number;
  /**
   * Holding still steadies the aim further: the multiplier eases from 1 down to `steady` over `steadyTime`
   * seconds of standing still on the ground (owner, 2026-10-03: the stiller you are, the more accurate).
   */
  steady: number;
  steadyTime: number;
  /** At walking pace (walkSpeed) and at the normal pace (runSpeed); in between it blends linearly. */
  walk: number;
  run: number;
  /** While sprinting (you can't fire, but the shake carries into the moments after). */
  sprint: number;
  /** Off the ground (jumping, falling); the shake carries into the landing. */
  air: number;
  /**
   * Seconds off the ground before `air` applies (a jump applies it at once). A brief loss of ground contact
   * (a step down, a bump in the floor) then never flashes the spread wide.
   */
  airSpreadDelay: number;
  /** Multiplier for being fully crouched (applied on top of the movement one). */
  crouched: number;
  /**
   * Seconds for the multiplier to settle back (time constant) after a sprint or time in the air: those shakes
   * carry into the moments after, for `carryTime` seconds since the sprint or the landing.
   */
  settleTime: number;
  carryTime: number;
  /**
   * Time constant (s) for settling once walking or running stops: the aim locks on almost at once (owner,
   * 2026-10-03: "instant lock"), so the crosshair snaps in rather than easing.
   */
  lockTime: number;
}

/** Heights are measured from the character's position (capsule bottom), which rests PHYSICS.groundRestGap above the floor. */
export interface BodyConfig {
  radius: number;
  height: number;
  standEyeHeight: number;
  crouchEyeHeight: number;
}

export const MOVEMENT: MovementConfig = {
  runSpeed: 4.2,
  walkSpeed: 2.3,
  sprintSpeed: 6.3,
  crouchSpeed: 2.1,
  groundAccel: 45,
  groundDecel: 38,
  airAccel: 6,
  gravity: 20,
  maxFallSpeed: 30,
  jumpSpeed: 5.4,
  jumpCooldown: 0.55,
  sprintMinForward: 0.5,
  sprintFireLockout: 0.2,
  crouchTransitionTime: 0.15,
  crouchedThreshold: 0.5,
  ceilingBlockFraction: 0.5,
  groundSettleDistance: 0.06,
  inputDeadzone: 0.01,
  maxPitch: Math.PI / 2 - 0.02,
  leanTime: 0.18,
  leanWallClearance: 0.2,
  leanQuietFrom: 0.5,
  accuracy: {
    stillBelow: 0.4,
    // Owner's v0.1-alpha.3 playtest: standing still steadies to ×0.7, and walking with Shift costs ×1.15 (was 1.5).
    // M12a eased to ×0.7 over half a second; the owner found that too slow and smooth and asked for an "instant
    // lock" (2026-10-03), so it now takes a few ticks. Gentler than CS / Valorant, but the same idea.
    steady: 0.7,
    steadyTime: 0.05,
    walk: 1.15,
    run: 2.6,
    sprint: 3.5,
    air: 4.5,
    airSpreadDelay: 0.1,
    crouched: 0.65,
    settleTime: 0.15,
    carryTime: 0.45,
    lockTime: 0.015,
  },
};

export const BODY: BodyConfig = {
  radius: 0.32,
  height: 1.8,
  standEyeHeight: 1.62,
  crouchEyeHeight: 1.05,
};
