import type { BotBehaviour, BotSkill } from '../config/bots';
import { type RngState, rngNext } from '../sim/rng';
import { wrapAngle } from '../sim/vec';

const DEG = Math.PI / 180;

/**
 * A bot's view and aim: where it is looking (turned at a limited rate), a slowly wandering aim error, like a hand that
 * is still settling on the target, and the hasty first aim at a new contact, off to one side, that the hand walks in.
 */
export interface AimState {
  yaw: number;
  pitch: number;
  /** Current aim error (a share of its size, both ways) and the error it is drifting towards. */
  errYaw: number;
  errPitch: number;
  goalErrYaw: number;
  goalErrPitch: number;
  /** Seconds until a new drift goal is picked. */
  wanderLeft: number;
  /** Which way the first aim at the current contact is off (a share of aimFirstErrorSize, G11): to one side. */
  firstYaw: number;
  firstPitch: number;
}

export function createAim(yaw: number): AimState {
  return { yaw, pitch: 0, errYaw: 0, errPitch: 0, goalErrYaw: 0, goalErrPitch: 0, wanderLeft: 0, firstYaw: 0, firstPitch: 0 };
}

/**
 * Aim error size (radians) `sinceAcquired` seconds after picking up a target `dist` metres away that
 * moves across the view at `sideways` m/s: starts large and settles over aimSettleTime; worse while the
 * bot moves or the target does. The starting error is never smaller than aimErrorStartMetres off the
 * target, so up close the first BBs can miss.
 */
export function aimErrorSize(sinceAcquired: number, moving: boolean, dist: number, sideways: number, skill: BotSkill): number {
  const t = Math.min(1, Math.max(0, sinceAcquired / skill.aimSettleTime));
  const d = Math.max(dist, 1e-3);
  const start = Math.max(skill.aimErrorStartDeg * DEG, Math.atan2(skill.aimErrorStartMetres, d));
  const settled = skill.aimErrorSettledDeg * DEG;
  const tracking = Math.atan2(Math.abs(sideways) * skill.aimErrorTracking, d);
  return start + (settled - start) * t + (moving ? skill.aimErrorMovingDeg * DEG : 0) + tracking;
}

/**
 * The part of aimErrorSize that settles (radians): the starting error over the settled one, gone after aimSettleTime.
 * It is the first aim's (AimState.firstYaw, off to one side, G11); the rest, settled, moving and tracking, wanders.
 */
export function aimFirstErrorSize(sinceAcquired: number, dist: number, skill: BotSkill): number {
  const t = Math.min(1, Math.max(0, sinceAcquired / skill.aimSettleTime));
  const start = Math.max(skill.aimErrorStartDeg * DEG, Math.atan2(skill.aimErrorStartMetres, Math.max(dist, 1e-3)));
  return Math.max(0, start - skill.aimErrorSettledDeg * DEG) * (1 - t);
}

/**
 * How long the aim error of a contact has been settling at `time` (s; aimErrorSize's `sinceAcquired`): from when it was
 * acquired (`acquiredAt`, which a pre-aim shifts back), less the part of its reaction delay (`firstSeenAt` to `reactAt`)
 * it does not settle over (cfg.aimSettleWhileReacting, G11). Negative while it still reacts.
 */
export function aimSettling(time: number, acquiredAt: number, firstSeenAt: number, reactAt: number, cfg: BotBehaviour): number {
  return time - acquiredAt - (1 - cfg.aimSettleWhileReacting) * Math.max(0, reactAt - firstSeenAt);
}

/**
 * Turns the view towards (desiredYaw, desiredPitch) plus the wandering aim error of size `errorSize` and the first aim's
 * of size `firstSize` (aimFirstErrorSize), at most skill.turnRate per second (the error wanders at the shared
 * cfg.aimWanderRate, chasing each new wander goal at cfg.aimWanderSettle times that rate). Returns the angle (radians)
 * still left between the view and the erroneous aim point.
 */
export function stepAim(a: AimState, desiredYaw: number, desiredPitch: number, errorSize: number, cfg: BotBehaviour, skill: BotSkill, rng: RngState, dt: number, firstSize = 0): number {
  a.wanderLeft -= dt;
  if (a.wanderLeft <= 0) {
    a.wanderLeft = 1 / cfg.aimWanderRate;
    const angle = rngNext(rng) * Math.PI * 2;
    const r = Math.sqrt(rngNext(rng)); // uniform over the disc
    a.goalErrYaw = Math.cos(angle) * r;
    a.goalErrPitch = Math.sin(angle) * r;
  }
  const k = 1 - Math.exp(-cfg.aimWanderRate * cfg.aimWanderSettle * dt);
  a.errYaw += (a.goalErrYaw - a.errYaw) * k;
  a.errPitch += (a.goalErrPitch - a.errPitch) * k;

  const goalYaw = desiredYaw + a.errYaw * errorSize + a.firstYaw * firstSize;
  const goalPitch = desiredPitch + a.errPitch * errorSize + a.firstPitch * firstSize;
  const dYaw = wrapAngle(goalYaw - a.yaw);
  const dPitch = goalPitch - a.pitch;
  const off = Math.hypot(dYaw, dPitch);
  const maxTurn = skill.turnRate * dt;
  const s = off > maxTurn ? maxTurn / off : 1;
  a.yaw = wrapAngle(a.yaw + dYaw * s);
  a.pitch += dPitch * s;
  return off * (1 - s);
}

/**
 * A new aim error on a target: the wander jumps to a random direction, at least cfg.aimFirstErrorMin of the way out,
 * and holds there a while. On a new contact (`fresh`, G11) the wander starts from the middle instead, and the first aim
 * is what is off: by its settling part (aimFirstErrorSize), at least cfg.aimFirstErrorMin of it, to one side, tilted at
 * most cfg.aimFirstErrorTiltDeg from level. So the first BBs whizz past a shoulder and walk onto the target once the bot
 * opens fire, instead of starting dead on it or landing on the legs or the head from an error that pointed down or up.
 */
export function freshAimError(a: AimState, cfg: BotBehaviour, rng: RngState, fresh = false): void {
  const angle = rngNext(rng) * Math.PI * 2;
  const r = cfg.aimFirstErrorMin + rngNext(rng) * (1 - cfg.aimFirstErrorMin);
  a.errYaw = a.goalErrYaw = Math.cos(angle) * r;
  a.errPitch = a.goalErrPitch = Math.sin(angle) * r;
  a.wanderLeft = 1 / cfg.aimWanderRate;
  if (!fresh) return;
  const tilt = (rngNext(rng) * 2 - 1) * cfg.aimFirstErrorTiltDeg * DEG;
  const side = rngNext(rng) < 0.5 ? 1 : -1;
  const out = cfg.aimFirstErrorMin + rngNext(rng) * (1 - cfg.aimFirstErrorMin);
  a.firstYaw = side * Math.cos(tilt) * out;
  a.firstPitch = Math.sin(tilt) * out;
  // The hand starts from the middle and drifts out to the same side, so it never cancels the first aim's miss.
  a.errYaw = a.errPitch = 0;
  a.goalErrYaw = side * Math.abs(a.goalErrYaw);
}

/** Yaw and pitch that look from (ax, ay, az) at (bx, by, bz). Yaw 0 looks down -Z; positive yaw turns left. */
export function lookAngles(ax: number, ay: number, az: number, bx: number, by: number, bz: number, out: { yaw: number; pitch: number }): void {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  out.yaw = Math.atan2(-dx, -dz);
  out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}
