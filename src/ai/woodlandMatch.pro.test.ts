import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../config/bots';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { expectRoundsPlayed, tallyBalance } from './depotMatchSupport';

/** Woodland plays 4v4 (M33d), at night with its bushes and every bot's torch, as the game plays it. */
const TEAM_SIZE = 4;
/** Long enough for a whole match, first to 5 (the longest takes about 13 minutes of game time). */
const SECONDS = 900;

/** Enough seeds to catch bots that stop finding each other; who wins is measured on 16 (balance/woodlandPro.balance.ts). */
const SEEDS = 4;

describe('a 4v4 Elimination match on Woodland, both teams on Pro (M40)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays rounds out on Pro: some rounds, under 1 in 4 run out the clock', { timeout: 600_000 }, () => {
    expectRoundsPlayed(tallyBalance(SEEDS, SECONDS, botConfig('pro'), 'elimination', WOODLAND, TEAM_SIZE), 'Woodland Pro Elimination');
  });
});
