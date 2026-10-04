import { beforeAll, expect, it } from 'vitest';
import { botConfig } from '../config/bots';
import { initPhysics } from '../physics/physicsWorld';
import { playMatch } from './depotMatchSupport';

beforeAll(async () => {
  await initPhysics();
});

it('keeps Easy rounds about as long as Normal ones, and Easy bots the worse shots (audit AI-03)', { timeout: 120_000 }, () => {
  // Bot against bot, seeds 1-4, 150 s each. Mean round length, not the median: round lengths are bimodal (quick wipes
  // and long last-man hunts), so the median jumps between the two humps from seed set to seed set. Measured 2026-10-04
  // (FA4, after the M30 / FA1 merge): Easy 40.3 s vs Normal 26.4 s, hit rate 9.3 vs 11.3 % (16 seeds: 50.2 vs 40.7 s,
  // 9.2 vs 10.9 %).
  const play = (level: 'easy' | 'normal') => {
    let total = 0;
    let rounds = 0;
    let shots = 0;
    let hits = 0;
    for (const seed of [1, 2, 3, 4]) {
      const stats = playMatch(150, seed, undefined, botConfig(level));
      for (const r of stats.results) total += r.length;
      rounds += stats.results.length;
      shots += stats.shots;
      hits += stats.hits;
    }
    return { mean: total / rounds, rounds, hitRate: hits / shots };
  };
  const easy = play('easy');
  const normal = play('normal');
  const said = `easy ${easy.mean.toFixed(1)} s (${easy.rounds} rounds), normal ${normal.mean.toFixed(1)} s (${normal.rounds})`;
  expect(easy.mean, said).toBeLessThanOrEqual(1.6 * normal.mean);
  expect(easy.hitRate).toBeLessThan(normal.hitRate);
});
