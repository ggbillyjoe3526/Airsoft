import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../config/bots';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { expectProBalance, LEVELS_BAND, tallyBalance } from './depotMatchSupport';

/** Woodland plays 4v4 (M33d), at night with its bushes and every bot's torch, as the game plays it. */
const TEAM_SIZE = 4;
/** Ten minutes of play per seed: several rounds, each long enough to be decided or run out its clock. */
const SECONDS = 600;
const SEEDS = 8;

describe('a 4v4 Attack / Defend match on Woodland below Pro (Audit 2 BAL-02)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  // Measured 2026-10-05 (M71, seeds 1-8, 600 s each, with torches): attackers win 37.9 % (22 of 58), none on time. With
  // the habits but each bot's torch on for any fight within its 40 m reach and the whole way to a search: 27.9 % (17 of
  // 61); without torches 39.7 % (seeds 1-8, the habits on): the beams, not the fort's lanterns, held the attackers back.
  it('Normal: the attackers win 35-65 % of rounds, and rounds end before the clock', { timeout: 300_000 }, () => {
    expectProBalance(tallyBalance(SEEDS, SECONDS, botConfig('normal'), 'attackDefend', WOODLAND, TEAM_SIZE), 'attackDefend', 'Woodland Normal', LEVELS_BAND);
  });

  // Measured 2026-10-05 (M71, seeds 1-8): attackers win 48.3 % (28 of 58), none on time; with the torch on for any fight
  // within 40 m 28.3 % (15 of 53), 23.6 % without keepsDark; without torches 45.2 %. As shipped (no habits, no torches)
  // the audit read 76 % on seeds 1-4.
  it('Hard: the attackers win 35-65 % of rounds, and rounds end before the clock', { timeout: 300_000 }, () => {
    expectProBalance(tallyBalance(SEEDS, SECONDS, botConfig('hard'), 'attackDefend', WOODLAND, TEAM_SIZE), 'attackDefend', 'Woodland Hard', LEVELS_BAND);
  });
});
