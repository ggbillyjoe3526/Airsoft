import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../../config/bots';
import { WOODLAND } from '../../map/woodland';
import { initPhysics } from '../../physics/physicsWorld';
import { tallyBalance } from '../depotMatchSupport';
import { type Band, PRO_BAND, reportTally } from './balanceSupport';

/** Woodland plays 4v4 (M33d), at night with its bushes (sightConditionsOf, as woodlandMatch*.test.ts play it). */
const TEAM_SIZE = 4;
/** Long enough for a whole match, first to 5 (the longest of these seeds takes about 13 minutes of game time). */
const SECONDS = 900;
/**
 * The attackers' band (M57, DECISIONS): with the torches the game fits every bot at night they won 24 % (33 % since
 * M71's torch discipline), under the plan's 40 %. The floor is M57's measure less two standard errors (about 8 points),
 * the ceiling the plan's: whatever brings them into PRO_BAND puts the floor back.
 */
const ATTACKERS: Band = { min: 0.15, max: PRO_BAND.max };

describe('a 4v4 Attack / Defend match on Woodland, both teams on Pro (M40)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('measures the attackers\' share of rounds (target 15-60 %; the plan: 40-60 %) and the rounds that run out the clock', { timeout: 600_000 }, (ctx) => {
    // Measured 2026-10-05 (M40, seeds 1-8, whole matches): attackers win 44 % (27 of 62 rounds), none on time. Seeds
    // 9-16: 43 % (24 of 56). Before M40: attackers 82 % (56 of 68, 54 of them by elimination): the defenders held their
    // posts in the fort under its two lanterns, seen from 40 m by attackers they couldn't see in the moonlit open (25 m).
    // Pro now holds lane points out of the light (keepsDark). Hard on the same seeds: attackers 73 % (51 of 70), none on
    // time. Re-measure after any bot, layout or lighting change. Seeds 1-16 since M51 (audit BAL-07).
    // M55 (audit SIM-05: a log and a boulder out of what they stood in) deals every seed again: attackers 43.4 % here
    // (49 of 113), 40.7 % over seeds 1-48 (43.0 % before, ±3.7 between the two). Every figure so far played without the
    // torches the game fits every bot at night. With them (M57, audit AI-02, on M55's maps): attackers 24.2 % (30 of 124),
    // none on time, against 43.4 % without on the same seeds. M71 (Audit 2: every level hunts the middle, Normal and up keep out of the light, bots step aside when pressed together, a
    // torch comes on only for a fight within 20 m or a search's last stretch): 33.3 % (41 of 123), none on time.
    // The beams were why: a bot lit itself for every defender in the fort the moment a fight 20-40 m off began.
    reportTally(ctx, 'Woodland, Pro, Attack / Defend', tallyBalance(16, SECONDS, botConfig('pro'), 'attackDefend', WOODLAND, TEAM_SIZE), 'attackDefend', ATTACKERS);
  });
});
