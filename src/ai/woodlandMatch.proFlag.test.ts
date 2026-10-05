import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../config/bots';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { expectProBalance, tallyBalance } from './depotMatchSupport';

/** Woodland plays 4v4 (M33d), at night with its bushes (sightConditionsOf, as woodlandMatch*.test.ts play it). */
const TEAM_SIZE = 4;
/** Long enough for a whole match, first to 5 (the longest of these seeds takes about 13 minutes of game time). */
const SECONDS = 900;

describe('a 4v4 Attack / Defend match on Woodland, both teams on Pro (M40)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps the attackers at 40-60 % of rounds, and rounds end before the clock', { timeout: 600_000 }, () => {
    // Measured 2026-10-05 (M40, seeds 1-8, whole matches): attackers win 44 % (27 of 62 rounds), none on time. Seeds
    // 9-16: 43 % (24 of 56). Before M40: attackers 82 % (56 of 68, 54 of them by elimination): the defenders held their
    // posts in the fort under its two lanterns, seen from 40 m by attackers they couldn't see in the moonlit open (25 m).
    // Pro now holds lane points out of the light (keepsDark). Hard on the same seeds: attackers 73 % (51 of 70), none on
    // time. Re-measure with this test after any bot, layout or lighting change. Seeds 1-16 since M51 (audit BAL-07).
    // M55 (audit SIM-05: a log and a boulder out of what they stood in) deals every seed again: attackers 43.4 % here
    // (49 of 113), 40.7 % over seeds 1-48 (43.0 % before, ±3.7 between the two).
    expectProBalance(tallyBalance(16, SECONDS, botConfig('pro'), 'attackDefend', WOODLAND, TEAM_SIZE), 'attackDefend', 'Woodland Pro');
  });
});
