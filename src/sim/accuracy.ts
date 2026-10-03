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
 * The spread multiplier this character's state calls for right now (before settling). Off the ground it is
 * cfg.accuracy.air once airTime reaches airSpreadDelay; until then the horizontal speed decides, as on the ground.
 */
export function targetSpreadScale(c: Character, cfg: MovementConfig): number {
  const a = cfg.accuracy;
  let move: number;
  if (!c.grounded && c.airTime >= a.airSpreadDelay - AIR_TIME_EPSILON) move = a.air;
  else if (c.sprinting) move = a.sprint;
  else {
    const speed = Math.hypot(c.velocity.x, c.velocity.z);
    if (speed <= a.stillBelow) move = 1 + (a.steady - 1) * Math.min(1, c.stillTime / a.steadyTime);
    else if (speed <= cfg.walkSpeed) move = 1 + ((a.walk - 1) * (speed - a.stillBelow)) / (cfg.walkSpeed - a.stillBelow);
    else move = a.walk + ((a.run - a.walk) * Math.min(1, (speed - cfg.walkSpeed) / (cfg.runSpeed - cfg.walkSpeed)));
  }
  return move * (1 + (a.crouched - 1) * c.crouchAmount);
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
