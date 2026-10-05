import { beforeAll, describe, expect, it } from 'vitest';
import type { Difficulty } from '../config/bots';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { initPhysics } from '../physics/physicsWorld';
import { measureRuns, type RunMeasure } from './extractionRunSupport';

/**
 * Extraction's balance on Neon Heights (M48), measured as on Depot (depotMatch.extractionBalance.test.ts): whole runs by
 * Night (the map's first preset), a bot runner by RUNNER_PLAN with two Normal teammates, against the home team at each
 * level. Measured 2026-10-05 over these seeds (DECISIONS M48): the squad gets out more often than on Depot at Normal (the
 * plan's "about half"), the rooms and floors giving it cover to open cases behind.
 */
const SEEDS = 48;
const BANDS: Readonly<Record<Difficulty, { extract: readonly [number, number]; fcPerMinute: readonly [number, number] }>> = {
  // Measured: Easy 56 % and 34 FC a minute, Normal 50 % and 32, Hard 21 % and 25, Pro 15 % and 16.
  easy: { extract: [0.4, 0.75], fcPerMinute: [20, 55] },
  normal: { extract: [0.3, 0.65], fcPerMinute: [18, 50] },
  hard: { extract: [0.08, 0.35], fcPerMinute: [10, 40] },
  pro: { extract: [0.03, 0.3], fcPerMinute: [5, 30] },
};

describe('Extraction balance on Neon Heights (M48)', () => {
  const LEVELS = ['easy', 'normal', 'hard', 'pro'] as const;
  const measured = new Map<Difficulty, RunMeasure>();
  beforeAll(async () => {
    await initPhysics();
    for (const level of LEVELS) measured.set(level, measureRuns(NEON_HEIGHTS, level, SEEDS));
  }, 900_000);

  for (const level of LEVELS) {
    it(`keeps ${level}'s extract rate and FC a minute in their bands`, () => {
      const m = measured.get(level)!;
      const band = BANDS[level];
      expect(m.extract, `${level} extract rate`).toBeGreaterThanOrEqual(band.extract[0]);
      expect(m.extract, `${level} extract rate`).toBeLessThanOrEqual(band.extract[1]);
      expect(m.fcPerMinute, `${level} FC a minute`).toBeGreaterThanOrEqual(band.fcPerMinute[0]);
      expect(m.fcPerMinute, `${level} FC a minute`).toBeLessThanOrEqual(band.fcPerMinute[1]);
      expect(m.runs.every((r) => r.reason === 'extracted' || r.reason === 'out')).toBe(true);
    });
  }

  it('makes a harder home team harder to get out from: Easy above Normal above Hard', () => {
    expect(measured.get('easy')!.extract).toBeGreaterThan(measured.get('normal')!.extract);
    expect(measured.get('normal')!.extract).toBeGreaterThan(measured.get('hard')!.extract);
  });
});
