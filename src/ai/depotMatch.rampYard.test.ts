import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { SQUAD_ORDERS } from '../config/squad';
import { RAMP_YARD } from '../map/testYard';
import { initPhysics } from '../physics/physicsWorld';
import { expectGrounded, playFollowMatch, playMatch } from './depotMatchSupport';

describe('a 3v3 bot match on the Ramp Yard', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays out rounds over a ramp: bots reach the upper level, walk-offs come down to the dead zone, nobody steps off an open edge', { timeout: 60_000 }, () => {
    // Fighting bots sidestep along the platform's open edges: before they checked for drops, 4 of these
    // 6 seeds had one fall off (13-18 ticks in the air).
    const spots = RAMP_YARD.deadZones.flat().map((s) => s.position);
    let walkedDown = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const stats = playMatch(60, seed, undefined, BOTS, 'elimination', ROUNDS, RAMP_YARD);
      expect(stats.rounds, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      // Someone still in play stood on the platform (1 m up).
      expect(stats.maxAliveY, `seed ${seed}`).toBeGreaterThan(1);
      // Everyone hit on the platform walked all the way to a dead-zone spot on the floor below.
      const down = stats.walkOffs.filter((w) => w.fromY > 1 && w.to.y < 0.1);
      walkedDown += down.length;
      for (const w of down) expect(Math.min(...spots.map((p) => Math.hypot(p.x - w.to.x, p.z - w.to.z))), `seed ${seed}`).toBeLessThanOrEqual(HITS.deadZoneArrive);
      expectGrounded(stats, RAMP_YARD);
    }
    expect(walkedDown).toBeGreaterThan(0);
  });

  it('has bot teammates follow a leader over the ramp and along the platform without stepping off an edge (M-08)', { timeout: 60_000 }, () => {
    // A smoke test of Follow me over drops: it passes without M-08's drop check too (the followers here never turn
    // along an edge), so squadOrders.test.ts's pit case is the regression guard for that.
    // Measured 2026-10-04 (seeds 1-3, 60 s): within a few metres of the leader all the time, at worst about 4.4 m
    // behind, never in the air.
    for (const seed of [1, 2, 3]) {
      const { stats, counted, near, worst } = playFollowMatch(60, seed, RAMP_YARD);
      expect(counted, `seed ${seed}`).toBeGreaterThan(500);
      expect(near / counted, `seed ${seed}`).toBeGreaterThan(0.9);
      expect(worst, `seed ${seed}`).toBeLessThan(SQUAD_ORDERS.catchUp);
      expect(stats.maxAliveY, `seed ${seed}`).toBeGreaterThan(1); // someone went up on the platform
      expectGrounded(stats, RAMP_YARD);
    }
  });
});
