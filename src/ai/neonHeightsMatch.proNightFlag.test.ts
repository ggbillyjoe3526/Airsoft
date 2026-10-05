import { beforeAll, describe, it } from 'vitest';
import { botConfig } from '../config/bots';
import { mapUnderLighting } from '../map/lightingChoice';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { initPhysics } from '../physics/physicsWorld';
import { expectProBalance, tallyBalance } from './depotMatchSupport';

/** Neon Heights plays 4v4 (M34c); this guard plays it by Night (its default, M34d, lit by M34e). */
const TEAM_SIZE = 4;
const NIGHT = mapUnderLighting(NEON_HEIGHTS, 'night');

describe('a 4v4 Attack / Defend match on Neon Heights by Night, both teams on Pro (M40, M41)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps the attackers at 40-60 % of rounds, and rounds end before the clock', { timeout: 300_000 }, () => {
    // Measured 2026-10-05 with M34e's night light (seeds 1-32, 400 s each): attackers win 50.2 % (107 of 213 rounds), none
    // on time; Hard on the same seeds 54.3 % (132 of 243), none on time. Re-measure with this test after any bot, layout or
    // night-sight change.
    expectProBalance(tallyBalance(32, 400, botConfig('pro'), 'attackDefend', NIGHT, TEAM_SIZE), 'attackDefend', 'Neon Heights by Night Pro');
  });
});
