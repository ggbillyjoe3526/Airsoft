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
  /**
   * Longest walk-off (seconds). Walk-off heads straight for the dead zone; until bots bring
   * navigation, anyone still on the way after this is moved into the dead zone.
   */
  walkOffTime: 4,
  /** Close enough to the dead-zone slot to stop walking (metres). */
  deadZoneArrive: 0.6,
  /**
   * Walking off slower than this (m/s) for `stuckTime` seconds counts as blocked: the character skips
   * ahead to leaving the field instead of grinding against cover.
   */
  stuckSpeed: 0.5,
  stuckTime: 0.5,
  /** The last seconds of a walk-off that doesn't reach the dead zone: the figure fades off the field. */
  vanishTime: 0.6,
};

/** Round flow (Phase 1 minimum: one team out ends the round, everyone respawns). */
export const ROUNDS = {
  /** Players per team, including the local player on team 0. */
  teamSize: 3,
  /** Seconds between the last elimination and everyone respawning. */
  resetDelay: 4,
} as const;
