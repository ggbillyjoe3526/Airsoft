import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { DEPOT } from '../map/depot';
import type { MapData } from '../map/mapTypes';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { playMatch } from './depotMatchSupport';

/**
 * OT1 (Dev 6 item 45): Elimination's overtime flag in bot matches on every map. Rounds cut to 25 s so most run out the
 * clock: the flag goes up, the bots go for it, and it is taken by a touch far more often than its time runs out. Bot
 * matches at the full round time almost never run the clock out (the time-out figures, pipeline/balance.mjs).
 */
const SHORT = { ...ROUNDS, roundTime: 25 };
/** Map, team size and how many seeds: Woodland plays four, since two of its seeds are too few overtimes to judge (WL2). */
const MAPS: [string, MapData, number, number][] = [
  ['Depot', DEPOT, ROUNDS.teamSize, 2],
  ['Woodland', WOODLAND, 5, 4],
  ['Neon Heights', NEON_HEIGHTS, 4, 2],
];

describe('the overtime flag in bot matches (OT1)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it.each(MAPS)('on %s the bots go and take it: by touch in most overtimes, each within its time', { timeout: 300_000 }, (_name, map, size, seeds) => {
    let overtimes = 0;
    let touched = 0;
    let timedOut = 0;
    const takers = [0, 0];
    for (let seed = 1; seed <= seeds; seed++) {
      let upAt = -1;
      playMatch(240, seed, undefined, BOTS, 'elimination', SHORT, map, size, undefined, (state) => {
        for (const e of state.events) {
          if (e.type === 'overtime') {
            overtimes++;
            upAt = state.time;
            expect(e.position).toEqual(map.overtimeFlag);
          } else if (e.type === 'roundOver' && upAt >= 0) {
            expect(state.time - upAt).toBeLessThanOrEqual(SHORT.overtime.time + 0.05);
            if (e.reason === 'overtimeFlag') {
              touched++;
              takers[e.winner]!++;
            } else if (e.reason === 'time') timedOut++;
            upAt = -1;
          }
        }
      });
    }
    expect(overtimes).toBeGreaterThanOrEqual(4);
    // Taken by a touch far more often than its time runs out; a wipe-out still wins an overtime, and since walking aims
    // as steady as standing (MV1, the owner's ruling) more overtimes end in one: Woodland seeds 1-6 end 18 of 40 by a
    // touch, none by time (21 of 37 before), so the floor is a third. Since WL2 (no boulders, lower fort walls) seeds 1-6
    // end 19 of 36 by a touch, none by time, but seeds 1-2 alone only 3 of 12, so Woodland plays seeds 1-4 (11 of 25).
    expect(touched).toBeGreaterThan(3 * timedOut);
    expect(touched).toBeGreaterThanOrEqual(overtimes / 3);
    expect(takers[0]! + takers[1]!).toBe(touched);
  });
});
