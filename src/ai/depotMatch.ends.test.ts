import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../physics/physicsWorld';
import { playedAfterHalfTime, playMatch } from './depotMatchSupport';

describe('a 3v3 bot match on Depot: the ends', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('starts Blue in the east and swaps the ends at half-time', { timeout: 120_000 }, () => {
    // Which end wins its share is a balance figure (balance/depotEnds.balance.ts, 16 seeds).
    for (let seed = 1; seed <= 4; seed++) {
      const stats = playMatch(300, seed);
      // Blue (team 0) starts at the east end (end 1) for rounds 1-4, then the west (a drawn round is replayed under its
      // number).
      expect(stats.results.map((r) => r.blueEnd), `seed ${seed}`).toEqual(playedAfterHalfTime(stats.results).map((after) => (after ? 0 : 1)));
    }
  });
});
