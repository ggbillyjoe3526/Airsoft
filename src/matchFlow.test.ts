import { describe, expect, it } from 'vitest';
import { matchSeed } from './matchFlow';

describe('match flow', () => {
  it('gives each match of a visit its own seed, and the seed shown replays that match as the first of a visit', () => {
    const visit = 1234567;
    expect(matchSeed(visit, 0)).toBe(visit);
    const seeds = [0, 1, 2, 3].map((k) => matchSeed(visit, k));
    expect(new Set(seeds).size).toBe(4);
    for (const s of seeds) expect(matchSeed(s, 0)).toBe(s); // ?seed=s plays s first
  });
});
