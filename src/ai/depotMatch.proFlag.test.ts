import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { DEPOT } from '../map/depot';
import { initPhysics } from '../physics/physicsWorld';
import { expectRoundsPlayed, tallyBalance } from './depotMatchSupport';

/** Enough seeds to catch bots that stop finding each other; who wins is measured on 32 (balance/depotProFlag.balance.ts). */
const SEEDS = 4;

describe('a 3v3 Attack / Defend match on Depot, both teams on Pro (M40)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays rounds out on Pro: some rounds, under 1 in 4 run out the clock', { timeout: 300_000 }, () => {
    expectRoundsPlayed(tallyBalance(SEEDS, 400, botConfig('pro'), 'attackDefend', DEPOT, ROUNDS.teamSize), 'Depot Pro Attack / Defend');
  });
});
