/**
 * Extraction's home team (M46; DX7: one of the files config/bots.ts gathers into BOT_BEHAVIOUR): its guards, patrols
 * and hunters, and your bot teammates while you open a case.
 */
export const BOT_EXTRACTION = {
  // ---- Extraction (M46): the home team's guards, patrols and hunters (plan, section 3) ---------
  /**
   * A guard's post: a cover spot within this of its case (metres), hidden from a point guardThreatDistance in front of
   * the case (the way in: a case's front faces its room, a locker has a wall at its back), as the pole's guards do.
   */
  guardPostRadius: 6,
  guardThreatDistance: 10,
  /**
   * With no such cover (a case in the open), a guard stands guardOpenRadius from the case (metres), on its floor, with
   * the case and the way in in view and clear of teammates' spots: straight out from its front first, then turned
   * guardOpenTurnDeg at a time to either side, up to guardOpenMaxTurnDeg; then the same at patrolStandOff (M55).
   */
  guardOpenRadius: 3,
  guardOpenTurnDeg: 30,
  guardOpenMaxTurnDeg: 90,
  /** A guard goes after a noise, or someone it lost, only within this of its case (metres); further off it watches from its post. */
  guardLeash: 8,
  /**
   * No guard is posted at, and no patrol round goes by, a case within this of the squad's insertion (metres): the run
   * starts quiet (no fight at the door as the guards take their posts), and the case by the door is an easy first find.
   */
  insertionBerth: 15,
  /** A patrol stops this far in front of each case on its round (metres). */
  patrolStandOff: 2,
  /** A patrol waits at its stop while its partner is further than this behind (metres), for up to teamWaitMax. */
  patrolPairGap: 6,
  /** A hunter makes for the last place its team saw or heard the squad, while that is no older than this (s). */
  hunterMemory: 30,
  /** In a fight a hunter keeps closing in, sidestepping as it comes, until this near its target (metres). */
  pushDistance: 8,
  /**
   * Your bot teammates while you open a case (holding Use): each takes cover within openCoverRadius of you (metres),
   * hidden from a point holdCoverThreatDistance out the way it watches: behind you to the left, then to the right
   * (degrees from where you face; you face the case).
   */
  openCoverRadius: 5,
  openWatchDeg: [135, -135],
} as const;
