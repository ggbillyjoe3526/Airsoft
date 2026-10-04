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
