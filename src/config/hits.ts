export interface HitConfig {
  bodyRadius: number;
  standingTop: number;
  crouchedTop: number;
  friendlyFire: boolean;
  callTime: number;
  walkOffSpeed: number;
  walkOffTime: number;
  deadZoneArrive: number;
}

/**
 * Hit rules and hit calling. One BB hit and you're out: call it (hand up, "HIT!"), walk off to the
 * dead zone, wait for the next round.
 */
export const HITS: HitConfig = {
  /**
   * Hit volume: an upright capsule around the character, a little slimmer than the collision capsule
   * so a BB that visibly brushes past the silhouette doesn't count. Heights are from the feet.
   */
  bodyRadius: 0.26,
  standingTop: 1.8,
  /** Crouched, the top of the head sits at 1.15 m, so 1.2 m crouch cover hides you completely. */
  crouchedTop: 1.15,
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
};

/** Round flow (Phase 1 minimum: one team out ends the round, everyone respawns). */
export const ROUNDS = {
  /** Players per team, including the local player on team 0. */
  teamSize: 3,
  /** Seconds between the last elimination and everyone respawning. */
  resetDelay: 4,
} as const;
