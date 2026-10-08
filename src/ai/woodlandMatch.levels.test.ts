import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../config/bots';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { expectRoundsPlayed, tallyBalance } from './depotMatchSupport';

/** Woodland plays 4v4 (M33d), at night with its bushes and every bot's torch, as the game plays it. */
const TEAM_SIZE = 4;
/** Ten minutes of play per seed: several rounds, each long enough to be decided or run out its clock. */
const SECONDS = 600;

/** Enough seeds to catch bots that stop finding each other; who wins is measured on 8 (balance/woodlandLevels.balance.ts). */
const SEEDS = 4;

describe('a 4v4 Elimination match on Woodland below Pro (Audit 2 BAL-01, BAL-09)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('Normal: plays rounds out: some rounds, under 1 in 4 run out the clock', { timeout: 300_000 }, () => {
    expectRoundsPlayed(tallyBalance(SEEDS, SECONDS, botConfig('normal'), 'elimination', WOODLAND, TEAM_SIZE), 'Woodland Normal Elimination');
  });

  it('Hard: plays rounds out: some rounds, under 1 in 4 run out the clock', { timeout: 300_000 }, () => {
    expectRoundsPlayed(tallyBalance(SEEDS, SECONDS, botConfig('hard'), 'elimination', WOODLAND, TEAM_SIZE), 'Woodland Hard Elimination');
  });
});
