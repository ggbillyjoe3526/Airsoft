import { describe, expect, it } from 'vitest';
import { isEmpty, summarize } from './saveFile';

describe('save summary edge cases (M31)', () => {
  it('is all zeros for no stores, null stores and stores of the wrong shape', () => {
    const zero = { fc: 0, tokens: 0, items: 0, matches: 0 };
    expect(summarize({})).toEqual(zero);
    expect(summarize({ collection: null, records: null })).toEqual(zero);
    expect(summarize({ collection: 'junk', records: [1, 2] })).toEqual(zero);
    expect(summarize({ collection: { owned: 5 }, records: { results: 'x' } })).toEqual(zero);
  });

  it('counts copies, not kinds of item, and every difficulty and mode of the records', () => {
    const s = summarize({
      collection: { owned: { a: 1, b: 3, c: 2 }, fc: 7, tokens: 2 },
      records: { results: { 'easy.elimination': { wins: 2, losses: 1 }, 'hard.attackDefend': { wins: 0, losses: 4 } } },
    });
    expect(s).toEqual({ fc: 7, tokens: 2, items: 6, matches: 7 });
  });

  it('counts a bad field as zero without dropping the good ones', () => {
    const s = summarize({
      collection: { owned: { a: 2, b: -1, c: 1.5, d: '3', e: null }, fc: -5, tokens: 1.5 },
      records: { results: { 'easy.elimination': { wins: '2', losses: 3 }, 'bad': 7, 'worse': null } },
    });
    expect(s).toEqual({ fc: 0, tokens: 0, items: 2, matches: 3 });
  });

  it('isEmpty: true only when no store holds anything', () => {
    expect(isEmpty({})).toBe(true);
    expect(isEmpty({ settings: null, keyBindings: null, records: null, collection: null })).toBe(true);
    expect(isEmpty({ settings: null, collection: { fc: 0 } })).toBe(false);
    // An empty object is still something saved.
    expect(isEmpty({ keyBindings: {} })).toBe(false);
  });
});
