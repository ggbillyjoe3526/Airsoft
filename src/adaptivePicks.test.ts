import { describe, expect, it } from 'vitest';
import { adaptedPicks, adaptiveNote, adaptiveSetup, settleAdaptive } from './adaptivePicks';
import { DEFAULT_MATCH_RULES, DEFAULT_RULESET } from './config/matchRules';
import type { NewGamePicks } from './newGamePicks';
import { loadAdaptiveRating, saveAdaptiveRating } from './settings/adaptiveRating';
import { SETTINGS_KEY, SETTINGS_VERSION } from './settings/storage';

function memory(): Storage {
  const items = new Map<string, string>([[SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION })]]);
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  } as unknown as Storage;
}

const PICKS: NewGamePicks = { map: 'depot', mode: 'elimination', difficulty: 'normal', teammateDifficulty: 'normal', ruleset: DEFAULT_RULESET, rules: { ...DEFAULT_MATCH_RULES } };

describe('adaptive difficulty between matches (AD1)', () => {
  it('applies only with its switch on, and never to an Extraction run', () => {
    const s = memory();
    expect(adaptiveSetup(false, PICKS, false, s)).toBeNull();
    expect(adaptiveSetup(true, { ...PICKS, mode: 'extraction' }, false, s)).toBeNull();
    expect(adaptiveSetup(true, PICKS, false, s)).toEqual({ rating: 1, top: 2, from: 'normal' });
    expect(adaptiveSetup(true, { ...PICKS, mode: 'attackDefend' }, true, s)).toEqual({ rating: 1, top: 3, from: 'normal' });
  });

  it('plays the opponents as the level nearest the rating, and leaves your teammates at theirs', () => {
    const s = memory();
    saveAdaptiveRating('normal', 1.6, s);
    const setup = adaptiveSetup(true, PICKS, false, s);
    const played = adaptedPicks(PICKS, setup);
    expect(played.difficulty).toBe('hard');
    expect(played.teammateDifficulty).toBe('normal');
    expect(adaptedPicks(PICKS, null)).toBe(PICKS);
  });

  it('says on the Match screen where the other team starts', () => {
    const s = memory();
    expect(adaptiveNote(false, PICKS, false, s)).toBeNull();
    expect(adaptiveNote(true, PICKS, false, s)).toBe('Adaptive difficulty: the other team adapts to how you do, and starts this match at Normal.');
    saveAdaptiveRating('normal', 1.25, s);
    expect(adaptiveNote(true, PICKS, false, s)).toBe('Adaptive difficulty: the other team adapts to how you do, and starts this match at Normal, a little sharper.');
    expect(adaptiveNote(true, { ...PICKS, mode: 'extraction' }, false, s)).toBe("Adaptive difficulty doesn't change Extraction runs: the other team plays the Opponents level.");
  });

  it('saves what a match taught it and says so on the summary', () => {
    const s = memory();
    expect(settleAdaptive({ start: 1, next: 1.2 }, 'normal', s)).toBe('A step up: the next match starts at Normal, a little sharper.');
    expect(loadAdaptiveRating('normal', 2, s)).toBe(1.2);
    expect(settleAdaptive({ start: 1.2, next: 0.95 }, 'normal', s)).toBe('A step down: the next match starts at Normal.');
    expect(settleAdaptive({ start: 2, next: 2 }, 'hard', s)).toBe('No change: the next match starts at Hard again.');
  });

  it('learns nothing from a match other Dev settings helped', () => {
    const s = memory();
    saveAdaptiveRating('normal', 1.3, s);
    expect(settleAdaptive({ start: 1.3, next: null }, 'normal', s)).toBe('No change, as other Dev settings changed this match: the next starts at Normal, a little sharper.');
    expect(loadAdaptiveRating('normal', 2, s)).toBe(1.3);
  });
});
