import { describe, expect, it } from 'vitest';
import { itemKey, newCollection } from '../pool/collection';
import { GAME_POOL } from '../pool/gamePool';
import { emptyRecords, resultKey } from './records';
import { MatchTakes, matchStanding, settleMatch } from './settleMatch';

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
    expect(settleMatch(records, collection, null, null, GAME_POOL.economy, false)).toEqual({ news: null, pay: null, haul: null });
    expect(records).toEqual(emptyRecords());
    const off = settleMatch(records, collection, null, OUTCOME, GAME_POOL.economy, true);
    expect(off.pay).toBeNull();
    expect(collection.fc).toBe(fc);
  });
});

describe('an Extraction haul (M44)', () => {
  const grip = GAME_POOL.assets.find((a) => a.category === 'grip')!;
  const HAUL = { fc: 85, items: [{ asset: grip.id, tier: 'epic' }] };

  it('goes into the collection with the pay, in the same settle (one save), the parts revealed new or spare', () => {
    const collection = newCollection(GAME_POOL, 1);
    const fc = collection.fc;
    const settled = settleMatch(emptyRecords(), collection, null, { ...OUTCOME, haul: HAUL }, GAME_POOL.economy, false);
    expect(collection.fc).toBe(fc + settled.pay!.total + 85);
    expect(collection.owned[itemKey(grip.id, 'epic')]).toBe(1);
    expect(settled.haul).toEqual([{ item: HAUL.items[0], isNew: true }]);
  });

  it('is never granted when the run is not paid: the Armory off, Dev settings or dev content, or already taken', () => {
    const collection = newCollection(GAME_POOL, 1);
    const before = structuredClone(collection);
    const off = settleMatch(emptyRecords(), collection, null, { ...OUTCOME, haul: HAUL }, GAME_POOL.economy, true);
    expect(off.haul).toBeNull();
    // A run that doesn't pay (Dev settings, dev content) or was settled already has no outcome to carry a haul.
    expect(settleMatch(emptyRecords(), collection, null, null, GAME_POOL.economy, false).haul).toBeNull();
    expect(collection).toEqual(before);
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

describe('what keeps a match out of the records and what pays (M35 matchStanding)', () => {
  const bools = [true, false];
  const expected = (standardRules: boolean, devAssisted: boolean, devContentUsed: boolean) => {
    const unpaid = devAssisted ? 'dev' : devContentUsed ? 'devContent' : null;
    // Custom rules come first for the records; the pay never looks at them.
    return { notCounted: !standardRules ? 'rules' : (unpaid ?? ''), unpaid };
  };

  it('counts and pays a standard match with nothing dev about it', () => {
    expect(matchStanding({ standardRules: true, devAssisted: false, devContentUsed: false })).toEqual({ notCounted: '', unpaid: null });
  });

  it('gives each of the eight combinations the reasons the rule names', () => {
    for (const standardRules of bools) for (const devAssisted of bools) for (const devContentUsed of bools) {
      expect(matchStanding({ standardRules, devAssisted, devContentUsed }), JSON.stringify({ standardRules, devAssisted, devContentUsed })).toEqual(
        expected(standardRules, devAssisted, devContentUsed),
      );
    }
  });

  it('keeps custom rules out of the records but still pays them', () => {
    expect(matchStanding({ standardRules: false, devAssisted: false, devContentUsed: false })).toEqual({ notCounted: 'rules', unpaid: null });
  });

  it('names Dev settings before dev content, for the records and for the pay', () => {
    expect(matchStanding({ standardRules: true, devAssisted: true, devContentUsed: true })).toEqual({ notCounted: 'dev', unpaid: 'dev' });
    expect(matchStanding({ standardRules: true, devAssisted: false, devContentUsed: true })).toEqual({ notCounted: 'devContent', unpaid: 'devContent' });
    expect(matchStanding({ standardRules: true, devAssisted: true, devContentUsed: false })).toEqual({ notCounted: 'dev', unpaid: 'dev' });
  });

  it('names custom rules first for the records while the pay still names the dev reason', () => {
    expect(matchStanding({ standardRules: false, devAssisted: true, devContentUsed: true })).toEqual({ notCounted: 'rules', unpaid: 'dev' });
    expect(matchStanding({ standardRules: false, devAssisted: false, devContentUsed: true })).toEqual({ notCounted: 'rules', unpaid: 'devContent' });
    expect(matchStanding({ standardRules: false, devAssisted: true, devContentUsed: false })).toEqual({ notCounted: 'rules', unpaid: 'dev' });
  });
});
