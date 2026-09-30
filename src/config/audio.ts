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
  hitTick: { clickHz: 3400, noiseHz: 5200, thumpFromHz: 180, thumpToHz: 70, thumpTime: 0.08 },
  /** A BB landing on someone else (positional). */
  bodyHitVolume: 0.6,
  /** Confirmation that your BB hit someone. */
  hitMarkerVolume: 0.35,
  /** Referee whistle at the end and start of a round. */
  whistleVolume: 0.25,
  whistlePitch: 2900,
  whistleWarble: 28,
  /** Warble depth as a fraction of the pitch (the pea rattling in the whistle). */
  whistleWarbleDepth: 0.04,
  roundOverWhistle: 0.8,
  /** Round start: two short blasts, the second starting this many blast-lengths after the first. */
  roundStartWhistle: 0.14,
  roundStartWhistleGap: 1.6,
} as const;
