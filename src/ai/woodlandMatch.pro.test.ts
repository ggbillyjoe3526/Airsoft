import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../config/bots';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { expectProBalance, tallyBalance } from './depotMatchSupport';

/** Woodland plays 4v4 (M33d), at night with its bushes (sightConditionsOf, as woodlandMatch*.test.ts play it). */
const TEAM_SIZE = 4;
/** Long enough for a whole match, first to 5 (the longest of these seeds takes about 13 minutes of game time). */
const SECONDS = 900;

describe('a 4v4 Elimination match on Woodland, both teams on Pro (M40)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps each end at 40-60 % of the decided rounds, and rounds end before the clock', { timeout: 300_000 }, () => {
    // Measured 2026-10-05 (M40, seeds 1-8, whole matches): end 0 (downhill) wins 54 % of the decided rounds (34 of 63),
    // none of 63 rounds ends on time. Seeds 9-16 read 63 % (35 of 56, none on time): over 16 seeds 58 %, close to the
    // ceiling (KNOWN_ISSUES). Before M40 (Pro hunting the far end and holding lane points in the light): end 0 61 %
    // (27 of 44) and 38 of 82 rounds drawn on time, as both teams swept a lane each to the other's camp and searched
    // there. Hard on the same seeds: end 0 53 % (21 of 40), 38 of 78 on time (Normal's 67 % and half on time are the
    // Woodland thread's, KNOWN_ISSUES). Re-measure with this test after any bot, layout, lighting or round-time change.
    expectProBalance(tallyBalance(8, SECONDS, botConfig('pro'), 'elimination', WOODLAND, TEAM_SIZE), 'elimination', 'Woodland Pro');
  });
});
