import type { Switch } from './controls';

/** Settings → Accessibility (M18): reduced motion so far. */

export const REDUCED_MOTION_CHOICES: readonly { id: Switch; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: 'The replica bobs as you walk and sways as you turn, and the view tips as you lean.' },
  { id: 'on', label: 'On', blurb: 'No weapon bob or sway, half the recoil kick and hit jolt, and a gentler tip as you lean.' },
];

/**
 * What reduced motion leaves of each movement, as a share of the full one (1 = unchanged). The camera's own recoil climb
 * stays: it shows where the next BB goes (DECISIONS, M18).
 */
export const REDUCED_MOTION = {
  /** The replica's walk bob and its sway behind mouse turns. */
  bob: 0,
  sway: 0,
  /** The replica's kick per shot and its jolt when you're hit. */
  kick: 0.5,
  /** The view's roll as you lean (render/cameraRig.ts). */
  leanRoll: 0.25,
} as const;

/** Every movement at full size: reduced motion off. */
export const FULL_MOTION: MotionScale = { bob: 1, sway: 1, kick: 1, leanRoll: 1 };

export type MotionScale = { readonly [K in keyof typeof REDUCED_MOTION]: number };

/** The motion scales for the Reduced motion setting. */
export function motionScale(reduced: boolean): MotionScale {
  return reduced ? REDUCED_MOTION : FULL_MOTION;
}
