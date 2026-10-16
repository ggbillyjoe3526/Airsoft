import { describe, expect, it } from 'vitest';
import { GAME_LEVELS } from '../progress/gameLevels';
import { unlocksUpTo } from '../progress/levels';
import { isEmpty, summarize } from './saveFile';

/** The items every level up to `level` gives (the starting kit at 0). */
const kitTo = (level: number): number => unlocksUpTo(GAME_LEVELS, level).length;

describe('save summary edge cases (M31, LV1)', () => {
  it('is a new player\'s for no stores, null stores and stores of the wrong shape: level 0 with the starting kit', () => {
    const zero = { level: 0, xp: 0, unlocked: kitTo(0), matches: 0 };
    expect(kitTo(0)).toBeGreaterThan(0);
    expect(summarize({})).toEqual(zero);
    expect(summarize({ progress: null, records: null })).toEqual(zero);
    expect(summarize({ progress: 'junk', records: [1, 2] })).toEqual(zero);
    expect(summarize({ progress: { xp: 'lots', unlocked: 5 }, records: { results: 'x' } })).toEqual(zero);
  });

  it('gives the level the XP reaches, the items unlocked and every difficulty and mode of the records', () => {
    const level2 = GAME_LEVELS.levels[2]!.total;
    const s = summarize({
      progress: { version: 1, xp: level2 + 5, unlocked: [...unlocksUpTo(GAME_LEVELS, 2), 'extra-item'], rev: 4 },
      records: { results: { 'easy.elimination': { wins: 2, losses: 1 }, 'hard.attackDefend': { wins: 0, losses: 4 } } },
    });
    expect(s).toEqual({ level: 2, xp: level2 + 5, unlocked: kitTo(2) + 1, matches: 7 });
  });

  it('counts what the level gives even when the saved list lacks it (BP5: a save before the first XP showed 0)', () => {
    expect(summarize({ progress: { xp: 0 } }).unlocked).toBe(kitTo(0));
    const level2 = GAME_LEVELS.levels[2]!.total;
    expect(summarize({ progress: { xp: level2, unlocked: [] } }).unlocked).toBe(kitTo(2));
    // Listed twice, or listed and given by the level: counted once.
    const first = unlocksUpTo(GAME_LEVELS, 0)[0]!;
    expect(summarize({ progress: { xp: 0, unlocked: [first, first] } }).unlocked).toBe(kitTo(0));
  });

  it('never gives a level past the cap', () => {
    const top = GAME_LEVELS.levels[GAME_LEVELS.cap]!.total;
    expect(summarize({ progress: { xp: top * 10, unlocked: [] } }).level).toBe(GAME_LEVELS.cap);
  });

  it('counts a bad field as zero without dropping the good ones', () => {
    const s = summarize({
      progress: { xp: -5, unlocked: ['extra-a', 7, null, 'extra-b'] },
      records: { results: { 'easy.elimination': { wins: '2', losses: 3 }, 'bad': 7, 'worse': null } },
    });
    expect(s).toEqual({ level: 0, xp: 0, unlocked: kitTo(0) + 2, matches: 3 });
    expect(summarize({ progress: { xp: 1.5 } }).xp).toBe(0);
  });

  it('isEmpty: true only when no store holds anything', () => {
    expect(isEmpty({})).toBe(true);
    expect(isEmpty({ settings: null, keyBindings: null, records: null, progress: null })).toBe(true);
    expect(isEmpty({ settings: null, progress: { xp: 0 } })).toBe(false);
    // An empty object is still something saved.
    expect(isEmpty({ keyBindings: {} })).toBe(false);
  });
});
