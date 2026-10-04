import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../physics/physicsWorld';
import { playedAfterHalfTime, playMatch } from './depotMatchSupport';

describe('a 3v3 bot match on Depot: the ends', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps the ends close enough: Blue starts in the east, ends swap at half-time, and the west end still wins its share', { timeout: 300_000 }, () => {
    let decided = 0;
    let westWins = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const stats = playMatch(300, seed);
      // Blue (team 0) starts at the east end (end 1) for rounds 1-4, then the west (a drawn round is replayed under its
      // number).
      expect(stats.results.map((r) => r.blueEnd)).toEqual(playedAfterHalfTime(stats.results).map((after) => (after ? 0 : 1)));
      for (const r of stats.results) {
        if (r.winner < 0) continue;
        decided++;
        if (r.winnerEnd === 0) westWins++;
      }
    }
    // Measured on the M11 Depot (2026-10-03): the west end wins 40% of the decided rounds here (46 of 114) and
    // 46% over seeds 1-96; with M20's ricochets, 39% (45 of 116). The east end is stronger (KNOWN_ISSUES); the end swap evens out a match. Re-measure with this test after any layout or bot change.
    // With M25b's props (2026-10-04): 49% here (38 of 77) and 48% over seeds 1-64 (155 of 322; 45% on the M11 Depot).
    // FA4 (2026-10-04: the east spawns moved so neither end reaches the dock or the Main Gate first, and the bot
    // changes): 53% here (42 of 80) and 49% over seeds 1-64 (165 of 339; 53% on the build before it). After merging
    // M30 and FA1: 56% here (48 of 86), 45% over seeds 1-64 (152 of 336; 50% without FA4). With the east spawns 1.45 m
    // further back (FA4 attempt 2, SIM-13): 49% here (42 of 85), 48% over seeds 1-64 (166 of 343).
    expect(westWins / decided).toBeGreaterThan(0.35);
    expect(westWins / decided).toBeLessThan(0.6);
  });
});
