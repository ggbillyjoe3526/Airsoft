import { beforeAll, describe, expect, it } from 'vitest';
import type { Difficulty } from '../config/bots';
import { initPhysics } from '../physics/physicsWorld';
import { playRun, RUNNER_PLAN, type RunResult } from './extractionRunSupport';

/**
 * Extraction's balance on Depot (M46; plan, section 4): whole runs, headless, a bot playing the runner by RUNNER_PLAN
 * (three cases, nearest first, the locker left alone, then the nearest open exit) with two bot teammates, against the
 * home team at each difficulty. The squad is Normal at every level, standing in for you, so only the home team's level
 * changes. Measured 2026-10-05 over these seeds (DECISIONS M46): the bands keep a later change from tipping the mode
 * over, and the levels in order. FC a minute is what the runs got out with over the minutes they lasted; a bot runner
 * is quicker about it than a player, so it is only comparable between levels and builds, not with Elimination's pay.
 */
const SEEDS = 48;
const BANDS: Readonly<Record<Difficulty, { extract: readonly [number, number]; fcPerMinute: readonly [number, number] }>> = {
  // Measured: Easy 48 % and 63 FC a minute, Normal 25 % and 31, Hard 6 % and 11, Pro 8 % and 14.
  easy: { extract: [0.3, 0.65], fcPerMinute: [35, 90] },
  normal: { extract: [0.1, 0.45], fcPerMinute: [12, 55] },
  hard: { extract: [0, 0.25], fcPerMinute: [0, 35] },
  pro: { extract: [0, 0.25], fcPerMinute: [0, 40] },
};

function measure(opponents: Difficulty): { extract: number; fcPerMinute: number; runs: RunResult[] } {
  const runs: RunResult[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) runs.push(playRun({ seed, opponents, teammates: 'normal', plan: RUNNER_PLAN }));
  const minutes = runs.reduce((sum, r) => sum + r.seconds, 0) / 60;
  return {
    extract: runs.filter((r) => r.reason === 'extracted').length / runs.length,
    fcPerMinute: runs.reduce((sum, r) => sum + r.fc, 0) / minutes,
    runs,
  };
}

describe('Extraction balance on Depot (M46)', () => {
  const LEVELS = ['easy', 'normal', 'hard', 'pro'] as const;
  const measured = new Map<Difficulty, ReturnType<typeof measure>>();
  beforeAll(async () => {
    await initPhysics();
    for (const level of LEVELS) measured.set(level, measure(level));
  }, 600_000);

  for (const level of LEVELS) {
    it(`keeps ${level}'s extract rate and FC a minute in their bands`, () => {
      const m = measured.get(level)!;
      const band = BANDS[level];
      expect(m.extract, `${level} extract rate`).toBeGreaterThanOrEqual(band.extract[0]);
      expect(m.extract, `${level} extract rate`).toBeLessThanOrEqual(band.extract[1]);
      expect(m.fcPerMinute, `${level} FC a minute`).toBeGreaterThanOrEqual(band.fcPerMinute[0]);
      expect(m.fcPerMinute, `${level} FC a minute`).toBeLessThanOrEqual(band.fcPerMinute[1]);
      // Every run ends by the run's own rules, none on time with the runner bot (it leaves with 3:00 left).
      expect(m.runs.every((r) => r.reason === 'extracted' || r.reason === 'out')).toBe(true);
    });
  }

  it('makes a harder home team harder to get out from: Easy above Normal above Hard', () => {
    expect(measured.get('easy')!.extract).toBeGreaterThan(measured.get('normal')!.extract);
    expect(measured.get('normal')!.extract).toBeGreaterThan(measured.get('hard')!.extract);
  });
});
