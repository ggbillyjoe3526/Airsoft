import type { SoundRecipe } from '../audio/dsp';

/**
 * Every sound effect as a recipe (audio/dsp.ts): layers of filtered noise, gliding tones and struck resonances,
 * rendered into a few variants each when audio starts. Replicas sound like the toys they are: an electric gearbox
 * cycling a plastic piston, a gas pistol's pop and slide clack, a spring piston's thump and twang. More body than
 * a click, never the boom of a firearm (CLAUDE.md §2).
 */

/** What powers a replica's shot sound (ReplicaConfig.power picks it; spring replicas come with the v0.3 armoury). */
export type ShotProfile = 'electric' | 'gas' | 'spring';
export const SHOT_PROFILES: readonly ShotProfile[] = ['electric', 'gas', 'spring'];

/** What a footstep lands on (MapBlock.surface; floors and ramps without one are concrete). */
export type FloorSurface = 'concrete' | 'metal';
export const FLOOR_SURFACES: readonly FloorSurface[] = ['concrete', 'metal'];

/** What a BB ticks off (from the kind of block it hit; see audio/soundMaterials.ts). */
export type ImpactMaterial = 'concrete' | 'metal' | 'wood';
export const IMPACT_MATERIALS: readonly ImpactMaterial[] = ['concrete', 'metal', 'wood'];

export type FootstepPace = 'run' | 'sprint' | 'land';

export type SoundCue =
  | `shot.${ShotProfile}`
  /** An AEG's motor winding up on the first shot of a trigger pull, and winding down after the last. */
  | 'motor.spinUp'
  | 'motor.spinDown'
  | `dryFire.${ShotProfile}`
  | `magOut.${ShotProfile}`
  | `magIn.${ShotProfile}`
  | 'selector'
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
  | 'rope.down';

/** Typical spreads: shots and mechanisms vary a little, steps and impacts more. */
const TIGHT = { pitchSpread: 0.04, timeSpread: 0.08, gainSpread: 0.1 } as const;
const LOOSE = { pitchSpread: 0.12, timeSpread: 0.15, gainSpread: 0.2 } as const;

/** A short noise click: the attack of a latch, a trigger or a BB's strike. */
function click(at: number, hz: number, gain: number, decay = 0.006): SoundRecipe['layers'][number] {
  return { kind: 'noise', at, attack: 0.0004, decay, gain, filter: { type: 'bandpass', hz, q: 1.4 } };
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
  } else {
    // A steel ramp plate: a hollow clank that rings on, and a sharper scuff.
    layers.push(
      { kind: 'modes', gain: 0.13 * loud, modes: [{ hz: 290, decay: 0.2 * long, gain: 0.8 }, { hz: 705, decay: 0.14 * long, gain: 0.5 }, { hz: 1580, decay: 0.09, gain: 0.35 }, { hz: 2930, decay: 0.05, gain: 0.2 }] },
      { kind: 'noise', attack: 0.002, decay: 0.035 * long, gain: 0.32 * loud, filter: { type: 'bandpass', hz: 1700, q: 1.2 } },
    );
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
};

/** The cue each kind of shot, mechanism, step or impact plays. */
export const cues = {
  shot: (p: ShotProfile): SoundCue => `shot.${p}`,
  dryFire: (p: ShotProfile): SoundCue => `dryFire.${p}`,
  magOut: (p: ShotProfile): SoundCue => `magOut.${p}`,
  magIn: (p: ShotProfile): SoundCue => `magIn.${p}`,
  step: (s: FloorSurface, pace: FootstepPace): SoundCue => `step.${s}.${pace}`,
  impact: (m: ImpactMaterial): SoundCue => `impact.${m}`,
};
