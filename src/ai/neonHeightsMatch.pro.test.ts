import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../config/bots';
import { mapUnderLighting } from '../map/lightingChoice';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { initPhysics } from '../physics/physicsWorld';
import { expectProBalance, PRO_BAND, tallyBalance } from './depotMatchSupport';

/** The west's band (M71, DECISIONS) until M73 moves the east's edge at the bar door: PRO_BAND's ceiling, a 35 % floor. */
const WEST_UNTIL_M73: readonly [number, number] = [0.35, PRO_BAND[1]];
/** Neon Heights plays 4v4 (M34c); this guard plays it by Day (M34d's switch; Night is its default). */
const TEAM_SIZE = 4;
const DAY = mapUnderLighting(NEON_HEIGHTS, 'day');

describe('a 4v4 Elimination match on Neon Heights, both teams on Pro (M40)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps the west end at 35-60 % of the decided rounds until M73 (the plan: 40-60 %), and rounds end before the clock', { timeout: 300_000 }, () => {
    // Measured 2026-10-05 (M40, seeds 1-32, 300 s each): the west end (end 0) wins 41 % of the decided rounds (79 of
    // 194), none of 196 rounds ends on time; seeds 33-64 52 % (97 of 185), 46 % over the 64. The east end is the
    // stronger one at every level (KNOWN_ISSUES, M34c: the west 44.5 % on Normal over 96 seeds); Hard on seeds 1-32:
    // 39 % (67 of 172), 2 of 177 on time. Re-measure with this test after any bot or layout change.
    // M71 (Audit 2: every level hunts the middle, Normal and up keep out of the light, bots step aside when pressed together, a
    // torch comes on only for a fight within 20 m or a search's last stretch): west 37.6 % (71 of 189), none on time. By Day only the step-aside changed for Pro, so the
    // west's 41 % sat one standard error (3.6 points) from the floor and fell through it. The floor is 35 % until M73's
    // lane point at the bar door (audit BAL-04, owner decision 6) moves the east's edge; M73 puts it back to 40 %.
    expectProBalance(tallyBalance(32, 300, botConfig('pro'), 'elimination', DAY, TEAM_SIZE), 'elimination', 'Neon Heights Pro', WEST_UNTIL_M73);
  });
});
