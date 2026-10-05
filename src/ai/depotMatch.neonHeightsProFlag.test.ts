import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../config/bots';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { initPhysics } from '../physics/physicsWorld';
import { expectProBalance, tallyBalance } from './depotMatchSupport';

/** Neon Heights plays 4v4 (M34c), by day: the map has no night yet. */
const TEAM_SIZE = 4;

describe('a 4v4 Attack / Defend match on Neon Heights, both teams on Pro (M40)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps the attackers at 40-60 % of rounds, and rounds end before the clock', { timeout: 300_000 }, () => {
    // Measured 2026-10-05 (M40, seeds 1-32, 400 s each): attackers win 55 % (118 of 215 rounds), none on time; seeds
    // 33-64 55 % (118 of 214). With tree-gap angles taken between any narrow blocks (a wall's stub by a door counted as a
    // post) it was 59 %: posts are now about square (anglePostSquareness). Hard on seeds 1-32: 55 % (128 of 231), none on
    // time. Re-measure with this test after any bot or layout change.
    expectProBalance(tallyBalance(32, 400, botConfig('pro'), 'attackDefend', NEON_HEIGHTS, TEAM_SIZE), 'attackDefend', 'Neon Heights Pro');
  });
});
