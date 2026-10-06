import { describe, expect, it } from 'vitest';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { DEPOT } from '../map/depot';
import type { MapData } from '../map/mapTypes';
import { TEST_YARD } from '../map/testYard';
import { buildNavGrid, clearLine, createNavSearch, findPath, isWalkableAt } from '../nav/navGrid';
import { createCharacter } from './character';
import { createEliminationContext, deadZoneFields, type EliminationContext, eliminate, planWalkOffRoutes } from './elimination';
import { createRng, rngNext } from './rng';
import { createSimContext } from './simulation';
import { vec3, type Vec3 } from './vec';
import { BALLISTICS } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';

/** M74: walk-off routes read a distance field built once per end; no route search at the hit. */

const depot = buildNavGrid(DEPOT, NAV);
const depotCtx = createEliminationContext(DEPOT.deadZones, depot, NAV.snap);

function lengthOf(from: Vec3, route: readonly Vec3[]): number {
  let len = 0;
  let px = from.x;
  let pz = from.z;
  for (const p of route) {
    len += Math.hypot(p.x - px, p.z - pz);
    px = p.x;
    pz = p.z;
  }
  return len;
}

/** `count` seeded random walkable starts on Depot's ground. */
function starts(count: number, seed: number): Vec3[] {
  const rng = createRng(seed);
  const out: Vec3[] = [];
  const search = createNavSearch(depot);
  while (out.length < count) {
    const x = depot.minX + rngNext(rng) * depot.cols * depot.cell;
    const z = depot.minZ + rngNext(rng) * depot.rows * depot.cell;
    if (!isWalkableAt(depot, x, 0, z)) continue;
    // Somewhere a walker can go on from (not a pocket cut off from both dead zones).
    if (!findPath(depot, search, vec3(x, 0, z), DEPOT.deadZones[0][0]!.position, NAV.snap, [])) continue;
    out.push(vec3(x, 0, z));
  }
  return out;
}

describe('walk-off routes from the distance field (M74, acceptance 1)', () => {
  it('are no more than 8 % longer than findPath’s to the same spot, over 60 seeded starts on Depot, and end on the victim’s own spot', () => {
    const search = createNavSearch(depot);
    const old: Vec3[] = [];
    const points = starts(60, 74);
    let worst = 0;
    let diff = 0;
    let slack = 0;
    for (const [n, p] of points.entries()) {
      const victim = createCharacter(n, p, 0, LOADOUT, n % 2);
      eliminate(victim, 99, [victim], depotCtx);
      expect(planWalkOffRoutes([victim], depotCtx)).toBe(true);
      const spot = victim.deadZoneTarget;
      expect(findPath(depot, search, p, spot, NAV.snap, old)).toBe(true);
      const route = victim.walkOffRoute;
      const mine = lengthOf(p, route);
      const theirs = lengthOf(p, old);
      // Ends exactly on its own spot.
      expect(route[route.length - 1]!.x).toBe(spot.x);
      expect(route[route.length - 1]!.z).toBe(spot.z);
      // Every leg is a straight walk on foot.
      let px = p.x;
      let pz = p.z;
      for (const w of route) {
        expect(clearLine(depot, px, p.y, pz, w.x, w.z), `start ${n} leg to ${w.x.toFixed(1)},${w.z.toFixed(1)}`).toBe(true);
        px = w.x;
        pz = w.z;
      }
      expect(mine, `start ${n}: ${mine.toFixed(2)} m against ${theirs.toFixed(2)} m`).toBeLessThanOrEqual(theirs * 1.08);
      worst = Math.max(worst, mine / Math.max(theirs, 0.01));
      diff += mine - theirs;
      slack = Math.max(slack, mine - theirs);
    }
    console.log(`QA M74 walk-off vs findPath, 60 Depot starts: worst ratio ${worst.toFixed(4)}, mean difference ${(diff / points.length).toFixed(3)} m, largest excess ${slack.toFixed(3)} m`);
    expect(Math.abs(diff / points.length)).toBeLessThan(1);
  });

  it('end on each victim’s own spot when teammates are out before it (the second and third spots), not on the nearest one', () => {
    const spots = DEPOT.deadZones[1];
    expect(spots.length).toBeGreaterThanOrEqual(3);
    const crowd = [0, 1, 2].map((id) => createCharacter(id, vec3(-20, 0, 0), 0, LOADOUT, 1));
    // All three start by the same place, so the nearest spot is the same for them; each still ends on its own.
    for (const c of crowd) {
      eliminate(c, 99, crowd, depotCtx);
      expect(planWalkOffRoutes(crowd, depotCtx)).toBe(true);
    }
    const targets = crowd.map((c) => c.deadZoneTarget);
    expect(new Set(targets.map((t) => `${t.x},${t.z}`)).size).toBe(3);
    const search = createNavSearch(depot);
    const old: Vec3[] = [];
    for (const c of crowd) {
      expect(c.walkOffRoute.at(-1)).toMatchObject({ x: c.deadZoneTarget.x, z: c.deadZoneTarget.z });
      expect(findPath(depot, search, vec3(-20, 0, 0), c.deadZoneTarget, NAV.snap, old)).toBe(true);
      expect(lengthOf(vec3(-20, 0, 0), c.walkOffRoute)).toBeLessThanOrEqual(lengthOf(vec3(-20, 0, 0), old) * 1.08);
    }
  });

  it('go round a wall to the spot (the route comes from the field), and a field with no way through leaves the straight walk', () => {
    const wall = { kind: 'wall' as const, center: vec3(0, 1.5, -4.6), size: vec3(0.4, 3, 21.2) };
    const map: MapData = { ...TEST_YARD, blocks: [...TEST_YARD.blocks, wall] };
    const g = buildNavGrid(map, NAV);
    const spots = [[{ position: vec3(-10, 0, 0), yaw: 0 }], [{ position: vec3(-10, 0, 0), yaw: 0 }]];
    const victim = (ctx: EliminationContext) => {
      const v = createCharacter(0, vec3(10, 0, -10), 0, LOADOUT, 0);
      eliminate(v, 99, [v], ctx);
      planWalkOffRoutes([v], ctx);
      return v;
    };
    const real = victim(createEliminationContext(spots, g, NAV.snap));
    expect(real.walkOffRoute.length).toBeGreaterThan(1);
    expect(real.walkOffRoute.some((w) => w.z > 6)).toBe(true); // round the divider's north end
    expect(real.walkOffRoute.at(-1)).toMatchObject({ x: -10, z: 0 });

    // The same context with every end's field walled off (+Infinity): the walk-off no longer plans, it heads straight.
    const blind = createEliminationContext(spots, g, NAV.snap, spots.map(() => new Float32Array(g.floorY.length).fill(Number.POSITIVE_INFINITY)));
    expect(victim(blind).walkOffRoute).toEqual([{ x: -10, y: 0, z: 0 }]);
  });

  it('uses the fields it is given, and builds its own only when none are', () => {
    const fields = deadZoneFields(DEPOT.deadZones, depot, NAV.snap);
    expect(fields).toHaveLength(2);
    expect(createEliminationContext(DEPOT.deadZones, depot, NAV.snap, fields).deadZoneFields).toBe(fields);
    const built = depotCtx.deadZoneFields;
    expect(built).toHaveLength(DEPOT.deadZones.length);
    expect(built[0]).not.toBe(built[1]); // one field per end
    expect(built[0]).not.toEqual(built[1]);
  });
});

describe('one NavSearch, not two (M74, acceptance 3)', () => {
  /** Every object reachable from `root` through plain objects and arrays (skipping `skip` keys) that looks like a NavSearch. */
  function navSearchesIn(root: unknown, skip: readonly string[]): string[] {
    const found: string[] = [];
    const seen = new Set<unknown>();
    const walk = (o: unknown, path: string, depth: number) => {
      if (!o || typeof o !== 'object' || ArrayBuffer.isView(o) || seen.has(o) || depth > 6) return;
      seen.add(o);
      const r = o as Record<string, unknown>;
      if (r.heap instanceof Int32Array && r.heapF instanceof Float32Array) found.push(path);
      for (const k of Object.keys(r)) if (!skip.includes(k)) walk(r[k], `${path}.${k}`, depth + 1);
    };
    walk(root, 'ctx', 0);
    return found;
  }

  /** The typed arrays an elimination context holds (not counting the grid itself), by path. */
  function typedArraysIn(ctx: EliminationContext): [string, ArrayBufferView][] {
    const out: [string, ArrayBufferView][] = [];
    for (const [k, v] of Object.entries(ctx)) {
      if (k === 'nav') continue;
      const vs = Array.isArray(v) ? v.map((e, i) => [`${k}[${i}]`, e] as const) : [[k, v] as const];
      for (const [p, e] of vs) if (ArrayBuffer.isView(e)) out.push([p, e]);
    }
    return out;
  }

  it('the elimination context holds only the per-end distance fields (one Float32 per node), no search memory', () => {
    const arrays = typedArraysIn(depotCtx);
    expect(arrays.map(([p]) => p)).toEqual(['deadZoneFields[0]', 'deadZoneFields[1]']);
    for (const [, a] of arrays) {
      expect(a).toBeInstanceOf(Float32Array);
      expect((a as Float32Array).length).toBe(depot.floorY.length);
    }
    expect(Object.keys(depotCtx).sort()).toEqual(['deadZoneFields', 'deadZones', 'nav', 'nodes', 'snap']);
    expect(navSearchesIn(depotCtx, ['nav'])).toEqual([]);
  });

  it('the detector sees a NavSearch where there is one (so an empty answer means none)', () => {
    const old = { ...depotCtx, navSearch: createNavSearch(depot) };
    expect(navSearchesIn(old, ['nav'])).toEqual(['ctx.navSearch']);
    expect(typedArraysIn(old as unknown as EliminationContext).length).toBe(2);
  });

  it('the simulation context holds no NavSearch either, and passes given fields on without rebuilding', () => {
    const floor = { raycastStatic: () => -1 };
    const mover = { move: () => undefined } as never;
    const fields = deadZoneFields(DEPOT.deadZones, depot, NAV.snap);
    const services = { mover, query: floor, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: -10, hits: HITS, deadZones: DEPOT.deadZones, rounds: ROUNDS, nav: depot, navSnap: NAV.snap };
    const given = createSimContext({ ...services, deadZoneFields: fields });
    expect(given.targets.elimination.deadZoneFields).toBe(fields);
    expect(navSearchesIn(given, ['nav', 'mover', 'query'])).toEqual([]);
    const built = createSimContext(services);
    expect(built.targets.elimination.deadZoneFields).toHaveLength(2);
    expect(typedArraysIn(built.targets.elimination).every(([, a]) => a instanceof Float32Array && (a as Float32Array).length === depot.floorY.length)).toBe(true);
    expect(navSearchesIn(built, ['nav', 'mover', 'query'])).toEqual([]);
  });
});
