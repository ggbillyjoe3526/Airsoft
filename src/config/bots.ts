/**
 * Bot behaviour tuning. Bots play through the same commands as the player and have human limits:
 * they only know what they've seen or heard, react after a delay, turn at a finite speed and aim
 * with an error that settles over time. Ranges are [min, max], picked at random (seeded) each time.
 */
export const BOTS = {
  /** Seconds between perception updates per bot (staggered across bots). */
  thinkInterval: 0.1,

  // ---- Perception -------------------------------------------------------------------------------
  /** Field of view (degrees, full angle) and how far bots can make out a player (metres). */
  fovDeg: 120,
  viewDistance: 40,
  /** Anyone this close is noticed whatever way the bot faces (footsteps, rustling). */
  closeAwareness: 2.5,
  /** Gunfire within this distance gives away roughly where the shooter is (metres). */
  hearingDistance: 22,
  /**
   * How far an enemy's footsteps carry (metres): running, sprinting, and the thud of landing a jump.
   * Walking and moving crouched are silent (only `closeAwareness` gives those away).
   */
  footstepHearingRun: 11,
  footstepHearingSprint: 16,
  footstepHearingLand: 12,
  /** A heard position is off by up to this fraction of the distance (hearing through walls is vague). */
  hearingError: 0.3,
  /**
   * Gunfire heard within this long (s) of the last, from within the current guess's margin of error,
   * keeps the same guess of where the noise is (one guess per contact, not per BB or per shooter).
   */
  hearingContactTime: 2,
  /** How long a bot keeps hunting a last-known position after losing sight or hearing (s); after this it forgets the contact. */
  memoryTime: 6,
  /** A BB landing this close (metres) or a teammate being hit nearby makes a bot want cover. */
  suppressionRadius: 1.6,
  /** A bot counts as under fire for this long after a near miss (s). */
  suppressionTime: 0.4,

  // ---- Reaction and aim -------------------------------------------------------------------------
  /** Delay between first seeing someone and opening fire (s). */
  reactionTime: [0.3, 0.55] as const,
  /** Seconds a target can be out of sight and still count as "the same contact" (no new reaction delay). */
  contactGrace: 1.2,
  /** Stay on the current target unless another is at least this much closer (metres). */
  targetSwitchMargin: 3,
  /** Turning speed when aiming (rad/s). */
  turnRate: 4.5,
  /** Aim error (degrees) right after acquiring a target, what it settles to, and how long that takes (s). */
  aimErrorStartDeg: 4.5,
  aimErrorSettledDeg: 1.1,
  aimSettleTime: 0.9,
  /** Extra aim error while the bot itself is moving (degrees). */
  aimErrorMovingDeg: 1.5,
  /** How fast the error drifts around (Hz): low values look like a hand correcting, not jitter. */
  aimWanderRate: 0.7,
  /** Fraction of the target's movement a bot leads by (BBs are slow; bots are imperfect at it). */
  leadFactor: 0.5,
  /** Fire only when the view is within this of the (erroneous) aim point (degrees). */
  fireCone: 3,
  /** Aim at this height on the target's body, as a fraction of its hit-volume height (chest). */
  aimHeightFraction: 0.7,
  /** Bots look for a target's head at this fraction of its hit-volume height. */
  headHeightFraction: 0.93,

  // ---- Firing -----------------------------------------------------------------------------------
  /** Trigger held per burst and pause between bursts (s). */
  burst: [0.2, 0.5] as const,
  burstPause: [0.25, 0.6] as const,
  /** Reload when the magazine is below this fraction and nobody is in sight. */
  tacticalReloadFraction: 0.35,
  /** Never fire if a teammate is this close to the line of fire (metres, beyond their hit volume). */
  friendlyMargin: 0.3,

  // ---- Movement and cover -----------------------------------------------------------------------
  /** Pause at each lane point, looking ahead (s). */
  holdTime: [0.8, 2.5] as const,
  /** Cover search: candidate spots within this radius, how many to test, and the least time between searches (s). */
  coverRadius: 8,
  coverMinRadius: 1,
  coverCandidates: 28,
  coverCooldown: 1.5,
  /** Skip cover spots that end up closer to the threat than this fraction of the current distance (or 2 m closer). */
  coverTowardThreatFraction: 0.7,
  coverTowardThreatMetres: 2,
  /** Crouch-high cover scores as if it were this much closer (metres): you can stand up and shoot back. */
  crouchCoverBonus: 1,
  /** Close enough to a cover spot to settle in (metres). */
  coverArrive: 0.9,
  /** Stay in cover this long before peeking out again (s). */
  coverTime: [1.2, 2.4] as const,
  /** Give up on reaching cover after this long (s), e.g. if the route there is blocked. */
  coverMaxTime: 5,
  /**
   * After this long at a cover spot (s: time to crouch and look again), still seeing the enemy means
   * the spot doesn't hide us (or we've been flanked): leave cover and fight.
   */
  coverSettle: 0.5,
  /** Route waypoints count as reached within this distance (metres). */
  waypointReach: 0.45,
  /** Walking slower than this (m/s) for `stuckTime` seconds along a route means blocked: re-plan. */
  stuckSpeed: 0.3,
  stuckTime: 1,
  /** Re-plan a route to a moving goal when it has moved this far (metres). */
  replanDistance: 2.5,
  /** While fighting, sidestep for this long before switching direction (s). */
  strafeTime: [0.5, 1.2] as const,
  /** Strafing speed as a fraction of full input. */
  strafeInput: 0.6,
  /** Sprint along routes when nobody has been seen or heard for this long (s), if heading mostly forward. */
  sprintWhenCalmFor: 3,
  sprintForward: 0.9,
  /**
   * Hunting, once a bot has swept its lane: the map is split into square sectors (metres) and the bot
   * heads for whichever of `huntCandidates` random spots its team visited least recently, so hiding
   * players are eventually found.
   */
  huntSectorSize: 4,
  huntCandidates: 12,
  /** Random cells drawn per candidate before giving up (most of the grid is walkable). */
  huntTriesPerCandidate: 20,
  /** Among never-visited sectors, each metre further from home counts like this many seconds staler. */
  huntFarBias: 0.01,
  /** At most this many route searches per simulation tick, shared by all bots. */
  pathsPerTick: 1,
} as const;

/** BOTS with its values widened to plain numbers, so tests and future difficulty levels can vary them. */
export type BotConfig = {
  readonly [K in keyof typeof BOTS]: (typeof BOTS)[K] extends readonly [number, number] ? readonly [number, number] : number;
};
