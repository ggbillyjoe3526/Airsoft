import type { SoundRecipe } from '../audio/dsp';
import type { GroundSurface } from '../map/mapTypes';

/**
 * Every sound effect as a recipe (audio/dsp.ts): layers of filtered noise, gliding tones and struck resonances,
 * rendered into a few variants each when audio starts. Replicas sound like the toys they are: an electric gearbox
 * cycling a plastic piston, a gas pistol's pop and slide clack, a spring piston's thump and twang. More body than
 * a click, never the boom of a firearm (CLAUDE.md §2).
 */

/**
 * What a replica sounds like: its power's sounds (ReplicaConfig.power; spring replicas come with the v0.3 armoury), or
 * its own (ReplicaLook.sound: the Cyber Pistol's, M32).
 */
export type ShotProfile = 'electric' | 'gas' | 'spring' | 'cyber';
/** Every shot profile, for the audio tests that walk them all (test only). */
export const SHOT_PROFILES: readonly ShotProfile[] = ['electric', 'gas', 'spring', 'cyber'];

/** What a floor or ramp block is underfoot (MapBlock.surface; without one, concrete). */
export type BlockSurface = 'concrete' | 'metal';

/**
 * What a footstep lands on: a floor or ramp block's surface, or on terrain the ground's (M33j: MapData.ground, the grid
 * the terrain is painted from).
 */
export type FloorSurface = BlockSurface | GroundSurface;

/** What a BB ticks off (from the kind of block it hit; see audio/soundMaterials.ts). */
export type ImpactMaterial = 'concrete' | 'metal' | 'wood' | 'earth';

export type FootstepPace = 'run' | 'sprint' | 'land';
/** Every footstep pace, for the cues a surface needs (M33j). */
export const FOOTSTEP_PACES: readonly FootstepPace[] = ['run', 'sprint', 'land'];

export type SoundCue =
  | `shot.${ShotProfile}`
  /** An AEG's motor winding up on the first shot of a trigger pull, and winding down after the last. */
  | 'motor.spinUp'
  | 'motor.spinDown'
  | `dryFire.${ShotProfile}`
  | `magOut.${ShotProfile}`
  | `magIn.${ShotProfile}`
  | 'selector'
  /** A weapon torch's tailcap switch (M33h): a softer, lower click than the selector. */
  | 'torchClick'
  | 'draw'
  | 'reloadRefused'
  | `step.${FloorSurface}.${FootstepPace}`
  /** Kit and clothing moving: dropping into a crouch, standing up, leaning out. */
  | 'foley.crouch'
  | 'foley.stand'
  | 'foley.lean'
  /** A hi-cap's loose BBs shaking with each step (M17b). */
  | 'magRattle'
  | `impact.${ImpactMaterial}`
  | 'bodyHit'
  /** A BB ringing a steel plate on the practice range (M21). */
  | 'steelRing'
  | 'hitTick'
  | 'hitMarker'
  /** A teammate's radio keyed twice: your squad order was heard (M22). */
  | 'radio.ack'
  | 'rope.up'
  | 'rope.down'
  /** Extraction (M43): the exit's timer box beeping each second of the count. */
  | 'count.beep'
  /** A bird somewhere round the yard: the ambience's sparse one-shots (audit CORE-34). */
  | 'ambience.bird'
  /** An owl somewhere in the woods at night (M33j): the night ambience's sparse one-shots. */
  | 'ambience.owl';

/** Typical spreads: shots and mechanisms vary a little, steps and impacts more. */
const TIGHT = { pitchSpread: 0.04, timeSpread: 0.08, gainSpread: 0.1 } as const;
const LOOSE = { pitchSpread: 0.12, timeSpread: 0.15, gainSpread: 0.2 } as const;

/** A short noise click: the attack of a latch, a trigger or a BB's strike. */
function click(at: number, hz: number, gain: number, decay = 0.006): SoundRecipe['layers'][number] {
  return { kind: 'noise', at, attack: 0.0004, decay, gain, filter: { type: 'bandpass', hz, q: 1.4 } };
}

/**
 * How loud each ground's own layers are (M33j), set so every surface's step is as loud as concrete's within 1.5 dB
 * (audio.test.ts): footsteps are information, so a softer ground never hides anyone.
 */
const GROUND_STEP_LEVEL: Readonly<Record<GroundSurface, number>> = { grass: 1.12, leaves: 1, earth: 1.05, gravel: 0.8, wood: 0.95 };

/**
 * What a boot does to the ground underfoot (M33j), after the heel's thump: grass swishes with a low crunch, dry leaves
 * crackle above 3 kHz, earth gives a dull thud, gravel a scatter of granular clicks, boards a hollow knock. `loud` and
 * `long` scale levels and decays as for a sprint or a landing.
 */
function groundUnderfoot(surface: GroundSurface, loud: number, long: number): SoundRecipe['layers'][number][] {
  switch (surface) {
    case 'grass':
      return [
        { kind: 'noise', attack: 0.01, decay: 0.09 * long, gain: 0.25 * loud, filter: { type: 'bandpass', hz: 1500, hzTo: 1000, q: 0.6 } },
        { kind: 'noise', attack: 0.003, decay: 0.04 * long, gain: 0.5 * loud, filter: { type: 'lowpass', hz: 450, q: 0.8 } },
        { kind: 'noise', at: 0.015, attack: 0.004, decay: 0.04, gain: 0.06 * loud, filter: { type: 'highpass', hz: 4000, q: 0.6 } },
      ];
    case 'leaves':
      return [
        click(0, 3600, 0.3 * loud, 0.005),
        click(0.009, 5200, 0.24 * loud, 0.004),
        click(0.02, 4300, 0.26 * loud, 0.005),
        click(0.031, 6100, 0.18 * loud, 0.004),
        click(0.047, 3900, 0.16 * loud, 0.005),
        click(0.066, 5600, 0.1 * loud, 0.004),
        { kind: 'noise', attack: 0.006, decay: 0.08 * long, gain: 0.22 * loud, filter: { type: 'highpass', hz: 3000, q: 0.7 } },
        { kind: 'noise', attack: 0.003, decay: 0.05 * long, gain: 0.3 * loud, filter: { type: 'bandpass', hz: 1100, q: 0.9 } },
      ];
    case 'earth':
      return [
        { kind: 'noise', attack: 0.002, decay: 0.06 * long, gain: 0.45 * loud, filter: { type: 'lowpass', hz: 500, q: 0.9 } },
        { kind: 'noise', attack: 0.003, decay: 0.045 * long, gain: 0.5 * loud, filter: { type: 'bandpass', hz: 900, hzTo: 650, q: 1 } },
      ];
    case 'gravel':
      return [
        click(0, 2600, 0.5 * loud, 0.006),
        click(0.006, 3800, 0.4 * loud, 0.005),
        click(0.013, 2200, 0.45 * loud, 0.007),
        click(0.019, 4400, 0.32 * loud, 0.005),
        click(0.027, 3000, 0.38 * loud, 0.006),
        click(0.036, 4000, 0.26 * loud, 0.005),
        click(0.047, 2700, 0.22 * loud, 0.006),
        click(0.06, 3400, 0.16 * loud, 0.005),
        { kind: 'noise', attack: 0.002, decay: 0.07 * long, gain: 0.4 * loud, filter: { type: 'bandpass', hz: 3000, q: 0.7 } },
        { kind: 'noise', attack: 0.002, decay: 0.04 * long, gain: 0.12 * loud, filter: { type: 'lowpass', hz: 700, q: 0.8 } },
      ];
    case 'wood':
      return [
        { kind: 'modes', gain: 0.17 * loud, modes: [{ hz: 170, decay: 0.15 * long, gain: 0.8 }, { hz: 410, decay: 0.1 * long, gain: 0.6 }, { hz: 980, decay: 0.04, gain: 0.4 }, { hz: 2100, decay: 0.025, gain: 0.2 }] },
        { kind: 'noise', attack: 0.002, decay: 0.03 * long, gain: 0.42 * loud, filter: { type: 'bandpass', hz: 1300, q: 1.2 } },
      ];
  }
}

/** A footstep on `surface` at `pace` (run, sprint, or landing a jump). */
function step(surface: FloorSurface, pace: FootstepPace): SoundRecipe {
  const loud = pace === 'land' ? 1.2 : pace === 'sprint' ? 1.12 : 1;
  const long = pace === 'land' ? 1.8 : 1;
  const layers: SoundRecipe['layers'][number][] = [
    // Heel strike: a soft low thump, heavier on landing.
    { kind: 'tone', wave: 'sine', attack: 0.002, decay: 0.07 * long, gain: 0.32 * loud, hz: pace === 'land' ? 150 : 125, hzTo: 50 },
  ];
  if (surface === 'concrete') {
    // Rubber sole scuffing grit on concrete, with a fine crunch on top.
    layers.push(
      { kind: 'noise', attack: 0.003, decay: 0.06 * long, gain: 0.5 * loud, filter: { type: 'bandpass', hz: 950, hzTo: 700, q: 1.1 } },
      { kind: 'noise', at: 0.008, attack: 0.002, decay: 0.035, gain: 0.12 * loud, filter: { type: 'highpass', hz: 3600, q: 0.7 } },
    );
  } else if (surface === 'metal') {
    // A steel ramp plate: a hollow clank that rings on, and a sharper scuff.
    layers.push(
      { kind: 'modes', gain: 0.13 * loud, modes: [{ hz: 290, decay: 0.2 * long, gain: 0.8 }, { hz: 705, decay: 0.14 * long, gain: 0.5 }, { hz: 1580, decay: 0.09, gain: 0.35 }, { hz: 2930, decay: 0.05, gain: 0.2 }] },
      { kind: 'noise', attack: 0.002, decay: 0.035 * long, gain: 0.32 * loud, filter: { type: 'bandpass', hz: 1700, q: 1.2 } },
    );
  } else {
    layers.push(...groundUnderfoot(surface, loud * GROUND_STEP_LEVEL[surface], long));
  }
  if (pace !== 'run') {
    // Sprinting and landing shake the kit: magazines and buckles rattle in their pouches.
    layers.push(
      { kind: 'noise', at: 0.018, attack: 0.004, decay: 0.05 * long, gain: 0.14 * loud, filter: { type: 'bandpass', hz: 3200, q: 3.5 } },
      { kind: 'modes', at: 0.03, gain: 0.06 * loud, modes: [{ hz: 2300, decay: 0.03, gain: 1 }, { hz: 4100, decay: 0.02, gain: 0.6 }] },
    );
  } else {
    // A run carries a quieter brush of clothing and kit.
    layers.push({ kind: 'noise', at: 0.01, attack: 0.01, decay: 0.06, gain: 0.06, filter: { type: 'bandpass', hz: 2600, q: 0.8 } });
  }
  return { layers, ...LOOSE };
}

/** Clothing and kit brushing as a body moves, with a soft tap of gear at the end. */
function rustle(fromHz: number, toHz: number, gain: number, decay: number): SoundRecipe {
  return {
    layers: [
      { kind: 'noise', attack: 0.03, decay, gain, filter: { type: 'bandpass', hz: fromHz, hzTo: toHz, q: 0.8 } },
      { kind: 'noise', at: 0.02, attack: 0.02, decay: decay * 0.7, gain: gain * 0.4, filter: { type: 'highpass', hz: 5000, q: 0.6 } },
      { kind: 'modes', at: decay * 0.5, gain: gain * 0.35, modes: [{ hz: 1900, decay: 0.03, gain: 1 }, { hz: 3700, decay: 0.02, gain: 0.5 }] },
    ],
    ...LOOSE,
  };
}

export const SOUNDS: Readonly<Record<SoundCue, SoundRecipe>> = {
  // ---- Shots ---------------------------------------------------------------------------------
  /**
   * AEG, one gearbox cycle: the motor and gears whirring, the piston slamming forward into the head (a plastic
   * slap with a little body), the air puff through the barrel and the BB's small "tsk" as it leaves.
   */
  'shot.electric': {
    layers: [
      { kind: 'tone', wave: 'saw', attack: 0.004, decay: 0.09, gain: 0.14, hz: 205, hzTo: 175, filter: { type: 'lowpass', hz: 1700, q: 0.8 } },
      { kind: 'tone', wave: 'square', attack: 0.004, decay: 0.06, gain: 0.045, hz: 620, hzTo: 560, filter: { type: 'lowpass', hz: 2600, q: 0.7 } },
      { kind: 'tone', wave: 'sine', at: 0.012, attack: 0.002, decay: 0.07, gain: 0.52, hz: 130, hzTo: 58 },
      { kind: 'modes', at: 0.012, gain: 0.42, modes: [{ hz: 185, decay: 0.05, gain: 0.8 }, { hz: 430, decay: 0.035, gain: 0.55 }, { hz: 1150, decay: 0.022, gain: 0.35 }, { hz: 2700, decay: 0.012, gain: 0.2 }] },
      { kind: 'noise', at: 0.013, attack: 0.002, decay: 0.055, gain: 0.62, filter: { type: 'bandpass', hz: 1500, hzTo: 650, q: 0.8 } },
      { kind: 'noise', at: 0.016, attack: 0.0005, decay: 0.014, gain: 0.25, filter: { type: 'highpass', hz: 4800, q: 0.7 } },
    ],
    ...TIGHT,
    drive: 0.6,
  },
  /** Gas pistol: a sharp pop of gas with a short hiss after it, the slide clacking back and slamming home. */
  'shot.gas': {
    layers: [
      { kind: 'noise', attack: 0.0006, decay: 0.035, gain: 0.75, filter: { type: 'highpass', hz: 1500, q: 0.7 } },
      { kind: 'noise', attack: 0.001, decay: 0.05, gain: 0.4, filter: { type: 'bandpass', hz: 900, q: 1 } },
      { kind: 'tone', wave: 'sine', attack: 0.001, decay: 0.07, gain: 0.42, hz: 165, hzTo: 70 },
      { kind: 'modes', at: 0.004, gain: 0.42, modes: [{ hz: 1350, decay: 0.03, gain: 0.8 }, { hz: 2900, decay: 0.02, gain: 0.5 }, { hz: 5200, decay: 0.012, gain: 0.3 }] },
      { kind: 'modes', at: 0.042, gain: 0.38, modes: [{ hz: 1100, decay: 0.035, gain: 0.8 }, { hz: 2450, decay: 0.022, gain: 0.5 }, { hz: 4300, decay: 0.012, gain: 0.25 }] },
      { kind: 'noise', at: 0.01, attack: 0.01, decay: 0.14, gain: 0.1, filter: { type: 'highpass', hz: 3500, q: 0.5 } },
    ],
    ...TIGHT,
    drive: 0.5,
  },
  /** Spring piston: a deep thump as the piston lands, a crack of air and the spring twanging on after it. */
  'shot.spring': {
    layers: [
      { kind: 'tone', wave: 'sine', attack: 0.002, decay: 0.1, gain: 0.55, hz: 110, hzTo: 48 },
      { kind: 'noise', attack: 0.002, decay: 0.05, gain: 0.4, filter: { type: 'lowpass', hz: 900, q: 0.8 } },
      { kind: 'noise', at: 0.006, attack: 0.0006, decay: 0.03, gain: 0.5, filter: { type: 'bandpass', hz: 2200, q: 0.9 } },
      { kind: 'modes', at: 0.002, gain: 0.24, modes: [{ hz: 190, decay: 0.35, gain: 0.8 }, { hz: 437, decay: 0.28, gain: 0.55 }, { hz: 701, decay: 0.22, gain: 0.4 }, { hz: 1130, decay: 0.15, gain: 0.3 }] },
    ],
    ...TIGHT,
    drive: 0.5,
  },
  /**
   * Cyber Pistol (M32): futuristic and quiet but satisfying. A quick rising electronic chirp, a soft rounded pop with a
   * puff of air, a bright click on top and a faint shimmer after it. Quieter than the AEG's gearbox, no motor.
   */
  'shot.cyber': {
    layers: [
      { kind: 'tone', wave: 'sine', attack: 0.002, decay: 0.05, gain: 0.16, hz: 900, hzTo: 2400, glide: 0.03 },
      { kind: 'tone', wave: 'square', attack: 0.002, decay: 0.035, gain: 0.04, hz: 450, hzTo: 1200, glide: 0.03, filter: { type: 'lowpass', hz: 3000, q: 0.7 } },
      { kind: 'tone', wave: 'sine', at: 0.008, attack: 0.002, decay: 0.06, gain: 0.7, hz: 220, hzTo: 70 },
      { kind: 'noise', at: 0.008, attack: 0.001, decay: 0.035, gain: 0.42, filter: { type: 'bandpass', hz: 1800, hzTo: 900, q: 0.9 } },
      { kind: 'modes', at: 0.006, gain: 0.2, modes: [{ hz: 3200, decay: 0.014, gain: 0.8 }, { hz: 5400, decay: 0.01, gain: 0.5 }, { hz: 7800, decay: 0.006, gain: 0.3 }] },
      { kind: 'tone', wave: 'triangle', at: 0.02, attack: 0.01, decay: 0.08, gain: 0.035, hz: 1800, hzTo: 1500 },
    ],
    ...TIGHT,
    drive: 0.3,
  },
  'motor.spinUp': {
    layers: [{ kind: 'tone', wave: 'saw', attack: 0.006, decay: 0.07, gain: 0.22, hz: 85, hzTo: 205, glide: 0.04, filter: { type: 'lowpass', hz: 1500, q: 0.8 } }],
    ...TIGHT,
  },
  /** The motor coasting down after the trigger is let go, with the gears ticking over. */
  'motor.spinDown': {
    layers: [
      { kind: 'tone', wave: 'saw', attack: 0.004, decay: 0.2, gain: 0.08, hz: 190, hzTo: 70, glide: 0.17, filter: { type: 'lowpass', hz: 1400, q: 0.8 } },
      { kind: 'noise', attack: 0.004, decay: 0.08, gain: 0.04, filter: { type: 'bandpass', hz: 2400, q: 3 } },
    ],
    ...TIGHT,
  },

  // ---- Handling ------------------------------------------------------------------------------
  /** An empty AEG still cycles: the gearbox runs and the piston slaps, but no air puff and no BB. */
  'dryFire.electric': {
    layers: [
      { kind: 'tone', wave: 'saw', attack: 0.004, decay: 0.08, gain: 0.09, hz: 205, hzTo: 175, filter: { type: 'lowpass', hz: 1700, q: 0.8 } },
      { kind: 'modes', at: 0.012, gain: 0.22, modes: [{ hz: 185, decay: 0.04, gain: 0.8 }, { hz: 430, decay: 0.03, gain: 0.55 }, { hz: 1150, decay: 0.02, gain: 0.35 }] },
    ],
    ...TIGHT,
  },
  /** An empty gas pistol: only the trigger's click, the slide already locked back. */
  'dryFire.gas': { layers: [click(0, 2600, 0.7), click(0.01, 1800, 0.4)], ...TIGHT },
  /** An empty Cyber Pistol: a soft falling blip and the trigger's click. */
  'dryFire.cyber': {
    layers: [{ kind: 'tone', wave: 'sine', attack: 0.002, decay: 0.035, gain: 0.16, hz: 1400, hzTo: 800 }, click(0.004, 2800, 0.45)],
    ...TIGHT,
  },
  'dryFire.spring': { layers: [click(0, 2200, 0.7), click(0.012, 1500, 0.5)], ...TIGHT },
  /** The AEG's plastic magazine: the catch clicks and the mag slides out. */
  'magOut.electric': {
    layers: [click(0, 2100, 0.6), { kind: 'noise', at: 0.008, attack: 0.01, decay: 0.07, gain: 0.5, filter: { type: 'bandpass', hz: 1300, hzTo: 900, q: 1.5 } }],
    ...TIGHT,
  },
  /** The mag sliding in and seating with a firm plastic clack. */
  'magIn.electric': {
    layers: [
      { kind: 'noise', attack: 0.008, decay: 0.05, gain: 0.22, filter: { type: 'bandpass', hz: 1000, hzTo: 1400, q: 1.5 } },
      { kind: 'modes', at: 0.05, gain: 0.4, modes: [{ hz: 900, decay: 0.03, gain: 0.8 }, { hz: 2100, decay: 0.02, gain: 0.5 }, { hz: 3900, decay: 0.01, gain: 0.3 }] },
      click(0.05, 3000, 0.25),
    ],
    ...TIGHT,
  },
  /** The pistol's heavier metal gas magazine dropping free. */
  'magOut.gas': {
    layers: [click(0, 2600, 0.35), { kind: 'modes', at: 0.01, gain: 0.25, modes: [{ hz: 1250, decay: 0.05, gain: 0.8 }, { hz: 3100, decay: 0.03, gain: 0.5 }] }],
    ...TIGHT,
  },
  'magIn.gas': {
    layers: [
      { kind: 'noise', attack: 0.006, decay: 0.04, gain: 0.2, filter: { type: 'bandpass', hz: 1500, q: 1.5 } },
      { kind: 'modes', at: 0.045, gain: 0.42, modes: [{ hz: 1450, decay: 0.04, gain: 0.8 }, { hz: 3300, decay: 0.025, gain: 0.5 }, { hz: 6100, decay: 0.012, gain: 0.25 }] },
    ],
    ...TIGHT,
  },
  /** The Cyber Pistol's magazine: the catch clicks and the power drops with a falling whir as it slides free. */
  'magOut.cyber': {
    layers: [
      click(0, 2600, 0.5),
      { kind: 'tone', wave: 'sine', at: 0.004, attack: 0.004, decay: 0.09, gain: 0.08, hz: 1200, hzTo: 500 },
      { kind: 'noise', at: 0.01, attack: 0.008, decay: 0.06, gain: 0.35, filter: { type: 'bandpass', hz: 1500, hzTo: 1000, q: 1.5 } },
    ],
    ...TIGHT,
  },
  /** The magazine seating with a firm clack, then a two-note chime as the pistol powers up again. */
  'magIn.cyber': {
    layers: [
      { kind: 'noise', attack: 0.008, decay: 0.045, gain: 0.2, filter: { type: 'bandpass', hz: 1100, hzTo: 1500, q: 1.5 } },
      { kind: 'modes', at: 0.045, gain: 0.38, modes: [{ hz: 1000, decay: 0.03, gain: 0.8 }, { hz: 2300, decay: 0.02, gain: 0.5 }, { hz: 4200, decay: 0.01, gain: 0.3 }] },
      { kind: 'tone', wave: 'sine', at: 0.08, attack: 0.003, decay: 0.05, gain: 0.07, hz: 1320 },
      { kind: 'tone', wave: 'sine', at: 0.13, attack: 0.003, decay: 0.08, gain: 0.07, hz: 1980 },
    ],
    ...TIGHT,
  },
  'magOut.spring': {
    layers: [click(0, 2100, 0.6), { kind: 'noise', at: 0.008, attack: 0.01, decay: 0.07, gain: 0.5, filter: { type: 'bandpass', hz: 1300, hzTo: 900, q: 1.5 } }],
    ...TIGHT,
  },
  'magIn.spring': {
    layers: [
      { kind: 'noise', attack: 0.008, decay: 0.05, gain: 0.22, filter: { type: 'bandpass', hz: 1000, hzTo: 1400, q: 1.5 } },
      { kind: 'modes', at: 0.05, gain: 0.4, modes: [{ hz: 900, decay: 0.03, gain: 0.8 }, { hz: 2100, decay: 0.02, gain: 0.5 }] },
    ],
    ...TIGHT,
  },
  /** The fire selector moving one notch: a short, bright detent. */
  selector: { layers: [click(0, 2400, 0.4, 0.004), { kind: 'modes', gain: 0.15, modes: [{ hz: 3100, decay: 0.015, gain: 1 }] }], ...TIGHT },
  /** Bringing a replica up: a sling and kit rattle. */
  draw: {
    layers: [
      { kind: 'noise', attack: 0.01, decay: 0.08, gain: 0.25, filter: { type: 'bandpass', hz: 1800, hzTo: 2400, q: 1.2 } },
      { kind: 'modes', at: 0.05, gain: 0.12, modes: [{ hz: 2200, decay: 0.03, gain: 1 }, { hz: 3900, decay: 0.02, gain: 0.5 }] },
    ],
    ...LOOSE,
  },
  /** Reload pressed with no fuller magazine: a dull pat on the pouch. */
  reloadRefused: { layers: [{ kind: 'noise', attack: 0.002, decay: 0.06, gain: 0.6, filter: { type: 'lowpass', hz: 600, q: 1 } }], ...LOOSE },

  // ---- Movement ------------------------------------------------------------------------------
  'step.concrete.run': step('concrete', 'run'),
  'step.concrete.sprint': step('concrete', 'sprint'),
  'step.concrete.land': step('concrete', 'land'),
  'step.metal.run': step('metal', 'run'),
  'step.metal.sprint': step('metal', 'sprint'),
  'step.metal.land': step('metal', 'land'),
  'foley.crouch': rustle(2400, 1500, 0.22, 0.16),
  'foley.stand': rustle(1500, 2500, 0.18, 0.14),
  'foley.lean': rustle(2100, 2700, 0.14, 0.1),
  /**
   * A hi-cap's loose BBs shaking in the magazine: a quick scatter of tiny bright ticks inside a hollow plastic shell,
   * higher and grittier than the sling sound of a draw.
   */
  magRattle: {
    layers: [
      click(0, 5200, 0.2, 0.004),
      click(0.011, 6200, 0.15, 0.004),
      click(0.02, 4600, 0.17, 0.004),
      click(0.032, 5700, 0.13, 0.004),
      click(0.047, 6600, 0.1, 0.004),
      { kind: 'noise', attack: 0.004, decay: 0.05, gain: 0.07, filter: { type: 'highpass', hz: 4500, q: 0.7 } },
      { kind: 'modes', at: 0.006, gain: 0.05, modes: [{ hz: 1250, decay: 0.03, gain: 1 }, { hz: 2750, decay: 0.02, gain: 0.5 }] },
    ],
    ...LOOSE,
  },

  // ---- Hits ----------------------------------------------------------------------------------
  /** A BB on concrete or blockwork: the dry, bright "tik". */
  'impact.concrete': {
    layers: [
      { kind: 'noise', attack: 0.0004, decay: 0.018, gain: 0.5, filter: { type: 'bandpass', hz: 4200, q: 3 } },
      { kind: 'modes', gain: 0.12, modes: [{ hz: 3300, decay: 0.012, gain: 1 }, { hz: 6200, decay: 0.008, gain: 0.5 }] },
    ],
    ...LOOSE,
  },
  /** A BB pinging off a steel container: a ringing "tink". */
  'impact.metal': {
    layers: [
      click(0, 5000, 0.15, 0.004),
      { kind: 'modes', gain: 0.16, modes: [{ hz: 2650, decay: 0.09, gain: 0.8 }, { hz: 5900, decay: 0.06, gain: 0.5 }, { hz: 8300, decay: 0.04, gain: 0.3 }] },
    ],
    ...LOOSE,
  },
  /** A BB knocking on a wooden crate: a hollow "tok". */
  'impact.wood': {
    layers: [
      click(0, 2500, 0.15, 0.005),
      { kind: 'modes', gain: 0.18, modes: [{ hz: 880, decay: 0.035, gain: 0.8 }, { hz: 2050, decay: 0.022, gain: 0.5 }, { hz: 3600, decay: 0.012, gain: 0.25 }] },
    ],
    ...LOOSE,
  },
  /** A BB into the ground of an outdoor field (M33c, terrain): a soft, dull "thup", quieter than any hard surface. */
  'impact.earth': {
    layers: [{ kind: 'noise', attack: 0.0008, decay: 0.022, gain: 0.32, filter: { type: 'lowpass', hz: 1400, q: 0.7 } }],
    ...LOOSE,
  },
  /** A BB smacking into someone's jacket: duller than a hard surface, with a soft thud. */
  bodyHit: {
    layers: [
      { kind: 'noise', attack: 0.001, decay: 0.04, gain: 0.55, filter: { type: 'bandpass', hz: 2200, q: 1.5 } },
      { kind: 'tone', wave: 'sine', attack: 0.001, decay: 0.04, gain: 0.25, hz: 220, hzTo: 120 },
    ],
    ...LOOSE,
  },
  /** A BB on a practice range steel plate (M21): the bright "ting" a plate is there for, ringing on a moment. */
  steelRing: {
    layers: [
      click(0, 6000, 0.2, 0.003),
      { kind: 'modes', gain: 0.22, modes: [{ hz: 1480, decay: 0.45, gain: 0.9 }, { hz: 3390, decay: 0.3, gain: 0.55 }, { hz: 5720, decay: 0.18, gain: 0.3 }, { hz: 8100, decay: 0.08, gain: 0.15 }] },
    ],
    ...TIGHT,
  },
  /** You're hit: a sharp, close plastic "tick" with a hiss and a little thump. Unmistakable. */
  hitTick: {
    layers: [
      { kind: 'tone', wave: 'square', attack: 0.0004, decay: 0.012, gain: 0.5, hz: 3400 },
      { kind: 'noise', attack: 0.0005, decay: 0.03, gain: 0.55, filter: { type: 'bandpass', hz: 5200, q: 2 } },
      { kind: 'tone', wave: 'sine', attack: 0.001, decay: 0.08, gain: 0.45, hz: 180, hzTo: 70 },
    ],
    pitchSpread: 0.02,
    timeSpread: 0.05,
    gainSpread: 0.05,
  },
  /** Your BB hit someone: a soft wooden "tock". */
  hitMarker: {
    layers: [
      { kind: 'tone', wave: 'triangle', attack: 0.001, decay: 0.07, gain: 0.6, hz: 1100, hzTo: 700 },
      { kind: 'modes', gain: 0.2, modes: [{ hz: 1100, decay: 0.04, gain: 1 }, { hz: 2600, decay: 0.02, gain: 0.4 }] },
    ],
    pitchSpread: 0.02,
    timeSpread: 0.05,
    gainSpread: 0.05,
  },

  /** Two quick squelches of a cheap walkie-talkie: "copy that", for a squad order (M22). */
  'radio.ack': {
    layers: [
      { kind: 'noise', attack: 0.002, decay: 0.05, gain: 0.45, filter: { type: 'bandpass', hz: 1800, q: 2.5 } },
      { kind: 'tone', wave: 'square', attack: 0.002, decay: 0.035, gain: 0.08, hz: 1250 },
      { kind: 'noise', at: 0.11, attack: 0.002, decay: 0.05, gain: 0.45, filter: { type: 'bandpass', hz: 1800, q: 2.5 } },
      { kind: 'tone', wave: 'square', at: 0.11, attack: 0.002, decay: 0.035, gain: 0.08, hz: 1250 },
    ],
    pitchSpread: 0.03,
    timeSpread: 0.05,
    gainSpread: 0.05,
  },

  /** A site timer box's beep, as on a bomb prop: the exit counting you out (M43). */
  'count.beep': {
    layers: [{ kind: 'tone', wave: 'square', attack: 0.002, decay: 0.06, gain: 0.12, hz: 1650 }],
    pitchSpread: 0,
    timeSpread: 0,
    gainSpread: 0,
  },

  // ---- The field -----------------------------------------------------------------------------
  /** The flagpole's pulley ratcheting a notch: two clicks and a squeak of rope, higher going up than coming down. */
  'rope.up': {
    layers: [
      click(0, 1900, 1, 0.014),
      click(0.07, 2130, 0.8, 0.014),
      { kind: 'noise', attack: 0.01, decay: 0.09, gain: 0.5, filter: { type: 'bandpass', hz: 2600, q: 6 } },
    ],
    ...TIGHT,
  },
  'rope.down': {
    layers: [
      click(0, 1250, 1, 0.014),
      click(0.07, 1400, 0.8, 0.014),
      { kind: 'noise', attack: 0.01, decay: 0.09, gain: 0.5, filter: { type: 'bandpass', hz: 2100, q: 6 } },
    ],
    ...TIGHT,
  },
  /** A small bird's three-note chirp, up, down and up again: playful, never a recording. */
  'ambience.bird': {
    layers: [
      { kind: 'tone', wave: 'sine', attack: 0.004, decay: 0.07, gain: 0.5, hz: 3400, hzTo: 4600, glide: 0.05 },
      { kind: 'tone', wave: 'sine', at: 0.11, attack: 0.004, decay: 0.06, gain: 0.45, hz: 4200, hzTo: 3300, glide: 0.05 },
      { kind: 'tone', wave: 'sine', at: 0.2, attack: 0.004, decay: 0.09, gain: 0.4, hz: 3600, hzTo: 4900, glide: 0.07 },
    ],
    pitchSpread: 0.1,
    timeSpread: 0.15,
    gainSpread: 0.15,
  },
  /**
   * A weapon torch's tailcap switch (M33h): the selector's detent, softer and lower, with a rubbery body. Last in the
   * table, so the seeded synthesis of every earlier cue is unchanged.
   */
  torchClick: { layers: [click(0, 1500, 0.28, 0.005), { kind: 'modes', gain: 0.1, modes: [{ hz: 1900, decay: 0.012, gain: 1 }] }], ...TIGHT },

  // ---- Only for the maps that use them (M33j: MAP_CUE_SEEDS) --------------------------------------
  'step.grass.run': step('grass', 'run'),
  'step.grass.sprint': step('grass', 'sprint'),
  'step.grass.land': step('grass', 'land'),
  'step.leaves.run': step('leaves', 'run'),
  'step.leaves.sprint': step('leaves', 'sprint'),
  'step.leaves.land': step('leaves', 'land'),
  'step.earth.run': step('earth', 'run'),
  'step.earth.sprint': step('earth', 'sprint'),
  'step.earth.land': step('earth', 'land'),
  'step.gravel.run': step('gravel', 'run'),
  'step.gravel.sprint': step('gravel', 'sprint'),
  'step.gravel.land': step('gravel', 'land'),
  'step.wood.run': step('wood', 'run'),
  'step.wood.sprint': step('wood', 'sprint'),
  'step.wood.land': step('wood', 'land'),
  /**
   * A tawny owl far off in the trees (M33j): a soft "hoo", a pause, then a longer wavering "hoo-oo" a little lower,
   * round 350–420 Hz with a breath of air on each. Gentle and a touch comic, never eerie.
   */
  'ambience.owl': {
    layers: [
      { kind: 'tone', wave: 'sine', attack: 0.06, decay: 0.3, gain: 0.55, hz: 395, hzTo: 380 },
      { kind: 'tone', wave: 'sine', attack: 0.06, decay: 0.3, gain: 0.08, hz: 790, hzTo: 760 },
      { kind: 'noise', attack: 0.05, decay: 0.25, gain: 0.05, filter: { type: 'bandpass', hz: 390, q: 3 } },
      { kind: 'tone', wave: 'sine', at: 0.62, attack: 0.08, decay: 0.55, gain: 0.5, hz: 420, hzTo: 355, glide: 0.5 },
      { kind: 'tone', wave: 'sine', at: 0.62, attack: 0.08, decay: 0.5, gain: 0.07, hz: 840, hzTo: 710, glide: 0.5 },
      { kind: 'noise', at: 0.62, attack: 0.06, decay: 0.4, gain: 0.05, filter: { type: 'bandpass', hz: 380, q: 3 } },
    ],
    pitchSpread: 0.04,
    timeSpread: 0.1,
    gainSpread: 0.1,
  },
};

/**
 * The cues only some maps play (M33j): the ground's footsteps and the woods' owl. They come last in SOUNDS and are never
 * rendered on the title screen: a map that plays them has them rendered as it loads (AudioEngine.prepare), each from
 * its own seed here, not the stream the title screen's cues share in table order, so adding one leaves every other
 * cue's sound as it was.
 */
export const MAP_CUE_SEEDS: Readonly<Partial<Record<SoundCue, number>>> = {
  'step.grass.run': 3311,
  'step.grass.sprint': 3312,
  'step.grass.land': 3313,
  'step.leaves.run': 3321,
  'step.leaves.sprint': 3322,
  'step.leaves.land': 3323,
  'step.earth.run': 3331,
  'step.earth.sprint': 3332,
  'step.earth.land': 3333,
  'step.gravel.run': 3341,
  'step.gravel.sprint': 3342,
  'step.gravel.land': 3343,
  'step.wood.run': 3351,
  'step.wood.sprint': 3352,
  'step.wood.land': 3353,
  'ambience.owl': 3361,
};

/** Whether `cue` is rendered only for a map that plays it (MAP_CUE_SEEDS). */
export function isMapCue(cue: SoundCue): boolean {
  return MAP_CUE_SEEDS[cue] !== undefined;
}

/** The cues the title screen renders for every match, in table order (they share one seeded stream). */
export const TITLE_CUES: readonly SoundCue[] = (Object.keys(SOUNDS) as SoundCue[]).filter((c) => !isMapCue(c));

/** The cue each kind of shot, mechanism, step or impact plays. */
export const cues = {
  shot: (p: ShotProfile): SoundCue => `shot.${p}`,
  dryFire: (p: ShotProfile): SoundCue => `dryFire.${p}`,
  magOut: (p: ShotProfile): SoundCue => `magOut.${p}`,
  magIn: (p: ShotProfile): SoundCue => `magIn.${p}`,
  step: (s: FloorSurface, pace: FootstepPace): SoundCue => `step.${s}.${pace}`,
  impact: (m: ImpactMaterial): SoundCue => `impact.${m}`,
};
