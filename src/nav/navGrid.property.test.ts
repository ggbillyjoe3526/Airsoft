import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import { describe, expect } from 'vitest';
import { NAV } from '../config/nav';
import { DEPOT } from '../map/depot';
import { STACK_HOUSE } from '../map/testYard';
import type { MapData } from '../map/mapTypes';
import { type Vec3, vec3 } from '../sim/vec';
import { buildDistanceField, buildNavGrid, clearLine, createNavSearch, findPath, isWalkableAt, type NavGrid, nodeAt, nodeX, nodeZ } from './navGrid';

/**
 * Property tests (TL1, fast-check): routes between generated pairs of walkable points on real grids (Depot, and the
 * two-storey Stack House) rather than a few picked ones. Seeded; a failure prints the smallest pair and its seed and path.
 */
const SEED = 20261018;

interface Field {
  name: string;
  grid: NavGrid;
  /** Every walkable node. */
  walkable: number[];
}

function field(map: MapData): Field {
  const grid = buildNavGrid(map, NAV);
  const walkable: number[] = [];
  for (let k = 0; k < grid.walkable.length; k++) if (grid.walkable[k]) walkable.push(k);
  return { name: map.name, grid, walkable };
}

const FIELDS = [field(DEPOT), field(STACK_HOUSE)];
const point = (g: NavGrid, k: number): Vec3 => vec3(nodeX(g, k), g.floorY[k]!, nodeZ(g, k));
/** A field and two of its walkable nodes, as points on their floors. */
const pair = fc.constantFrom(...FIELDS).chain((f) =>
  fc.tuple(fc.constant(f), fc.integer({ min: 0, max: f.walkable.length - 1 }), fc.integer({ min: 0, max: f.walkable.length - 1 })).map(([f, i, j]) => ({ f, a: point(f.grid, f.walkable[i]!), b: point(f.grid, f.walkable[j]!) })),
);

describe('nav grid route properties (TL1)', () => {
  test.prop([pair], { seed: SEED, numRuns: 200 })('a route one way means a route back', ({ f, a, b }) => {
    const s = createNavSearch(f.grid);
    const out: Vec3[] = [];
    expect(findPath(f.grid, s, b, a, NAV.snap, out), `${f.name}: back`).toBe(findPath(f.grid, s, a, b, NAV.snap, out));
  });

  test.prop([pair], { seed: SEED, numRuns: 200 })(
    'every route is straight walkable legs on a floor, at least as long as the straight line, ending at the goal',
    ({ f, a, b }) => {
      const g = f.grid;
      const out: Vec3[] = [];
      if (!findPath(g, createNavSearch(g), a, b, NAV.snap, out)) return;
      let from = a;
      let length = 0;
      for (const p of out) {
        expect(isWalkableAt(g, p.x, p.y, p.z), `${f.name}: waypoint ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`).toBe(true);
        expect(clearLine(g, from.x, from.y, from.z, p.x, p.z), `${f.name}: leg to ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBe(true);
        length += Math.hypot(p.x - from.x, p.z - from.z);
        from = p;
      }
      expect(Math.hypot(from.x - b.x, from.z - b.z)).toBeLessThan(g.cell);
      expect(Math.abs(from.y - b.y)).toBeLessThan(g.maxStep);
      expect(length).toBeGreaterThanOrEqual(Math.hypot(b.x - a.x, b.z - a.z) - 1e-4);
    },
  );

  test.prop([pair], { seed: SEED, numRuns: 40 })("the walk-off distance field and the route search agree on what's reachable", ({ f, a, b }) => {
    const g = f.grid;
    const reach = buildDistanceField(g, [b], NAV.snap)[nodeAt(g, a.x, a.y, a.z)]!;
    expect(Number.isFinite(reach), f.name).toBe(findPath(g, createNavSearch(g), a, b, NAV.snap, []));
  });
});
