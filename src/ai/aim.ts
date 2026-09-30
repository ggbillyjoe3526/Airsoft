import type { BotConfig } from '../config/bots';
import { type RngState, rngNext } from '../sim/rng';
import { wrapAngle } from '../sim/vec';

const DEG = Math.PI / 180;

/**
 * A bot's view and aim: where it is looking (turned at a limited rate) and a slowly wandering aim
 * error, like a hand that is still settling on the target.
 */
export interface AimState {
  yaw: number;
  pitch: number;
  /** Current aim error (radians) and the error it is drifting towards. */
  errYaw: number;
  errPitch: number;
  goalErrYaw: number;
  goalErrPitch: number;
  /** Seconds until a new drift goal is picked. */
  wanderLeft: number;
}

export function createAim(yaw: number): AimState {
  return { yaw, pitch: 0, errYaw: 0, errPitch: 0, goalErrYaw: 0, goalErrPitch: 0, wanderLeft: 0 };
}

/**
 * Aim error size (radians) `sinceAcquired` seconds after picking up a target: starts large and settles
 * over aimSettleTime; worse while the bot moves.
 */
export function aimErrorSize(sinceAcquired: number, moving: boolean, cfg: BotConfig): number {
  const t = Math.min(1, Math.max(0, sinceAcquired / cfg.aimSettleTime));
  const deg = cfg.aimErrorStartDeg + (cfg.aimErrorSettledDeg - cfg.aimErrorStartDeg) * t + (moving ? cfg.aimErrorMovingDeg : 0);
  return deg * DEG;
}

/**
 * Turns the view towards (desiredYaw, desiredPitch) plus the wandering aim error of size `errorSize`,
 * at most cfg.turnRate per second. Returns the angle (radians) still left between the view and the
 * erroneous aim point.
 */
export function stepAim(a: AimState, desiredYaw: number, desiredPitch: number, errorSize: number, cfg: BotConfig, rng: RngState, dt: number): number {
  a.wanderLeft -= dt;
  if (a.wanderLeft <= 0) {
    a.wanderLeft = 1 / cfg.aimWanderRate;
    const angle = rngNext(rng) * Math.PI * 2;
    const r = Math.sqrt(rngNext(rng)); // uniform over the disc
    a.goalErrYaw = Math.cos(angle) * r;
    a.goalErrPitch = Math.sin(angle) * r;
  }
  const k = 1 - Math.exp(-cfg.aimWanderRate * 3 * dt);
  a.errYaw += (a.goalErrYaw - a.errYaw) * k;
  a.errPitch += (a.goalErrPitch - a.errPitch) * k;

  const goalYaw = desiredYaw + a.errYaw * errorSize;
  const goalPitch = desiredPitch + a.errPitch * errorSize;
  const dYaw = wrapAngle(goalYaw - a.yaw);
  const dPitch = goalPitch - a.pitch;
  const off = Math.hypot(dYaw, dPitch);
  const maxTurn = cfg.turnRate * dt;
  const s = off > maxTurn ? maxTurn / off : 1;
  a.yaw = wrapAngle(a.yaw + dYaw * s);
  a.pitch += dPitch * s;
  return off * (1 - s);
}

/** Yaw and pitch that look from (ax, ay, az) at (bx, by, bz). Yaw 0 looks down -Z; positive yaw turns left. */
export function lookAngles(ax: number, ay: number, az: number, bx: number, by: number, bz: number, out: { yaw: number; pitch: number }): void {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  out.yaw = Math.atan2(-dx, -dz);
  out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}
