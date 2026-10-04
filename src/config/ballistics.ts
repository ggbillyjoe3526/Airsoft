import type { ImpactMaterial } from './sounds';

/**
 * BB flight model. A 6 mm plastic BB with backspin from the hop-up: gravity pulls it down, air drag
 * slows it, and Magnus lift from the backspin holds it up. The spin decays, so the BB flies flat
 * over mid-range and then drops away. BB weight matters as at a real site: from the same replica a
 * lighter BB leaves faster but loses speed sooner and is lifted harder by the same hop, a heavier one the
 * other way round. Fun and readability beat simulation where they conflict (see `dragArea`).
 */
export interface BallisticsConfig {
  gravity: number;
  /**
   * Air drag of a 6 mm BB, ½·ρ·Cd·A (kg/m): deceleration = dragArea / mass · speed². About 60% of a real
   * BB's (~8e-6 kg/m): real BBs slow down so much that the arc would need far more hop to stay readable
   * across a CQB field; this keeps visible travel time (~0.47 s to 30 m) without that.
   */
  dragArea: number;
  /**
   * The BB weight replicas' hop-up and spin are tuned against (kg). A replica's hop-up lift lifts a BB of this
   * weight; a lighter BB is lifted harder, a heavier one less (lift force / mass), and spin lasts longer
   * on a heavier BB.
   */
  referenceMass: number;
  /** Hop-up spin decays as exp(-age / decay), decay = spinDecayTime × mass / referenceMass (s). */
  spinDecayTime: number;
  /** Seconds before an unhit BB is removed. */
  maxLifetime: number;
  /** Size of the BB pool (maximum BBs in flight at once). */
  maxBBs: number;
  ricochet: RicochetConfig;
}

/**
 * BBs bounce off hard surfaces (M20) instead of stopping dead: the part of the velocity into the surface comes back
 * smaller, the part along it is slowed by friction, and the hop-up's backspin is lost. Whether a bounced BB knocks
 * anyone out is the match's rule (HitConfig.ricochetsCount). First guesses, to tune in play.
 */
export interface RicochetConfig {
  /** Share of the speed into the surface that comes back out, per material (0: the BB stops there, as in wood). */
  restitution: Readonly<Record<ImpactMaterial, number>>;
  /** Share of the speed along the surface that is kept. */
  slide: number;
  /** A BB leaving a bounce slower than this (m/s) drops dead instead. */
  minSpeed: number;
  /** The most times one BB bounces; it stops at the next surface after that. */
  maxBounces: number;
  /** Random spread of the bounced direction, as a share of its speed (a BB on a rough wall doesn't bounce like a mirror). */
  scatter: number;
  /** Share of the hop-up lift left after a bounce (the backspin is scrubbed off). */
  spinKept: number;
  /** How far off the surface (m) a bounced BB restarts, so the next ray doesn't start inside it. */
  liftOff: number;
}

export const BALLISTICS: BallisticsConfig = {
  gravity: 9.81,
  dragArea: 5e-6,
  referenceMass: 0.25e-3,
  spinDecayTime: 0.5,
  maxLifetime: 2.5,
  maxBBs: 256,
  ricochet: {
    // Concrete gives back a little under half, steel containers more; crates (wood) soak a BB up.
    restitution: { concrete: 0.4, metal: 0.55, wood: 0 },
    slide: 0.75,
    minSpeed: 12,
    maxBounces: 2,
    scatter: 0.12,
    spinKept: 0,
    liftOff: 0.002,
  },
};
