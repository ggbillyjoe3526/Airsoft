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
};

/** The squad a run plays with for the picked team size: the team size, at most `maxSquad` (a map may allow bigger teams). */
export function squadSize(picked: number, rules: ExtractionRules = EXTRACTION): number {
  return Math.min(picked, rules.maxSquad);
}
