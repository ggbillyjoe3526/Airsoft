import type { Difficulty } from './bots';

/**
 * Extraction (M43; owner, 2026-10-04): a squad of one to three goes in at an insertion point, finds what it can and
 * gets out through an exit before the clock runs out. These are the rules every map shares; each map's own numbers
 * (its run time, how many opponents, where everything is) are in its data (MapData.extraction). First guesses, for
 * the owner's playtest; the plan is in the project files, `research/extraction-mode-2026-10-04.md`.
 */
export interface ExtractionRules {
  /** Seconds a squad member must stay inside an open exit to be counted out (the run ends "extracted"). */
  extractTime: number;
  /** Exits closer than this to the run's insertion (metres, horizontal) are closed for the run: every run is a journey. */
  minExitDistance: number;
  /** A late exit opens when this many seconds are left. */
  lateExitAt: number;
  /** The marshal whistles once when this many seconds are left. */
  warnAt: number;
  /** Times each squad member comes back after a hit (owner, 2026-10-04: one, automatically, no walk back). */
  respawns: number;
  /** The exit count pings every this many seconds while it runs (an 'exitCount' event; the HUD and sound). */
  countStep: number;
  /** The biggest squad (solo, duo or trio): a map's insertions have this many spawns each. */
  maxSquad: number;
  /** An exit zone reaches this far up and down from its floor (m): about a storey, so a dock above an exit isn't in it. */
  exitHeightReach: number;
  /**
   * Cases (M44): the Use key opens one within this distance of the runner (m, horizontal), and this far up or down
   * (m). How long each kind takes and how far it is heard are pool.md's Caches table.
   */
  caseReach: number;
  caseHeightReach: number;
  /**
   * A case opens only with a clear line from the runner's eye to this far above its spot (m, M55): never through a wall
   * or a floor.
   */
  caseSightHeight: number;
  /** While a case is being opened it makes its noise every this many seconds (bots within its Heard m come). */
  caseNoiseEvery: number;
  /** Seconds to pick up what you dropped when you were hit (plan: no opening time, so the hold ends at once). */
  dropOpenTime: number;
  /**
   * Waves (M45): hit opponents come back together every this many seconds, by the opponents' difficulty, or as soon as
   * none is left in play, up to the run's cap (base + squad).
   */
  waveEvery: Readonly<Record<Difficulty, number>>;
  /** In the last part of the run (this share of its time left) the cap is this many higher. */
  lateShare: number;
  lateExtra: number;
  /**
   * A regen point is in a squad member's sight if a line from their eye reaches any of these heights of a returner
   * standing there (shares of the body's height: chest and head).
   */
  regenSeenAt: readonly number[];
  /** A regen point is free only with nobody in play within this distance (m): two returners never share one. */
  regenClearance: number;
  /**
   * A wave that can't place a returner (every regen point taken, near the squad or in its sight) looks again after this
   * many seconds, not every tick (M55).
   */
  regenRetry: number;
}

export const EXTRACTION: ExtractionRules = {
  /** Double the flag's raise: you pick the moment, so it should cost a real stand (plan, section 5). */
  extractTime: 10,
  /** Depot is 50 m across: 30 m keeps the exits by the insertion's yard shut and leaves two open on the far side. */
  minExitDistance: 30,
  lateExitAt: 180,
  warnAt: 60,
  respawns: 1,
  countStep: 1,
  maxSquad: 3,
  exitHeightReach: 1,
  /** An arm's length and a step: you stand by the case, not on it. */
  caseReach: 1.5,
  caseHeightReach: 1,
  /** The top of the smallest case (an ammo can is 0.24 m tall, config/render.ts CASE_VISUALS). */
  caseSightHeight: 0.2,
  caseNoiseEvery: 1,
  dropOpenTime: 0,
  /** The plan's numbers; Pro waves come as fast as Hard's (its bots are what make it harder). */
  waveEvery: { easy: 100, normal: 75, hard: 60, pro: 60 },
  /** "One more in play in the last third". */
  lateShare: 1 / 3,
  lateExtra: 1,
  regenSeenAt: [0.5, 0.9],
  /** About two bodies' width. */
  regenClearance: 1,
  /** A quarter of a second: a returner is never noticeably late, and the search costs a fifteenth of what it did. */
  regenRetry: 0.25,
};

/** The squad a run plays with for the picked team size: the team size, at most `maxSquad` (a map may allow bigger teams). */
export function squadSize(picked: number, rules: ExtractionRules = EXTRACTION): number {
  return Math.min(picked, rules.maxSquad);
}
