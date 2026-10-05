import { describe, expect, it } from 'vitest';
import { NAV } from '../config/nav';
import { DEPOT } from '../map/depot';
import type { MapData } from '../map/mapTypes';
import { TEST_YARD } from '../map/testYard';
import { createRng, rngNext } from '../sim/rng';
import { type Vec3, vec3 } from '../sim/vec';
import {
  beginRoute,
  buildDistanceField,
  buildNavGrid,
  createNavSearch,
  descendField,
  endRoute,
  findPath,
  isWalkableAt,
  nearestWalkable,
  type NavGrid,
  stepRoute,
} from './navGrid';

/** M74: the multi-source distance field, the walk down it, and the route search run a budget at a time. */

const SQRT2 = Math.SQRT2;
const wall = (x0: number, x1: number, z0: number, z1: number) => ({ kind: 'wall' as const, center: vec3((x0 + x1) / 2, 1.5, (z0 + z1) / 2), size: vec3(x1 - x0, 3, z1 - z0) });

/**
 * Test Yard (30 m, walled, a crate) with a divider wall at x = 0 from the south wall up to z = 6 (open only at the
 * north end), and a sealed 8 m room on the east side.
 */
const WALLED: MapData = { ...TEST_YARD, blocks: [...TEST_YARD.blocks, wall(-0.2, 0.2, -15.2, 6), wall(3, 11, 3, 3.4), wall(3, 11, 10.6, 11), wall(3, 3.4, 3, 11), wall(10.6, 11, 3, 11)] };
const walled = buildNavGrid(WALLED, NAV);
const yard = buildNavGrid(TEST_YARD, NAV);
const depot = buildNavGrid(DEPOT, NAV);

const SOURCE_WEST = vec3(-10, 0, 0);
const INSIDE_ROOM = vec3(7, 0, 7);

const node = (g: NavGrid, p: Vec3) => nearestWalkable(g, p.x, p.y, p.z, NAV.snap);
const cellOf = (g: NavGrid, k: number) => [g.nodeCell[k]! % g.cols, Math.floor(g.nodeCell[k]! / g.cols)] as const;
/** Octile distance in cells between nodes a and b (the length of a shortest 8-neighbour route over open ground). */
function octile(g: NavGrid, a: number, b: number): number {
  const [ai, aj] = cellOf(g, a);
  const [bi, bj] = cellOf(g, b);
  const di = Math.abs(ai - bi);
  const dj = Math.abs(aj - bj);
  return Math.max(di, dj) + (SQRT2 - 1) * Math.min(di, dj);
}
/** Cost in cells of the node route (each step straight or diagonal). */
function routeCost(g: NavGrid, nodes: number[]): number {
  let c = 0;
  for (let i = 1; i < nodes.length; i++) {
    const [ai, aj] = cellOf(g, nodes[i - 1]!);
    const [bi, bj] = cellOf(g, nodes[i]!);
    const di = Math.abs(ai - bi);
    const dj = Math.abs(aj - bj);
    expect(Math.max(di, dj), 'each step goes to a neighbour cell').toBe(1);
    c += di + dj === 2 ? SQRT2 : 1;
  }
  return c;
}
/** Random walkable points of `g`'s area, seeded. */
function randomPoints(g: NavGrid, count: number, seed: number): Vec3[] {
  const rng = createRng(seed);
  const out: Vec3[] = [];
  while (out.length < count) {
    const x = g.minX + rngNext(rng) * g.cols * g.cell;
    const z = g.minZ + rngNext(rng) * g.rows * g.cell;
    if (isWalkableAt(g, x, 0, z)) out.push(vec3(x, 0, z));
  }
  return out;
}

describe('buildDistanceField (M74, acceptance 1)', () => {
  it('is 0 at the source and the octile walking distance, in cells, over open ground', () => {
    const src = node(yard, vec3(-8, 0, 8));
    const field = buildDistanceField(yard, [vec3(-8, 0, 8)], NAV.snap);
    expect(field).toBeInstanceOf(Float32Array);
    expect(field).toHaveLength(yard.floorY.length);
    expect(field[src]).toBe(0);
    // The yard's open north half (the crate stands in the south): every node there is its octile distance away.
    let checked = 0;
    for (let k = 0; k < field.length; k++) {
      const [i, j] = cellOf(yard, k);
      const x = yard.minX + (i + 0.5) * yard.cell;
      const z = yard.minZ + (j + 0.5) * yard.cell;
      if (!yard.walkable[k] || z < 1 || x < -12 || x > 12) continue;
      expect(field[k]!, `${x.toFixed(1)},${z.toFixed(1)}`).toBeCloseTo(octile(yard, src, k), 3);
      checked++;
    }
    expect(checked).toBeGreaterThan(5000);
    expect(field[node(yard, vec3(2, 0, 8))]! * NAV.cell).toBeCloseTo(10, 0); // 10 m east in a straight line
  });

  it('is +Infinity behind a sealed wall, and finite everywhere reachable', () => {
    const field = buildDistanceField(walled, [SOURCE_WEST], NAV.snap);
    expect(field[node(walled, SOURCE_WEST)]).toBe(0);
    expect(isWalkableAt(walled, INSIDE_ROOM.x, 0, INSIDE_ROOM.z)).toBe(true); // walkable, but walled in
    let room = 0;
    for (let k = 0; k < field.length; k++) {
      const [i, j] = cellOf(walled, k);
      const x = walled.minX + (i + 0.5) * walled.cell;
      const z = walled.minZ + (j + 0.5) * walled.cell;
      if (!walled.walkable[k]) continue;
      if (x > 3.8 && x < 10.2 && z > 3.8 && z < 10.2) {
        expect(field[k], `inside the room ${x.toFixed(1)},${z.toFixed(1)}`).toBe(Number.POSITIVE_INFINITY);
        room++;
      } else expect(Number.isFinite(field[k]!), `outside ${x.toFixed(1)},${z.toFixed(1)}`).toBe(true);
    }
    expect(room).toBeGreaterThan(500);
  });

  it('goes round a wall: the far side of the divider is much further than the straight line', () => {
    const field = buildDistanceField(walled, [SOURCE_WEST], NAV.snap);
    const far = node(walled, vec3(10, 0, -10)); // 20 m east of the source's z = -10 line, behind the divider
    const straight = octile(walled, node(walled, vec3(-10, 0, -10)), far); // 100 cells
    expect(field[far]!).toBeGreaterThan(straight * 1.4);
    expect(field[far]!).toBeLessThan(straight * 3);
  });

  it('with several sources is, at every node, the least of the sources’ own fields', () => {
    const east = vec3(10, 0, -10);
    const both = buildDistanceField(walled, [SOURCE_WEST, east], NAV.snap);
    const a = buildDistanceField(walled, [SOURCE_WEST], NAV.snap);
    const b = buildDistanceField(walled, [east], NAV.snap);
    expect(both[node(walled, east)]).toBe(0);
    expect(both[node(walled, SOURCE_WEST)]).toBe(0);
    for (let k = 0; k < both.length; k++) expect(both[k]!).toBeCloseTo(Math.min(a[k]!, b[k]!), 3);
  });

  it('snaps a source inside a wall’s clearance to the nearest walkable node, and drops one off the grid', () => {
    const crate = vec3(0, 0, -6); // the crate's centre: blocked, the nearest walkable node is a step away
    const field = buildDistanceField(yard, [crate], NAV.snap);
    const snapped = node(yard, crate);
    expect(snapped).toBeGreaterThanOrEqual(0);
    expect(field[snapped]).toBe(0);
    const none = buildDistanceField(yard, [vec3(400, 0, 400)], NAV.snap);
    expect(none.every((d) => d === Number.POSITIVE_INFINITY)).toBe(true);
  });

  it('equals the cost of the shortest route the search finds, from any start (same step rules)', () => {
    const s = createNavSearch(depot);
    const goals = [DEPOT.deadZones[0][0]!.position, DEPOT.deadZones[1][0]!.position];
    for (const [gi, goal] of goals.entries()) {
      const field = buildDistanceField(depot, [goal], NAV.snap);
      for (const p of randomPoints(depot, 12, 11 + gi)) {
        const a = node(depot, p);
        expect(beginRoute(depot, s, p, goal, NAV.snap)).toBe(true);
        const step = stepRoute(depot, s, Number.POSITIVE_INFINITY);
        if (step === 'none') {
          expect(field[a]).toBe(Number.POSITIVE_INFINITY);
          continue;
        }
        expect(step).toBe('found');
        expect(field[a]!, `from ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBeCloseTo(s.g[s.goalNode]!, 2);
      }
    }
  });
});

describe('descendField (M74, acceptance 1)', () => {
  const field = buildDistanceField(walled, [SOURCE_WEST], NAV.snap);

  it('from any node walks to a source, every step lowering the field, at the cost the field says', () => {
    const nodes: number[] = [];
    for (const p of [vec3(10, 0, -10), vec3(-3, 0, 12), vec3(1.5, 0, 9), vec3(-10, 0, 0.2), vec3(6, 0, -13), vec3(12, 0, 13)]) {
      const a = node(walled, p);
      expect(descendField(walled, field, a, SOURCE_WEST.x, SOURCE_WEST.z, nodes), `${p.x},${p.z}`).toBe(true);
      expect(nodes[0]).toBe(a);
      expect(field[nodes[nodes.length - 1]!]).toBe(0);
      expect(nodes[nodes.length - 1]).toBe(node(walled, SOURCE_WEST));
      for (let i = 1; i < nodes.length; i++) expect(field[nodes[i]!]!).toBeLessThan(field[nodes[i - 1]!]!);
      expect(routeCost(walled, nodes)).toBeCloseTo(field[a]!, 2); // a shortest route, not just a downhill one
      for (const k of nodes) expect(walled.walkable[k]).toBe(1);
    }
  });

  it('starting on a source is a route of that one node', () => {
    const nodes: number[] = [99];
    const src = node(walled, SOURCE_WEST);
    expect(descendField(walled, field, src, 0, 0, nodes)).toBe(true);
    expect(nodes).toEqual([src]);
  });

  it('returns false with no nodes from a node that cannot reach a source, and from none at all', () => {
    const nodes: number[] = [1, 2, 3];
    expect(descendField(walled, field, node(walled, INSIDE_ROOM), 0, 0, nodes)).toBe(false);
    expect(nodes).toHaveLength(0);
    nodes.push(5);
    expect(descendField(walled, field, -1, 0, 0, nodes)).toBe(false);
    expect(nodes).toHaveLength(0);
  });

  it('goes round the divider: some node of the descent is north of its end (z > 6), the only way across', () => {
    const nodes: number[] = [];
    descendField(walled, field, node(walled, vec3(10, 0, -10)), SOURCE_WEST.x, SOURCE_WEST.z, nodes);
    expect(nodes.some((k) => walled.minZ + (Math.floor(walled.nodeCell[k]! / walled.cols) + 0.5) * walled.cell > 6)).toBe(true);
  });
});

describe('stepRoute: a route search run a budget at a time (M74, acceptance 2)', () => {
  const route = (start: Vec3, goal: Vec3, budget: number) => {
    const s = createNavSearch(depot);
    const out: Vec3[] = [];
    expect(beginRoute(depot, s, start, goal, NAV.snap)).toBe(true);
    let calls = 0;
    let total = 0;
    let most = 0;
    let step = stepRoute(depot, s, budget);
    while (step === 'pending') {
      calls++;
      total += s.expanded;
      most = Math.max(most, s.expanded);
      expect(calls, 'a search that never ends').toBeLessThan(20_000);
      step = stepRoute(depot, s, budget);
    }
    total += s.expanded;
    most = Math.max(most, s.expanded);
    if (step === 'found') endRoute(depot, s, start, goal, out, NAV.legProbe);
    return { step, out, calls: calls + 1, total, most };
  };

  const pairs: [Vec3, Vec3][] = [];
  for (const a of [DEPOT.spawns[0][0]!.position, DEPOT.deadZones[1][0]!.position]) for (const b of [DEPOT.spawns[1][0]!.position, DEPOT.deadZones[0][0]!.position, ...randomPoints(depot, 2, 5)]) pairs.push([a, b]);

  it('returns pending under a small budget, then finishes with exactly the waypoints of one findPath', () => {
    const s = createNavSearch(depot);
    let sawPending = 0;
    for (const [a, b] of pairs) {
      const whole: Vec3[] = [];
      expect(findPath(depot, s, a, b, NAV.snap, whole, NAV.legProbe)).toBe(true);
      const sliced = route(a, b, 40);
      expect(sliced.step).toBe('found');
      expect(sliced.out).toEqual(whole);
      if (sliced.calls > 1) sawPending++;
    }
    expect(sawPending, 'most of these routes need more than one slice of 40').toBeGreaterThanOrEqual(pairs.length - 3);
  });

  it('never expands more than its budget in one call, and spends it all before saying pending', () => {
    const [a, b] = [DEPOT.spawns[0][0]!.position, DEPOT.spawns[1][0]!.position];
    for (const budget of [1, 7, 100, 1000]) {
      const s = createNavSearch(depot);
      beginRoute(depot, s, a, b, NAV.snap);
      let step = stepRoute(depot, s, budget);
      let calls = 1;
      while (step === 'pending') {
        expect(s.expanded, `budget ${budget}`).toBe(budget);
        step = stepRoute(depot, s, budget);
        calls++;
      }
      expect(step).toBe('found');
      expect(s.expanded).toBeLessThanOrEqual(budget);
      expect(calls, `budget ${budget}`).toBeGreaterThan(1);
    }
  });

  it('expands the same nodes in total however it is sliced', () => {
    const [a, b] = [DEPOT.spawns[0][0]!.position, DEPOT.spawns[1][0]!.position];
    const s = createNavSearch(depot);
    beginRoute(depot, s, a, b, NAV.snap);
    expect(stepRoute(depot, s, Number.POSITIVE_INFINITY)).toBe('found');
    const whole = s.expanded;
    expect(whole).toBeGreaterThan(300);
    for (const budget of [1, 50, 333]) expect(route(a, b, budget).total, `budget ${budget}`).toBe(whole);
  });

  it('a search under way answers none once the goal proves unreachable, after as many slices as it needs', () => {
    const room = (x0: number, x1: number, z0: number, z1: number) => wall(x0, x1, z0, z1);
    const map: MapData = { ...TEST_YARD, blocks: [...TEST_YARD.blocks, room(3, 11, 3, 3.4), room(3, 11, 10.6, 11), room(3, 3.4, 3, 11), room(10.6, 11, 3, 11)] };
    const g = buildNavGrid(map, NAV);
    const s = createNavSearch(g);
    expect(beginRoute(g, s, vec3(-5, 0, -2), INSIDE_ROOM, NAV.snap)).toBe(true);
    let step = stepRoute(g, s, 200);
    expect(step).toBe('pending');
    for (let i = 0; i < 1000 && step === 'pending'; i++) step = stepRoute(g, s, 200);
    expect(step).toBe('none');
    expect(findPath(g, s, vec3(-5, 0, -2), INSIDE_ROOM, NAV.snap, [])).toBe(false);
  });

  it('beginRoute drops a search left open: the next one runs from scratch', () => {
    const [a, b] = [DEPOT.spawns[0][0]!.position, DEPOT.spawns[1][0]!.position];
    const c = DEPOT.deadZones[0][0]!.position;
    const s = createNavSearch(depot);
    beginRoute(depot, s, a, b, NAV.snap);
    expect(stepRoute(depot, s, 100)).toBe('pending');
    expect(beginRoute(depot, s, c, b, NAV.snap)).toBe(true);
    let step = stepRoute(depot, s, 500);
    while (step === 'pending') step = stepRoute(depot, s, 500);
    const out: Vec3[] = [];
    endRoute(depot, s, c, b, out, NAV.legProbe);
    const whole: Vec3[] = [];
    findPath(depot, createNavSearch(depot), c, b, NAV.snap, whole, NAV.legProbe);
    expect(out).toEqual(whole);
  });

  it('beginRoute reports false, leaving nothing open, for an end off the grid', () => {
    const s = createNavSearch(depot);
    expect(beginRoute(depot, s, vec3(500, 0, 500), DEPOT.spawns[0][0]!.position, NAV.snap)).toBe(false);
    expect(beginRoute(depot, s, DEPOT.spawns[0][0]!.position, vec3(500, 0, 500), NAV.snap)).toBe(false);
    expect(s.size).toBe(0);
  });
});
