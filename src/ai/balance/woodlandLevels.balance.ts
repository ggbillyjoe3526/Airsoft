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

describe('a 5v5 Elimination match on Woodland below Pro (Audit 2 BAL-01, BAL-09)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  // Measured 2026-10-05 (M71, seeds 1-8, 600 s each, with torches): end 0 (downhill) wins 44.4 % (28 of 63 decided), none
  // on time. As shipped (both habits Pro-only) the audit read Normal 56 % of rounds on time (seeds 1-4, without torches).
  // M88 (2026-10-11, 5v5, the West Rise and a lower east end): 63.3 % (38 of 60), none on time; 59.0 % (36 of 61) on
  // main just before, at 4v4.
  it('Normal: measures each end\'s share of the decided rounds (target 35-65 %) and the rounds that run out the clock', { timeout: 300_000 }, (ctx) => {
    // M87 (2026-10-11, hunting bots check by eye and share it): 67.7 % (42 of 62), none on time; seeds 9-16 53.2 % (33
    // of 62), so 60.5 % over 16 seeds. The cause: end 1 walks its lanes from the fort out and paused at a third lane
    // point inside it (one at each baffle), so at 12 s it stood 19 m from its spawns to end 0's 31 and met end 0 coming
    // down the Knoll's open west face. M88 QA (2026-10-11, one lane point fewer a lane in the fort): 57.4 % (35 of 61),
    // none on time; seeds 9-16 55.9 % (33 of 59), so 56.7 % over 16 seeds.
    // M87 lean-spot yield (2026-10-11: a bot at a lean spot walks aside for a teammate walking past):
    // 57.1 % (32 of 56), none on time; 44.8 % (30 of 67) just before, after the M88 merge of main.
    reportTally(ctx, 'Woodland, Normal, Elimination', tallyBalance(SEEDS, SECONDS, botConfig('normal'), 'elimination', WOODLAND, TEAM_SIZE), 'elimination', LEVELS_BAND, 'the downhill end');
  });

  // Measured 2026-10-05 (M71, seeds 1-8): end 0 wins 52.6 % (30 of 57 decided), none on time (audit, as shipped: 45 % of
  // rounds on time). M88 (5v5, the West Rise): 52.3 % (34 of 65), none on time; 62.7 % (37 of 59) just before, at 4v4.
  it('Hard: measures each end\'s share of the decided rounds (target 35-65 %) and the rounds that run out the clock', { timeout: 300_000 }, (ctx) => {
    // M87 (2026-10-11, hunting bots check by eye and share it): 60.7 % (37 of 61), none on time; M88 QA (one lane point
    // fewer a lane in the fort) 56.1 % (37 of 66), none on time.
    // M87 lean-spot yield (2026-10-11: a bot at a lean spot walks aside for a teammate walking past):
    // 46.7 % (28 of 60), none on time; 45.5 % (25 of 55) just before, after the M88 merge of main.
    reportTally(ctx, 'Woodland, Hard, Elimination', tallyBalance(SEEDS, SECONDS, botConfig('hard'), 'elimination', WOODLAND, TEAM_SIZE), 'elimination', LEVELS_BAND, 'the downhill end');
  });
});
