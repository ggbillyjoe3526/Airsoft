import { describe, expect, it } from 'vitest';
import { NAV } from '../config/nav';
import { DEPOT } from '../map/depot';
import { TEST_YARD } from '../map/testYard';
import { type Vec3, vec3 } from '../sim/vec';
import { buildNavGrid, clearLine, createNavSearch, findPath, isWalkableAt, nearestWalkable } from './navGrid';

const yard = buildNavGrid(TEST_YARD, NAV);
const depot = buildNavGrid(DEPOT, NAV);

/** Every leg of the route is walkable in a straight line, and it ends at the goal. */
function checkRoute(grid: typeof yard, from: Vec3, to: Vec3, path: Vec3[]): void {
  let px = from.x;
  let pz = from.z;
  for (const p of path) {
    expect(clearLine(grid, px, pz, p.x, p.z), `leg to ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBe(true);
    px = p.x;
    pz = p.z;
  }
  expect(Math.hypot(px - to.x, pz - to.z)).toBeLessThan(NAV.cell);
}

describe('nav grid', () => {
  it('blocks the crate plus clearance and the perimeter, and leaves open ground walkable', () => {
    expect(isWalkableAt(yard, 0, 0)).toBe(true);
    expect(isWalkableAt(yard, 0, -6)).toBe(false); // crate centre
    expect(isWalkableAt(yard, 0.6 + NAV.clearance - 0.05, -6)).toBe(false); // within clearance of its side
    expect(isWalkableAt(yard, 0.6 + NAV.clearance + 0.15, -6)).toBe(true);
    expect(isWalkableAt(yard, 14.9, 0)).toBe(false); // against the wall
  });

  it('walks straight across open ground in one leg', () => {
    const path: Vec3[] = [];
    const from = vec3(-5, 0, 5);
    const to = vec3(5, 0, 5);
    expect(findPath(yard, createNavSearch(yard), from, to, NAV.snap, path)).toBe(true);
    expect(path).toHaveLength(1);
    checkRoute(yard, from, to, path);
  });

  it('routes around the crate with straight, walkable legs', () => {
    const path: Vec3[] = [];
    const from = vec3(0, 0, -2);
    const to = vec3(0, 0, -10);
    expect(clearLine(yard, from.x, from.z, to.x, to.z)).toBe(false);
    expect(findPath(yard, createNavSearch(yard), from, to, NAV.snap, path)).toBe(true);
    expect(path.length).toBeGreaterThan(1);
    checkRoute(yard, from, to, path);
    const length = path.reduce((acc, p, i) => acc + Math.hypot(p.x - (i ? path[i - 1]!.x : from.x), p.z - (i ? path[i - 1]!.z : from.z)), 0);
    expect(length).toBeLessThan(8 + 2.5); // a short detour, not a lap of the yard
  });

  it('snaps ends that sit inside clearance to the nearest walkable cell', () => {
    const c = nearestWalkable(yard, 0, -6, NAV.snap);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(nearestWalkable(yard, 0, -6, 0.1)).toBe(-1);
  });

  it('finds a route between every pair of Depot spawns and to every dead-zone spot', () => {
    const search = createNavSearch(depot);
    const path: Vec3[] = [];
    const points = [...DEPOT.spawns[0], ...DEPOT.spawns[1], ...DEPOT.deadZones[0], ...DEPOT.deadZones[1]].map((s) => s.position);
    for (const a of points) {
      expect(isWalkableAt(depot, a.x, a.z), `${a.x},${a.z} walkable`).toBe(true);
      for (const b of points) {
        if (a === b) continue;
        expect(findPath(depot, search, a, b, NAV.snap, path), `${a.x},${a.z} -> ${b.x},${b.z}`).toBe(true);
        checkRoute(depot, a, b, path);
      }
    }
  });

  it('reports no route into a sealed-off room', () => {
    // A walled 4 m room in an open yard: its inside is walkable but unreachable.
    const room = (x0: number, x1: number, z0: number, z1: number) => ({ kind: 'wall' as const, center: vec3((x0 + x1) / 2, 1.5, (z0 + z1) / 2), size: vec3(x1 - x0, 3, z1 - z0) });
    const map = {
      ...TEST_YARD,
      blocks: [...TEST_YARD.blocks, room(3, 11, 3, 3.4), room(3, 11, 10.6, 11), room(3, 3.4, 3, 11), room(10.6, 11, 3, 11)],
    };
    const g = buildNavGrid(map, NAV);
    const inside = vec3(7, 0, 7);
    expect(isWalkableAt(g, inside.x, inside.z)).toBe(true);
    const path: Vec3[] = [vec3()];
    expect(findPath(g, createNavSearch(g), vec3(-5, 0, -2), inside, NAV.snap, path)).toBe(false);
    expect(path).toHaveLength(0);
  });

  it('reuses the waypoint objects of the previous route', () => {
    const path: Vec3[] = [];
    const s = createNavSearch(yard);
    findPath(yard, s, vec3(0, 0, -2), vec3(0, 0, -10), NAV.snap, path);
    const first = path[0];
    findPath(yard, s, vec3(0, 0, -2.5), vec3(0.5, 0, -10), NAV.snap, path);
    expect(path[0]).toBe(first);
  });

  it('puts every Depot lane point on walkable ground, reachable from both spawns', () => {
    const search = createNavSearch(depot);
    const path: Vec3[] = [];
    expect(DEPOT.lanes).toHaveLength(3);
    for (const lane of DEPOT.lanes) {
      for (let i = 1; i < lane.length; i++) expect(lane[i]!.x).toBeGreaterThan(lane[i - 1]!.x); // west to east
      // Mirror-symmetric, like the map: both teams walk the same lane.
      for (let i = 0; i < lane.length; i++) {
        const m = lane[lane.length - 1 - i]!;
        expect(lane[i]!.x).toBeCloseTo(-m.x, 9);
        expect(lane[i]!.z).toBeCloseTo(m.z, 9);
      }
      for (const p of lane) {
        expect(isWalkableAt(depot, p.x, p.z), `${p.x},${p.z}`).toBe(true);
        for (const s of [DEPOT.spawns[0][0]!, DEPOT.spawns[1][0]!]) expect(findPath(depot, search, s.position, p, NAV.snap, path)).toBe(true);
      }
    }
  });
});

