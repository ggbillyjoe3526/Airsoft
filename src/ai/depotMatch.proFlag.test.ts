import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { DEPOT } from '../map/depot';
import { initPhysics } from '../physics/physicsWorld';
import { expectProBalance, tallyBalance } from './depotMatchSupport';

describe('a 3v3 Attack / Defend match on Depot, both teams on Pro (M40)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps the attackers at 40-60 % of rounds, and rounds end before the clock', { timeout: 300_000 }, () => {
    // Measured 2026-10-05 (M40, seeds 1-32, 400 s each): attackers win 53 % (132 of 249 rounds), none on time, 4 drawn
    // by a double hit; mean round 23 s. Seeds 1-16: 52 % (63 of 121). Before M40's changes: 54 % (127 of 234). The Office
    // lane doesn't hold the attackers under 40 %, so Depot's layout stays as it is (acceptance 2). Hard on the same
    // seeds: 46 % (113 of 247), none on time. Re-measure with this test after any bot or layout change.
    expectProBalance(tallyBalance(32, 400, botConfig('pro'), 'attackDefend', DEPOT, ROUNDS.teamSize), 'attackDefend', 'Depot Pro');
  });
});
