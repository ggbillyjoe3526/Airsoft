import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../config/bots';
import { mapUnderLighting } from '../map/lightingChoice';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { initPhysics } from '../physics/physicsWorld';
import { expectProBalance, tallyBalance } from './depotMatchSupport';

/** Neon Heights plays 4v4 (M34c); this guard plays it by Day (M34d's switch; Night is its default). */
const TEAM_SIZE = 4;
const DAY = mapUnderLighting(NEON_HEIGHTS, 'day');

describe('a 4v4 Elimination match on Neon Heights, both teams on Pro (M40)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps each end at 40-60 % of the decided rounds, and rounds end before the clock', { timeout: 300_000 }, () => {
    // Measured 2026-10-05 (M40, seeds 1-32, 300 s each): the west end (end 0) wins 41 % of the decided rounds (79 of
    // 194), none of 196 rounds ends on time; seeds 33-64 52 % (97 of 185), 46 % over the 64. The east end is the
    // stronger one at every level (KNOWN_ISSUES, M34c: the west 44.5 % on Normal over 96 seeds); Hard on seeds 1-32:
    // 39 % (67 of 172), 2 of 177 on time. Re-measure with this test after any bot or layout change.
    expectProBalance(tallyBalance(32, 300, botConfig('pro'), 'elimination', DAY, TEAM_SIZE), 'elimination', 'Neon Heights Pro');
  });
});
