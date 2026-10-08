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

describe.each<LightingPresetId>(['day', 'night'])('a 4v4 Attack / Defend match on Neon Heights by %s over 16 seeds (M34c, M34d)', (light) => {
  const map = mapUnderLighting(NEON_HEIGHTS, light);
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays the flag out: some rounds are won by raising it, nobody falls, under 1 round in 4 runs out the clock', { timeout: 300_000 }, () => {
    let rounds = 0;
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
        expect(r.length).toBeLessThanOrEqual(ROUNDS.roundTime + ROUNDS.flag.maxOvertime + 0.1);
      }
      expectGrounded(stats, map);
    }
    // The attackers' share and the target of under 1 round in 10 on time are balance figures since TE4 (2026-10-08),
    // with their measures since M34c (balance/neonHeightsFlag.balance.ts, the same 16 seeds).
    const said = `${light}: ${captures} of ${rounds} rounds won by raising the flag, ${onTime} on time`;
    expect(captures, said).toBeGreaterThan(0);
    expect(onTime / rounds, said).toBeLessThan(STALLED_ROUNDS_MAX);
  });
});
