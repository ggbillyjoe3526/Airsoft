import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import type { LightingPresetId } from '../config/render';
import { mapUnderLighting } from '../map/lightingChoice';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { initPhysics } from '../physics/physicsWorld';
import { expectGrounded, playMatch } from './depotMatchSupport';

/** Neon Heights plays 4v4 (M34c). */
const TEAM_SIZE = 4;

describe.each<LightingPresetId>(['day', 'night'])('a 4v4 Attack / Defend match on Neon Heights by %s over 16 seeds (M34c, M34d)', (light) => {
  const map = mapUnderLighting(NEON_HEIGHTS, light);
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps the flag fair: attackers win 40-60 %, some by raising it, under 1 round in 10 runs out the clock', { timeout: 300_000 }, () => {
    let rounds = 0;
    let attackWins = 0;
    let captures = 0;
    let onTime = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const stats = playMatch(300, seed, undefined, BOTS, 'attackDefend', ROUNDS, map, TEAM_SIZE, HITS);
      // The attackers always start at the west end; the flag is on the Tower's atrium floor.
      expect(stats.results.every((r) => r.attackerEnd === 0)).toBe(true);
      for (const r of stats.results) {
        rounds++;
        if (r.reason === 'time') onTime++;
        if (r.reason === 'captured') captures++;
        if (r.winner === r.attackers) attackWins++;
        expect(r.length).toBeLessThanOrEqual(ROUNDS.roundTime + ROUNDS.flag.maxOvertime + 0.1);
      }
      expectGrounded(stats, map);
    }
    // Measured 2026-10-04: attackers won 40 of 86 rounds here (47 %), 8 by raising the flag, none on time. Over seeds
    // 1-32 they won 54 %, 32 of 178 rounds by raising the flag. By night (M34d, 2026-10-05) they won 39 of 87 here
    // (45 %), 10 by raising it, none on time; with M34e's lamps and dark rooms 49 of 95 (52 %), none on time. With every
    // bot carrying the torch the game fits it at night (M57, audit AI-02, on M55's maps) 47 of 95 (49.5 %), 13 by
    // raising it, none on time. Re-measure with this test after any layout or bot change.
    expect(attackWins / rounds).toBeGreaterThanOrEqual(0.4);
    expect(attackWins / rounds).toBeLessThanOrEqual(0.6);
    expect(captures).toBeGreaterThan(0);
    expect(onTime / rounds).toBeLessThan(0.1);
  });
});
