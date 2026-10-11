import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../../config/bots';
import { WOODLAND } from '../../map/woodland';
import { initPhysics } from '../../physics/physicsWorld';
import { tallyBalance } from '../depotMatchSupport';
import { LEVELS_BAND, reportTally } from './balanceSupport';

/** Woodland plays 5v5 (M88; 4v4 before), at night with its bushes and every bot's torch, as the game plays it. */
const TEAM_SIZE = 5;
/** Ten minutes of play per seed: several rounds, each long enough to be decided or run out its clock. */
const SECONDS = 600;
const SEEDS = 8;

describe('a 5v5 Attack / Defend match on Woodland below Pro (Audit 2 BAL-02)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  // Measured 2026-10-05 (M71, seeds 1-8, 600 s each, with torches): attackers win 37.9 % (22 of 58), none on time. With
  // the habits but each bot's torch on for any fight within its 40 m reach and the whole way to a search: 27.9 % (17 of
  // 61); without torches 39.7 % (seeds 1-8, the habits on): the beams, not the fort's lanterns, held the attackers back.
  // M88 (2026-10-11, 5v5, the West Rise): 57.4 % (35 of 61), none on time; 59.3 % (32 of 54) just before, at 4v4.
  // M87 (2026-10-11, hunting bots check by eye and share it), then M88 QA (one lane point fewer a lane in the fort):
  // 57.4 % (35 of 61) both times, none on time. Nobody hunts in Attack / Defend, the attackers leave their lanes at the
  // middle and the defenders hold the last two points, which stayed.
  // M87 lean-spot yield (2026-10-11: a bot at a lean spot walks aside for a teammate walking past):
  // 52.5 % (32 of 61), none on time; 51.9 % (28 of 54) just before, after the M88 merge of main.
  it('Normal: measures the attackers\' share of rounds (target 35-65 %) and the rounds that run out the clock', { timeout: 300_000 }, (ctx) => {
    reportTally(ctx, 'Woodland, Normal, Attack / Defend', tallyBalance(SEEDS, SECONDS, botConfig('normal'), 'attackDefend', WOODLAND, TEAM_SIZE), 'attackDefend', LEVELS_BAND);
  });

  // Measured 2026-10-05 (M71, seeds 1-8): attackers win 48.3 % (28 of 58), none on time; with the torch on for any fight
  // within 40 m 28.3 % (15 of 53), 23.6 % without keepsDark; without torches 45.2 %. As shipped (no habits, no torches)
  // the audit read 76 % on seeds 1-4. M88 (5v5, the West Rise): 50.0 % (29 of 58); 56.1 % (32 of 57) just before, at 4v4.
  // M87 (2026-10-11, both as for Normal): 50.0 % (29 of 58) both times, none on time.
  // M87 lean-spot yield (2026-10-11: a bot at a lean spot walks aside for a teammate walking past):
  // 57.6 % (34 of 59), none on time; 60.0 % (36 of 60) just before, after the M88 merge of main.
  it('Hard: measures the attackers\' share of rounds (target 35-65 %) and the rounds that run out the clock', { timeout: 300_000 }, (ctx) => {
    reportTally(ctx, 'Woodland, Hard, Attack / Defend', tallyBalance(SEEDS, SECONDS, botConfig('hard'), 'attackDefend', WOODLAND, TEAM_SIZE), 'attackDefend', LEVELS_BAND);
  });
});
