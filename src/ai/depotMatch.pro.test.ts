import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { DEPOT } from '../map/depot';
import { initPhysics } from '../physics/physicsWorld';
import { expectProBalance, tallyBalance } from './depotMatchSupport';

describe('a 3v3 Elimination match on Depot, both teams on Pro (M40)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps each end at 40-60 % of the decided rounds, and rounds end before the clock', { timeout: 300_000 }, () => {
    // Measured 2026-10-05 (M40, seeds 1-32, 300 s each): the west end (end 0) wins 50 % of the decided rounds (113 of
    // 227), none of 232 rounds ends on time (5 drawn by a double hit); mean round 29 s. Seeds 1-16: 44 % (49 of 111).
    // Before M40's changes: 47 % (91 of 192), mean round 39 s. Hard on the same seeds: 51 % (102 of 201), none on time.
    // Re-measure with this test after any bot or layout change.
    expectProBalance(tallyBalance(32, 300, botConfig('pro'), 'elimination', DEPOT, ROUNDS.teamSize), 'elimination', 'Depot Pro');
  });
});
