import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { initPhysics } from '../physics/physicsWorld';
import { expectGrounded, playMatch } from './depotMatchSupport';

/** Neon Heights plays 4v4 (M34c). */
const TEAM_SIZE = 4;
/** Level 1's floor is at +3 m: anyone above this stands on Level 2 (or high on a stair to it). */
const LEVEL_2 = 5;

describe('a 4v4 Elimination match on Neon Heights over 16 seeds (M34c)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps the ends even and the rounds decided: each end wins 40-60 %, under 1 round in 10 runs out the clock', { timeout: 300_000 }, () => {
    let rounds = 0;
    let decided = 0;
    let westWins = 0;
    let onTime = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const stats = playMatch(300, seed, undefined, BOTS, 'elimination', ROUNDS, NEON_HEIGHTS, TEAM_SIZE, HITS);
      for (const r of stats.results) {
        rounds++;
        if (r.reason === 'time') onTime++;
        if (r.winner < 0) continue;
        decided++;
        if (r.winnerEnd === 0) westWins++;
      }
      // Bots fight on every floor: someone alive got up to Level 2 in every match, and nobody fell off anything.
      expect(stats.maxAliveY, `seed ${seed}`).toBeGreaterThan(LEVEL_2);
      expectGrounded(stats, NEON_HEIGHTS);
    }
    // Measured 2026-10-04: the west end won 45 % of the decided rounds here (32 of 71), none ran out the clock. Over
    // seeds 1-96 the west won 44.5 % (KNOWN_ISSUES: the east is a little stronger, as Depot's was before FA4) and 2
    // rounds in 499 ran out the clock. Re-measure with this test after any layout or bot change.
    expect(westWins / decided).toBeGreaterThanOrEqual(0.4);
    expect(westWins / decided).toBeLessThanOrEqual(0.6);
    expect(onTime / rounds).toBeLessThan(0.1);
  });
});
