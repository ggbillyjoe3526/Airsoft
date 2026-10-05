import { beforeAll, describe, expect, it } from 'vitest';
import type { Difficulty } from '../config/bots';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { measureRuns, type RunMeasure } from './extractionRunSupport';

/**
 * Extraction's balance on Woodland (M48), measured as on Depot (depotMatch.extractionBalance.test.ts): whole runs at
 * night, a bot runner by RUNNER_PLAN with two Normal teammates, against the home team at each level (4 / 5 / 6 of them
 * with a trio, three more than the squad). Measured 2026-10-05 over these seeds (DECISIONS M48). Normal already beats
 * the squad here, by day as by night, so Normal, Hard and Pro come out close together (KNOWN_ISSUES): only Easy is
 * checked to be easier than each, and their order is left to the Woodland balance pass (M48 acceptance 2, amended).
 */
const SEEDS = 48;
const BANDS: Readonly<Record<Difficulty, { extract: readonly [number, number]; fcPerMinute: readonly [number, number] }>> = {
  // Measured: Easy 65 % and 54 FC a minute, Normal 19 % and 20, Hard 19 % and 24, Pro 25 % and 33.
  easy: { extract: [0.45, 0.8], fcPerMinute: [30, 80] },
  normal: { extract: [0.05, 0.35], fcPerMinute: [5, 40] },
  hard: { extract: [0.05, 0.35], fcPerMinute: [5, 45] },
  pro: { extract: [0.08, 0.4], fcPerMinute: [10, 55] },
};

describe('Extraction balance on Woodland (M48)', () => {
  const LEVELS = ['easy', 'normal', 'hard', 'pro'] as const;
  const measured = new Map<Difficulty, RunMeasure>();
  beforeAll(async () => {
    await initPhysics();
    for (const level of LEVELS) measured.set(level, measureRuns(WOODLAND, level, SEEDS));
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

  it('makes an Easy home team the easiest to get out from', () => {
    for (const level of ['normal', 'hard', 'pro'] as const) expect(measured.get('easy')!.extract, level).toBeGreaterThan(measured.get(level)!.extract);
  });
});
