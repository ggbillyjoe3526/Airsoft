import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../config/bots';
import { mapUnderLighting } from '../map/lightingChoice';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { initPhysics } from '../physics/physicsWorld';
import { expectProBalance, tallyBalance } from './depotMatchSupport';

/** Neon Heights plays 4v4 (M34c); this guard plays it by Night (its default, M34d, lit by M34e). */
const TEAM_SIZE = 4;
const NIGHT = mapUnderLighting(NEON_HEIGHTS, 'night');

describe('a 4v4 Elimination match on Neon Heights by Night, both teams on Pro (M40, M41)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps each end at 40-60 % of the decided rounds, and rounds end before the clock', { timeout: 300_000 }, () => {
    // Measured 2026-10-05 (M57, seeds 1-32, 300 s each, every bot carrying the torch the game fits it at night, audit
    // AI-02, on M55's maps): the west end (end 0) wins 50.8 % of the decided rounds (93 of 183), 1 of 187 rounds ends
    // on time. Before M57 the guard played without torches: west 41.7 % (73 of 175), 3 of 180 on time; Hard on the same
    // seeds 41.2 % (75 of 182), none on time. By Day the east end is the stronger (KNOWN_ISSUES). Re-measure with this
    // test after any bot, layout or night-sight change.
    expectProBalance(tallyBalance(32, 300, botConfig('pro'), 'elimination', NIGHT, TEAM_SIZE), 'elimination', 'Neon Heights by Night Pro');
  });
});
