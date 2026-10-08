import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../../config/bots';
import { ROUNDS } from '../../config/hits';
import { DEPOT } from '../../map/depot';
import { initPhysics } from '../../physics/physicsWorld';
import { tallyBalance } from '../depotMatchSupport';
import { reportTally } from './balanceSupport';

describe('a 3v3 Attack / Defend match on Depot, both teams on Pro (M40)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('measures the attackers\' share of rounds (target 40-60 %) and the rounds that run out the clock', { timeout: 300_000 }, (ctx) => {
    // Measured 2026-10-05 (M40, seeds 1-32, 400 s each): attackers win 53 % (132 of 249 rounds), none on time, 4 drawn
    // by a double hit; mean round 23 s. Seeds 1-16: 52 % (63 of 121). Before M40's changes: 54 % (127 of 234). The Office
    // lane doesn't hold the attackers under 40 %, so Depot's layout stays as it is (acceptance 2). Hard on the same
    // seeds: 46 % (113 of 247), none on time. Re-measure after any bot or layout change. M71 (Audit 2:
    // bots step aside when pressed together; Pro's habits unchanged): 51.5 % (135 of 262), none on time.
    reportTally(ctx, 'Depot, Pro, Attack / Defend', tallyBalance(32, 400, botConfig('pro'), 'attackDefend', DEPOT, ROUNDS.teamSize), 'attackDefend');
  });
});
