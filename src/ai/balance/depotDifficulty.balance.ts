import { beforeAll, it } from 'vitest';
import { botConfig } from '../../config/bots';
import { initPhysics } from '../../physics/physicsWorld';
import { playMatch } from '../depotMatchSupport';
import { reportMeasure, shareError } from './balanceSupport';

beforeAll(async () => {
  await initPhysics();
});

it('measures Easy\'s rounds against Normal\'s (at most 1.6 times as long) and its hit rate (below Normal\'s) (audit AI-03)', { timeout: 300_000 }, (ctx) => {
  // Bot against bot, seeds 1-16, 150 s each. Mean round length, not the median: round lengths are bimodal (quick wipes
  // and long last-man hunts), so the median jumps between the two humps from seed set to seed set. Measured 2026-10-04
  // (FA4, after the M30 / FA1 merge): Easy 40.3 s vs Normal 26.4 s, hit rate 9.3 vs 11.3 % (16 seeds: 50.2 vs 40.7 s,
  // 9.2 vs 10.9 %). Since every level hunts the middle (M71, Audit 2) both meet sooner and closer: 16 seeds Easy 27.3 s
  // (71 rounds) and 9.6 % of 3,236 BBs, Normal 26.8 s (71) and 10.1 % of 3,099; seeds 1-4 alone read Easy 10.3 % against
  // Normal 9.0 % (80-odd hits each, half a point either way is noise), so the measure plays 16 seeds.
  const play = (level: 'easy' | 'normal') => {
    let total = 0;
    let rounds = 0;
    let shots = 0;
    let hits = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const stats = playMatch(150, seed, undefined, botConfig(level));
      for (const r of stats.results) total += r.length;
      rounds += stats.results.length;
      shots += stats.shots;
      hits += stats.hits;
    }
    return { mean: total / rounds, rounds, shots, hitRate: hits / shots };
  };
  const easy = play('easy');
  const normal = play('normal');
  reportMeasure(ctx, { label: "Depot, Elimination: Easy's mean round length over Normal's", value: easy.mean / normal.mean, band: { max: 1.6 }, unit: '×', detail: `Easy ${easy.mean.toFixed(1)} s (${easy.rounds} rounds), Normal ${normal.mean.toFixed(1)} s (${normal.rounds})` });
  reportMeasure(ctx, {
    label: "Depot, Elimination: Easy's hit rate less Normal's (Easy bots the worse shots)",
    value: easy.hitRate - normal.hitRate,
    band: { max: 0 },
    se: Math.hypot(shareError(easy.hitRate, easy.shots), shareError(normal.hitRate, normal.shots)),
    unit: 'points',
    detail: `Easy ${(100 * easy.hitRate).toFixed(1)} % of ${easy.shots} BBs, Normal ${(100 * normal.hitRate).toFixed(1)} % of ${normal.shots}`,
  });
});
