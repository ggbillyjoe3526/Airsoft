import { beforeAll, describe, expect, it } from 'vitest';
import { BOT_BEHAVIOUR } from '../config/bots';
import { DEPOT } from '../map/depot';
import type { MapData } from '../map/mapTypes';
import { initPhysics } from '../physics/physicsWorld';
import type { Vec3 } from '../sim/vec';
import type { Bot } from './bot';
import { SAME_SIZE_AT_EVERY_LEVEL, setUpRun } from './extractionRunSupport';

/**
 * M72 QA: the map's insertion berth reaches the home team's roles (BAL-05). A berth the map gives replaces the bots'
 * shared default for who guards and patrols which case; the locker is guarded wherever it stands.
 */
const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const centreOf = (pts: readonly { position: Vec3 }[]) => ({ x: pts.reduce((s, p) => s + p.position.x / pts.length, 0), z: pts.reduce((s, p) => s + p.position.z / pts.length, 0) });
const home = (bots: readonly Bot[]) => bots.filter((b) => b.character.team === 1);
const withBerth = (insertionBerth: number | undefined): MapData => ({ ...DEPOT, extraction: { ...DEPOT.extraction!, ...(insertionBerth === undefined ? {} : { insertionBerth }) } });

/** The field cases some bot guards or patrols in a run on Depot with `map`, and how many lie within `range` of the insertion. */
function worked(map: MapData, seed: number, range: number) {
  const r = setUpRun({ seed, map, rules: SAME_SIZE_AT_EVERY_LEVEL });
  const c = centreOf(r.run.insertion);
  const cases = r.state.round.run.cases;
  const team = home(r.bots.bots);
  const near = new Set<number>();
  cases.forEach((k, i) => {
    if (flat(k.position, c) < range) near.add(i);
  });
  const covered = new Set<number>();
  cases.forEach((k, i) => {
    if (k.kind === 'locker') return;
    if (team.some((b) => (b.role === 'guard' && b.guardCase === i) || b.patrol?.cases.includes(i))) covered.add(i);
  });
  const nearCovered = [...near].filter((i) => covered.has(i));
  const lockerGuards = team.filter((b) => b.role === 'guard' && cases[b.guardCase]?.kind === 'locker').length;
  r.dispose();
  return { near: near.size, nearCovered: nearCovered.length, covered: covered.size, lockerGuards };
}

describe('M72 QA: the map’s insertion berth sets who is left to guard the cases by the door', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('a map with no berth uses the bots’ shared one: Depot’s run is the same as with that figure given', () => {
    for (const seed of [1, 2, 3]) {
      expect(worked(withBerth(undefined), seed, BOT_BEHAVIOUR.insertionBerth), `seed ${seed}`).toEqual(worked(withBerth(BOT_BEHAVIOUR.insertionBerth), seed, BOT_BEHAVIOUR.insertionBerth));
    }
  });

  it('a berth wider than the field leaves no field case guarded or patrolled, and the locker still guarded', () => {
    let lockers = 0;
    for (const seed of [1, 2, 3, 4]) {
      const w = worked(withBerth(10_000), seed, 10_000);
      expect(w.covered, `seed ${seed}`).toBe(0);
      expect(w.nearCovered).toBe(0);
      lockers += w.lockerGuards;
    }
    expect(lockers, 'the locker is guarded wherever it stands').toBeGreaterThan(0);
  });

  it('a berth of 0 leaves every field case to a guard or a patrol, including the ones the shared berth keeps clear', () => {
    let keptClearByDefault = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const shared = worked(withBerth(undefined), seed, BOT_BEHAVIOUR.insertionBerth);
      const none = worked(withBerth(0), seed, BOT_BEHAVIOUR.insertionBerth);
      expect(shared.nearCovered, `seed ${seed} shared berth`).toBe(0);
      expect(none.covered, `seed ${seed}`).toBeGreaterThanOrEqual(shared.covered);
      keptClearByDefault += none.nearCovered;
    }
    expect(keptClearByDefault, 'some seed puts a case by the door, and without a berth it is worked').toBeGreaterThan(0);
  });
});
