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
   * The BB weight replicas' hop-up and spin are tuned against (kg). A replica's hopUp lifts a BB of this
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
}

export const BALLISTICS: BallisticsConfig = {
  gravity: 9.81,
  dragArea: 5e-6,
  referenceMass: 0.25e-3,
  spinDecayTime: 0.5,
  maxLifetime: 2.5,
  maxBBs: 256,
};
