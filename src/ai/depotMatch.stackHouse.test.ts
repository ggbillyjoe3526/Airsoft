import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { SQUAD_ORDERS } from '../config/squad';
import { STACK_HOUSE } from '../map/testYard';
import { initPhysics } from '../physics/physicsWorld';
import { expectGrounded, playFollowMatch, playMatch } from './depotMatchSupport';

/** The Stack House's upper floor is 3 m up: anyone above this stands on it (or on a stair's top half). */
const UPSTAIRS = 2.5;

describe('a 3v3 bot match on the Stack House (floors over floors, M34b)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays out rounds on both floors: bots climb the stairs, walk-offs from upstairs come down to the dead zone, nobody steps off an open edge', { timeout: 60_000 }, () => {
    // Measured 2026-10-04 (seeds 1-8, 120 s): 7-9 rounds a match, someone alive upstairs in every match, three players
    // hit upstairs (seeds 3, 5 and 7), each of whom walked down a stair to a dead-zone spot; never more than 2 ticks
    // in the air. Seeds 1-12 since G12 (2026-10-10): the weaker bounce reshuffles the matches, and seeds 1-8 then hold
    // one player hit upstairs (main held two, the floor); every walk-off from upstairs still came down to its spot
    // (16 seeds: 8 of 8 after, 3 of 3 before). The floor of 2 is a sample size, not a rate.
    // With personalities (BN1) the rounds play out as fast on the whole, 6.4 a match over seeds 1-24 with and without
    // them, but one long round can leave a match at 4 (seed 11: rounds of 7, 32, 6 and 17 s): each match plays at least
    // 4, and the twelve at least 66 between them.
    const spots = STACK_HOUSE.deadZones.flat().map((s) => s.position);
    let walkedDown = 0;
    let rounds = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const stats = playMatch(120, seed, undefined, BOTS, 'elimination', ROUNDS, STACK_HOUSE);
      expect(stats.rounds, `seed ${seed}`).toBeGreaterThanOrEqual(4);
      rounds += stats.rounds;
      expect(stats.maxAliveY, `seed ${seed}`).toBeGreaterThan(UPSTAIRS);
      const down = stats.walkOffs.filter((w) => w.fromY > UPSTAIRS && w.to.y < 0.1);
      walkedDown += down.length;
      for (const w of down) expect(Math.min(...spots.map((p) => Math.hypot(p.x - w.to.x, p.z - w.to.z))), `seed ${seed}`).toBeLessThanOrEqual(HITS.deadZoneArrive);
      expectGrounded(stats, STACK_HOUSE);
    }
    expect(walkedDown).toBeGreaterThanOrEqual(2);
    expect(rounds).toBeGreaterThanOrEqual(66);
  });

  it('has bot teammates follow a leader up a stair and across the upper floor without stepping off an edge', { timeout: 60_000 }, () => {
    // Measured 2026-10-04 (seeds 1-3, 60 s): within a few metres of the leader all the time, at worst about 5.3 m behind.
    // The count is a sample size: with personalities (BN1) seed 3 counts 490 ticks (seeds 1-6: 490 to 2,070), every one
    // of them near. With each figure's own hit area (HV1, 2026-10-16) seed 1's leader is hit early: seeds 1-16 count 281
    // to 2,801 ticks, every one of them near, so the floor is 250. With RE1's longer pause between rounds and its bots
    // holding fire for a teammate speeding into the line (2026-10-18), seed 1 counts 232 (seeds 1-16: 66 to 1,938, every
    // one near), so the floor is 200.
    for (const seed of [1, 2, 3]) {
      const { stats, counted, near, worst } = playFollowMatch(60, seed, STACK_HOUSE);
      expect(counted, `seed ${seed}`).toBeGreaterThan(200);
      expect(near / counted, `seed ${seed}`).toBeGreaterThan(0.9);
      expect(worst, `seed ${seed}`).toBeLessThan(SQUAD_ORDERS.catchUp);
      expect(stats.maxAliveY, `seed ${seed}`).toBeGreaterThan(UPSTAIRS);
      expectGrounded(stats, STACK_HOUSE);
    }
  });
});
