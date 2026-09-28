/** Character movement tuning. Units: metres, seconds, radians. */
export interface MovementConfig {
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
}

/** Heights are measured from the character's position (capsule bottom), which rests PHYSICS.groundRestGap above the floor. */
export interface BodyConfig {
  radius: number;
  height: number;
  standEyeHeight: number;
  crouchEyeHeight: number;
}

export const MOVEMENT: MovementConfig = {
  walkSpeed: 4.2,
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
  crouchTransitionTime: 0.15,
  crouchedThreshold: 0.5,
  ceilingBlockFraction: 0.5,
  groundSettleDistance: 0.06,
  inputDeadzone: 0.01,
  maxPitch: Math.PI / 2 - 0.02,
};

export const BODY: BodyConfig = {
  radius: 0.32,
  height: 1.8,
  standEyeHeight: 1.62,
  crouchEyeHeight: 1.05,
};
