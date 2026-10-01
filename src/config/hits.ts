import { FLAG } from './modes';

export interface HitConfig {
  bodyRadius: number;
  bodyBottom: number;
  bodyTop: number;
  headHeight: number;
  headRadius: number;
  crouchDrop: number;
  friendlyFire: boolean;
  callTime: number;
  walkOffSpeed: number;
  walkOffTime: number;
  deadZoneArrive: number;
  waypointReach: number;
  stuckSpeed: number;
  stuckTime: number;
  vanishTime: number;
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
  /** Friendly hits count, as they do at a real site. */
  friendlyFire: true,
  /** Seconds a hit player stands still with a hand up calling the hit. */
  callTime: 1.4,
  /** Walk-off pace as a fraction of walking speed. */
  walkOffSpeed: 0.8,
  /** Longest walk-off (seconds): enough to cross Depot; anyone still walking then leaves the field. */
  walkOffTime: 14,
  /** Close enough to the dead-zone spot to stop walking (metres). */
  deadZoneArrive: 0.6,
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
};

/** Match flow: 3v3 rounds against the clock (elimination or flag, see config/modes.ts), first to 5 round wins. */
export const ROUNDS = {
  /** Players per team, including the local player on team 0. */
  teamSize: 3,
  /** Round length (s). Elimination: a round that runs out of time is a draw (nobody scores). Flag: the defenders win it. */
  roundTime: 150,
  /** Seconds between a round ending and everyone respawning. */
  resetDelay: 4,
  /** Round wins needed to win the match. */
  winsNeeded: 5,
  flag: FLAG,
} as const;
