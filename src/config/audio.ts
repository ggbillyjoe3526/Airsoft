/** Procedural sound levels and ranges. Replicas sound mechanical and plasticky, never like firearms. */
export const AUDIO = {
  masterVolume: 0.7,
  shotVolume: 0.55,
  mechanismVolume: 0.35,
  /** Each shot's pitch varies by up to ± this fraction, so full auto sounds mechanical, not looped. */
  shotPitchSpread: 0.05,
  /** AEG gearbox: the motor's short whirr under each cycle (sawtooth sweep, Hz). */
  aegMotor: { fromHz: 105, toHz: 80, gain: 0.12, time: 0.06 },
  /** BB impact pitch varies by up to ± this fraction (a hose of BBs doesn't tick on one note). */
  impactPitchSpread: 0.15,
  impactVolume: 0.5,
  /** Positional sounds: full volume within refDistance, then roll off. */
  refDistance: 3,
  rolloff: 1.4,
  maxDistance: 60,
  /**
   * Footsteps on concrete: a gritty scuff plus a soft heel thump, pitch varied per step. Sprinting adds
   * a rattle of kit; landing a jump is a heavier thud. Your own steps are quieter than other players'.
   */
  footsteps: {
    volume: 0.45,
    sprintVolume: 0.6,
    selfVolume: 0.35,
    scuffHz: 900,
    /** Each step's scuff pitch varies by up to ± this fraction. */
    scuffSpread: 0.25,
    scuffQ: 1.2,
    scuffTime: 0.05,
    thumpFromHz: 130,
    thumpToHz: 60,
    thumpGain: 0.55,
    thumpTime: 0.06,
    gearHz: 3200,
    gearQ: 4,
    gearGain: 0.25,
    gearTime: 0.04,
    landVolume: 0.7,
    landThumpFromHz: 150,
    landThumpToHz: 45,
    landThumpTime: 0.14,
    /** Other players' steps further than this (m) aren't played: about as far as bots hear a sprint. */
    maxDistance: 22,
    /** At most this many other players' steps start within `window` seconds (six sprinters stay readable). */
    maxPerWindow: 4,
    window: 0.1,
  },
  /**
   * The yard's echo: a short procedural reverb (decaying noise) that every in-world sound feeds, so
   * shots and steps sound like they're between walls. UI sounds (hit tick, hit marker, whistle) stay dry.
   */
  reverb: { seconds: 0.8, decayPower: 3.5, wet: 0.22 },
  /** At most this many impact ticks start within `impactWindow` seconds (a hose of BBs stays readable). */
  maxImpactsPerWindow: 8,
  impactWindow: 0.1,
  /** The sharp "tick" you hear when a BB hits you: a plastic click, a hiss of noise and a small thump. */
  hitTickVolume: 0.8,
  hitTick: {
    clickHz: 3400,
    clickTime: 0.012,
    noiseHz: 5200,
    noiseQ: 2,
    noiseGain: 0.8,
    noiseAttack: 0.0005,
    noiseTime: 0.03,
    thumpFromHz: 180,
    thumpToHz: 70,
    thumpGain: 0.6,
    thumpTime: 0.08,
  },
  /** A BB landing on someone else (positional): a dull smack on fabric. */
  bodyHitVolume: 0.6,
  bodyHit: { hz: 2200, q: 1.5, attack: 0.001, time: 0.04 },
  /** Confirmation that your BB hit someone: a soft wooden "tock". */
  hitMarkerVolume: 0.35,
  hitMarker: { fromHz: 1100, toHz: 700, time: 0.07 },
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
   * The flagpole's rope ratchet, heard at the pole each time the flag passes a notch: two quick clicks of
   * the pulley and a squeak of rope, higher going up than coming down.
   */
  flagRope: {
    volume: 0.45,
    upHz: 1900,
    downHz: 1250,
    clickTime: 0.014,
    /** The second click: this long after the first (s), this much higher and this loud relative to it. */
    secondClickDelay: 0.07,
    secondClickPitch: 1.12,
    secondClickGain: 0.8,
    squeakUpHz: 2600,
    squeakDownHz: 2100,
    squeakQ: 6,
    squeakGain: 0.5,
    squeakAttack: 0.01,
    squeakTime: 0.09,
  },
} as const;

/** When extra match-over blast `i` (0-based) starts, in seconds after the deciding hit. */
export function matchOverBlastStart(i: number): number {
  return AUDIO.roundOverWhistle * AUDIO.matchOverWhistleGap * (i + 1);
}

/** Seconds from the deciding hit to the end of the match-over whistles (the round's blast plus the extra ones). */
export function matchOverWhistlesDuration(): number {
  return Math.max(AUDIO.roundOverWhistle, matchOverBlastStart(AUDIO.matchOverBlasts - 1) + AUDIO.roundOverWhistle);
}
