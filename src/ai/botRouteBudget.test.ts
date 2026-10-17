import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { ROUNDS } from '../config/hits';
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

/**
 * Long enough for a search over budget to run. Woodland's come once a bot hunts, after its lanes: since its lanes lost
 * the points at the fort's baffles (M88 QA, 2026-10-11) no search in its first 60 s runs past the budget (seeds 1-4).
 */
const SECONDS = { Woodland: 120, 'Neon Heights': 60 } as const;
/** Neon Heights plays 4v4; Woodland is checked at its largest, 6v6 (M88), where the most bots search at once. */
const TEAM_SIZE = { Woodland: 6, 'Neon Heights': 4 } as const;
/**
 * The match's seed. Woodland's is 6 since MV1 (the holstered run and the steadier walk): MS1 had moved it to 4 (seed 1's
 * longest search fell to 7,877 nodes, under the budget, and seeds 2 and 3 ran none longer either), and after MV1 seed
 * 4's longest is 6,442; seeds 5, 6 and 7 run to 15,046, 11,575 and 9,704, and 6 spends a tick's whole budget most often
 * (5 ticks).
 */
const SEED = { Woodland: 6, 'Neon Heights': 1 } as const;

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

function measure(map: MapData, seed: number, teamSize: number, seconds: number) {
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
    // Bots without personalities (BN1): this measures the route budget, and the probe needs searches longer than a
    // tick's budget. On Woodland's seed 1 the neutral bots ran one of 12,419 nodes; with personalities drawn (anchors
    // hold, rushers push) the longest was 6,857 and the probe had nothing to carry over.
    playMatch(seconds, seed, undefined, BOTS, 'elimination', ROUNDS, map, teamSize, undefined, () => {
      out.ticks++;
      out.maxTick = Math.max(out.maxTick, tally.tick);
      if (tally.tick > 0) out.busyTicks++;
      if (tally.tick >= NAV.searchBudget) out.atBudget++;
      tally.tick = 0;
    }, undefined, undefined, new Map());
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
] as const)('bot route searches under a per-tick budget on %s (M74, acceptance 2)', (name, map) => {
  beforeAll(async () => {
    await initPhysics();
  });

  it(`no tick of a ${SECONDS[name]} s ${TEAM_SIZE[name]}v${TEAM_SIZE[name]} expands more than NAV.searchBudget nodes in all, and searches longer than that carry over`, { timeout: 120_000 }, () => {
    const seen = measure(map, SEED[name], TEAM_SIZE[name], SECONDS[name]);
    console.log(`QA M74 probe ${name}: ${JSON.stringify(seen)}, stepRoute calls ${tally.calls}, longest search ${tally.longestSearch}`);
    expect(NAV.searchBudget).toBeGreaterThan(0);
    expect(Number.isFinite(NAV.searchBudget)).toBe(true);
    expect(seen.ticks).toBe(SECONDS[name] * 60);
    expect(seen.busyTicks, 'the bots did search').toBeGreaterThan(10);
    expect(seen.maxTick).toBeLessThanOrEqual(NAV.searchBudget);
    // The probe bites: a search longer than one tick's budget ran (it carried over), and a tick spent its whole budget.
    expect(tally.longestSearch).toBeGreaterThan(NAV.searchBudget);
    expect(seen.atBudget).toBeGreaterThan(0);
  });
});
