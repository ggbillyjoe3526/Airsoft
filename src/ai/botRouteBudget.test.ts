import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { NAV } from '../config/nav';
import type { MapData } from '../map/mapTypes';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND } from '../map/woodland';
import type { NavSearch } from '../nav/navGrid';
import { initPhysics } from '../physics/physicsWorld';
import { BotController } from './botController';
import { playMatch } from './depotMatchSupport';

/**
 * M74 acceptance 2: the bots' route searches run under NAV.searchBudget node expansions a tick, in all. The probe reads
 * what the controller's one NavSearch spends: planRoutes (private; wrapped on the prototype for the test, restored
 * after) puts a counting accessor on the search's `expanded` before the first search runs, so every stepRoute call
 * of every tick is counted, tick 0 included. Production code is untouched. (Test files share a worker's modules, so a
 * vi.mock of navGrid would not reach a controller module already loaded.)
 */

const SECONDS = 60;
/** Woodland and Neon Heights play 4v4. */
const TEAM_SIZE = 4;

const proto = BotController.prototype as unknown as { planRoutes(): void };
const realPlanRoutes = proto.planRoutes;

interface Tally {
  /** Spent this tick over every stepRoute call, and the largest tick. */
  tick: number;
  calls: number;
  /** Spent by the search under way (a search is one generation of the NavSearch), and the longest search in all. */
  search: number;
  generation: number;
  longestSearch: number;
}
let tally: Tally;

function count(s: NavSearch): void {
  let last = s.expanded;
  Object.defineProperty(s, 'expanded', {
    configurable: true,
    get: () => last,
    set: (v: number) => {
      last = v;
      tally.tick += v;
      tally.calls++;
      if (s.generation !== tally.generation) {
        tally.generation = s.generation;
        tally.search = 0;
      }
      tally.search += v;
      tally.longestSearch = Math.max(tally.longestSearch, tally.search);
    },
  });
}

function measure(map: MapData, seed: number) {
  tally = { tick: 0, calls: 0, search: 0, generation: -1, longestSearch: 0 };
  const hooked = new WeakSet<object>();
  proto.planRoutes = function (this: { search: NavSearch }) {
    if (!hooked.has(this.search)) {
      hooked.add(this.search);
      count(this.search);
    }
    realPlanRoutes.call(this);
  };
  const out = { maxTick: 0, busyTicks: 0, ticks: 0, atBudget: 0 };
  try {
    playMatch(SECONDS, seed, undefined, BOTS, 'elimination', ROUNDS, map, TEAM_SIZE, HITS, () => {
      out.ticks++;
      out.maxTick = Math.max(out.maxTick, tally.tick);
      if (tally.tick > 0) out.busyTicks++;
      if (tally.tick >= NAV.searchBudget) out.atBudget++;
      tally.tick = 0;
    });
  } finally {
    proto.planRoutes = realPlanRoutes;
  }
  return out;
}

afterAll(() => {
  proto.planRoutes = realPlanRoutes;
});

describe.each([
  ['Woodland', WOODLAND],
  ['Neon Heights', NEON_HEIGHTS],
])('bot route searches under a per-tick budget on %s (M74, acceptance 2)', (name, map) => {
  beforeAll(async () => {
    await initPhysics();
  });

  it(`no tick of a ${SECONDS} s 4v4 expands more than NAV.searchBudget nodes in all, and searches longer than that carry over`, { timeout: 120_000 }, () => {
    const seen = measure(map, 1);
    console.log(`QA M74 probe ${name}: ${JSON.stringify(seen)}, stepRoute calls ${tally.calls}, longest search ${tally.longestSearch}`);
    expect(NAV.searchBudget).toBeGreaterThan(0);
    expect(Number.isFinite(NAV.searchBudget)).toBe(true);
    expect(seen.ticks).toBe(SECONDS * 60);
    expect(seen.busyTicks, 'the bots did search').toBeGreaterThan(10);
    expect(seen.maxTick).toBeLessThanOrEqual(NAV.searchBudget);
    // The probe bites: a search longer than one tick's budget ran (it carried over), and a tick spent its whole budget.
    expect(tally.longestSearch).toBeGreaterThan(NAV.searchBudget);
    expect(seen.atBudget).toBeGreaterThan(0);
  });
});
