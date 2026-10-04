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
    // depotMatch.ricochet.test.ts.
    expectRicochetsPlayable('attackDefend');
  });
});
