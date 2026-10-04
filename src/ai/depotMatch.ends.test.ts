import { beforeAll, describe, expect, it } from 'vitest';
import { ROUNDS } from '../config/hits';
import { initPhysics } from '../physics/physicsWorld';
import { playMatch } from './depotMatchSupport';

describe('a 3v3 bot match on Depot: the ends', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps the ends close enough: Blue starts in the east, ends swap at half-time, and the west end still wins its share', { timeout: 300_000 }, () => {
    let decided = 0;
    let westWins = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const stats = playMatch(300, seed);
      // Blue (team 0) starts at the east end (end 1) for rounds 1-4, then the west.
      expect(stats.results.map((r) => r.blueEnd)).toEqual(stats.results.map((_, i) => (i < ROUNDS.halfTimeAfter ? 1 : 0)));
      for (const r of stats.results) {
        if (r.winner < 0) continue;
        decided++;
        if (r.winnerEnd === 0) westWins++;
      }
    }
    // Measured on the M11 Depot (2026-10-03): the west end wins 40% of the decided rounds here (46 of 114) and
    // 46% over seeds 1-96; with M20's ricochets, 39% (45 of 116). The east end is stronger (KNOWN_ISSUES); the end swap evens out a match. Re-measure with this test after any layout or bot change.
    // M25b's props (2026-10-04): 61% here (53 of 87) and 52% over seeds 17-64 (139 of 266; 47% on the M11 Depot), so
    // about 54% over seeds 1-64 against 45% before: as far from even as before, the other way. The bounds are even
    // either side of a half.
    expect(westWins / decided).toBeGreaterThan(0.35);
    expect(westWins / decided).toBeLessThan(0.65);
  });
});
