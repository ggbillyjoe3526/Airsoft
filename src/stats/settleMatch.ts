import { type Dispensed, earn, type Earnings, grantHaul, type MatchOutcome, matchPay } from '../pool/armory';
import type { Collection } from '../pool/collection';
import type { Economy } from '../pool/pool';
import type { NotCounted } from '../ui/recordsView';
import { addMatch, type MatchResult, type RecordNews, type Records } from './records';

/**
 * What settling a finished match changed: the records' news (null: nothing recorded), its pay (null: none) and the
 * Extraction haul's parts as they went into the collection (null: no haul granted, M44).
 */
export interface SettledMatch {
  news: RecordNews | null;
  pay: Earnings | null;
  haul: Dispensed[] | null;
}

/** What decides whether a match counts and pays. */
export interface MatchStanding {
  /** The standard match (M20): custom rules never go into the records (they still pay). */
  standardRules: boolean;
  /** Dev settings that change play were on (M24). */
  devAssisted: boolean;
  /** The match uses dev content (M35, newGamePicks.ts matchUsesDev). */
  devContentUsed: boolean;
}

/**
 * Why a match stays out of the records (custom rules first, then Dev settings, then dev content; '' when it counts) and
 * why it pays nothing (Dev settings, then dev content; null when it pays). Pure.
 */
export function matchStanding(m: MatchStanding): { notCounted: NotCounted; unpaid: 'dev' | 'devContent' | null } {
  const unpaid = m.devAssisted ? 'dev' : m.devContentUsed ? 'devContent' : null;
  return { notCounted: !m.standardRules ? 'rules' : (unpaid ?? ''), unpaid };
}

/**
 * A finished match goes into the records and pays its Field Credits (audit CORE-06): `result` and `outcome` are the
 * session's once-only takes (null when already taken, not counted or not paid). Changes `records` and `collection`;
 * the caller saves them. With the Armory switched off (Dev settings) nothing is paid. An Extraction haul (M44) is
 * granted with the pay, so it reaches the collection only from a run that pays, in the caller's one save.
 */
export function settleMatch(
  records: Records,
  collection: Collection,
  result: MatchResult | null,
  outcome: MatchOutcome | null,
  economy: Economy,
  armoryOff: boolean,
): SettledMatch {
  const news = result ? addMatch(records, result) : null;
  const pay = outcome ? matchPay(economy, outcome, armoryOff) : null;
  if (pay) earn(collection, pay.total);
  const haul = pay && outcome?.haul ? grantHaul(collection, outcome.haul) : null;
  return { news, pay, haul };
}

/**
 * A match's two once-only takes (audit POOL-25): its result for the records and its outcome for Field Credits. Each is
 * taken at most once, on the first call after the match is decided, whatever comes back: a match played with Dev help
 * (`pays` false) is never paid, even if the help is switched off by the next call, and a match with custom rules
 * (`counts` false) pays but is not recorded. Pure, so the economy's integrity is tested without a page.
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

  /** The outcome from `make`, once the match is `over`, if it `pays`; null otherwise and on every later call. */
  outcome<T>(over: boolean, pays: boolean, make: () => T): T | null {
    if (!over || this.outcomeTaken) return null;
    this.outcomeTaken = true;
    return pays ? make() : null;
  }
}
