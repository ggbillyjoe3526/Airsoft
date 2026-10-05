import { describe, expect, it } from 'vitest';
import { FACING, placeRun, type PlanPlacer, type RunPlan, SPOT_KINDS } from './extractionBlock';
import { mapData } from './maps';
import { vec3 } from '../sim/vec';

/**
 * The Extraction block both dev maps build through (M50, audit CORE-16). A stub placer marks which of its two calls
 * placed a value (a point is lifted 100 in x, a spawn 200 in z), so a swapped call or a dropped y shows.
 */
const PLACER: PlanPlacer = {
  point: ([x, y, z]) => vec3(x + 100, y, z),
  spawn: ([x, y, z], yaw) => ({ position: vec3(x, y, z + 200), yaw }),
};

const PLAN: RunPlan = {
  runTime: 480,
  baseOpponents: 3,
  regenDistance: 14,
  exitRadius: 2.5,
  insertions: [
    { name: 'West', spawns: [{ position: vec3(1, 0, 2), yaw: 0.5 }], end: 0 },
    { name: 'East', spawns: [{ position: vec3(-1, 0, -2), yaw: -0.5 }], end: 1 },
  ],
  exits: [
    { name: 'Open gate', at: [1, 0, 2] },
    { name: 'Late gate', at: [3, 3, 4], late: true },
  ],
  opponentStarts: [
    [5, 0, 6],
    [7, 3, 8],
  ],
  cases: [
    [9, 6, 10, FACING.north, SPOT_KINDS.locker],
    [11, 3, 12, FACING.east, SPOT_KINDS.room],
    [13, 0, 14, FACING.west, SPOT_KINDS.lane],
  ],
  regens: [
    [15, 3, 16, FACING.south],
    [17, 6, 18, FACING.east],
  ],
};

describe('a map plan placed as Extraction data (M50)', () => {
  const x = placeRun(PLAN, PLACER);

  it('carries the run numbers over unchanged', () => {
    expect(x.runTime).toBe(480);
    expect(x.baseOpponents).toBe(3);
    expect(x.regenDistance).toBe(14);
  });

  it('puts exits through the point placer with the shared radius, and marks only the late ones', () => {
    expect(x.exits.map((e) => [e.name, e.position.x, e.position.y, e.position.z, e.radius])).toEqual([
      ['Open gate', 101, 0, 2, 2.5],
      ['Late gate', 103, 3, 4, 2.5],
    ]);
    expect('late' in x.exits[0]!).toBe(false);
    expect(x.exits[1]!.late).toBe(true);
  });

  it('starts every home-team opponent facing 0 through the spawn placer, keeping the floor height', () => {
    expect(x.opponentStarts).toEqual([
      { position: vec3(5, 0, 206), yaw: 0 },
      { position: vec3(7, 3, 208), yaw: 0 },
    ]);
  });

  it('places each case with its own facing, its floor height and its spot kinds', () => {
    expect(x.cases).toEqual([
      { position: vec3(9, 6, 210), yaw: Math.PI, kinds: ['locker', 'field-case'] },
      { position: vec3(11, 3, 212), yaw: -Math.PI / 2, kinds: ['field-case', 'ammo-can'] },
      { position: vec3(13, 0, 214), yaw: Math.PI / 2, kinds: ['ammo-can'] },
    ]);
  });

  it('places each regen with its own facing and floor height', () => {
    expect(x.regens).toEqual([
      { position: vec3(15, 3, 216), yaw: 0 },
      { position: vec3(17, 6, 218), yaw: -Math.PI / 2 },
    ]);
  });

  it('keeps insertions (name, end, spawns as given, world coordinates already) without placing them again', () => {
    expect(x.insertions.map((i) => [i.name, i.end, i.spawns])).toEqual([
      ['West', 0, [{ position: vec3(1, 0, 2), yaw: 0.5 }]],
      ['East', 1, [{ position: vec3(-1, 0, -2), yaw: -0.5 }]],
    ]);
  });

  it('copies the plan\'s arrays, so the built block can be changed without touching the plan', () => {
    expect(x.insertions[0]!.spawns).not.toBe(PLAN.insertions[0]!.spawns);
    expect(x.cases[0]!.kinds).not.toBe(SPOT_KINDS.locker);
    x.cases[0]!.kinds.push('changed');
    x.insertions[0]!.spawns.pop();
    expect(SPOT_KINDS.locker).toEqual(['locker', 'field-case']);
    expect(PLAN.insertions[0]!.spawns).toHaveLength(1);
  });
});

describe('the shared case-spot kinds and facings (M50)', () => {
  it('lets the locker spot hold a locker or a field case, a room a field case or an ammo can, a lane an ammo can', () => {
    expect(SPOT_KINDS).toEqual({ locker: ['locker', 'field-case'], room: ['field-case', 'ammo-can'], lane: ['ammo-can'] });
  });

  it('gives the four plan directions their spawn yaws (north back to the south wall, east a quarter turn clockwise)', () => {
    expect(FACING).toEqual({ north: Math.PI, south: 0, east: -Math.PI / 2, west: Math.PI / 2 });
  });

  for (const id of ['woodland', 'neonHeights'] as const) {
    it(`holds every ${id} case spot to one of the kind sets, with at least one locker spot`, () => {
      const x = mapData(id).extraction!;
      const sets = Object.values(SPOT_KINDS).map((k) => k.join('|'));
      for (const c of x.cases) expect(sets, `${c.position.x},${c.position.z}`).toContain(c.kinds.join('|'));
      expect(x.cases.some((c) => c.kinds.join('|') === SPOT_KINDS.locker.join('|'))).toBe(true);
    });
  }
});
