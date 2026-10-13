/**
 * Practice on a map (M94): the range's targets stood where the other team's bots would play, and no bots. The spots come
 * from the map's own data, read by map/practiceSpots.ts: every lane point (where a bot advancing on that lane stops),
 * points along the lanes' long legs (where it walks), the other team's starts, Extraction's home-team starts and the
 * watch spots over a city floor. First guesses, to tune in play.
 */
export const PRACTICE_SPOTS = {
  /** No target within this much of your start (m): you start at end 0's first spawn, and the targets face that end. */
  clearOfStart: 9,
  /** Two targets on the same floor stand at least this far apart (m); the later candidate is left out. */
  minGap: 3.5,
  /** Floors this much apart or more (m) are different storeys: targets there don't crowd each other. */
  storeyGap: 2,
  /** Along a lane's legs, targets between its points, at least this far apart (m): where a bot walks. */
  legStep: 9,
  /** At most this many targets on a map: the spots a bot most surely stands at are taken first (map/practiceSpots.ts). */
  maxTargets: 48,
  /** A spot further than this (m) from the nav floor's walkable cells is dropped (it would float or stand in a wall). */
  snapReach: 1.2,
  /**
   * A figure crouches when cover lower than its shoulders is right in front of it, as someone behind a crate does: a ray
   * along its facing at `lowRayHeight` meets something within `coverReach` (m), and one at `highRayHeight` doesn't.
   */
  coverReach: 1.6,
  lowRayHeight: 0.7,
  highRayHeight: 1.45,
  /**
   * A target that would face a wall within `coverReach` faces your start instead; walled that way too, it faces the open
   * way nearest your start's, of this many ways round (and is left out if walled in every way).
   */
  turns: 16,
  /**
   * Every `steelEvery`-th standing target, counted near to far, is a steel plate (the rest are figures, as bots are): a
   * plate rings when hit, so you hear a hit where you can't see a figure fall, at every range.
   */
  steelEvery: 3,
  /** What the readout calls each kind (as the range's lanes do, config/range.ts). */
  labels: { steel: 'Steel', figure: 'Figure', crouched: 'Crouched figure' },
  /** How far up from the nav floor the real floor is looked for (m), and how far down. */
  floorProbeUp: 0.6,
  floorProbeDown: 1.6,
} as const;

export type PracticeSpotsConfig = typeof PRACTICE_SPOTS;
