import { beforeAll, describe, it } from 'vitest';
import type { Difficulty } from '../../config/bots';
import type { MapData } from '../../map/mapTypes';
import { initPhysics } from '../../physics/physicsWorld';
import { measureRuns, type RunMeasure } from '../extractionRunSupport';
import { reportMeasure, shareError } from './balanceSupport';

/** Each level's bands: the share of runs the squad gets out of, and the Field Credits a minute they get out with. */
export type ExtractionBands = Readonly<Record<Difficulty, { extract: readonly [number, number]; fcPerMinute: readonly [number, number] }>>;

/** The levels a balance measure plays, easiest first. */
const LEVELS = ['easy', 'normal', 'hard', 'pro'] as const;

/**
 * Every map's Extraction balance figures (M46, M48; one support since M51, audit CORE-16; figures since TE4): whole
 * runs over seeds 1 to `seeds` by measureRuns at each level, each level's extract rate and FC a minute against its
 * bands, and for each pair in `harder` ([easier, harder]) how much more often the easier level's squad gets out (it
 * should, so the band is above nothing). That every run ends by the run's own rules is a guard
 * (`*Match.extractionRuns.test.ts`).
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
      it(`measures ${level}'s extract rate and FC a minute`, (ctx) => {
        const m = measured.get(level)!;
        const band = opts.bands[level];
        const out = m.runs.filter((r) => r.reason === 'extracted').length;
        reportMeasure(ctx, { label: `${map.name}, Extraction, ${level} home team: the runs the squad gets out of`, value: m.extract, of: m.runs.length, band: { min: band.extract[0], max: band.extract[1] }, detail: `${out} of ${m.runs.length}` });
        reportMeasure(ctx, { label: `${map.name}, Extraction, ${level} home team: what the squad gets out with`, value: m.fcPerMinute, band: { min: band.fcPerMinute[0], max: band.fcPerMinute[1] }, unit: 'FC a minute' });
      });
    }

    it(`measures how much harder a harder home team is to get out from: ${opts.harder.map(([a, b]) => `${a} against ${b}`).join(', ')}`, (ctx) => {
      for (const [easier, harder] of opts.harder) {
        const e = measured.get(easier)!;
        const h = measured.get(harder)!;
        reportMeasure(ctx, {
          label: `${map.name}, Extraction: the squad gets out more often against ${easier} than ${harder}`,
          value: e.extract - h.extract,
          band: { min: 0 },
          se: Math.hypot(shareError(e.extract, e.runs.length), shareError(h.extract, h.runs.length)),
          unit: 'points',
          detail: `${easier} ${(100 * e.extract).toFixed(0)} %, ${harder} ${(100 * h.extract).toFixed(0)} %`,
        });
      }
    });
  });
}
