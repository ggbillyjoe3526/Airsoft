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
  /** The sharp "tick" you hear when a BB hits you. */
  hitTickVolume: 0.8,
  /** A BB landing on someone else (positional). */
  bodyHitVolume: 0.6,
  /** Confirmation that your BB hit someone. */
  hitMarkerVolume: 0.35,
  /** Referee whistle at the end and start of a round. */
  whistleVolume: 0.25,
  whistlePitch: 2900,
  whistleWarble: 28,
  roundOverWhistle: 0.8,
  roundStartWhistle: 0.14,
} as const;
