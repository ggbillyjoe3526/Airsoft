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
} as const;
