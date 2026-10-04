import { describe, expect, it } from 'vitest';
import { buildsNewMatch, matchSeed } from './matchFlow';

describe('match flow', () => {
  it('builds a new match for Play Again, even with nothing changed (audit SIM-08)', () => {
    expect(buildsNewMatch({ started: true, loaded: 'match', matchOver: true, setupChanged: false })).toBe(true);
    expect(buildsNewMatch({ started: true, loaded: 'match', matchOver: true, setupChanged: true })).toBe(true);
  });

  it('keeps the match for Resume, and reuses one built for a Play whose mouse lock was refused', () => {
    expect(buildsNewMatch({ started: true, loaded: 'match', matchOver: false, setupChanged: true })).toBe(false);
    expect(buildsNewMatch({ started: false, loaded: 'match', matchOver: false, setupChanged: false })).toBe(false);
    expect(buildsNewMatch({ started: false, loaded: 'match', matchOver: false, setupChanged: true })).toBe(true);
    expect(buildsNewMatch({ started: false, loaded: null, matchOver: false, setupChanged: false })).toBe(true);
    expect(buildsNewMatch({ started: false, loaded: 'range', matchOver: false, setupChanged: false })).toBe(true);
    expect(buildsNewMatch({ started: true, loaded: 'range', matchOver: false, setupChanged: false })).toBe(false);
  });

  it('gives each match of a visit its own seed, and the seed shown replays that match as the first of a visit', () => {
    const visit = 1234567;
    expect(matchSeed(visit, 0)).toBe(visit);
    const seeds = [0, 1, 2, 3].map((k) => matchSeed(visit, k));
    expect(new Set(seeds).size).toBe(4);
    for (const s of seeds) expect(matchSeed(s, 0)).toBe(s); // ?seed=s plays s first
  });
});
