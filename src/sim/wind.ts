import type { WindConfig } from '../config/ballistics';
import { createRng, rngNext } from './rng';
import type { Vec3 } from './vec';

/**
 * The match's breeze (M30), picked once from the match's seed: its mean strength and direction, and where each gust wave
 * starts. Plain data; windAt turns it into the wind at a moment of the match.
 */
export interface WindState {
  /** Mean strength (m/s). */
  speed: number;
  /** The way it blows towards, as a yaw (radians; 0 blows towards −z, as a character's yaw 0 faces). */
  yaw: number;
  /** Start phases (radians) of the two strength waves and the direction wave. */
  phases: [number, number, number];
  gust: number;
  gustPeriods: readonly [number, number];
  veer: number;
  veerPeriod: number;
}

/** Stirs the match seed so the wind's draws don't follow the simulation's own stream (createRng(seed)). */
const WIND_SALT = 0x5f3759df;

/** The breeze for a match of `seed`: a strength between cfg.minSpeed and cfg.maxSpeed, from any direction. */
export function createWind(seed: number, cfg: WindConfig): WindState {
  const rng = createRng((seed ^ WIND_SALT) >>> 0);
  const tau = Math.PI * 2;
  return {
    speed: cfg.minSpeed + (cfg.maxSpeed - cfg.minSpeed) * rngNext(rng),
    yaw: rngNext(rng) * tau,
    phases: [rngNext(rng) * tau, rngNext(rng) * tau, rngNext(rng) * tau],
    gust: cfg.gust,
    gustPeriods: cfg.gustPeriods,
    veer: cfg.veer,
    veerPeriod: cfg.veerPeriod,
  };
}

/**
 * The wind (m/s, level) at `time` seconds into the match, into `out`: the mean breeze, its strength rising and falling
 * by up to `gust` of itself on two slow waves, its direction swinging by up to `veer` on a third. Pure.
 */
export function windAt(w: WindState, time: number, out: Vec3): Vec3 {
  const tau = Math.PI * 2;
  const gust = 0.6 * Math.sin((tau * time) / w.gustPeriods[0] + w.phases[0]) + 0.4 * Math.sin((tau * time) / w.gustPeriods[1] + w.phases[1]);
  const speed = w.speed * (1 + w.gust * gust);
  const yaw = w.yaw + w.veer * Math.sin((tau * time) / w.veerPeriod + w.phases[2]);
  out.x = -Math.sin(yaw) * speed;
  out.y = 0;
  out.z = -Math.cos(yaw) * speed;
  return out;
}
