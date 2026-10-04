import type { MovementConfig } from '../config/movement';
import type { Character } from './character';

/**
 * Accuracy by stance and movement: how much a character's current state scales its replica's spread
 * (cfg.accuracy). Holding still, and crouching above all, is steady, and the longer you hold still the
 * steadier it gets; moving, jumping and coming out of a sprint are not. Bots and the player follow the same rule.
 */

/** Summed tick lengths drift below round numbers (6 × 1/60 < 0.1); this keeps the delay a whole number of ticks. */
const AIR_TIME_EPSILON = 1e-9;

/**
 * The spread multiplier this character's state calls for right now (before settling): movement times stance. Off the ground it is
 * cfg.accuracy.air once airTime reaches airSpreadDelay; until then the horizontal speed decides, as on the ground.
 */
export function targetSpreadScale(c: Character, cfg: MovementConfig): number {
  const a = cfg.accuracy;
  const speed = Math.hypot(c.velocity.x, c.velocity.z);
  let move: number;
  if (!c.grounded && c.airTime >= a.airSpreadDelay - AIR_TIME_EPSILON) move = a.air;
  else if (c.sprinting) move = a.sprint;
  else {
    if (speed <= a.stillBelow) move = 1 + (a.steady - 1) * Math.min(1, c.stillTime / a.steadyTime);
    else if (speed <= cfg.walkSpeed) move = 1 + ((a.walk - 1) * (speed - a.stillBelow)) / (cfg.walkSpeed - a.stillBelow);
    else move = a.walk + ((a.run - a.walk) * Math.min(1, (speed - cfg.walkSpeed) / (cfg.runSpeed - cfg.walkSpeed)));
  }
  // Crouching steadies a still shooter fully, a moving one less (audit SIM-10).
  const moving = Math.min(1, Math.max(0, (speed - a.stillBelow) / (cfg.crouchSpeed - a.stillBelow)));
  const crouched = a.crouched + (a.crouchedMoving - a.crouched) * moving;
  return move * (1 + (crouched - 1) * c.crouchAmount);
}

/**
 * One tick: the multiplier rises to the target at once (you can't fire steadily while starting to move)
 * and comes back down towards it once the shake stops: within a few ticks after walking or running
 * (cfg.accuracy.lockTime, the "instant lock"), more slowly (settleTime) for carryTime after a sprint or a landing,
 * both scaled by the grip on the replica in hand.
 */
export function stepAccuracy(c: Character, cfg: MovementConfig, dt: number): void {
  const a = cfg.accuracy;
  c.airTime = c.grounded ? 0 : c.airTime + dt;
  const still = c.grounded && Math.hypot(c.velocity.x, c.velocity.z) <= a.stillBelow;
  c.stillTime = still ? c.stillTime + dt : 0;
  const shaken = c.sprinting || (!c.grounded && c.airTime >= a.airSpreadDelay - AIR_TIME_EPSILON);
  // A grip on the replica in hand shortens or lengthens how long the shake lasts (config/attachments.ts).
  const grip = c.armament.handling[c.armament.active]?.shakeScale ?? 1;
  c.shakeCarry = shaken ? a.carryTime * grip : Math.max(0, c.shakeCarry - dt);
  const target = targetSpreadScale(c, cfg);
  const settle = c.shakeCarry > 0 ? a.settleTime * grip : a.lockTime;
  c.spreadScale = target >= c.spreadScale ? target : target + (c.spreadScale - target) * Math.exp(-dt / settle);
}

/**
 * Seconds from the end of a sprint, standing still, until `c`'s aim is back within `margin` of steady standing
 * (spreadScale at most 1 + margin), found by running stepAccuracy tick by tick so it follows the sim's own rule (the
 * grip on the replica in hand included). For the Loadout screen; `c` is changed.
 */
export function timeToSteady(c: Character, cfg: MovementConfig, dt: number, margin: number): number {
  c.grounded = true;
  c.velocity.x = c.velocity.z = 0;
  c.sprinting = true;
  stepAccuracy(c, cfg, dt);
  c.sprinting = false;
  let t = 0;
  // Bounded: settling is exponential, so a margin above zero is always reached.
  while (c.spreadScale > 1 + margin && t < 10) {
    stepAccuracy(c, cfg, dt);
    t += dt;
  }
  return t;
}
