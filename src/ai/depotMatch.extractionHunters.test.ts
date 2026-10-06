import { beforeAll, expect, it } from 'vitest';
import { botConfig } from '../config/bots';
import { DEPOT } from '../map/depot';
import { initPhysics } from '../physics/physicsWorld';
import { playRun, RUNNER_PLAN_CAREFUL, type RunResult } from './extractionRunSupport';

beforeAll(async () => {
  await initPhysics();
});

/**
 * The home team's hunters (M46) measured at last (Audit 2 BAL-06, owner decision 5): RUNNER_PLAN's quick runs end before
 * hunting time, so the guard plays the careful runner (five cases, 20 s at each) as a ghost nobody can hit, whose runs
 * last past it (against Hard a careful runner who can be hit is out in 13-74 s, seeds 1-8). On Depot, the shortest
 * run, against Hard (hunters from a third of the run).
 */
it('has the home team hunt the squad in at least half the runs that last past its hunting time (Hard, Depot)', { timeout: 300_000 }, () => {
  const hard = botConfig('hard');
  const huntingFrom = DEPOT.extraction!.runTime * hard.huntersFrom!;
  const runs: RunResult[] = [];
  for (let seed = 1; seed <= 8; seed++) runs.push(playRun({ seed, map: DEPOT, opponents: 'hard', teammates: 'normal', plan: RUNNER_PLAN_CAREFUL, ghost: true }));
  const long = runs.filter((r) => r.seconds > huntingFrom);
  const said = JSON.stringify(runs.map((r) => ({ reason: r.reason, seconds: Math.round(r.seconds), hunters: r.hunters })));
  // Measured 2026-10-05 (M72): seven of the eight runs last past hunting time (160 s), the ghost runner out with its
  // cases at 168-214 s or caught at the exits until time; every one of the seven ends with 2-4 hunters. The one under
  // 160 s (155 s) has none.
  expect(long.length, said).toBeGreaterThan(0);
  expect(long.filter((r) => r.hunters > 0).length, said).toBeGreaterThanOrEqual(long.length / 2);
});
