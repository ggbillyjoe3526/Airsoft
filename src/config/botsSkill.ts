/**
 * The bots' skill per difficulty level (DX7: config/bots.ts gathers it with the behaviour every level shares and
 * re-exports it). Import from config/bots.ts.
 */

/** The difficulty levels. */
export type Difficulty = 'easy' | 'normal' | 'hard' | 'pro';

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
   * (m/s) times this (s) gives metres off. Moving targets are harder to hit, as with real slow BBs. Every level's grew
   * by 11/9 with M85, when the hit volume took in the drawn shoulders: a strafing player kept the moment it buys
   * (ai.test.ts, Normal at 4 m).
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
  /**
   * Chance a search of a far spot goes round to one side of it first (see flankOffset); in Elimination's overtime, the
   * chance it goes for the flag round the side (see overtimeFlankOffset).
   */
  readonly flankChance: number;
  // Held angles (M37): Pro holds and pre-aims the corners someone would come round; the levels below don't.
  /** Holding still, aim at the corners and doorways someone would step out of (see angleFanDeg). */
  readonly holdsAngles: boolean;
  /** Reaction to someone appearing where the bot already aims (within preAimConeDeg), instead of reactionTime (s). */
  readonly preAimReactionTime: readonly [number, number];
  /** ...and how much of its aim settling (0..1 of aimSettleTime) is already done then. */
  readonly preAimSettled: number;
  // Clearing corners and team play (M38): Pro does these; the levels below don't.
  /**
   * Near the enemy (past the middle of the map, or with a threat still in mind) it walks and slices corners: on its
   * lane it aims at each corner ahead as it opens instead of where it walks; closing in on someone heard or lost, at the
   * corner they are behind until the spot is in view; leaning out past a corner close by. With a threat in mind it tops
   * up its magazine only from cover.
   */
  readonly slicesCorners: boolean;
  /** Having lost sight of someone, how long it stays and watches where they were before going after them (s). */
  readonly peekWatchTime: readonly [number, number];
  /**
   * Elimination's overtime flag (Dev 6 item 45): how long after it goes up the bot heads for it (s). Easy is slow to see
   * what the whistle means; Pro is off at once.
   */
  readonly overtimeReaction: readonly [number, number];
  /** Trades a hit teammate, moves in pairs, sets crossfires on defence and pushes late when behind (see tradeTime…). */
  readonly teamPlay: boolean;
  /**
   * Weapon torch discipline at night (M33h, ai/botTorch.ts): true keeps the torch on while advancing too (sloppy: Easy),
   * giving itself away. Absent: off on the move, as the levels above play it.
   */
  readonly torchOnTheMove?: boolean;
  /**
   * Shooting into bushes (Dev 6 item 44, ai/botCombat.ts): true fires through the leaves wherever its BBs could still get
   * through (BallisticsConfig.leaves.stopDepth), however far off they come out (sloppy: Easy). Absent: holds fire through
   * more than BOT_BEHAVIOUR.foliageFireThrough of them, as the levels above play it.
   */
  readonly firesIntoLeaves?: boolean;
  /**
   * Map balance (M40; every level since Audit 2, BAL-01): its lane swept with no one found, it hunts the middle of the
   * map rather than the far end (see huntMiddleBias), where the other team, which swept a lane of its own the other way,
   * comes back through. Off, both teams sweep each other's empty ends and the round runs out the clock.
   */
  readonly huntsMiddle: boolean;
  /**
   * How long (s) a hunt sector its team checked (stood in, or saw empty: huntClearRange) stays checked (M87): until
   * then a bot hunting picks it only after every sector checked longer ago; after it, it is worth a look again, as if
   * never checked. Longer at the higher levels, which search more methodically; Infinity: never stale (before M87).
   */
  readonly huntMemory: number;
  /**
   * On a night field (M40; Normal and up since Audit 2, BAL-02), never holds a lane point in a light pool when a dark
   * spot is near (see darkSpotRadius). Easy keeps it off: a learning level whose defenders may stand in the light.
   */
  readonly keepsDark: boolean;
  // Extraction (M46; plan, section 8): how the home team plays a run at this level.
  /** Guards posted on the marshal's locker, the run's best case. */
  readonly lockerGuards: number;
  /** From this share of the run gone, its patrols and those back in a wave hunt the squad (null: never). */
  readonly huntersFrom: number | null;
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
    aimErrorTracking: 0.147,
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
    slicesCorners: false,
    peekWatchTime: [0, 0],
    overtimeReaction: [1.2, 2.4],
    teamPlay: false,
    torchOnTheMove: true,
    firesIntoLeaves: true,
    huntsMiddle: true,
    huntMemory: 20,
    keepsDark: false,
    lockerGuards: 1,
    huntersFrom: null,
  },
  normal: {
    reactionTime: [0.35, 0.6],
    turnRate: 4.5,
    aimErrorStartDeg: 4.5,
    aimErrorSettledDeg: 1.1,
    aimSettleTime: 1.0,
    aimErrorStartMetres: 0.75,
    aimErrorMovingDeg: 1.5,
    aimErrorTracking: 0.11,
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
    slicesCorners: false,
    peekWatchTime: [0, 0],
    overtimeReaction: [0.5, 1.2],
    teamPlay: false,
    huntsMiddle: true,
    huntMemory: 40,
    keepsDark: true,
    lockerGuards: 2,
    huntersFrom: 0.5,
  },
  hard: {
    reactionTime: [0.25, 0.45],
    turnRate: 5.5,
    aimErrorStartDeg: 4,
    aimErrorSettledDeg: 0.9,
    aimSettleTime: 0.6,
    aimErrorStartMetres: 0.6,
    aimErrorMovingDeg: 1.2,
    aimErrorTracking: 0.073,
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
    slicesCorners: false,
    peekWatchTime: [0, 0],
    overtimeReaction: [0.3, 0.7],
    teamPlay: false,
    huntsMiddle: true,
    huntMemory: 50,
    keepsDark: true,
    lockerGuards: 2,
    huntersFrom: 1 / 3,
  },
  // ---- Pro tuning: the skill (the rest of Pro's numbers are under "Pro tuning" in config/botsSquad.ts) ----
  // Pro (M36, owner 2026-10-04): above Hard in every number, but its first BBs are still never dead on
  // (aimErrorStartMetres above zero) and it reacts no faster than Hard to someone it wasn't already aiming at. It plays
  // slower than Hard: longer holds at lane points, nearly always from cover, and a walk (silent) for the last 30 m to
  // a contact. Holding still it aims at the corners someone would step out of and answers someone appearing there in
  // 0.18–0.28 s with its aim half settled (M37). Near the enemy it walks and slices each corner, watches a spot someone
  // ducked out of before chasing, trades a hit teammate, moves in pairs and pushes late when behind (M38).
  pro: {
    reactionTime: [0.25, 0.45],
    turnRate: 6,
    aimErrorStartDeg: 3.5,
    aimErrorSettledDeg: 0.75,
    aimSettleTime: 0.5,
    aimErrorStartMetres: 0.5,
    aimErrorMovingDeg: 1.0,
    aimErrorTracking: 0.061,
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
    slicesCorners: true,
    peekWatchTime: [1.5, 3],
    overtimeReaction: [0.2, 0.5],
    teamPlay: true,
    huntsMiddle: true,
    huntMemory: 60,
    keepsDark: true,
    lockerGuards: 2,
    huntersFrom: 1 / 3,
  },
};
