import type { ContentTag } from './content';
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
  /**
   * How much bush (M33e, map/foliage.ts) a bot can see someone through (metres of leaves along the sight line): someone
   * at the edge of a bush is seen, someone deeper in or behind one is not. `closeAwareness` still notices them.
   */
  foliageSeeThrough: 0.6,
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
  /**
   * Through walls (M22): a sound fully blocked from a bot carries only this fraction of its range, and half blocked
   * (low cover) halfway between. Judged by the same rays (ear to the source's knees and head) that muffle sounds for
   * the player (AUDIO.occlusion), so bots hear through walls no better than the player does.
   */
  wallHearing: 0.6,
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
   * ...widened with the distance to them by this many standard deviations of the replica's spread: a BB strays further
   * from the aim line the further it flies, so a teammate 20 m down the line needs more room than one 2 m away.
   */
  friendlySpreadSigmas: 2,
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
   * ...and a teammate up to this far (metres) past where the aim line meets a wall still counts: a line that only grazes
   * a wall's corner lets BBs (spread, aim error) past it, onto a teammate stepping out from behind that corner.
   */
  friendlyPastWall: 0.8,
  /**
   * Hold fire when the aim line itself (aim error included) meets a wall within this fraction of the
   * distance to the target: the clear line to the target doesn't help if the BB would go into the door frame.
   */
  aimWallFraction: 0.5,

  // ---- Movement and cover -----------------------------------------------------------------------
  // How long a bot pauses at each lane point is its skill's holdTime (BOT_SKILL).
  /**
   * Holding at a lane point (audit AI-02): after this long (s) the bot crouches, if its crouched eyes still see this
   * far (metres) towards the enemy side (one ray per hold; behind crouch cover it stays up to see over it), and it
   * sweeps its view this far (degrees) either side of the enemy side over a period of this many seconds.
   */
  holdCrouchDelay: 0.4,
  holdLookDistance: 8,
  holdSweepDeg: 35,
  holdSweepPeriod: 4,
  /**
   * Held angles (M37, for skills with holdsAngles): holding still, the bot fans this many rays at eye height across
   * this wide a view (degrees) of the enemy side and aims where a ray that stops at a wall sits beside one that runs on
   * at least angleJump (metres) further than the wall itself would reach (so a long wall seen at a slant is no corner): a
   * corner or doorway someone would step out of. It aims anglePast (metres) past
   * the wall's distance, at head height. Edges nearer than angleMinDist or beyond angleMaxDist (metres) are skipped,
   * those near angleBestDist (metres) preferred; it keeps two at least angleSeparationDeg apart, switches between them
   * every angleSwitchTime (s) and looks again every angleRefresh (s).
   */
  angleFanDeg: 140,
  angleRays: 29,
  angleJump: 2.5,
  anglePast: 0.6,
  angleMinDist: 2,
  angleMaxDist: 30,
  angleBestDist: 10,
  angleSeparationDeg: 15,
  angleSwitchTime: 3,
  angleRefresh: 2,
  /** ...or as soon as it has moved this far (metres) since it last looked. */
  angleMoveRefresh: 0.5,
  /** Someone appearing within this angle (degrees) of where a bot already aims counts as pre-aimed (the skill's preAim*). */
  preAimConeDeg: 6,
  /**
   * At a lane point, a bot may first step into cover (its skill's holdCoverChance): the best spot within this radius
   * (metres) that hides it from a point this far (metres) towards the enemy side and that it can peek from.
   */
  holdCoverRadius: 3,
  holdCoverThreatDistance: 10,
  /**
   * Bots sharing a lane (audit AI-01): a lane point with a teammate holding (or heading for a hold) within this distance
   * (metres) of it is moved this far (metres) to one side, across the way to the enemy.
   */
  laneHoldSpacing: 1.5,
  laneHoldOffset: 1,
  /**
   * Keeping apart (audit AI-01): characters don't collide with each other in the physics, so a bot steers away from
   * anyone in play whose centre is closer than this (metres; two bodies touch at twice BODY.radius), harder the
   * closer they are; standing still, it walks out of the way. Cover spots are never picked within two body radii plus
   * coverSpacingMargin (metres) of where a teammate is or is heading for cover.
   */
  separationDistance: 0.8,
  coverSpacingMargin: 0.1,
  /** A route search that finds no way to a goal isn't asked for again (or for the next goal) within this long (s; AI-07). */
  routeRetryDelay: 1,
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
  /** A low block counts as standing on the floor if its bottom is within this of the nav floor under it (metres). */
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
   * On spotting someone at least its skill's contactCoverMinDistance away while advancing or searching, a
   * bot first moves to crouch cover within contactCoverRadius (metres), if there is any, and fights
   * from it: the way players at a site get behind a barricade before trading BBs.
   */
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
   * A sidestep must keep the target in sight (audit AI-05): from eyes moved this far (metres) to that side, the line to
   * the target must be clear, or the bot steps the other way (or forward or back, or stands).
   */
  strafeSightOffset: 0.6,
  /**
   * Steps off the route (sidesteps, the last few centimetres to a lean spot) look this far ahead for a
   * drop (a platform's edge, a ramp's side) and don't take it (metres): more than the body's radius, so
   * the bot turns back before its feet leave the floor.
   */
  edgeLookahead: 0.6,
  /**
   * At the end of a search (audit AI-14), a bot that found nobody crouches and looks round for this long (s), sweeping
   * its view this far (degrees) either side of the way it arrived, before it moves on.
   */
  searchLook: [1, 2] as const,
  searchLookDeg: 90,
  /**
   * Flanking (audit AI-17, the skill's flankChance): a search of a spot at least flankMinDistance (metres) away first
   * goes to a point flankOffset (metres) to one side of the straight way there.
   */
  flankMinDistance: 8,
  flankOffset: 4,
  /** How far short of the searched spot (metres, along the straight way) the flank point lies: it comes in from the side. */
  flankBack: 2,
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
   * Attackers at the pole (audit AI-06): one raises the flag; each other attacker who has swept its lane holds cover
   * within flagGuardRadius (metres) of the pole, hidden from a point flagGuardThreatDistance (metres) from the pole
   * towards the defenders' end (or from where an enemy was last seen or heard), and watches from there.
   */
  flagGuardRadius: 6,
  flagGuardThreatDistance: 10,
  /**
   * The raiser keeps the rope unless another attacker in flag mode is this much nearer the pole (metres): close enough
   * that a guard by the pole takes over from a raiser still on its way, far enough that two bots don't swap every tick.
   */
  raiserSwitchMargin: 3,
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
 * How good a bot is: reaction, turning, aim and trigger discipline. One set per difficulty level; each
 * team's bots play at the level picked for it (M20).
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
  // How it plays (audit AI-17): difficulty is behaviour too, not only aim. Hard uses cover and flanks more, Easy less.
  /** Pause at each lane point, looking ahead (s). */
  readonly holdTime: readonly [number, number];
  /** Chance of stepping into cover by a lane point before holding there (see holdCoverRadius). */
  readonly holdCoverChance: number;
  /** On a fresh contact at least this far away (metres), get behind close cover before fighting (see contactCoverRadius). */
  readonly contactCoverMinDistance: number;
  /** Walk (silent) for the last this-many metres to where someone was seen or heard. */
  readonly searchWalkDistance: number;
  /** Chance a search of a far spot goes round to one side of it first (see flankOffset). */
  readonly flankChance: number;
  // Held angles (M37): Pro holds and pre-aims the corners someone would come round; the levels below don't.
  /** Holding still, aim at the corners and doorways someone would step out of (see angleFanDeg). */
  readonly holdsAngles: boolean;
  /** Reaction to someone appearing where the bot already aims (within preAimConeDeg), instead of reactionTime (s). */
  readonly preAimReactionTime: readonly [number, number];
  /** ...and how much of its aim settling (0..1 of aimSettleTime) is already done then. */
  readonly preAimSettled: number;
}

export type Difficulty = 'easy' | 'normal' | 'hard' | 'pro';

/**
 * Difficulty levels in the order the Difficulty pop-up lists them, with their labels and content tags (M35,
 * config/content.ts: a `dev` level, as Pro is while it is built, is offered only with Dev content on).
 */
export const DIFFICULTIES: readonly { id: Difficulty; label: string; blurb: string; tag: ContentTag }[] = [
  { id: 'easy', label: 'Easy', blurb: 'Slow to react, shaky aim. Learn the map.', tag: 'public' },
  { id: 'normal', label: 'Normal', blurb: 'A fair fight: their first BBs up close can miss.', tag: 'public' },
  { id: 'hard', label: 'Hard', blurb: 'Quick and steady, each on kit of its own. Get seen first and you\'re out.', tag: 'public' },
  { id: 'pro', label: 'Pro', blurb: 'Tournament-sharp: patient, accurate and well kitted. Slow down and slice every corner.', tag: 'dev' },
];

/** The same levels as the Difficulty pop-up's Teammates row describes them (M20), with the same tags. */
export const TEAMMATE_DIFFICULTIES: readonly { id: Difficulty; label: string; blurb: string; tag: ContentTag }[] = [
  { id: 'easy', label: 'Easy', blurb: 'Slow to react, shaky aim: you carry the team.', tag: 'public' },
  { id: 'normal', label: 'Normal', blurb: 'They hold their own in a fair fight.', tag: 'public' },
  { id: 'hard', label: 'Hard', blurb: 'Quick and steady: they win fights for you.', tag: 'public' },
  { id: 'pro', label: 'Pro', blurb: 'Patient and accurate: they hold their angles and win their duels.', tag: 'dev' },
];

/** True when `d` is `min` or above, in the Difficulty pop-up's order (Easy, Normal, Hard, Pro). */
export function difficultyAtLeast(d: Difficulty, min: Difficulty): boolean {
  return DIFFICULTY_RANK[d] >= DIFFICULTY_RANK[min];
}

const DIFFICULTY_RANK = Object.fromEntries(DIFFICULTIES.map((o, i) => [o.id, i])) as Readonly<Record<Difficulty, number>>;

export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

/**
 * Your bot teammates' level until you pick one (audit AI-03): the opponents' level, as every bot had before M20, except
 * that Easy opponents give you Normal teammates. A new player on Easy needs teammates who win their fights, and Easy
 * against Easy plays the longest rounds.
 */
export function defaultTeammateDifficulty(opponents: Difficulty): Difficulty {
  return opponents === 'easy' ? DEFAULT_DIFFICULTY : opponents;
}

/** Skill per difficulty level (see BotSkill). Tuned with measured time-to-hit (docs/DECISIONS.md). */
export const BOT_SKILL: Readonly<Record<Difficulty, BotSkill>> = {
  // Easy (audit AI-03): forgiving to the player where the player feels it (slow reactions, wide first BBs), but its
  // settled aim is closer to Normal's so bot-against-bot fights still end and rounds don't drag on (1.7°, not the audit's
  // 1.4°: with M30's BB flight that made Easy bots as good shots as Normal ones; DECISIONS).
  easy: {
    reactionTime: [0.6, 1.0],
    turnRate: 3.2,
    aimErrorStartDeg: 8,
    aimErrorSettledDeg: 1.7,
    aimSettleTime: 1.3,
    aimErrorStartMetres: 1.0,
    aimErrorMovingDeg: 2.0,
    aimErrorTracking: 0.12,
    leadFactor: 0.25,
    burst: [0.15, 0.35],
    burstPause: [0.45, 0.9],
    holdTime: [1.0, 2.5],
    holdCoverChance: 0.2,
    contactCoverMinDistance: 12,
    searchWalkDistance: 4,
    flankChance: 0,
    holdsAngles: false,
    preAimReactionTime: [0.6, 1.0],
    preAimSettled: 0,
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
    holdTime: [0.8, 2.5],
    holdCoverChance: 0.5,
    contactCoverMinDistance: 8,
    searchWalkDistance: 12,
    flankChance: 0.25,
    holdsAngles: false,
    preAimReactionTime: [0.35, 0.6],
    preAimSettled: 0,
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
    holdTime: [0.4, 1.2],
    holdCoverChance: 0.8,
    contactCoverMinDistance: 5,
    searchWalkDistance: 20,
    flankChance: 0.7,
    holdsAngles: false,
    preAimReactionTime: [0.25, 0.45],
    preAimSettled: 0,
  },
  // Pro (M36, owner 2026-10-04): above Hard in every number, but its first BBs are still never dead on
  // (aimErrorStartMetres above zero) and it reacts no faster than Hard to someone it wasn't already aiming at. It plays
  // slower than Hard: longer holds at lane points, nearly always from cover, and a walk (silent) for the last 30 m to
  // a contact. Holding still it aims at the corners someone would step out of and answers someone appearing there in
  // 0.18–0.28 s with its aim half settled (M37); clearing corners and team play come with M38.
  pro: {
    reactionTime: [0.25, 0.45],
    turnRate: 6,
    aimErrorStartDeg: 3.5,
    aimErrorSettledDeg: 0.75,
    aimSettleTime: 0.7,
    aimErrorStartMetres: 0.2,
    aimErrorMovingDeg: 1.0,
    aimErrorTracking: 0.05,
    leadFactor: 0.85,
    burst: [0.15, 0.35],
    burstPause: [0.2, 0.4],
    holdTime: [1.2, 3],
    holdCoverChance: 0.9,
    contactCoverMinDistance: 4,
    searchWalkDistance: 30,
    flankChance: 0.7,
    holdsAngles: true,
    preAimReactionTime: [0.18, 0.28],
    preAimSettled: 0.5,
  },
};

/**
 * What the other team's bots carry, per difficulty (M29b, owner 2026-10-04): 'factory' is each replica as it comes;
 * 'random' rolls every bot its own compatible kit from the pool (pool/botKit.ts). Your teammates always carry factory.
 */
export const BOT_LOADOUTS: Readonly<Record<Difficulty, 'factory' | 'random'>> = { easy: 'factory', normal: 'factory', hard: 'random', pro: 'random' };

/**
 * How a random loadout is rolled: the chance each part slot (optic, grip, laser, barrel, muzzle, magazine) gets a part,
 * and (M32, owner 2026-10-04) the chance a match's opponents include one carrying a chase replica (the Cyber Pistol) as
 * their primary: only on a difficulty that rolls kits (Hard, and any above it later), and only once the player owns
 * one (Unlock all gear counts). 0.05: about 5 matches in 100.
 */
export const RANDOM_LOADOUT = { partChance: 0.6, chaseChance: 0.05 } as const;

/** That chance per difficulty that rolls kits (BOT_LOADOUTS): Hard's as above, Pro's higher (M36: better kitted). */
export const BOT_PART_CHANCE: Readonly<Record<Difficulty, number>> = { easy: 0, normal: 0, hard: RANDOM_LOADOUT.partChance, pro: 0.8 };

/** The behaviour tuning every bot shares, whatever its level (BOT_BEHAVIOUR's shape). */
export type BotBehaviour = Widen<typeof BOT_BEHAVIOUR>;

/** Everything a bot's decisions are tuned by: shared behaviour plus one difficulty's skill. */
export type BotConfig = BotBehaviour & BotSkill;

/** The full bot tuning for a difficulty level. */
export function botConfig(difficulty: Difficulty): BotConfig {
  return { ...BOT_BEHAVIOUR, ...BOT_SKILL[difficulty] };
}

/** Bots at the default difficulty: the reference bot for tests and tuning docs. */
export const BOTS: BotConfig = botConfig(DEFAULT_DIFFICULTY);
