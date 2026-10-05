
import type { SoundCue } from './sounds';

/**
 * How sound is mixed and placed (M13). The sounds themselves are recipes in config/sounds.ts; this file sets how
 * loud each kind plays, how it's positioned in 3D and muffled by walls, the yard's echo and the volume settings.
 * Replicas sound mechanical and plasticky, never like firearms.
 */
/**
 * Extraction's cases (M44) reuse cues the bank already has (it is at its title-screen budget, audio.test.ts): a case
 * being worked open is kit rummaged through, the marshal's locker a padlock and chain ratcheting (by pool.md Key), and
 * a lid snapping open a magazine's clack.
 */
const CASE_WORK_SOUNDS: Readonly<Record<string, SoundCue>> = { locker: 'rope.down' };
const CASE_WORK_SOUND: SoundCue = 'draw';
export const CASE_OPEN_SOUND: SoundCue = 'magIn.electric';

/** The sound of a case of `kind` being opened. */
export function caseWorkSound(kind: string): SoundCue {
  return CASE_WORK_SOUNDS[kind] ?? CASE_WORK_SOUND;
}

export const AUDIO = {
  /** Headroom under the player's master volume (several shots and steps at once must not clip). */
  masterVolume: 0.7,
  /**
   * A gentle limiter on the world's sound (the effects bus, before the master volume): only peaks above the threshold
   * (dB) are squeezed, so a firefight next to several replicas doesn't crackle. Quiet sounds pass untouched. The
   * interface's cues skip it (audit CORE-16): a limiter's look-ahead delays what passes through it by about 6 ms, and
   * the hit tick must land at once. -1 dB here is the old -4 dBFS after the master's headroom (0.7, about -3 dB).
   */
  limiter: { threshold: -1, knee: 4, ratio: 12, attack: 0.002, release: 0.12 },
  /**
   * The rate every sound is rendered at, whatever the output device runs at (audit CORE-03): a buffer at another rate
   * is resampled as it plays, so a 44.1 or 96 kHz device costs no second render and no extra memory.
   */
  renderRate: 48000,
  /**
   * Ducking (audit CORE-30): a cue that must be read lowers the world under it (the effects bus, never the interface)
   * to `depth` (linear) within about `attack` seconds, holds it for `hold` seconds, then lets it back over `release`
   * (time constants). Your own hit is the deepest; the referee's whistle at a round's end a gentler dip.
   */
  duck: {
    hit: { depth: 0.4, attack: 0.008, hold: 0.25, release: 0.1 },
    whistle: { depth: 0.6, attack: 0.03, hold: 0.6, release: 0.15 },
  },
  /**
   * While you are out (hit, walking off or in the dead zone; audit CORE-30/34) the world is heard as from the side
   * line: low-passed to `hz` and turned down to `gain`, easing over `ease` seconds (a time constant). The interface's
   * cues stay clear.
   */
  out: { hz: 900, gain: 0.5, ease: 0.15 },
  /**
   * The yard's quiet outdoor bed (audit CORE-34): a procedurally rendered loop of `seconds` of filtered noise (a band
   * around `bandHz`, rolled off above `topHz`, for distant traffic and air; a low rumble under `rumbleHz`) with gusts that swell `gustDepth` of
   * the level `gusts` times per loop. The loop is rendered at a loudness (RMS) of 1 and played at `gain` into the
   * world (so the effects slider sets it, and it dips and muffles with the rest) on two copies half a loop apart,
   * panned `width` left and right for some width: about -29 dBFS together after the master's headroom. Birds chirp now and then, `birdEvery` seconds
   * apart (min, max), `birdDistance` metres away (min, max) and `birdHeight` up, from a seeded generator.
   */
  ambience: {
    seconds: 6,
    crossfade: 0.25,
    bandHz: 380,
    bandQ: 0.6,
    topHz: 700,
    rumbleHz: 120,
    rumbleMix: 0.8,
    gusts: 2,
    gustDepth: 0.45,
    gain: 0.035,
    width: 0.7,
    seed: 1303,
    birdEvery: [7, 19] as readonly [number, number],
    birdDistance: [22, 45] as readonly [number, number],
    birdHeight: 7,
  },
  /** Pausing fades the match out over this long (s) before the audio is suspended, so Esc doesn't click (CORE-02). */
  pauseFade: 0.03,
  /**
   * A play whose audio still isn't running this long (s) after it was asked to (the browser blocks sound for the site)
   * shows a hint on the menus (audit CORE-21).
   */
  blockedCheck: 1,
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
    /** Extraction's exit count (M43): the timer box's beeps, on the interface bus. */
    countBeep: { gain: 0.45, pitchSpread: 0 },
    /** Extraction's cases (M44): worked while opened, and the lid popping. */
    caseWork: { gain: 0.8, pitchSpread: 0.06 },
    caseOpen: { gain: 0.9, pitchSpread: 0.05 },
    rope: { gain: 1, pitchSpread: 0.04 },
    /** A bird somewhere round the yard (the ambience). */
    bird: { gain: 0.35, pitchSpread: 0.08 },
    /** An owl somewhere in the woods at night (M33j): never above a bird's level. */
    owl: { gain: 0.3, pitchSpread: 0.04 },
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
   * volume within refDistance, then an inverse roll-off (refDistance / (refDistance + rolloff · (d - refDistance))):
   * -14 dB at 20 m, so a bot sprinting at you is heard from most of the 22 m earshot (audit CORE-26; was 3 m and 1.4,
   * -19 dB). The inverse model never reaches silence, so `maxDistance` is the game's own cull range (audit CORE-01):
   * one-off sounds in the world further than that aren't played at all.
   */
  spatial: {
    panningModel: 'HRTF' as PanningModelType,
    /** One-off world sounds (BB impacts, the flag's rope): many at once, so the cheaper equal-power panning. */
    oneShotPanningModel: 'equalpower' as PanningModelType,
    refDistance: 4,
    rolloff: 1,
    maxDistance: 60,
    /** The practice range's steel and figures are heard all the way down it (its far corner is 74 m from the back). */
    targetMaxDistance: 80,
    /**
     * A character's channel follows them only when they moved more than this (m) since it was last placed, and not
     * at all while they're beyond `maxDistance` or out in the dead zone (audit CORE-35): its next sound places it.
     */
    moveEpsilon: 0.05,
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
  reverb: { seconds: 0.8, decayPower: 3.5, wet: 0.22, seed: 1302 },
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
  /**
   * The sounds are rendered in the browser's spare time on the title screen (audit M-09), a cue at a time, for as
   * long as a spare moment has more than this many milliseconds left (a cue takes about 4 ms).
   */
  warmUpSliceMs: 5,
  /**
   * Letting go of a volume slider plays this short dry cue through the bus it sets (audit L-17), so the level can be
   * judged from the pause menu or the title screen.
   */
  volumePreview: { cue: 'hitMarker' as SoundCue, gain: 0.55 },
} as const;

/** A playback level and per-play pitch spread (AUDIO.levels). */
export interface SoundLevel {
  readonly gain: number;
  readonly pitchSpread: number;
}

/**
 * A loop of filtered noise whose level swells in gusts (audio/ambience.ts renderAmbienceBed): a band around `bandHz`,
 * rolled off above `topHz`, with a low rumble under `rumbleHz` mixed in at `rumbleMix`; `gusts` whole swells of
 * `gustDepth` per loop of `seconds`, its tail crossfaded over its head for `crossfade` seconds.
 */
export interface NoiseLoopSpec {
  readonly kind: 'noise';
  readonly seconds: number;
  readonly crossfade: number;
  readonly bandHz: number;
  readonly bandQ: number;
  readonly topHz: number;
  readonly rumbleHz: number;
  readonly rumbleMix: number;
  readonly gusts: number;
  readonly gustDepth: number;
  readonly seed: number;
}

/**
 * Insects at night (audio/ambience.ts renderInsects): each voice a sine at `hz` (kept above the 0.7–4 kHz band where
 * footsteps live) pulsed `pulseHz` times a second in chirps of `pulses`, `chirps` chirps per loop of `seconds` (whole
 * numbers of everything, so the loop is seamless), at `level`; chirp levels vary by `jitter` from a seed.
 */
export interface InsectLoopSpec {
  readonly kind: 'insects';
  readonly seconds: number;
  readonly seed: number;
  readonly jitter: number;
  readonly voices: readonly { readonly hz: number; readonly pulseHz: number; readonly pulses: number; readonly chirps: number; readonly level: number }[];
}

/**
 * A camp fire (audio/ambience.ts renderCrackle): a low roar (noise under `roarHz`, flickering `flicker` deep), crackles
 * (`crackles` a second: short bursts of noise between `crackleHz`, `crackleDecay` seconds long) and pops (`pops` a
 * second: louder, lower knocks round `popHz`), a loop of `seconds` crossfaded over `crossfade`.
 */
export interface CrackleLoopSpec {
  readonly kind: 'crackle';
  readonly seconds: number;
  readonly crossfade: number;
  readonly seed: number;
  readonly roarHz: number;
  readonly roarLevel: number;
  readonly flicker: number;
  readonly crackles: number;
  readonly crackleHz: readonly [number, number];
  readonly crackleDecay: readonly [number, number];
  readonly crackleLevel: number;
  readonly pops: number;
  readonly popHz: readonly [number, number];
  readonly popDecay: number;
  readonly popLevel: number;
}

export type LoopSpec = NoiseLoopSpec | InsectLoopSpec | CrackleLoopSpec;

/** The ambience's looping sounds (M33j), each rendered once per page and only for a map that plays it. */
export type LoopId = 'yard' | 'pines' | 'insects' | 'crackle';

export const AMBIENT_LOOPS: Readonly<Record<LoopId, LoopSpec>> = {
  /** The yard's bed (audit CORE-34), as it always was: rendered on the title screen. */
  yard: { kind: 'noise', ...AUDIO.ambience },
  /**
   * Wind in the pines (M33j): a hiss of needles round 500–1500 Hz, a soft roar of air under it, three slow gusts in a
   * loop of 7 s (coprime with the insects' 5 s, so the two repeat only every 35 s).
   */
  pines: { kind: 'noise', seconds: 7, crossfade: 0.3, bandHz: 600, bandQ: 0.7, topHz: 1100, rumbleHz: 160, rumbleMix: 0.6, gusts: 3, gustDepth: 0.6, seed: 3371 },
  /** Crickets and katydids (M33j): three voices between 5.5 and 7 kHz, well above the footstep band. */
  insects: {
    kind: 'insects',
    seconds: 5,
    seed: 3372,
    jitter: 0.35,
    voices: [
      { hz: 5600, pulseHz: 32, pulses: 4, chirps: 11, level: 1 },
      { hz: 6300, pulseHz: 45, pulses: 3, chirps: 8, level: 0.7 },
      { hz: 6900, pulseHz: 60, pulses: 6, chirps: 4, level: 0.45 },
    ],
  },
  /** A camp fire burning (M33j): a soft roar, quick crackles and the odd pop, a loop of 4 s. */
  crackle: {
    kind: 'crackle',
    seconds: 4,
    crossfade: 0.2,
    seed: 3373,
    roarHz: 500,
    roarLevel: 0.8,
    flicker: 0.4,
    crackles: 22,
    crackleHz: [1500, 6000],
    crackleDecay: [0.002, 0.006],
    crackleLevel: 0.8,
    pops: 1.2,
    popHz: [500, 1100],
    popDecay: 0.018,
    popLevel: 1.2,
  },
};

/** The fields' soundscapes (MapData.ambience; absent: the yard). */
export type AmbienceId = 'yard' | 'woods';

/** A loop playing as a bed (two copies half a loop apart, panned `width` left and right) at `gain`. */
export interface AmbienceBed {
  readonly loop: LoopId;
  readonly gain: number;
  readonly width: number;
}

/**
 * Sparse calls round the listener (audio/ambience.ts AmbientCalls): `cue` now and then, `every` seconds apart (min, max),
 * `distance` metres away (min, max) and `height` up, at `level`, timed from a seeded generator.
 */
export interface AmbientCallSpec {
  readonly cue: SoundCue;
  readonly level: SoundLevel;
  readonly every: readonly [number, number];
  readonly distance: readonly [number, number];
  readonly height: number;
  readonly seed: number;
}

/** A field's sound by day or by night: its beds, and its calls (none at all: null). */
export interface Ambience {
  readonly beds: readonly AmbienceBed[];
  readonly call: AmbientCallSpec | null;
}

/** The yard's birds (audit CORE-34), as they always were. */
const BIRDS: AmbientCallSpec = {
  cue: 'ambience.bird',
  level: AUDIO.levels.bird,
  every: AUDIO.ambience.birdEvery,
  distance: AUDIO.ambience.birdDistance,
  height: AUDIO.ambience.birdHeight,
  seed: AUDIO.ambience.seed,
};

/** A tawny owl in the woods at night (M33j): rarely, and far off. */
const OWL: AmbientCallSpec = { cue: 'ambience.owl', level: AUDIO.levels.owl, every: [25, 60], distance: [30, 50], height: 8, seed: 3374 };

const YARD_BED: AmbienceBed = { loop: 'yard', gain: AUDIO.ambience.gain, width: AUDIO.ambience.width };
/**
 * The woods' wind and insects (gameplay first: steps, BBs and bot cues on top). The wind sits low (round 600 Hz, rolled off
 * above 1.1 kHz) and quieter than the yard's bed, so the two together put no more into the 0.7–4 kHz band footsteps live
 * in than Depot's bed does (audio.test.ts); the insects, 6 dB under the wind, sing above that band.
 */
const PINES_BED: AmbienceBed = { loop: 'pines', gain: 0.018, width: 0.75 };
const INSECTS_BED: AmbienceBed = { loop: 'insects', gain: 0.009, width: 0.9 };

/**
 * Every field's sound, by day and by night (M33j), picked by the lighting preset's night flag (never a map's name). The
 * engine's rule: no birds under a night preset, on any map.
 */
export const AMBIENCES: Readonly<Record<AmbienceId, Readonly<Record<'day' | 'night', Ambience>>>> = {
  yard: { day: { beds: [YARD_BED], call: BIRDS }, night: { beds: [YARD_BED], call: null } },
  woods: { day: { beds: [PINES_BED], call: BIRDS }, night: { beds: [PINES_BED, INSECTS_BED], call: OWL } },
};

/**
 * A camp fire's crackle (M33j), heard at each `kind: 'fire'` light of a field played at night: `loop` at `gain` (its
 * loudest pop peaks under 0.25 within `refDistance` m, as loud as the bed on average), fading to nothing at
 * `maxDistance` (a linear roll-off, equal-power panning). Lanterns are silent: an electric hum would sound wrong.
 */
export const FIRE_SOUND = { loop: 'crackle' as LoopId, gain: 0.028, refDistance: 2, maxDistance: 12, rolloff: 1, panningModel: 'equalpower' as PanningModelType };

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
