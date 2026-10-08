import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../../config/bots';
import { WOODLAND } from '../../map/woodland';
import { initPhysics } from '../../physics/physicsWorld';
import { tallyBalance } from '../depotMatchSupport';
import { LEVELS_BAND, reportTally } from './balanceSupport';

/** Woodland plays 4v4 (M33d), at night with its bushes and every bot's torch, as the game plays it. */
const TEAM_SIZE = 4;
/** Ten minutes of play per seed: several rounds, each long enough to be decided or run out its clock. */
const SECONDS = 600;
const SEEDS = 8;

describe('a 4v4 Elimination match on Woodland below Pro (Audit 2 BAL-01, BAL-09)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  // Measured 2026-10-05 (M71, seeds 1-8, 600 s each, with torches): end 0 (downhill) wins 44.4 % (28 of 63 decided), none
  // on time. As shipped (both habits Pro-only) the audit read Normal 56 % of rounds on time (seeds 1-4, without torches).
  it('Normal: measures each end\'s share of the decided rounds (target 35-65 %) and the rounds that run out the clock', { timeout: 300_000 }, (ctx) => {
    reportTally(ctx, 'Woodland, Normal, Elimination', tallyBalance(SEEDS, SECONDS, botConfig('normal'), 'elimination', WOODLAND, TEAM_SIZE), 'elimination', LEVELS_BAND, 'the downhill end');
  });

  // Measured 2026-10-05 (M71, seeds 1-8): end 0 wins 52.6 % (30 of 57 decided), none on time (audit, as shipped: 45 % of
  // rounds on time).
  it('Hard: measures each end\'s share of the decided rounds (target 35-65 %) and the rounds that run out the clock', { timeout: 300_000 }, (ctx) => {
    reportTally(ctx, 'Woodland, Hard, Elimination', tallyBalance(SEEDS, SECONDS, botConfig('hard'), 'elimination', WOODLAND, TEAM_SIZE), 'elimination', LEVELS_BAND, 'the downhill end');
  });
});
