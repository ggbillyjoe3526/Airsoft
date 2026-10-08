import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../config/bots';
import { mapUnderLighting } from '../map/lightingChoice';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { initPhysics } from '../physics/physicsWorld';
import { expectRoundsPlayed, tallyBalance } from './depotMatchSupport';

/** Neon Heights plays 4v4 (M34c); this guard plays it by Day (M34d's switch; Night is its default). */
const TEAM_SIZE = 4;
const DAY = mapUnderLighting(NEON_HEIGHTS, 'day');

/** Enough seeds to catch bots that stop finding each other; who wins is measured on 32 (balance/neonHeightsProFlag.balance.ts). */
const SEEDS = 4;

describe('a 4v4 Attack / Defend match on Neon Heights, both teams on Pro (M40)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays rounds out on Pro: some rounds, under 1 in 4 run out the clock', { timeout: 300_000 }, () => {
    expectRoundsPlayed(tallyBalance(SEEDS, 400, botConfig('pro'), 'attackDefend', DAY, TEAM_SIZE), 'Neon Heights by Day Pro Attack / Defend');
  });
});
