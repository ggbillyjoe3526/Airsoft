
/**
 * How sound is mixed and placed (M13). The sounds themselves are recipes in config/sounds.ts; this file sets how
 * loud each kind plays, how it's positioned in 3D and muffled by walls, the yard's echo and the volume settings.
 * Replicas sound mechanical and plasticky, never like firearms.
 */
export const AUDIO = {
  /** Headroom under the player's master volume (several shots and steps at once must not clip). */
  masterVolume: 0.7,
  /**
   * A gentle limiter on the master bus: only peaks above the threshold (dBFS) are squeezed, so a firefight next to
   * several replicas doesn't crackle. Quiet sounds pass untouched.
   */
  limiter: { threshold: -4, knee: 4, ratio: 12, attack: 0.002, release: 0.12 },
  /** Variants rendered per sound (each moves pitch, timing and mix a little, so repeats don't sound looped). */
  variants: 5,
  /** Seed of the presentation-only generator the variants are rendered with. */
  synthSeed: 1301,
  /** Playback level of each kind of sound, and how far its pitch varies per play (± fraction). */
  levels: {
    shot: { gain: 1, pitchSpread: 0.03 },
    motor: { gain: 0.8, pitchSpread: 0.02 },
    mechanism: { gain: 0.8, pitchSpread: 0.04 },
    /** Other players' footsteps. */
    step: { gain: 0.48, pitchSpread: 0.06 },
    /** Your own: quieter, but always played (they're how you judge your own pace and noise). */
    ownStep: { gain: 0.25, pitchSpread: 0.06 },
    foley: { gain: 0.8, pitchSpread: 0.08 },
    ownFoley: { gain: 0.45, pitchSpread: 0.08 },
    impact: { gain: 0.9, pitchSpread: 0.1 },
    bodyHit: { gain: 1, pitchSpread: 0.06 },
    /** Practice range steel (M21): loud enough to hear from 60 m, as a plate is. */
    steelRing: { gain: 1.4, pitchSpread: 0.03 },
    hitTick: { gain: 1, pitchSpread: 0 },
    hitMarker: { gain: 0.55, pitchSpread: 0 },
    /** A teammate's radio answering a squad order (M22). */
    radioAck: { gain: 0.5, pitchSpread: 0.02 },
    rope: { gain: 1, pitchSpread: 0.04 },
  },
  /**
   * An AEG's motor: the first shot after the trigger has rested this many fire-rate cycles gets the spin-up whine,
   * and the spin-down plays this many cycles after the last shot (cancelled when another shot comes first).
   */
  motor: { spinUpAfterCycles: 1.6, spinDownAfterCycles: 1.25 },
  /** A sound stopped while it plays (the motor's wind-down cut by the next trigger pull) fades out over this long (s). */
  cutFade: 0.015,
  /**
   * Positional sounds. HRTF panning gives direction cues in front, behind and above (best on headphones); full
   * volume within refDistance, then an inverse roll-off.
   */
  spatial: {
    panningModel: 'HRTF' as PanningModelType,
    /** One-off world sounds (BB impacts, the flag's rope): many at once, so the cheaper equal-power panning. */
    oneShotPanningModel: 'equalpower' as PanningModelType,
    refDistance: 3,
    rolloff: 1.4,
    maxDistance: 60,
    /** A character's sounds come from this high above their feet (m). */
    sourceHeight: 1.2,
  },
  /**
   * Muffling through walls: rays from your ears to a character at these heights above their feet (m) (knees and
   * head: someone behind low cover is half muffled). The blocked share closes a low-pass filter towards
   * `muffledHz` and turns the sound down towards `muffledGain`, easing over `smoothing` seconds. A one-off sound
   * in the world (a BB impact) casts one ray, stopping `surfaceGap` short of the surface it hit.
   */
  occlusion: {
    rayHeights: [0.45, 1.5] as readonly number[],
    openHz: 18000,
    muffledHz: 700,
    muffledGain: 0.55,
    smoothing: 0.07,
    surfaceGap: 0.2,
  },
  /**
   * Other players' footsteps further than this (m) aren't played: about as far as bots hear a sprint. At most
   * `maxPerWindow` of them start within `window` seconds (six sprinters stay readable).
   */
  footsteps: { maxDistance: 22, maxPerWindow: 4, window: 0.1 },
  /** Crouching, standing and leaning rustle: heard this close (m), at most this many per window. */
  foley: { maxDistance: 9, maxPerWindow: 3, window: 0.15 },
  /** At most this many impact ticks start within `impactWindow` seconds (a hose of BBs stays readable). */
  maxImpactsPerWindow: 8,
  impactWindow: 0.1,
  /** A BB impact this close to a block's faces (m) counts as on that block. */
  impactBlockMargin: 0.06,
  /**
   * The yard's echo: a short procedural reverb (decaying noise) that every in-world sound feeds, so shots and
   * steps sound like they're between walls. Interface sounds (hit tick, hit marker, whistle) stay dry.
   */
  reverb: { seconds: 0.8, decayPower: 3.5, wet: 0.22 },
  /** Referee whistle at the end and start of a round. */
  whistleVolume: 0.25,
  whistlePitch: 2900,
  whistleWarble: 28,
  /** Warble depth as a fraction of the pitch (the pea rattling in the whistle). */
  whistleWarbleDepth: 0.04,
  /** Fade in / out at each end of a blast (s). */
  whistleAttack: 0.02,
  whistleRelease: 0.05,
  /** Oscillators stop this long after a sound's end so the fade-out isn't clipped (s). */
  stopPadding: 0.02,
  roundOverWhistle: 0.8,
  /** Round start: two short blasts, the second starting this many blast-lengths after the first. */
  roundStartWhistle: 0.14,
  roundStartWhistleGap: 1.6,
  /** Match over: this many more long blasts after the round's, each this many blast-lengths apart. */
  matchOverBlasts: 3,
  matchOverWhistleGap: 1.3,
  /**
   * A suppressed replica's shots: its usual sound, low-passed and turned down (ReplicaLook.suppressed). No
   * replica has a suppressor yet; muzzle devices come with loadouts (after v0.1).
   */
  suppressed: { lowpassHz: 1400, volume: 0.45 },
} as const;

/** The player's volume sliders (Settings → Audio): everything, sounds in the world, and the interface's cues. */
export type VolumeChannel = 'master' | 'effects' | 'interface';
export const VOLUME_CHANNELS: readonly VolumeChannel[] = ['master', 'effects', 'interface'];

export const VOLUME = {
  /** Slider range and step (0..1, shown as a percentage), and where each slider starts. */
  min: 0,
  max: 1,
  step: 0.05,
  /** Full by default: the master slider's top is AUDIO.masterVolume, the level the game always played at. */
  defaults: { master: 1, effects: 1, interface: 1 } satisfies Record<VolumeChannel, number>,
  /** A slider's position is raised to this power for its gain, so each step sounds about as big as the last. */
  curve: 2,
  /** Volume changes ease in over this many seconds (no zipper noise while a slider moves). */
  smoothing: 0.03,
} as const;

/** When extra match-over blast `i` (0-based) starts, in seconds after the deciding hit. */
export function matchOverBlastStart(i: number): number {
  return AUDIO.roundOverWhistle * AUDIO.matchOverWhistleGap * (i + 1);
}

/** Seconds from the deciding hit to the end of the match-over whistles (the round's blast plus the extra ones). */
export function matchOverWhistlesDuration(): number {
  return Math.max(AUDIO.roundOverWhistle, matchOverBlastStart(AUDIO.matchOverBlasts - 1) + AUDIO.roundOverWhistle);
}
