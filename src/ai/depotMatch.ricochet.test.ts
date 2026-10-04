import { beforeAll, describe, it } from 'vitest';
import { initPhysics } from '../physics/physicsWorld';
import { expectRicochetsPlayable } from './depotMatchSupport';

describe('custom matches on Depot (M20): ricochets counting, Elimination', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('stays playable with ricochets counting: bots never shoot a teammate, and bounced BBs decide only some hits', { timeout: 600_000 }, () => {
    // Measured 2026-10-04 (16 seeds, 3v3, friendly fire on): 72 of 520 hits were ricochets (14%), the west won 44%
    // of rounds (55 of 125), 5 friendly hits, all ricochets. Bots can't see where a bounce goes, so a ricochet can
    // catch a teammate (as at a site that counts them). Attack / Defend: depotMatch.ricochetFlag.test.ts.
    // Re-measured with level rays and own ricochets (FA12): 44 of 406 hits ricochets (11%), the west won 57% (55 of
    // 96), 2 friendly ricochets, and 6 bots caught by their own ricochet (not counted as friendly).
    expectRicochetsPlayable('elimination');
  });
});
