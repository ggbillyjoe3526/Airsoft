import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../config/bots';
import { mapUnderLighting } from '../map/lightingChoice';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { initPhysics } from '../physics/physicsWorld';
import { expectProBalance, tallyBalance } from './depotMatchSupport';

/** Neon Heights plays 4v4 (M34c); this guard plays it by Day (M34d's switch; Night is its default). */
const TEAM_SIZE = 4;
const DAY = mapUnderLighting(NEON_HEIGHTS, 'day');

describe('a 4v4 Attack / Defend match on Neon Heights, both teams on Pro (M40)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps the attackers at 40-60 % of rounds, and rounds end before the clock', { timeout: 300_000 }, () => {
    // Measured 2026-10-05 (M40, seeds 1-32, 400 s each): attackers win 55 % (118 of 215 rounds), none on time; seeds
    // 33-64 55 % (118 of 214). With tree-gap angles taken between any narrow blocks (a wall's stub by a door counted as a
    // post) it was 59 %: posts are now about square (anglePostSquareness). Hard on seeds 1-32: 55 % (128 of 231), none on
    // time. Re-measure with this test after any bot or layout change. M71 (Audit 2: every level hunts the middle, Normal and up keep out of the light, bots step aside when pressed together, a
    // torch comes on only for a fight within 20 m or a search's last stretch): 55.7 % (127 of 228),
    // none on time. M73 (the east's last mid-lane holds inside the bar's door line): 55.6 % (124 of 223), none on time.
    expectProBalance(tallyBalance(32, 400, botConfig('pro'), 'attackDefend', DAY, TEAM_SIZE), 'attackDefend', 'Neon Heights Pro');
  });
});
