import { describe, expect, it } from 'vitest';
import { loadAdaptiveRating, saveAdaptiveRating } from './adaptiveRating';
import { SETTINGS_KEY, SETTINGS_VERSION } from './storage';

/** A Storage in memory, starting with one saved settings object. */
function memory(fields: Record<string, unknown> = {}): Storage {
  const items = new Map<string, string>([[SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...fields })]]);
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  } as unknown as Storage;
}

describe("adaptive difficulty's saved rating (AD1)", () => {
  it('starts at the Opponents level picked when nothing is saved', () => {
    expect(loadAdaptiveRating('easy', 2, memory())).toBe(0);
    expect(loadAdaptiveRating('normal', 2, memory())).toBe(1);
    expect(loadAdaptiveRating('hard', 2, memory())).toBe(2);
  });

  it('carries on from the saved rating while the same level is picked', () => {
    const s = memory();
    saveAdaptiveRating('normal', 1.3456, s);
    expect(loadAdaptiveRating('normal', 2, s)).toBe(1.346);
  });

  it('starts again from a newly picked level', () => {
    const s = memory();
    saveAdaptiveRating('normal', 1.4, s);
    expect(loadAdaptiveRating('hard', 2, s)).toBe(2);
    expect(loadAdaptiveRating('easy', 2, s)).toBe(0);
  });

  it('keeps it up to the top level offered, and reads junk as nothing saved', () => {
    expect(loadAdaptiveRating('hard', 2, memory({ adaptiveFrom: 'hard', adaptiveRating: 2.6 }))).toBe(2);
    expect(loadAdaptiveRating('hard', 3, memory({ adaptiveFrom: 'hard', adaptiveRating: 2.6 }))).toBe(2.6);
    expect(loadAdaptiveRating('normal', 2, memory({ adaptiveFrom: 'normal', adaptiveRating: 'lots' }))).toBe(1);
    expect(loadAdaptiveRating('normal', 2, memory({ adaptiveFrom: 'normal', adaptiveRating: 9 }))).toBe(1);
    expect(loadAdaptiveRating('normal', 2, memory({ adaptiveFrom: 'expert', adaptiveRating: 1.5 }))).toBe(1);
  });

  it('works without storage', () => {
    expect(loadAdaptiveRating('normal', 2, null)).toBe(1);
    expect(() => saveAdaptiveRating('normal', 1.2, null)).not.toThrow();
  });
});
