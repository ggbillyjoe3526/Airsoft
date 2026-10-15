import type { BlockKind } from '../map/mapTypes';
import type { FloorSurface } from './sounds';

/**
 * Noisy ground and props (NP1, the owner's Dev 6 item 41): what gives you away besides your shots and steps. Run into a
 * skip and it booms, a rack of stock rattles, a crate knocks; a BB ringing off steel draws a look; steps on gravel and on
 * steel carry further. Bots hear each as they hear a step or a vault (ai/botController.ts), you hear it from where it
 * happened (audio/sfx.ts), and walking, crouching or brushing along a prop stays quiet. Units: metres, seconds.
 */

/** What a prop sounds like when someone runs into it (config/sounds.ts `prop.<sound>`). */
export type PropSound = 'steel' | 'clank' | 'rattle' | 'wood' | 'plastic' | 'glass';

/** Every prop sound, for the cues a map with that prop renders (audio/soundscape.ts) and the tests. */
export const PROP_SOUNDS: readonly PropSound[] = ['steel', 'clank', 'rattle', 'wood', 'plastic', 'glass'];

/** One kind of noisy prop. */
export interface PropNoise {
  /** What it sounds like, run into. */
  sound: PropSound;
  /**
   * How far (m) the other team's bots hear someone run into it, walls muffling it as any sound (BOT_BEHAVIOUR
   * .wallHearing). A run's own steps carry 11 m and a vault 18 m: every noisy prop carries further than the run that hit it.
   */
  bumped: number;
  /**
   * How far (m) a BB ringing off it carries to the other team's bots (0: no further than any BB's impact). Only a bot with
   * no fresher news of anyone turns to check it, so a ring draws an idle bot's look and never pulls one off a fight.
   */
  shot: number;
}

export interface NoiseConfig {
  /**
   * Running into a prop at this speed or more (m/s, the speed into its face as the move began) rattles it: a run (4.2)
   * or a sprint straight in does; a walk (2.3), a crouch (2.1) or a run that only glances along it (under about 45°) doesn't.
   */
  bumpSpeed: number;
  /** The move must lose at least this much (m) against the prop for it to count as hit: a real knock, not a graze. */
  blockedMin: number;
  /** The prop's face within this (m) of the body's surface: the controller keeps a skin of 0.02 m. */
  touch: number;
  /**
   * The way the move was stopped points at the prop within this (the cosine of the largest angle between them), so the
   * crate beside you isn't what a wall in front of you stopped.
   */
  facing: number;
  /** A prop's top this far (m) or less above the feet is underfoot, not run into (standing on a crate). */
  underfoot: number;
  /** Where on the prop the noise comes from: this high (m) above the feet, held within the prop's height. */
  noiseHeight: number;
  /** A prop makes a noise at most once in this long (s), whoever hits it, however: one prop can't be drummed on. */
  quiet: number;
  /** A BB rings a prop only when it lands this fast (m/s) or faster: a spent BB dropping onto a skip only ticks. */
  shotMinSpeed: number;
  /** A BB stopped this close (m) to a prop's faces landed on it (AUDIO.impactBlockMargin's role for the tick). */
  shotMargin: number;
  /** The noisy props by kind; a kind without a row is silent (walls, floors, sandbags, gabions, logs, trees, planters). */
  props: Readonly<Partial<Record<BlockKind, PropNoise>>>;
  /**
   * How far steps carry on each ground (×): bots hear a run, sprint or landing on it this many times as far, and you hear
   * it that much louder and further. Loose gravel and steel plate (Depot's dock ramps, Neon Heights' stairs) are noisy;
   * everything else carries as before. Walking and crouching stay silent on every ground.
   */
  ground: Readonly<Record<FloorSurface, number>>;
}

export const NOISE: NoiseConfig = {
  bumpSpeed: 3,
  blockedMin: 0.002,
  touch: 0.08,
  facing: 0.5,
  underfoot: 0.05,
  noiseHeight: 0.9,
  quiet: 1.2,
  shotMinSpeed: 15,
  shotMargin: 0.06,
  props: {
    // Steel boxes: a skip, a shipping container, the van. A body into one booms; a BB pings off it.
    skip: { sound: 'steel', bumped: 20, shot: 12 },
    container: { sound: 'steel', bumped: 20, shot: 12 },
    van: { sound: 'steel', bumped: 20, shot: 12 },
    // Smaller steel: a generator, an IBC's cage.
    generator: { sound: 'clank', bumped: 17, shot: 10 },
    ibc: { sound: 'clank', bumped: 17, shot: 10 },
    // Loose things on and in them: a rack's stock, a stall's pans, the cans in a vending machine.
    rack: { sound: 'rattle', bumped: 16, shot: 0 },
    stall: { sound: 'rattle', bumped: 16, shot: 0 },
    vending: { sound: 'rattle', bumped: 16, shot: 0 },
    // A phone booth's panes in their frame.
    booth: { sound: 'glass', bumped: 15, shot: 0 },
    // Hollow plastic: a site toilet, an arcade cabinet.
    toilet: { sound: 'plastic', bumped: 14, shot: 0 },
    cabinet: { sound: 'plastic', bumped: 14, shot: 0 },
    // Timber: crates, pallet loads, Woodland's board fence.
    crate: { sound: 'wood', bumped: 13, shot: 0 },
    wrapped: { sound: 'wood', bumped: 13, shot: 0 },
    fence: { sound: 'wood', bumped: 13, shot: 0 },
  },
  ground: { concrete: 1, metal: 1.35, grass: 1, leaves: 1, earth: 1, gravel: 1.35, wood: 1 },
};
