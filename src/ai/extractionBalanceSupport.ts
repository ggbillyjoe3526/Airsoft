import { beforeAll, describe, expect, it } from 'vitest';
import type { Difficulty } from '../config/bots';
import type { MapData } from '../map/mapTypes';
import { initPhysics } from '../physics/physicsWorld';
import { measureRuns, type RunMeasure } from './extractionRunSupport';

/** Each level's bands: the share of runs the squad gets out of, and the Field Credits a minute they get out with. */
export type ExtractionBands = Readonly<Record<Difficulty, { extract: readonly [number, number]; fcPerMinute: readonly [number, number] }>>;

/** The levels a balance guard measures, easiest first. */
const LEVELS = ['easy', 'normal', 'hard', 'pro'] as const;

/**
 * Every map's Extraction balance guard (M46, M48; one support since M51, audit CORE-16): whole runs over seeds 1 to
 * `seeds` by measureRuns at each level, each level's extract rate and FC a minute inside its bands, every run ended by
 * the run's own rules, and each pair in `harder` ([easier, harder]) further apart than nothing: the easier level's
 * squad gets out more often.
 */
export function describeExtractionBalance(
  title: string,
  map: MapData,
  opts: { seeds: number; bands: ExtractionBands; harder: readonly (readonly [Difficulty, Difficulty])[]; timeoutMs: number },
): void {
  describe(title, () => {
    const measured = new Map<Difficulty, RunMeasure>();
    beforeAll(async () => {
      await initPhysics();
      for (const level of LEVELS) measured.set(level, measureRuns(map, level, opts.seeds));
    }, opts.timeoutMs);

    for (const level of LEVELS) {
      it(`keeps ${level}'s extract rate and FC a minute in their bands`, () => {
        const m = measured.get(level)!;
        const band = opts.bands[level];
        expect(m.extract, `${level} extract rate`).toBeGreaterThanOrEqual(band.extract[0]);
        expect(m.extract, `${level} extract rate`).toBeLessThanOrEqual(band.extract[1]);
        expect(m.fcPerMinute, `${level} FC a minute`).toBeGreaterThanOrEqual(band.fcPerMinute[0]);
        expect(m.fcPerMinute, `${level} FC a minute`).toBeLessThanOrEqual(band.fcPerMinute[1]);
        // Every run ends by the run's own rules, none on time with the runner bot (it leaves with time to spare).
        expect(m.runs.every((r) => r.reason === 'extracted' || r.reason === 'out')).toBe(true);
      });
    }

    it(`makes a harder home team harder to get out from: ${opts.harder.map(([a, b]) => `${a} above ${b}`).join(', ')}`, () => {
      for (const [easier, harder] of opts.harder) expect(measured.get(easier)!.extract, `${easier} above ${harder}`).toBeGreaterThan(measured.get(harder)!.extract);
    });
  });
}
