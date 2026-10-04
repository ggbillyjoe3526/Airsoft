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
    // in the air.
    const spots = STACK_HOUSE.deadZones.flat().map((s) => s.position);
    let walkedDown = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const stats = playMatch(120, seed, undefined, BOTS, 'elimination', ROUNDS, STACK_HOUSE);
      expect(stats.rounds, `seed ${seed}`).toBeGreaterThanOrEqual(5);
      expect(stats.maxAliveY, `seed ${seed}`).toBeGreaterThan(UPSTAIRS);
      const down = stats.walkOffs.filter((w) => w.fromY > UPSTAIRS && w.to.y < 0.1);
      walkedDown += down.length;
      for (const w of down) expect(Math.min(...spots.map((p) => Math.hypot(p.x - w.to.x, p.z - w.to.z))), `seed ${seed}`).toBeLessThanOrEqual(HITS.deadZoneArrive);
      expectGrounded(stats, STACK_HOUSE);
    }
    expect(walkedDown).toBeGreaterThanOrEqual(2);
  });

  it('has bot teammates follow a leader up a stair and across the upper floor without stepping off an edge', { timeout: 60_000 }, () => {
    // Measured 2026-10-04 (seeds 1-3, 60 s): within a few metres of the leader all the time, at worst about 5.3 m behind.
    for (const seed of [1, 2, 3]) {
      const { stats, counted, near, worst } = playFollowMatch(60, seed, STACK_HOUSE);
      expect(counted, `seed ${seed}`).toBeGreaterThan(500);
      expect(near / counted, `seed ${seed}`).toBeGreaterThan(0.9);
      expect(worst, `seed ${seed}`).toBeLessThan(SQUAD_ORDERS.catchUp);
      expect(stats.maxAliveY, `seed ${seed}`).toBeGreaterThan(UPSTAIRS);
      expectGrounded(stats, STACK_HOUSE);
    }
  });
});
