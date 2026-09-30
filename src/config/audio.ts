/** Procedural sound levels and ranges. Replicas sound mechanical and plasticky, never like firearms. */
export const AUDIO = {
  masterVolume: 0.7,
  shotVolume: 0.55,
  mechanismVolume: 0.35,
  impactVolume: 0.5,
  /** Positional sounds: full volume within refDistance, then roll off. */
  refDistance: 3,
  rolloff: 1.4,
  maxDistance: 60,
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
} as const;
