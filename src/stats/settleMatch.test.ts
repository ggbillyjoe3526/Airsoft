import { describe, expect, it } from 'vitest';
import { newCollection } from '../pool/collection';
import { GAME_POOL } from '../pool/gamePool';
import { emptyRecords, resultKey } from './records';
import { settleMatch } from './settleMatch';

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
