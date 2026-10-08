import { describe, expect, it } from 'vitest';
import { BOT_BEHAVIOUR } from '../config/bots';
import { placeRun, type RunPlan } from './extractionBlock';
import { MAPS, mapData } from './maps';

/**
 * M72 QA: the optional `insertionBerth` of a map's Extraction block (BAL-05, a contract addition): a map that sets none
 * has no key at all (the bots' shared default holds), Woodland sets 30 m, and the block format passes it through.
 */
const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const at = { point: ([x, y, z]: readonly [number, number, number]) => ({ x, y, z }), spawn: ([x, y, z]: readonly [number, number, number], yaw: number) => ({ position: { x, y, z }, yaw }) };
const PLAN: RunPlan = {
  runTime: 300,
  baseOpponents: 2,
  regenDistance: 15,
  exitRadius: 2,
  insertions: [{ name: 'West', spawns: [{ position: { x: 0, y: 0, z: 0 }, yaw: 0 }], end: 0 }],
  exits: [],
  opponentStarts: [],
  cases: [],
  regens: [],
} as unknown as RunPlan;

describe('M72 QA: the insertion berth in the Extraction block', () => {
  it('is passed through from the plan to the placed data, and is absent (no key, not undefined) when the plan has none', () => {
    expect(placeRun({ ...PLAN, insertionBerth: 30 }, at).insertionBerth).toBe(30);
    expect(placeRun({ ...PLAN, insertionBerth: 0 }, at).insertionBerth).toBe(0);
    const none = placeRun(PLAN, at);
    expect('insertionBerth' in none).toBe(false);
  });

  it('is 30 m on Woodland, wider than the bots’ shared default sized for Depot, and set on no other map', () => {
    expect(mapData('woodland').extraction?.insertionBerth).toBe(30);
    expect(30).toBeGreaterThan(BOT_BEHAVIOUR.insertionBerth);
    for (const { id } of MAPS) if (id !== 'woodland') expect(mapData(id).extraction?.insertionBerth, id).toBeUndefined();
  });

  it('bites on Woodland: every insertion has a case the shared berth would patrol that the 30 m one keeps clear', () => {
    const x = mapData('woodland').extraction!;
    for (const ins of x.insertions) {
      const c = ins.spawns.reduce((s, p) => ({ x: s.x + p.position.x / ins.spawns.length, z: s.z + p.position.z / ins.spawns.length }), { x: 0, z: 0 });
      const nearest = Math.min(...x.cases.map((k) => flat(k.position, c)));
      expect(nearest, ins.name).toBeLessThan(x.insertionBerth!);
      expect(nearest, ins.name).toBeGreaterThanOrEqual(BOT_BEHAVIOUR.insertionBerth);
    }
  });
});
