import { MOVEMENT } from './movement';

/**
 * Bot behaviour tuning shared by every difficulty level (the skill per level is BOT_SKILL below).
 * Bots play through the same commands as the player and have human limits: they only know what
 * they've seen or heard, react after a delay, turn at a finite speed and aim with an error that
 * settles over time. Ranges are [min, max], picked at random (seeded) each time.
 */
export const BOT_BEHAVIOUR = {
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
   * Walking and moving crouched are silent (only `closeAwareness` gives those away), unless a hi-cap magazine
   * rattles (M17b): heard this far on quiet moves.
   */
  footstepHearingRun: 11,
  footstepHearingSprint: 16,
  footstepHearingLand: 12,
  footstepHearingRattle: 7,
  /** A heard position is off by up to this fraction of the distance (hearing through walls is vague). */
  hearingError: 0.3,
  /**
   * Gunfire heard within this long (s) of the last, from within the current guess's margin of error,
   * keeps the same guess of where the noise is (one guess per contact, not per BB or per shooter).
   */
  hearingContactTime: 2,
  /** How long a bot keeps hunting a last-known position after losing sight or hearing (s); after this it forgets the contact. */
  memoryTime: 6,
  /** An enemy BB landing this close (metres) makes a bot want cover. */
  suppressionRadius: 1.6,
  /** A bot counts as under fire for this long after a near miss (s). */
  suppressionTime: 0.4,

  // ---- Reaction and aim (the skill values live in BOT_SKILL) -------------------------------------
  /** Seconds a target can be out of sight and still count as "the same contact" (no new reaction delay). */
  contactGrace: 1.2,
  /** Stay on the current target unless another is at least this much closer (metres). */
  targetSwitchMargin: 3,
  /**
   * On a new contact the aim error starts at least this fraction of its full size off target (in a
   * random direction), then settles: a hasty first aim, never dead on.
   */
  aimFirstErrorMin: 0.6,
  /** How fast the error drifts around (Hz): low values look like a hand correcting, not jitter. */
  aimWanderRate: 0.7,
  /** Fire only when the view is within this of the (erroneous) aim point (degrees). */
  fireCone: 3,
  /** Aim at this height on the target's body, as a fraction of its hit-volume height (chest). */
  aimHeightFraction: 0.7,
  /** Bots look for a target's head at this fraction of its hit-volume height. */
  headHeightFraction: 0.93,

  // ---- Firing -----------------------------------------------------------------------------------
  /** Reload when the magazine is below this fraction and nobody is in sight. */
  tacticalReloadFraction: 0.35,
  /** Never fire if a teammate is this close to the line of fire (metres, beyond their hit volume). */
  friendlyMargin: 0.3,
  /**
   * ...and this far (metres) past the target too: a BB that misses keeps flying, so a teammate just
   * behind the target in the line of fire is as much in the way as one in front.
   */
  friendlyBeyondTarget: 15,
  /**
   * ...unless a wall stops the line first. What the aim line meets counts as a wall only if it also stands
   * this much higher (metres) where the line meets it: BBs (spread, hop-up) can sail over low cover such
   * as a crate with a teammate crouched behind it, but not over a wall.
   */
  friendlyWallClearance: 0.6,
  /** The raised check looks for the wall from this far (metres) before the point the aim line meets it, to as far past it. */
  friendlyWallProbe: 0.2,
  /**
   * Hold fire when the aim line itself (aim error included) meets a wall within this fraction of the
   * distance to the target: the clear line to the target doesn't help if the BB would go into the door frame.
   */
  aimWallFraction: 0.5,

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
  crouchCoverBonus: 4,
  /**
   * Low blocks (crates, barriers, sills) are also tried as cover: the spot this far (metres) past a
   * block's far side from the threat. Just over the body radius, so the bot hugs the block.
   */
  lowCoverGap: 0.45,
  /** Second try behind a low block when the spot at lowCoverGap isn't walkable (metres). */
  lowCoverGapFar: 0.8,
  /** A low block counts as standing on the floor if its bottom is within this of y = 0 (metres). */
  lowCoverFloorGap: 0.05,
  /**
   * Corners of full-height blocks (walls, containers) are tried as lean spots: just behind the corner as
   * seen from the threat, leanSpotInset (metres) inside its shadow. More than the body's hit radius
   * (hidden standing upright) but less than the eyes move in a full lean (~0.4 m), so leaning out shows
   * the head and one shoulder, as a player peeking that corner would.
   */
  leanSpotInset: 0.27,
  /**
   * From the corner, the lean spot moves along the sight line in steps of this (metres) until standing
   * there clears the block by lowCoverGap.
   */
  leanSpotStep: 0.225,
  /** Lean spots score as if they were this much closer (metres): you can lean out and shoot back. */
  leanCoverBonus: 1.5,
  /** Walk right onto a lean spot, to within this distance (metres): a few centimetres decide the peek. */
  leanSpotReach: 0.1,
  /** ...and only from this close (metres): further off, the route brings the bot there first. */
  leanSpotApproachMax: 0.9,
  /** At a lean spot, the bot counts as there (to peek and fight from it) only within this distance (metres). */
  leanSpotArrive: 0.2,
  /** A lean needs this much room past the leaned eyes (metres; the lean stops this short of walls). */
  leanRoomMargin: MOVEMENT.leanWallClearance,
  /** Close enough to a cover spot to settle in (metres). */
  coverArrive: 0.9,
  /** Stay in cover this long before peeking out again (s). */
  coverTime: [1.2, 2.4] as const,
  /**
   * Crouch-peeking at crouch-high cover: how many times to stand up and look (whole number, rounded
   * down), how long each look lasts with nobody in sight (s), how long to stay up shooting once someone
   * is (s), and how long to stay ducked between looks (s). Ducks early when under fire or reloading.
   */
  peekCount: [2, 4] as const,
  peekLook: [0.6, 1.1] as const,
  peekFight: [1.2, 2.4] as const,
  peekDown: [0.8, 1.6] as const,
  /** Give up on reaching cover after this long (s), e.g. if the route there is blocked. */
  coverMaxTime: 5,
  /**
   * On spotting someone at least contactCoverMinDistance away (metres) while advancing or searching, a
   * bot first moves to crouch cover within contactCoverRadius (metres), if there is any, and fights
   * from it: the way players at a site get behind a barricade before trading BBs.
   */
  contactCoverMinDistance: 8,
  contactCoverRadius: 3.5,
  /** A whole cover episode (getting there, ducking, peeking, fighting from it) ends after this long (s). */
  coverEpisodeMax: 12,
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
  /**
   * Steps off the route (sidesteps, the last few centimetres to a lean spot) look this far ahead for a
   * drop (a platform's edge, a ramp's side) and don't take it (metres): more than the body's radius, so
   * the bot turns back before its feet leave the floor.
   */
  edgeLookahead: 0.6,
  /** Walk (silent) for the last this-many metres to where someone was seen or heard. */
  searchWalkDistance: 12,
  /** Sprint along routes when nobody has been seen or heard for this long (s), if heading mostly forward. */
  sprintWhenCalmFor: 3,
  sprintForward: 0.9,
  // ---- Team play and routes -------------------------------------------------------------------
  /**
   * Each round a team picks a plan for its bots, by these weights: split (each on a different lane),
   * pair (two share a lane, the rest take others) or stack (all on one lane).
   */
  planSplitWeight: 0.4,
  planPairWeight: 0.4,
  planStackWeight: 0.2,
  /** Bots sharing a lane set off this long apart (s), so they don't walk on each other's heels. */
  laneFollowDelay: [0.8, 1.6] as const,
  /** Lane points are moved up to this far at random (metres, onto walkable ground), so no two rounds run the same line. */
  laneJitter: 1.2,
  laneJitterTries: 6,
  /**
   * Moving as a team: a bot more than this far (metres, towards the enemy side) ahead of its rearmost
   * bot teammate waits at lane points, for at most teamWaitMax seconds per point.
   */
  teamSpread: 7,
  teamWaitMax: 4,

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
  // ---- Flag mode -------------------------------------------------------------------------------
  /**
   * Bots stand at a random spot within this distance of the pole (metres): close enough to work the
   * rope (FLAG.radius) once within flagArrive of the spot, and spread out so they don't stand in a heap.
   */
  flagStand: 0.8,
  /** Close enough to that spot to stop, crouch and work the rope (metres). */
  flagArrive: 0.5,
  /**
   * Defenders hold the first point of their lane (nearest home). The first bot on a shared lane holds
   * the next one, and a bot alone on its lane does so this often: a forward hold.
   */
  defendForwardChance: 0.3,
  /**
   * Defenders go after someone seen or heard within this distance of the pole (metres); further away
   * they hold their post and watch that way, so the attackers have to come to them.
   */
  defendSearchRadius: 12,
  /**
   * Once the flag is off the bottom, this many defenders (those nearest the pole) go and pull it down;
   * the rest hold their posts.
   */
  retakers: 2,

  /** At most this many route searches per simulation tick, shared by all bots. */
  pathsPerTick: 1,
} as const;

type Widen<T> = { readonly [K in keyof T]: T[K] extends readonly [number, number] ? readonly [number, number] : number };

/**
 * How good a bot is: reaction, turning, aim and trigger discipline. One set per difficulty level; all
 * bots in a match (teammates too) play at the chosen level.
 */
export interface BotSkill {
  /** Delay between first seeing someone and opening fire (s). */
  readonly reactionTime: readonly [number, number];
  /** Turning speed when aiming (rad/s). */
  readonly turnRate: number;
  /** Aim error (degrees) right after acquiring a target, what it settles to, and how long that takes (s). */
  readonly aimErrorStartDeg: number;
  readonly aimErrorSettledDeg: number;
  readonly aimSettleTime: number;
  /**
   * The starting aim error is at least this far off the target (metres) however close it is, so up
   * close a bot's first BBs can whizz past instead of always landing: you get a moment to answer.
   */
  readonly aimErrorStartMetres: number;
  /** Extra aim error while the bot itself is moving (degrees). */
  readonly aimErrorMovingDeg: number;
  /**
   * Extra aim error while tracking a target that moves across the view: the target's sideways speed
   * (m/s) times this (s) gives metres off. Moving targets are harder to hit, as with real slow BBs.
   */
  readonly aimErrorTracking: number;
  /** Fraction of the target's movement a bot leads by (BBs are slow; bots are imperfect at it). */
  readonly leadFactor: number;
  /** Trigger held per burst and pause between bursts (s). */
  readonly burst: readonly [number, number];
  readonly burstPause: readonly [number, number];
}

export type Difficulty = 'easy' | 'normal' | 'hard';

/** Difficulty levels in the order the Difficulty pop-up lists them, with their labels. */
export const DIFFICULTIES: readonly { id: Difficulty; label: string; blurb: string }[] = [
  { id: 'easy', label: 'Easy', blurb: 'Slow to react, shaky aim. Learn the map.' },
  { id: 'normal', label: 'Normal', blurb: 'A fair fight: their first BBs up close can miss.' },
  { id: 'hard', label: 'Hard', blurb: 'Quick and steady. Get seen first and you\'re out.' },
];

/** The same levels as the Difficulty pop-up's Teammates row describes them (M20). */
export const TEAMMATE_DIFFICULTIES: readonly { id: Difficulty; label: string; blurb: string }[] = [
  { id: 'easy', label: 'Easy', blurb: 'Slow to react, shaky aim: you carry the team.' },
  { id: 'normal', label: 'Normal', blurb: 'They hold their own in a fair fight.' },
  { id: 'hard', label: 'Hard', blurb: 'Quick and steady: they win fights for you.' },
];

export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

/** Skill per difficulty level (see BotSkill). Tuned with measured time-to-hit (docs/DECISIONS.md). */
export const BOT_SKILL: Readonly<Record<Difficulty, BotSkill>> = {
  easy: {
    reactionTime: [0.55, 0.9],
    turnRate: 3.2,
    aimErrorStartDeg: 7,
    aimErrorSettledDeg: 1.9,
    aimSettleTime: 1.6,
    aimErrorStartMetres: 0.9,
    aimErrorMovingDeg: 2.5,
    aimErrorTracking: 0.12,
    leadFactor: 0.25,
    burst: [0.15, 0.35],
    burstPause: [0.45, 0.9],
  },
  normal: {
    reactionTime: [0.35, 0.6],
    turnRate: 4.5,
    aimErrorStartDeg: 4.5,
    aimErrorSettledDeg: 1.1,
    aimSettleTime: 1.0,
    aimErrorStartMetres: 0.75,
    aimErrorMovingDeg: 1.5,
    aimErrorTracking: 0.09,
    leadFactor: 0.5,
    burst: [0.2, 0.45],
    burstPause: [0.3, 0.65],
  },
  hard: {
    reactionTime: [0.25, 0.45],
    turnRate: 5.5,
    aimErrorStartDeg: 4,
    aimErrorSettledDeg: 0.9,
    aimSettleTime: 0.8,
    aimErrorStartMetres: 0.25,
    aimErrorMovingDeg: 1.2,
    aimErrorTracking: 0.06,
    leadFactor: 0.7,
    burst: [0.25, 0.55],
    burstPause: [0.2, 0.5],
  },
};

/** Everything a bot's decisions are tuned by: shared behaviour plus one difficulty's skill. */
export type BotConfig = Widen<typeof BOT_BEHAVIOUR> & BotSkill;

/** The full bot tuning for a difficulty level. */
export function botConfig(difficulty: Difficulty): BotConfig {
  return { ...BOT_BEHAVIOUR, ...BOT_SKILL[difficulty] };
}

/** Bots at the default difficulty: the reference bot for tests and tuning docs. */
export const BOTS: BotConfig = botConfig(DEFAULT_DIFFICULTY);
