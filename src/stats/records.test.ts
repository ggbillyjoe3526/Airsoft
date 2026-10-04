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
