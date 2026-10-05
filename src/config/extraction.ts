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
  /** While a case is being opened it makes its noise every this many seconds (bots within its Heard m come). */
  caseNoiseEvery: number;
  /** Seconds to pick up what you dropped when you were hit (plan: no opening time, so the hold ends at once). */
  dropOpenTime: number;
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
  caseNoiseEvery: 1,
  dropOpenTime: 0,
};

/** The squad a run plays with for the picked team size: the team size, at most `maxSquad` (a map may allow bigger teams). */
export function squadSize(picked: number, rules: ExtractionRules = EXTRACTION): number {
  return Math.min(picked, rules.maxSquad);
}
