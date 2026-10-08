import { beforeAll, describe, it } from 'vitest';
import { initPhysics } from '../../physics/physicsWorld';
import { tallyCustomMatches } from '../depotMatchSupport';
import { reportMeasure, share } from './balanceSupport';

/*
 * Measured 2026-10-04 (16 seeds each, first to 3, 200 s): a 1v1 starts from the middle spawn at both ends (first,
 * from the end's first spawn, the west won 63% of 1v1 rounds over 8 seeds). Elimination: the west wins 47% of
 * decided 1v1 rounds (27 of 58) and 48% of 2v2 (33 of 69). Attack / Defend: attackers win 49% of 1v1 rounds (30
 * of 61, 3 captures) and 52% of 2v2 (34 of 65, 15 captures). 95% or more of rounds are decided, no friendly hits.
 * 1v1 is judged over 32 seeds since FA4 (2026-10-04; DECISIONS): with one bot a side a 16-seed set has only ~50
 * rounds, and after the M30 / FA1 merge seeds 1-16 gave the west 33% of 1v1 Elimination rounds (17 of 51) while
 * seeds 17-32 gave 53% and 33-48 60% (49% over all 48; 55% before FA4). The two modes were one file until FA11b
 * (audit CORE-15: at about 42 s it was the suite's longest); the other mode is in depotMatch.custom.test.ts.
 * M71 (Audit 2: every level hunts the middle, bots step aside when pressed together): Elimination west 51% of decided
 * 1v1 rounds (66 of 129, 32 seeds) and 42% of 2v2 (28 of 66); Attack / Defend attackers 59% of 1v1 (80 of 136) and
 * 48% of 2v2 (30 of 63); every round but two decided, no friendly hits.
 */
describe('custom matches on Depot (M20): Attack / Defend', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it(`measures the attackers' share of the decided rounds in 1v1 and 2v2 (target 35-65 %)`, { timeout: 600_000 }, (ctx) => {
    for (const size of [1, 2]) {
      const t = tallyCustomMatches('attackDefend', size);
      reportMeasure(ctx, { label: `Depot, Normal, ${size}v${size} Attack / Defend: the attackers' share of the decided rounds`, value: share(t.favoured, t.decided), of: t.decided, band: { min: 0.35, max: 0.65 }, detail: `${t.favoured} of ${t.decided} decided, ${t.seeds} seeds` });
    }
  });
});
