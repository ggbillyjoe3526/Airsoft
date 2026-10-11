import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../../config/bots';
import { WOODLAND } from '../../map/woodland';
import { initPhysics } from '../../physics/physicsWorld';
import { tallyBalance } from '../depotMatchSupport';
import { reportTally } from './balanceSupport';

/** Woodland plays 5v5 (M88; 4v4 before), at night with its bushes (sightConditionsOf, as woodlandMatch*.test.ts play it). */
const TEAM_SIZE = 5;
/** Long enough for a whole match, first to 5 (the longest of these seeds takes about 13 minutes of game time). */
const SECONDS = 900;
/*
 * The attackers' band is the plan's PRO_BAND again (M88 QA, 2026-10-11). From M57 to M88 its floor was 15 %, M57's 24 %
 * (33 % since M71's torch discipline) less two standard errors, until a measure brought them into the band: M88 (5v5,
 * the West Rise) read 55.7 % on seeds 1-16, and a second measure on seeds 17-32 51.6 % (nightRoster.test.ts pins it).
 */

describe('a 5v5 Attack / Defend match on Woodland, both teams on Pro (M40)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('measures the attackers\' share of rounds (target 40-60 %) and the rounds that run out the clock', { timeout: 600_000 }, (ctx) => {
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
    // M88 (2026-10-11, 5v5, the West Rise and a lower east end): 55.7 % (68 of 122), none on time.
    // M87 (2026-10-11, hunting bots check by eye and share it): 55.7 % (68 of 122), none on time: nobody hunts here.
    // M88 QA (one lane point fewer a lane in the fort, woodlandLevels.balance.ts): 54.9 % (67 of 122), none on time;
    // seeds 17-32 51.6 % (64 of 124), none on time, so 53.3 % over 32 seeds.
    // M87 lean-spot yield (2026-10-11: a bot at a lean spot walks aside for a teammate walking past):
    // 61.3 % (76 of 124), none on time; seeds 17-32 53.4 % (63 of 118), so 57.4 % over 32 seeds. Just before, after the
    // M88 merge of main: 63.6 % (75 of 118) and 55.9 % (66 of 118), 59.7 % over 32 seeds.
    reportTally(ctx, 'Woodland, Pro, Attack / Defend', tallyBalance(16, SECONDS, botConfig('pro'), 'attackDefend', WOODLAND, TEAM_SIZE), 'attackDefend');
  });
});
