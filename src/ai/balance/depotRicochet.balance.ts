import { beforeAll, describe, it } from 'vitest';
import { initPhysics } from '../../physics/physicsWorld';
import { tallyRicochetMatches } from '../depotMatchSupport';
import { reportMeasure, share } from './balanceSupport';

describe('custom matches on Depot (M20): ricochets counting, Elimination', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it(`measures the west end's share of rounds with ricochets counting (target 35-65 %)`, { timeout: 600_000 }, (ctx) => {
    // The same 16 matches as depotMatch.ricochet.test.ts, whose comment holds the measures since FA12.
    const t = tallyRicochetMatches('elimination');
    reportMeasure(ctx, { label: "Depot, Normal, Elimination, ricochets counting: the west end's share of rounds", value: share(t.favoured, t.rounds), of: t.rounds, band: { min: 0.35, max: 0.65 }, detail: `${t.favoured} of ${t.rounds}` });
  });
});
