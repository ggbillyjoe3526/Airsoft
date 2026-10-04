import { earn, type Earnings, type MatchOutcome, matchPay } from '../pool/armory';
import type { Collection } from '../pool/collection';
import type { Economy } from '../pool/pool';
import { addMatch, type MatchResult, type RecordNews, type Records } from './records';

/** What settling a finished match changed: the records' news (null: nothing recorded) and its pay (null: none). */
export interface SettledMatch {
  news: RecordNews | null;
  pay: Earnings | null;
}

/**
 * A finished match goes into the records and pays its Field Credits (audit CORE-06): `result` and `outcome` are the
 * session's once-only takes (null when already taken, not counted or not paid). Changes `records` and `collection`;
 * the caller saves them. With the Armory switched off (Dev settings) nothing is paid.
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
  return { news, pay };
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
