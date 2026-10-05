import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { initPhysics } from '../physics/physicsWorld';
import { expectGrounded, playMatch } from './depotMatchSupport';

/** Neon Heights plays 4v4 (M34c). */
const TEAM_SIZE = 4;

describe('a 4v4 Attack / Defend match on Neon Heights over 16 seeds (M34c)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps the flag fair: attackers win 40-60 %, some by raising it, under 1 round in 10 runs out the clock', { timeout: 300_000 }, () => {
    let rounds = 0;
    let attackWins = 0;
    let captures = 0;
    let onTime = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const stats = playMatch(300, seed, undefined, BOTS, 'attackDefend', ROUNDS, NEON_HEIGHTS, TEAM_SIZE, HITS);
      // The attackers always start at the west end; the flag is on the Tower's atrium floor.
      expect(stats.results.every((r) => r.attackerEnd === 0)).toBe(true);
      for (const r of stats.results) {
        rounds++;
        if (r.reason === 'time') onTime++;
        if (r.reason === 'captured') captures++;
        if (r.winner === r.attackers) attackWins++;
        expect(r.length).toBeLessThanOrEqual(ROUNDS.roundTime + ROUNDS.flag.maxOvertime + 0.1);
      }
      expectGrounded(stats, NEON_HEIGHTS);
    }
    // Measured 2026-10-04: attackers won 40 of 86 rounds here (47 %), 8 by raising the flag, none on time. Over seeds
    // 1-32 they won 54 %, 32 of 178 rounds by raising the flag. Re-measure with this test after any layout or bot
    // change.
    expect(attackWins / rounds).toBeGreaterThanOrEqual(0.4);
    expect(attackWins / rounds).toBeLessThanOrEqual(0.6);
    expect(captures).toBeGreaterThan(0);
    expect(onTime / rounds).toBeLessThan(0.1);
  });
});
