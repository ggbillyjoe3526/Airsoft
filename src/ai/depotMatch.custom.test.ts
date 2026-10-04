import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { DEPOT } from '../map/depot';
import { initPhysics } from '../physics/physicsWorld';
import { expectGrounded, playMatch } from './depotMatchSupport';

describe('custom matches on Depot (M20)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays fair 1v1 and 2v2 matches in both modes: rounds get decided, neither end is favoured, nobody stays at spawn', { timeout: 600_000 }, () => {
    // Measured 2026-10-04 (16 seeds each, first to 3, 200 s; about 50 s for all four here): a 1v1 starts from the middle spawn at both ends (first,
    // from the end's first spawn, the west won 63% of 1v1 rounds over 8 seeds). Elimination: the west wins 47% of
    // decided 1v1 rounds (27 of 58) and 48% of 2v2 (33 of 69). Attack / Defend: attackers win 49% of 1v1 rounds (30
    // of 61, 3 captures) and 52% of 2v2 (34 of 65, 15 captures). 95% or more of rounds are decided, no friendly hits.
    // 1v1 is judged over 32 seeds since FA4 (2026-10-04; DECISIONS): with one bot a side a 16-seed set has only ~50
    // rounds, and after the M30 / FA1 merge seeds 1-16 gave the west 33% of 1v1 Elimination rounds (17 of 51) while
    // seeds 17-32 gave 53% and 33-48 60% (49% over all 48; 55% before FA4).
    const rules = { ...ROUNDS, winsNeeded: 3, halfTimeAfter: 2 };
    for (const size of [1, 2]) {
      for (const mode of ['elimination', 'attackDefend'] as const) {
        const label = `${size}v${size} ${mode}`;
        let rounds = 0;
        let decided = 0;
        let favoured = 0; // elimination: rounds the west end won; attack / defend: rounds the attackers won
        let friendlyHits = 0;
        const seeds = size === 1 ? 32 : 16;
        for (let seed = 1; seed <= seeds; seed++) {
          const stats = playMatch(200, seed, undefined, BOTS, mode, rules, DEPOT, size);
          expect(stats.farthestFromSpawn, label).toHaveLength(2 * size);
          friendlyHits += stats.friendlyHits;
          for (const r of stats.results) {
            rounds++;
            if (r.winner < 0) continue;
            decided++;
            if (mode === 'elimination' ? r.winnerEnd === 0 : r.winner === r.attackers) favoured++;
          }
          // Everyone leaves spawn in round 1; in Attack / Defend only the attackers (Blue) must, defenders may hold.
          stats.farthestFromSpawn.forEach((d, i) => {
            if (mode === 'elimination' || i < size) expect(d, `${label} seed ${seed}`).toBeGreaterThan(8);
          });
          expectGrounded(stats, DEPOT);
        }
        expect(rounds, label).toBeGreaterThanOrEqual(seeds * 3);
        expect(decided / rounds, label).toBeGreaterThan(0.9);
        expect(favoured / decided, label).toBeGreaterThan(0.35);
        expect(favoured / decided, label).toBeLessThan(0.65);
        expect(friendlyHits, label).toBe(0);
      }
    }
  });
});
