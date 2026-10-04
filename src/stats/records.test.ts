import { describe, expect, it } from 'vitest';
import { RECORDS_KEY, STATS } from '../config/matchInfo';
import { addMatch, emptyRecords, loadRecords, type MatchResult, type RecordStore, resultKey, saveRecords } from './records';

function memory(initial: Record<string, string> = {}): RecordStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const win = (over: Partial<MatchResult> = {}): MatchResult => ({ difficulty: 'normal', mode: 'elimination', won: true, hits: 0, bbsFired: 0, ...over });

describe('local records (M19)', () => {
  it('counts wins and losses per difficulty and mode', () => {
    const r = emptyRecords();
    addMatch(r, win());
    addMatch(r, win({ won: false }));
    addMatch(r, win({ difficulty: 'hard', mode: 'attackDefend' }));
    expect(r.results[resultKey('normal', 'elimination')]).toEqual({ wins: 1, losses: 1 });
    expect(r.results[resultKey('hard', 'attackDefend')]).toEqual({ wins: 1, losses: 0 });
    expect(r.results[resultKey('easy', 'elimination')]).toBeUndefined();
  });

  it('keeps the longest run of wins and says when it is beaten', () => {
    const r = emptyRecords();
    expect(addMatch(r, win()).bestStreak).toBe(true);
    expect(addMatch(r, win()).bestStreak).toBe(true);
    expect(addMatch(r, win({ won: false })).bestStreak).toBe(false);
    expect(r).toMatchObject({ streak: 0, bestStreak: 2 });
    expect(addMatch(r, win()).bestStreak).toBe(false);
    expect(r).toMatchObject({ streak: 1, bestStreak: 2 });
  });

  it('keeps the best accuracy, only over matches with enough BBs fired', () => {
    const r = emptyRecords();
    const few = STATS.minBBsForAccuracyRecord - 1;
    expect(addMatch(r, win({ hits: few, bbsFired: few })).bestAccuracy).toBe(false);
    expect(r.bestAccuracy).toBeNull();
    expect(addMatch(r, win({ hits: 10, bbsFired: 40 })).bestAccuracy).toBe(true);
    expect(addMatch(r, win({ hits: 5, bbsFired: 40 })).bestAccuracy).toBe(false);
    expect(r.bestAccuracy).toBe(0.25);
  });

  it('saves and loads, and survives garbage, other versions and blocked storage', () => {
    const store = memory();
    const r = emptyRecords();
    addMatch(r, win({ hits: 12, bbsFired: 40 }));
    saveRecords(r, store);
    expect(loadRecords(store)).toEqual(r);
    expect(loadRecords(memory({ [RECORDS_KEY]: '{oops' }))).toEqual(emptyRecords());
    expect(loadRecords(memory({ [RECORDS_KEY]: JSON.stringify({ version: 99, streak: 3 }) }))).toEqual(emptyRecords());
    expect(loadRecords(null)).toEqual(emptyRecords());
    const throwing: RecordStore = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadRecords(throwing)).toEqual(emptyRecords());
    expect(() => saveRecords(r, throwing)).not.toThrow();
  });

  it('drops bad fields one by one', () => {
    const raw = { version: 1, results: { 'normal.elimination': { wins: 2, losses: -1 }, bad: 7 }, bestAccuracy: 3, streak: 'x', bestStreak: 4 };
    const r = loadRecords(memory({ [RECORDS_KEY]: JSON.stringify(raw) }));
    expect(r.results['normal.elimination']).toEqual({ wins: 2, losses: 0 });
    expect(r.results.bad).toBeUndefined();
    expect(r.bestAccuracy).toBeNull();
    expect(r).toMatchObject({ streak: 0, bestStreak: 4 });
  });

  it('drops results under keys that are no difficulty and mode, keeping a newer build’s well-formed ones (audit POOL-21)', () => {
    const raw = { version: 1, results: { 'normal.elimination': { wins: 1, losses: 0 }, junk: { wins: 3, losses: 0 }, 'a.b.c': { wins: 1, losses: 1 }, 'insane.capture': { wins: 1, losses: 0 } } };
    const r = loadRecords(memory({ [RECORDS_KEY]: JSON.stringify(raw) }));
    expect(Object.keys(r.results).sort()).toEqual(['insane.capture', 'normal.elimination']);
  });
});

describe('Pro records (M36 criterion 5)', () => {
  it('files a Pro match under pro.<mode> and reads it back after a save', () => {
    const store = memory();
    const r = emptyRecords();
    addMatch(r, win({ difficulty: 'pro', mode: 'attackDefend' }));
    addMatch(r, win({ difficulty: 'pro', mode: 'attackDefend', won: false }));
    addMatch(r, win({ difficulty: 'pro', mode: 'elimination' }));
    expect(resultKey('pro', 'attackDefend')).toBe('pro.attackDefend');
    expect(r.results['pro.attackDefend']).toEqual({ wins: 1, losses: 1 });
    expect(r.results['pro.elimination']).toEqual({ wins: 1, losses: 0 });
    expect(r.results[resultKey('hard', 'attackDefend')]).toBeUndefined();
    saveRecords(r, store);
    const back = loadRecords(store);
    expect(back.results['pro.attackDefend']).toEqual({ wins: 1, losses: 1 });
    expect(back.results['pro.elimination']).toEqual({ wins: 1, losses: 0 });
  });

  it('loads records written before Pro existed unchanged, and a Pro match added after leaves them alone', () => {
    const old = { version: 1, results: { 'easy.elimination': { wins: 2, losses: 1 }, 'hard.attackDefend': { wins: 0, losses: 4 } }, bestAccuracy: 0.4, streak: 0, bestStreak: 3 };
    const store = memory({ [RECORDS_KEY]: JSON.stringify(old) });
    const r = loadRecords(store);
    expect(r).toEqual({ results: old.results, bestAccuracy: 0.4, streak: 0, bestStreak: 3 });
    expect(r.results['pro.elimination']).toBeUndefined();
    addMatch(r, win({ difficulty: 'pro' }));
    saveRecords(r, store);
    const again = loadRecords(store);
    expect(again.results['easy.elimination']).toEqual({ wins: 2, losses: 1 });
    expect(again.results['hard.attackDefend']).toEqual({ wins: 0, losses: 4 });
    expect(again.results['pro.elimination']).toEqual({ wins: 1, losses: 0 });
    expect(JSON.parse(store.data.get(RECORDS_KEY)!).version).toBe(1); // no format bump
  });
});
