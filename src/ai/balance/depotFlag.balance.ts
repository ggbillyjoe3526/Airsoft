import { beforeAll, describe, it } from 'vitest';
import { BOTS } from '../../config/bots';
import { initPhysics } from '../../physics/physicsWorld';
import { playMatch } from '../depotMatchSupport';
import { reportMeasure, share } from './balanceSupport';

describe('a 3v3 Attack / Defend match on Depot: the pole over 16 seeds', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('measures the attackers\' share of rounds (target 38-67 %)', { timeout: 300_000 }, (ctx) => {
    // The same matches as depotMatch.flag.test.ts, whose comment holds the measures since M11 (2026-10-03: attackers 51 %
    // over 16 seeds, 50 % over seeds 1-96; M71 57 %). Re-measure after any bot tuning change.
    let rounds = 0;
    let attackWins = 0;
    for (let seed = 1; seed <= 16; seed++) {
      for (const r of playMatch(400, seed, undefined, BOTS, 'attackDefend').results) {
        rounds++;
        if (r.winner === r.attackers) attackWins++;
      }
    }
    reportMeasure(ctx, { label: "Depot, Normal, Attack / Defend: the attackers' share of rounds", value: share(attackWins, rounds), of: rounds, band: { min: 0.38, max: 0.67 }, detail: `${attackWins} of ${rounds}` });
  });
});
