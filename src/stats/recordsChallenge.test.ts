import { describe, expect, it } from 'vitest';
import { RECORDS_KEY } from '../config/matchInfo';
import { RANGE_CHALLENGE } from '../config/range';
import { addChallengeRun, emptyRecords, loadRecords, type RecordStore, saveRecords } from './records';

function memory(initial: Record<string, string> = {}): RecordStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}
const saved = (bestChallenge: unknown) => memory({ [RECORDS_KEY]: JSON.stringify({ version: 1, bestChallenge }) });

describe('the timed challenge best in the records (M93)', () => {
  it('starts empty and keeps only runs that beat the best, saying so', () => {
    const r = emptyRecords();
    expect(r.bestChallenge).toEqual({});
    expect(addChallengeRun(r, 'range', 0)).toBe(false);
    expect(addChallengeRun(r, 'range', 7)).toBe(true);
    expect(addChallengeRun(r, 'range', 7)).toBe(false);
    expect(addChallengeRun(r, 'range', 5)).toBe(false);
    expect(addChallengeRun(r, 'range', 9)).toBe(true);
    expect(r.bestChallenge).toEqual({ range: 9 });
    expect(addChallengeRun(r, 'other', 1)).toBe(true);
    expect(r.bestChallenge).toEqual({ range: 9, other: 1 });
  });

  it('is saved and loaded back', () => {
    const store = memory();
    const r = emptyRecords();
    addChallengeRun(r, RANGE_CHALLENGE.course, 12);
    saveRecords(r, store);
    expect(loadRecords(store).bestChallenge).toEqual({ [RANGE_CHALLENGE.course]: 12 });
  });

  it('loads as empty from a save made before it, and from nothing at all', () => {
    expect(loadRecords(memory({ [RECORDS_KEY]: JSON.stringify({ version: 1, streak: 2 }) })).bestChallenge).toEqual({});
    expect(loadRecords(memory()).bestChallenge).toEqual({});
    expect(loadRecords(null).bestChallenge).toEqual({});
  });

  it('drops invalid course names and values one by one, keeping the good ones', () => {
    const r = loadRecords(saved({ range: 8, 'bad name': 5, '9x': 4, '': 3, neg: -2, zero: 0, frac: 2.5, text: '7', nul: null, big: 11 }));
    expect(r.bestChallenge).toEqual({ range: 8, big: 11 });
  });

  it('ignores a bestChallenge that is not an object, without losing other fields', () => {
    for (const bad of [5, 'x', null, true]) {
      const store = memory({ [RECORDS_KEY]: JSON.stringify({ version: 1, streak: 3, bestChallenge: bad }) });
      const r = loadRecords(store);
      expect(r.bestChallenge).toEqual({});
      expect(r.streak).toBe(3);
    }
  });
});
