import { describe, expect, it } from 'vitest';
import { RECORDS_KEY, STATS } from '../config/matchInfo';
import { addMatch, emptyRecords, loadRecords, type MatchResult, type RecordStore, resultKey, runResultOf, saveRecords } from './records';

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
    expect(r).toEqual({ ...emptyRecords(), results: old.results, bestAccuracy: 0.4, streak: 0, bestStreak: 3 });
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

describe('ruleset records (M39 criterion 4)', () => {
  it("files a named ruleset's match under <difficulty>.<mode>.<ruleset>, Skirmish's under the plain cell", () => {
    const r = emptyRecords();
    addMatch(r, win({ difficulty: 'pro', ruleset: 'tournament' }));
    addMatch(r, win({ difficulty: 'easy', ruleset: 'proCqb', won: false }));
    addMatch(r, win({ ruleset: '' }));
    expect(resultKey('pro', 'elimination', 'tournament')).toBe('pro.elimination.tournament');
    expect(resultKey('pro', 'elimination', '')).toBe('pro.elimination');
    expect(r.results['pro.elimination.tournament']).toEqual({ wins: 1, losses: 0 });
    expect(r.results['easy.elimination.proCqb']).toEqual({ wins: 0, losses: 1 });
    expect(r.results['normal.elimination']).toEqual({ wins: 1, losses: 0 });
    expect(r.results['pro.elimination']).toBeUndefined();
  });

  it('saves them beside the plain cells, so old records load unchanged and a build from before M39 keeps them', () => {
    const old = { version: 1, results: { 'easy.elimination': { wins: 2, losses: 1 } }, bestAccuracy: 0.4, streak: 0, bestStreak: 3 };
    const store = memory({ [RECORDS_KEY]: JSON.stringify(old) });
    const r = loadRecords(store);
    expect(r).toEqual({ ...emptyRecords(), results: old.results, bestAccuracy: 0.4, streak: 0, bestStreak: 3 });
    addMatch(r, win({ difficulty: 'hard', mode: 'attackDefend', ruleset: 'tournament' }));
    saveRecords(r, store);
    const saved = JSON.parse(store.data.get(RECORDS_KEY)!);
    expect(saved.version).toBe(1); // no format bump
    expect(saved.results).toEqual(old.results);
    expect(saved.rulesetResults).toEqual({ 'hard.attackDefend.tournament': { wins: 1, losses: 0 } });
    expect(loadRecords(store).results).toEqual({ ...old.results, 'hard.attackDefend.tournament': { wins: 1, losses: 0 } });
    // A build from before M39 rewrites `results` with what it knows and keeps the field it doesn't (overStored).
    saveRecords({ ...emptyRecords(), results: { 'easy.elimination': { wins: 3, losses: 1 } } }, store);
    expect(loadRecords(store).results['hard.attackDefend.tournament']).toEqual({ wins: 1, losses: 0 });
    // Malformed ruleset keys are dropped one by one.
    const junk = memory({ [RECORDS_KEY]: JSON.stringify({ version: 1, rulesetResults: { 'pro.elimination': { wins: 1, losses: 0 }, 'a.b.c.d': { wins: 1 }, 'pro.elimination.custom': { wins: 2, losses: 0 } } }) });
    expect(Object.keys(loadRecords(junk).results)).toEqual(['pro.elimination.custom']);
  });
});

describe('Extraction records (M47)', () => {
  const run = (over: Partial<MatchResult> = {}, haulFc = 120, finds = 2, seconds = 200): MatchResult => ({
    difficulty: 'normal',
    mode: 'extraction',
    won: true,
    hits: 0,
    bbsFired: 0,
    run: { haulFc, finds, seconds },
    ...over,
  });

  it('counts runs and extractions in the run’s cell, and leaves the match-win streak alone', () => {
    const r = emptyRecords();
    addMatch(r, win());
    addMatch(r, run());
    addMatch(r, run({ won: false }, 0, 0));
    expect(r.results[resultKey('normal', 'extraction')]).toEqual({ wins: 1, losses: 1 });
    expect(r).toMatchObject({ streak: 1, bestStreak: 1 });
  });

  it('keeps extractions in a row, the best haul and the fastest extraction with a find, and says when each is beaten', () => {
    const r = emptyRecords();
    expect(addMatch(r, run({}, 120, 2, 200))).toMatchObject({ bestHaul: true, bestExtractionStreak: true, fastestExtraction: true, bestStreak: false });
    expect(addMatch(r, run({}, 80, 1, 150))).toMatchObject({ bestHaul: false, bestExtractionStreak: true, fastestExtraction: true });
    // Out empty-handed but quicker: the streak goes on, but a run with no finds sets no fastest time.
    expect(addMatch(r, run({}, 0, 0, 30))).toMatchObject({ bestHaul: false, bestExtractionStreak: true, fastestExtraction: false });
    expect(r).toMatchObject({ bestHaul: 120, extractionStreak: 3, bestExtractionStreak: 3, fastestExtraction: 150 });
    // A run you don't get out of ends the streak and sets nothing.
    expect(addMatch(r, run({ won: false }, 0, 0, 20))).toMatchObject({ bestHaul: false, bestExtractionStreak: false, fastestExtraction: false });
    expect(r).toMatchObject({ extractionStreak: 0, bestExtractionStreak: 3, fastestExtraction: 150 });
    expect(addMatch(r, run({}, 300, 3, 400)).bestHaul).toBe(true);
    expect(r.bestHaul).toBe(300);
  });

  it('saves and loads them, and loads a save from before M47 with empty ones', () => {
    const store = memory();
    const r = emptyRecords();
    addMatch(r, run());
    saveRecords(r, store);
    expect(loadRecords(store)).toEqual(r);
    const old = { version: 1, results: { 'normal.elimination': { wins: 2, losses: 1 } }, bestAccuracy: 0.3, streak: 1, bestStreak: 4 };
    const loaded = loadRecords(memory({ [RECORDS_KEY]: JSON.stringify(old) }));
    expect(loaded).toEqual({ ...emptyRecords(), results: old.results, bestAccuracy: 0.3, streak: 1, bestStreak: 4 });
    const bad = { ...old, bestHaul: -5, extractionStreak: 'x', bestExtractionStreak: 2.5, fastestExtraction: 0 };
    expect(loadRecords(memory({ [RECORDS_KEY]: JSON.stringify(bad) }))).toMatchObject({ bestHaul: null, extractionStreak: 0, bestExtractionStreak: 0, fastestExtraction: null });
  });
});

describe('an Extraction run’s record from its haul (M47)', () => {
  it('adds up the FC got out with and counts the finds (FC or a part), leaving a BB resupply out', () => {
    const part = { asset: 'x', tier: 'rare' };
    expect(runResultOf([{ fc: 40, resupply: false, item: null }, { fc: 0, resupply: false, item: part }, { fc: 0, resupply: true, item: null }], 123.5)).toEqual({ haulFc: 40, finds: 2, seconds: 123.5 });
    expect(runResultOf([], 30)).toEqual({ haulFc: 0, finds: 0, seconds: 30 });
  });
});

describe('records from a newer version of the store (M56, audit POOL-01)', () => {
  it('are neither read nor overwritten: a match played meanwhile lasts for the session only', () => {
    const newer = JSON.stringify({ version: 2, results: { 'normal.elimination': { wins: 40, losses: 2 } }, streak: 9, bestStreak: 12 });
    const store = memory({ [RECORDS_KEY]: newer });
    const r = loadRecords(store);
    expect(r).toEqual(emptyRecords());
    addMatch(r, win());
    saveRecords(r, store);
    expect(store.data.get(RECORDS_KEY)).toBe(newer);
    // Records of this version are saved over as before.
    store.data.set(RECORDS_KEY, JSON.stringify({ version: 1, streak: 0 }));
    saveRecords(r, store);
    expect(loadRecords(store)).toEqual(r);
  });
});
