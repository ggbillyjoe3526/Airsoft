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
   * The kinds (M93's) a spot gets (map/practiceLayout.ts): behind low cover, a crouched pop-up and a crouched figure in
   * turn; at a window or balcony (an overlook), a pop-up; on a lane's leg, where a bot walks, a mover where its track
   * fits; every `steelEvery`-th other one, near to far, steel (a plate, a small plate and a swinger in turn, the swinger
   * where its frame fits, else a plate); the rest, standing figures, moving as `figureMotions` says in turn. A plate
   * rings, so a hit reads where a falling figure can't be seen.
   */
  steelEvery: 3,
  /**
   * The standing figures' motions in turn, near to far: half of them move, as on the range, where a bot holding that
   * point would peek (a pop-up) or shift along it (a mover, a pop-up where its track doesn't fit).
   */
  figureMotions: ['still', 'popup', 'still', 'mover'],
  /** What the readout calls each kind (as the range's own targets are called, config/range.ts). */
  labels: {
    steel: 'Steel',
    smallSteel: 'Small steel',
    swinger: 'Swinger',
    figure: 'Figure',
    crouched: 'Crouched figure',
    popup: 'Pop-up',
    crouchedPopup: 'Crouched pop-up',
    mover: 'Mover',
  },
  /**
   * Movers on a map: half the track (m) and the trolley's speeds (m/s), taken in turn, each a `phaseStep` (s) further into
   * its cycle than the last. Its track fits where the floor at both ends is within `flat` (m) of the middle's and nothing
   * stands across its face up to `margin` (m) past either end, at each of `rayHeights` (m over the floor).
   */
  mover: { track: 1.6, speeds: [1.4, 1.8], phaseStep: 1.3, flat: 0.15, margin: 0.4, rayHeights: [0.3, 1, 1.6] },
  /**
   * Swingers on a map: their frame fits where the floor under both legs is within `flat` (m) of the middle's, nothing
   * stands across its face up to `margin` (m) past the legs at the plate's and the pivot's heights, and nothing is over
   * it up to `headroom` (m) above the pivot.
   */
  swinger: { flat: 0.15, margin: 0.1, headroom: 0.3 },
  /**
   * The timed challenge's START plate on a map (M93's, M94): this far ahead of your start (m, the first that fits), turned
   * this much either side of the way you face (rad), on a floor no more than `climb` (m) from your start's, in plain
   * sight from your eye as you stand there.
   */
  start: { ahead: [5, 4, 6, 3], turns: [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05], climb: 1 },
  /**
   * The timed challenge on a map lights only targets in your sight (RangeSession), and none further than this (m): about
   * the range's far plates, the most a replica reaches with holdover (config/range.ts distances).
   */
  sightReach: 50,
  /** How far up from the nav floor the real floor is looked for (m), and how far down. */
  floorProbeUp: 0.6,
  floorProbeDown: 1.6,
} as const;

export type PracticeSpotsConfig = typeof PRACTICE_SPOTS;
