import { beforeAll, describe, it } from 'vitest';
import { initPhysics } from '../physics/physicsWorld';
import { expectRicochetsPlayable } from './depotMatchSupport';

describe('custom matches on Depot (M20): ricochets counting, Attack / Defend', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('stays playable with ricochets counting: bots never shoot a teammate, and bounced BBs decide only some hits', { timeout: 600_000 }, () => {
    // Measured 2026-10-04 (16 seeds, 3v3, friendly fire on): 80 of 487 hits ricochets (16%), attackers won 54% (65
    // of 120), 14 captures, flags raised in 10 of 16, 3 friendly hits, all ricochets. Elimination:
    // depotMatch.ricochet.test.ts. Re-measured with level rays and own ricochets (FA12): 86 of 455 hits ricochets
    // (19%), attackers won 56% (66 of 118), 25 captures, 7 friendly ricochets, and 6 bots caught by their own
    // ricochet (not counted as friendly).
    // G11's wide first aim: 147 of 548 (27%), 8 friendly ricochets, 10 own; G12's weaker bounce (owner, 2026-10-10):
    // 82 of 458 (18%), 3 friendly ricochets, 7 own, attackers 69 of 116, 27 captures.
    // Which end or side the rounds favour is a balance figure since TE4 (balance/depotRicochetFlag.balance.ts).
    expectRicochetsPlayable('attackDefend');
  });
});
