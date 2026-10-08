import { beforeAll, describe, it } from 'vitest';
import { initPhysics } from '../../physics/physicsWorld';
import { tallyRicochetMatches } from '../depotMatchSupport';
import { reportMeasure, share } from './balanceSupport';

describe('custom matches on Depot (M20): ricochets counting, Attack / Defend', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it(`measures the attackers' share of rounds with ricochets counting (target 35-65 %)`, { timeout: 600_000 }, (ctx) => {
    // The same 16 matches as depotMatch.ricochetFlag.test.ts, whose comment holds the measures since FA12.
    const t = tallyRicochetMatches('attackDefend');
    reportMeasure(ctx, { label: "Depot, Normal, Attack / Defend, ricochets counting: the attackers' share of rounds", value: share(t.favoured, t.rounds), of: t.rounds, band: { min: 0.35, max: 0.65 }, detail: `${t.favoured} of ${t.rounds}` });
  });
});
