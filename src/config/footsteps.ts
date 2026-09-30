/**
 * Footsteps. Running and sprinting make noise that players and bots can hear; walking (walk key) and
 * moving crouched are silent, as in CS/Valorant. How far bots hear them is in config/bots.ts.
 */
export interface FootstepConfig {
  /** Metres travelled per footstep at a run and at a sprint. */
  strideRun: number;
  strideSprint: number;
  /** Crouched deeper than this (0..1) counts as moving crouched: silent. */
  silentCrouch: number;
  /** Landing faster than this (m/s, downwards) makes a thud (a normal hop lands at ~5.4 m/s). */
  landMinSpeed: number;
}

export const FOOTSTEPS: FootstepConfig = {
  strideRun: 1.6,
  strideSprint: 2.1,
  silentCrouch: 0.5,
  landMinSpeed: 3,
};
