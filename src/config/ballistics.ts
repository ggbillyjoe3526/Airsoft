/**
 * BB flight model. A 6 mm plastic BB with backspin from the hop-up: gravity pulls it down, air drag
 * slows it, and Magnus lift from the backspin holds it up. The spin decays, so the BB flies flat
 * over mid-range and then drops away. Speeds are lower than real replicas (~100 m/s) so BBs stay
 * visible in flight: fun and readability beat simulation.
 */
export interface BallisticsConfig {
  gravity: number;
  /** Quadratic drag: acceleration = -drag * speed * velocity (1/m). */
  drag: number;
  /** Hop-up spin decays as exp(-age / spinDecayTime) (s). */
  spinDecayTime: number;
  /** Seconds before an unhit BB is removed. */
  maxLifetime: number;
  /** Size of the BB pool (maximum BBs in flight at once). */
  maxBBs: number;
}

export const BALLISTICS: BallisticsConfig = {
  gravity: 9.81,
  drag: 0.012,
  spinDecayTime: 0.55,
  maxLifetime: 2.5,
  maxBBs: 256,
};
