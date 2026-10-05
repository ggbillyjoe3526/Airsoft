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

  it('keeps each end at 40-60 % of the decided rounds, and rounds end before the clock', { timeout: 600_000 }, () => {
    // Measured 2026-10-05 (M57, seeds 1-16, whole matches, every bot carrying the torch the game fits it at night,
    // audit AI-02): end 0 (downhill) wins 54.8 % of the decided rounds (68 of 124), none of 124 rounds ends on time.
    // Before M57 the guard played without torches: seeds 1-8 54 % (34 of 63), none on time; seeds 9-16 63 % (35 of 56):
    // over 16 seeds 58 %, close to the ceiling (KNOWN_ISSUES). Before M40 (Pro hunting the far end and holding lane
    // points in the light): end 0 61 % (27 of 44) and 38 of 82 rounds drawn on time, as both teams swept a lane each to
    // the other's camp and searched there. Hard on seeds 1-8 (without torches): end 0 53 % (21 of 40), 38 of 78 on time
    // (Normal's 67 % and half on time are the Woodland thread's, KNOWN_ISSUES). Re-measure with this test after any
    // bot, layout, lighting or round-time change. Seeds 1-16 since M50 (audit BAL-07): at 8 seeds one standard error is
    // about 6 points and the 54 % sat within reach of the ceiling either way; at 16 it is about 4.
    expectProBalance(tallyBalance(16, SECONDS, botConfig('pro'), 'elimination', WOODLAND, TEAM_SIZE), 'elimination', 'Woodland Pro');
  });
});
