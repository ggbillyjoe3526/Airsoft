import type { LevelTable } from '../progress/levels';
import { addXp, type LevelUp, type Progress } from '../progress/progress';
import { type MatchOutcome, matchXp, type XpEarned } from '../progress/xp';
import type { NotCounted } from '../ui/recordsView';
import { addMatch, type MatchResult, type RecordNews, type Records } from './records';

/**
 * What settling a finished match changed: the records' news (null: nothing recorded), its XP (null: none) and what
 * that XP did to the player's level (null: no XP, LV1).
 */
export interface SettledMatch {
  news: RecordNews | null;
  xp: XpEarned | null;
  levelUp: LevelUp | null;
}

/** Why a match gives no XP (LV1): Dev settings that change play were on, or it used dev content. */
export type NoXp = 'dev' | 'devContent';

/** What decides whether a match counts and gives XP. */
export interface MatchStanding {
  /** The standard match (M20): custom rules never go into the records (they still give XP). */
  standardRules: boolean;
  /** Dev settings that change play were on (M24; Disable levelling is one). */
  devAssisted: boolean;
  /** The match uses dev content (M35, newGamePicks.ts matchUsesDev). */
  devContentUsed: boolean;
}

/**
 * Why a match stays out of the records (custom rules first, then Dev settings, then dev content; '' when it counts) and
 * why it gives no XP (Dev settings, then dev content; null when it gives XP). Pure.
 */
export function matchStanding(m: MatchStanding): { notCounted: NotCounted; noXp: NoXp | null } {
  const noXp = m.devAssisted ? 'dev' : m.devContentUsed ? 'devContent' : null;
  return { notCounted: !m.standardRules ? 'rules' : (noXp ?? ''), noXp };
}

/**
 * A finished match goes into the records and gives its XP (audit CORE-06; LV1): `result` and `outcome` are the
 * session's once-only takes (null when already taken, not counted or giving no XP). Changes `records` and `progress`
 * (the XP, and the items the levels it reaches unlock); the caller saves them.
 */
export function settleMatch(records: Records, progress: Progress, levels: LevelTable, result: MatchResult | null, outcome: MatchOutcome | null): SettledMatch {
  const news = result ? addMatch(records, result) : null;
  const xp = outcome ? matchXp(levels.xp, outcome) : null;
  const levelUp = xp ? addXp(progress, levels, xp.total) : null;
  return { news, xp, levelUp };
}

/**
 * A match's two once-only takes (audit POOL-25): its result for the records and its outcome for XP. Each is taken at
 * most once, on the first call after the match is decided, whatever comes back: a match played with Dev help (`pays`
 * false) never gives XP, even if the help is switched off by the next call, and a match with custom rules (`counts`
 * false) gives XP but is not recorded. Pure, so the levelling's integrity is tested without a page.
 */
export class MatchTakes {
  private resultTaken = false;
  private outcomeTaken = false;

  /** The result from `make`, once the match is `over`, if it `counts`; null otherwise and on every later call. */
  result<T>(over: boolean, counts: boolean, make: () => T): T | null {
    if (!over || this.resultTaken) return null;
    this.resultTaken = true;
    return counts ? make() : null;
  }

  /** The outcome from `make`, once the match is `over`, if it `pays` XP; null otherwise and on every later call. */
  outcome<T>(over: boolean, pays: boolean, make: () => T): T | null {
    if (!over || this.outcomeTaken) return null;
    this.outcomeTaken = true;
    return pays ? make() : null;
  }
}
