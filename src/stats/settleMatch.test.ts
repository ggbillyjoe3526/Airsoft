import { describe, expect, it } from 'vitest';
import { newCollection } from '../pool/collection';
import { GAME_POOL } from '../pool/gamePool';
import { emptyRecords, resultKey } from './records';
import { MatchTakes, settleMatch } from './settleMatch';

const RESULT = { difficulty: 'normal', mode: 'elimination', won: true, hits: 7, bbsFired: 40 } as const;
const OUTCOME = { won: true, roundsWon: 5, hits: 7, winsNeeded: 5, difficulty: 'normal' } as const;

describe('settling a finished match (audit CORE-06)', () => {
  it('records it and pays its Field Credits in one go, with no screen involved', () => {
    const records = emptyRecords();
    const collection = newCollection(GAME_POOL, 1);
    const fc = collection.fc;
    const settled = settleMatch(records, collection, RESULT, OUTCOME, GAME_POOL.economy, false);
    expect(records.results[resultKey('normal', 'elimination')]).toEqual({ wins: 1, losses: 0 });
    expect(settled.news).not.toBeNull();
    expect(settled.pay!.total).toBeGreaterThan(0);
    expect(collection.fc).toBe(fc + Math.round(settled.pay!.total));
  });

  it('changes nothing for a match already taken, and pays nothing with the Armory off', () => {
    const records = emptyRecords();
    const collection = newCollection(GAME_POOL, 1);
    const fc = collection.fc;
    expect(settleMatch(records, collection, null, null, GAME_POOL.economy, false)).toEqual({ news: null, pay: null });
    expect(records).toEqual(emptyRecords());
    const off = settleMatch(records, collection, null, OUTCOME, GAME_POOL.economy, true);
    expect(off.pay).toBeNull();
    expect(collection.fc).toBe(fc);
  });
});

describe('a match taken once for the records and once for pay (audit POOL-25)', () => {
  it('gives nothing before the match is decided, then once only', () => {
    const t = new MatchTakes();
    expect(t.result(false, true, () => RESULT)).toBeNull();
    expect(t.outcome(false, true, () => OUTCOME)).toBeNull();
    expect(t.result(true, true, () => RESULT)).toBe(RESULT);
    expect(t.outcome(true, true, () => OUTCOME)).toBe(OUTCOME);
    expect(t.result(true, true, () => RESULT)).toBeNull();
    expect(t.outcome(true, true, () => OUTCOME)).toBeNull();
  });

  it('never pays a Dev-assisted match, even when the help is off by the next call', () => {
    const t = new MatchTakes();
    expect(t.outcome(true, false, () => OUTCOME)).toBeNull();
    expect(t.outcome(true, true, () => OUTCOME)).toBeNull();
  });

  it('pays a match with custom rules without recording it', () => {
    const t = new MatchTakes();
    const records = emptyRecords();
    const collection = newCollection(GAME_POOL, 1);
    const settled = settleMatch(records, collection, t.result(true, false, () => RESULT), t.outcome(true, true, () => OUTCOME), GAME_POOL.economy, false);
    expect(settled.news).toBeNull();
    expect(records).toEqual(emptyRecords());
    expect(settled.pay!.total).toBeGreaterThan(0);
  });

  it('pays nothing with the Armory off, and gives no second chance once it is back on', () => {
    const t = new MatchTakes();
    const collection = newCollection(GAME_POOL, 1);
    expect(settleMatch(emptyRecords(), collection, null, t.outcome(true, true, () => OUTCOME), GAME_POOL.economy, true).pay).toBeNull();
    expect(settleMatch(emptyRecords(), collection, null, t.outcome(true, true, () => OUTCOME), GAME_POOL.economy, false).pay).toBeNull();
    expect(collection.fc).toBe(0);
  });
});
