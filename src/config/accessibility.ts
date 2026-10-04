import type { Switch } from './controls';
import { AUDIO } from './audio';

/** Settings → Accessibility (M18): reduced motion so far. */

export const REDUCED_MOTION_CHOICES: readonly { id: Switch; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: 'The replica bobs as you walk and sways as you turn, and the view tips as you lean.' },
  { id: 'on', label: 'On', blurb: 'No weapon bob or sway, half the recoil kick and hit jolt, a gentler tip as you lean, no drifting dust, and no pulsing or flashing on the HUD.' },
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
  /** The dust motes drifting in the sunlight (render/dustMotes.ts, M14): shown at all (1) or not (0). */
  dust: 0,
} as const;

/** Every movement at full size: reduced motion off. */
export const FULL_MOTION: MotionScale = { bob: 1, sway: 1, kick: 1, leanRoll: 1, dust: 1 };

export type MotionScale = { readonly [K in keyof typeof REDUCED_MOTION]: number };

/** The motion scales for the Reduced motion setting. */
export function motionScale(reduced: boolean): MotionScale {
  return reduced ? REDUCED_MOTION : FULL_MOTION;
}

/** On-screen sound cues (Settings → Accessibility, M18b): off by default, so playing by ear stays the norm. */
export const SOUND_CUE_CHOICES: readonly { id: Switch; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: 'Footsteps, shots and hit calls are heard only.' },
  {
    id: 'on',
    label: 'On',
    blurb: 'A marker round the crosshair points to each footstep (two dots), shot (an arrow) and hit call (a HIT tag), fainter further away.',
  },
];

/**
 * The sound cue ring (ui/soundCues.ts). Each cue shows as far as its sound is played (config/audio.ts), so it never
 * tells you more than your ears would.
 */
export const SOUND_CUES = {
  /** Seconds a cue stays up; it fades over the last `fade` of them. */
  life: 1.4,
  fade: 0.6,
  /** Furthest each kind shows (m). Steps: as far as other players' steps play; shots and hit calls: the 3D sound's reach. */
  range: { step: AUDIO.footsteps.maxDistance, shot: AUDIO.spatial.maxDistance, hit: AUDIO.spatial.maxDistance },
  /** Opacity of a cue at the edge of its range (1 right beside you). */
  farOpacity: 0.35,
  /** Markers kept (pooled); a new sound from the same player and kind moves that player's marker instead. */
  markers: 10,
  /** Distance of the ring from the screen centre (px): outside the crosshair and the hit direction arrow. */
  radius: 150,
  /** A marker moves or fades only in steps of this many radians and this much opacity (fewer style writes). */
  angleStep: 0.02,
  opacityStep: 0.05,
} as const;

export type SoundCueKind = keyof typeof SOUND_CUES.range;
