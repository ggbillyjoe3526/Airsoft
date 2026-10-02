import type { MovementConfig } from '../config/movement';
import type { Character } from './character';

/**
 * Accuracy by stance and movement: how much a character's current state scales its replica's spread
 * (cfg.accuracy). Holding still, and crouching above all, is steady; moving, jumping and coming out of
 * a sprint are not. Bots and the player follow the same rule.
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
    if (speed <= a.stillBelow) move = 1;
    else if (speed <= cfg.walkSpeed) move = 1 + ((a.walk - 1) * (speed - a.stillBelow)) / (cfg.walkSpeed - a.stillBelow);
    else move = a.walk + ((a.run - a.walk) * Math.min(1, (speed - cfg.walkSpeed) / (cfg.runSpeed - cfg.walkSpeed)));
  }
  return move * (1 + (a.crouched - 1) * c.crouchAmount);
}

/**
 * One tick: the multiplier rises to the target at once (you can't fire steadily while starting to move)
 * and settles back towards it over cfg.accuracy.settleTime once the shake stops.
 */
export function stepAccuracy(c: Character, cfg: MovementConfig, dt: number): void {
  c.airTime = c.grounded ? 0 : c.airTime + dt;
  const target = targetSpreadScale(c, cfg);
  c.spreadScale = target >= c.spreadScale ? target : target + (c.spreadScale - target) * Math.exp(-dt / cfg.accuracy.settleTime);
}
