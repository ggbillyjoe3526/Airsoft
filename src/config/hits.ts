import { FLAG } from './modes';

export interface HitConfig {
  bodyRadius: number;
  bodyBottom: number;
  bodyTop: number;
  headHeight: number;
  headRadius: number;
  crouchDrop: number;
  friendlyFire: boolean;
  /** A BB that has bounced (a ricochet) knocks out whoever it hits; when false it only ticks them (M20, Match pop-up). */
  ricochetsCount: boolean;
  callTime: number;
  walkOffSpeed: number;
  walkOffTime: number;
  deadZoneArrive: number;
  waypointReach: number;
  stuckSpeed: number;
  stuckTime: number;
  vanishTime: number;
  /**
   * Leaning (peeking around cover): the upper body tilts sideways about a pivot at the hips. Everything
   * that leans (eyes and BB origin, hit volume, the drawn figure, what bots see) uses this one geometry.
   */
  lean: {
    /** Tilt at full lean (radians). */
    maxAngle: number;
    /** Height of the pivot (the hips) above the feet when standing; crouching lowers it by crouchDrop. */
    pivotHeight: number;
  };
}

/**
 * Hit rules and hit calling. One BB hit and you're out: call it (hand up, "HIT!"), walk off to the
 * dead zone, wait for the next round.
 */
export const HITS: HitConfig = {
  /**
   * Hit volume, matching the figure players see (config/characters.ts builds the figure from these
   * numbers): an upright body capsule from the boots to the shoulders, as wide as the torso and legs,
   * plus a head sphere covering head, cap and goggles. Heights are from the feet, standing.
   */
  bodyRadius: 0.2,
  bodyBottom: 0.02,
  bodyTop: 1.5,
  headHeight: 1.62,
  headRadius: 0.13,
  /**
   * Crouching lowers everything above the hips this far. Crouched, the head top is at 1.13 m, so
   * 1.2 m crouch cover hides you completely.
   */
  crouchDrop: 0.62,
  /** Friendly hits count, as they do at a real site. A match can turn it off (config/matchRules.ts). */
  friendlyFire: true,
  /** Ricochets don't count unless the match says so (owner, M20): a bounced BB ticks you, but you play on. */
  ricochetsCount: false,
  /** Seconds a hit player stands still with a hand up calling the hit. */
  callTime: 1.4,
  /** Walk-off pace as a fraction of the normal (run) speed: a brisk walk-off, so it fits in walkOffTime. */
  walkOffSpeed: 0.8,
  /** Longest walk-off (seconds): enough to cross Depot; anyone still walking then leaves the field. */
  walkOffTime: 14,
  /**
   * Close enough to the dead-zone spot to stop walking (metres). Well under half the spots' spacing, so
   * teammates who walk in from the same side don't end up standing inside each other.
   */
  deadZoneArrive: 0.15,
  /** A route waypoint counts as reached within this distance (metres). */
  waypointReach: 0.4,
  /**
   * Walking off slower than this (m/s) for `stuckTime` seconds counts as blocked: the character leaves
   * the field instead of grinding against cover.
   */
  stuckSpeed: 0.5,
  stuckTime: 0.5,
  /** Leaving the field: the figure stands and fades out over this long, then appears in the dead zone. */
  vanishTime: 0.6,
  /**
   * About 34°: the eyes move ~0.4 m sideways (enough to see past a corner from a body-width back) and drop
   * ~0.12 m; the legs stay put. The pivot is the drawn figure's hip height (config/characters.ts uses it).
   */
  lean: { maxAngle: 0.6, pivotHeight: 0.92 },
};

/**
 * Match flow: 3v3 rounds against the clock (elimination or flag, see config/modes.ts), first to 5 round wins. These are
 * the defaults; the Match pop-up changes team size, rounds to win and round time (config/matchRules.ts).
 */
export const ROUNDS = {
  /** Players per team, including the local player on team 0. */
  teamSize: 3,
  /** Round length (s). Elimination: a round that runs out of time is a draw (nobody scores). Flag: the defenders win it. */
  roundTime: 150,
  /** Seconds between a round ending and everyone respawning. */
  resetDelay: 4,
  /** Round wins needed to win the match. */
  winsNeeded: 5,
  /** First to 5 is at most 9 decided rounds: swap ends after 4, so the decider is in the second half. */
  halfTimeAfter: 4,
  /**
   * Elimination: Blue starts in the east. On Depot the east end wins a little over half the rounds in bot-only
   * matches (54%, DECISIONS 2026-10-03), so the player's team plays its first rounds, the ones that teach the map, there.
   */
  eliminationFirstEnd: 1,
  flag: FLAG,
} as const;
