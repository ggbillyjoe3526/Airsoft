import type { ImpactMaterial } from './sounds';

/**
 * BB flight model (M30): a 6 mm plastic sphere in air, from the fluid dynamics of a spinning ball. Four forces act on it:
 * gravity; drag along the airflow, ½·ρ·Cd·A·v², with Cd read from the Reynolds number (sim/air.ts); Magnus lift
 * from the hop-up's backspin, ½·ρ·CL·A·v² across the airflow, with CL from the spin ratio ω·r / v; and the wind, since
 * drag and lift both act on the BB's speed relative to the air. The backspin itself decays under the air's friction
 * torque. So a hopped BB flies flat while its spin still holds it up, then drops away as it slows, and a breeze drifts
 * it most at the end of a long shot. BB weight matters as at a real site: from the same replica a lighter BB leaves
 * faster but loses speed sooner and is lifted harder by the same hop, a heavier one the other way round.
 */
export interface BallisticsConfig {
  gravity: number;
  /** The air the BBs fly through: sea-level air at a mild day's temperature. Density and viscosity follow from it. */
  air: AirConfig;
  /** BB diameter (m): 5.95 mm, the standard airsoft BB (the barrel is 6.01–6.08 mm). */
  bbDiameter: number;
  /**
   * Backspin (rad/s) per unit of hop-up a replica gives (`hopUpLift`, its hopUpMax × the dial). The rifle's factory
   * setting (0.195) spins a BB at about 975 rad/s (9,300 rpm). Tuned so the factory dials keep the rifle on target to
   * ~38 m and the pistol to ~26 m, as before M30.
   */
  spinPerHop: number;
  /**
   * The Magnus lift coefficient's fit to the spin ratio S = ω·r / v: CL = S / (liftBase + liftSlope · S). Linear
   * (CL ≈ S) at the small spin ratios a hop-up gives, levelling off near 0.5 at high spin, the shape measured on
   * spinning spheres.
   */
  liftBase: number;
  liftSlope: number;
  /**
   * The air's friction torque on the spinning BB, as a moment coefficient per unit spin ratio (CM = spinFriction · S).
   * Spin then decays at 1.25 · ρ · A · spinFriction · v / m per second: faster while the BB is fast, slower on a
   * heavier BB (a 0.25 g BB at 80 m/s loses about half its spin in a second).
   */
  spinFriction: number;
  /** Seconds before an unhit BB is removed. */
  maxLifetime: number;
  /** Size of the BB pool (maximum BBs in flight at once). */
  maxBBs: number;
  ricochet: RicochetConfig;
}

/** The air's state; density from the ideal gas law, viscosity from Sutherland's law (sim/air.ts). */
export interface AirConfig {
  /** °C. */
  temperature: number;
  /** Pa (sea level: 101,325). */
  pressure: number;
}

/**
 * A breeze across the field, the same for the whole match and new each match (M30). It moves only BBs (and the dust in
 * the air), never players. Its strength is picked between `minSpeed` and `maxSpeed` from the match's seed, from any
 * direction, then gusts a little round that: two slow waves on its strength and one on its direction.
 */
export interface WindConfig {
  /** m/s: calm air to a light breeze (Beaufort 1–2), measured at head height. */
  minSpeed: number;
  maxSpeed: number;
  /** How much the strength gusts, as a share of it (0: steady). */
  gust: number;
  /** Periods (s) of the two gust waves; not multiples of each other, so the pattern doesn't repeat soon. */
  gustPeriods: readonly [number, number];
  /** How far (radians) the direction swings either way, and over what period (s). */
  veer: number;
  veerPeriod: number;
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
  air: { temperature: 20, pressure: 101_325 },
  bbDiameter: 5.95e-3,
  spinPerHop: 5000,
  liftBase: 0.981,
  liftSlope: 2.022,
  spinFriction: 0.05,
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

export const WIND: WindConfig = {
  minSpeed: 0.3,
  maxSpeed: 1.8,
  gust: 0.25,
  gustPeriods: [7.3, 11.9],
  veer: 0.14,
  veerPeriod: 17.1,
};
