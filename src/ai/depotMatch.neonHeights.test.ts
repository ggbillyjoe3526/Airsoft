import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import type { LightingPresetId } from '../config/render';
import { mapUnderLighting } from '../map/lightingChoice';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { initPhysics } from '../physics/physicsWorld';
import { expectGrounded, playMatch, STALLED_ROUNDS_MAX } from './depotMatchSupport';

/** Neon Heights plays 4v4 (M34c). */
const TEAM_SIZE = 4;
/** Level 1's floor is at +3 m: anyone above this stands on Level 2 (or high on a stair to it). */
const LEVEL_2 = 5;
/** Seeds played: the per-match checks hold on every seed; who wins is measured on 48 (balance/neonHeights.balance.ts). */
const SEEDS = 16;

describe.each<LightingPresetId>(['day', 'night'])('a 4v4 Elimination match on Neon Heights by %s over 16 seeds (M34c, M34d)', (light) => {
  const map = mapUnderLighting(NEON_HEIGHTS, light);
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays rounds out on every floor: someone reaches Level 2, nobody falls, under 1 round in 4 runs out the clock', { timeout: 300_000 }, () => {
    let rounds = 0;
    let onTime = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const stats = playMatch(300, seed, undefined, BOTS, 'elimination', ROUNDS, map, TEAM_SIZE, HITS);
      for (const r of stats.results) {
        rounds++;
        if (r.reason === 'time') onTime++;
      }
      // Bots fight on every floor: someone alive got up to Level 2 in every match, and nobody fell off anything.
      expect(stats.maxAliveY, `seed ${seed}`).toBeGreaterThan(LEVEL_2);
      expectGrounded(stats, map);
    }
    // The west end's share and the target of under 1 round in 10 on time are balance figures since TE4 (2026-10-08),
    // with their measures since M34c (balance/neonHeights.balance.ts); this guard played 48 seeds for them from 2026-10-06.
    expect(rounds).toBeGreaterThan(0);
    expect(onTime / rounds, `${onTime} of ${rounds} on time`).toBeLessThan(STALLED_ROUNDS_MAX);
  });
});
