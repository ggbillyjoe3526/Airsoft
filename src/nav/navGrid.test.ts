import { describe, expect, it } from 'vitest';
import { NAV } from '../config/nav';
import { DEPOT } from '../map/depot';
import { TEST_YARD } from '../map/testYard';
import { GENTLE_SLOPE, planeTerrain, SLOPE_YARD, SLOPE_YARD_TERRAIN, terrainOnly } from '../map/testSupport';
import { buildTerrain, steepestSlope, terrainHeightAt } from '../map/terrain';
import { PHYSICS } from '../config/physics';
import { createRng, rngNext } from '../sim/rng';
import type { MapBlock, MapData } from '../map/mapTypes';
import { type Vec3, vec3 } from '../sim/vec';
import { BODY } from '../config/movement';
import { buildNavGrid, clearLine, createNavSearch, dropOnLine, findPath, floorAt, isWalkableAt, NAV_HEAP_PER_CELL, nearestWalkable } from './navGrid';

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

  it('puts every Depot lane point on walkable ground, reachable from both ends', () => {
    const search = createNavSearch(depot);
    const path: Vec3[] = [];
    expect(DEPOT.lanes).toHaveLength(3);
    for (const lane of DEPOT.lanes) {
      for (let i = 1; i < lane.length; i++) expect(lane[i]!.x).toBeGreaterThan(lane[i - 1]!.x); // west to east
      for (const p of lane) {
        expect(isWalkableAt(depot, p.x, p.z), `${p.x},${p.z}`).toBe(true);
        for (const s of [DEPOT.spawns[0][0]!, DEPOT.spawns[1][0]!]) expect(findPath(depot, search, s.position, p, NAV.snap, path)).toBe(true);
      }
    }
  });
});

describe('nav grid route searches (audit AI-11, AI-12)', () => {
  /** Distance on the ground plane from (x, z) to the nearest Depot block that stands in a walker's way on the ground. */
  const solid = DEPOT.blocks.filter((b) => b.kind !== 'ramp' && b.kind !== 'floor' && b.center.y - b.size.y / 2 < BODY.height / 2 && b.center.y + b.size.y / 2 > NAV.maxStep);
  function toBlocks(x: number, z: number): number {
    let m = Number.POSITIVE_INFINITY;
    for (const b of solid) m = Math.min(m, Math.hypot(Math.max(Math.abs(x - b.center.x) - b.size.x / 2, 0), Math.max(Math.abs(z - b.center.z) - b.size.z / 2, 0)));
    return m;
  }
  /** Closest any leg of the route (start first) comes to a block. */
  function closestApproach(path: Vec3[]): number {
    let m = Number.POSITIVE_INFINITY;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      for (let t = 0; t <= 1; t += 1 / 64) m = Math.min(m, toBlocks(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t));
    }
    return m;
  }

  it('starts with a modest open list and grows it when a search outgrows it, instead of failing', () => {
    const s = createNavSearch(depot);
    expect(s.heap.length).toBe(depot.cols * depot.rows * NAV_HEAP_PER_CELL);
    // Shrink it to a handful of slots: the spawn-to-spawn search still finds its route.
    s.heap = new Int32Array(4);
    s.heapF = new Float32Array(4);
    const path: Vec3[] = [];
    expect(findPath(depot, s, DEPOT.spawns[0][0]!.position, DEPOT.spawns[1][0]!.position, NAV.snap, path)).toBe(true);
    expect(s.heap.length).toBeGreaterThan(4);
    expect(s.heapF.length).toBe(s.heap.length);
  });

  it("keeps bots' route legs at least a body radius from Depot's blocks, not just the grid's cell centres", () => {
    const s = createNavSearch(depot);
    const path: Vec3[] = [];
    // Two routes whose plain string-pulled legs (clearLine) pass a few millimetres inside the body (found by a sweep
    // of 2000 routes), then a seeded sweep.
    const pairs: [number, number, number, number][] = [
      [3.819315647622254, 9.523805991990404, -1.5377613993071748, 9.129878249079866],
      [-3.036300269438094, -4.436642778775022, 2.3016265818391126, -1.9000533627812057],
    ];
    let seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    while (pairs.length < 150) {
      const ax = -24 + rnd() * 48;
      const az = -15 + rnd() * 30;
      pairs.push([ax, az, ax - 6 + rnd() * 12, az - 6 + rnd() * 12]);
    }
    let checked = 0;
    for (const [ax, az, bx, bz] of pairs) {
      const a = vec3(ax, 0, az);
      const b = vec3(bx, 0, bz);
      if (!isWalkableAt(depot, ax, az) || !isWalkableAt(depot, bx, bz) || floorAt(depot, ax, az) !== 0 || floorAt(depot, bx, bz) !== 0) continue;
      if (!findPath(depot, s, a, b, NAV.snap, path, NAV.legProbe)) continue;
      if (path.some((p) => p.y !== 0)) continue; // ground-level routes only (the block test above is for the ground)
      // Ends well clear of blocks, so any leg that comes close does so on the search's account.
      if (toBlocks(ax, az) < NAV.clearance || toBlocks(bx, bz) < NAV.clearance) continue;
      expect(closestApproach([a, ...path]), `${ax},${az} → ${bx},${bz}`).toBeGreaterThanOrEqual(BODY.radius);
      checked++;
    }
    expect(checked).toBeGreaterThan(40);
  });
});

describe('nav grid with raised floors', () => {
  /** A 1 m platform (x 2..8, z -4..4) on a 20 m yard, optionally with a 2 m wide ramp up to it from the west (1:2). */
  function platformYard(ramp: boolean, extra: MapBlock[] = []): MapData {
    return {
      name: 'platform yard',
      blocks: [
        { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(20, 0.5, 20) },
        { kind: 'floor', center: vec3(5, 0.5, 0), size: vec3(6, 1, 8) },
        ...(ramp ? [{ kind: 'ramp', center: vec3(1, 0.5, 0), size: vec3(2, 1, 2), rise: '+x' } as MapBlock] : []),
        ...extra,
      ],
      killY: -10,
      spawns: [[], []],
      deadZones: [[], []],
      lanes: [],
    };
  }
  const below = vec3(-4, 0, 0);
  const above = vec3(6, 1, 0);

  it('gives each cell the height of the surface under it', () => {
    const g = buildNavGrid(platformYard(true), NAV);
    expect(floorAt(g, -4, 0)).toBe(0);
    expect(floorAt(g, 6, 0)).toBe(1);
    expect(floorAt(g, 1.1, 0)).toBeCloseTo(0.55, 5); // the ramp, at that cell's centre (x = 1.1)
  });

  it('routes up a ramp onto the platform, with every waypoint on the surface under it', () => {
    const g = buildNavGrid(platformYard(true), NAV);
    const path: Vec3[] = [];
    expect(findPath(g, createNavSearch(g), below, above, NAV.snap, path)).toBe(true);
    checkRoute(g, below, above, path);
    for (const p of path) expect(p.y, `${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBe(floorAt(g, p.x, p.z));
    expect(path[path.length - 1]!.y).toBe(1);
    // Up the ramp, not up the platform's side: the route crosses x = 2 between the ramp's sides.
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      if ((a.x - 2) * (b.x - 2) < 0) expect(Math.abs(a.z + ((2 - a.x) / (b.x - a.x)) * (b.z - a.z))).toBeLessThan(1);
    }
  });

  it('has no route onto a 1 m platform without a ramp, and no straight line up its side', () => {
    const g = buildNavGrid(platformYard(false), NAV);
    expect(isWalkableAt(g, -4, 0)).toBe(true);
    expect(isWalkableAt(g, 6, 0)).toBe(true);
    const path: Vec3[] = [];
    expect(findPath(g, createNavSearch(g), below, above, NAV.snap, path)).toBe(false);
    expect(clearLine(g, -4, 0, 6, 0)).toBe(false);
  });

  it('finds drops on a line (platform edges, ramp sides, the floor’s end) but not walls or the ramp itself', () => {
    const g = buildNavGrid(platformYard(true, [{ kind: 'wall', center: vec3(-4, 1.5, 3), size: vec3(4, 3, 0.4) }]), NAV);
    expect(dropOnLine(g, 6, 2, 7, 2)).toBe(false); // across the platform
    expect(dropOnLine(g, 2.4, 2, 1.6, 2)).toBe(true); // off its west edge
    expect(dropOnLine(g, 1.6, 2, 2.4, 2)).toBe(true); // and up it
    expect(dropOnLine(g, -1, 0, 3, 0)).toBe(false); // up the ramp
    expect(dropOnLine(g, 1, 0.5, 1, 1.5)).toBe(true); // off the ramp's side
    expect(dropOnLine(g, -4, 2, -4, 4)).toBe(false); // through a wall: not a drop
    expect(dropOnLine(g, 9.5, 0, 10.5, 0)).toBe(true); // past the floor's edge
  });

  it('keeps the clearance from a drop on both sides of it, as from a wall', () => {
    const g = buildNavGrid(platformYard(false), NAV);
    // The platform's west side is at x = 2.
    expect(isWalkableAt(g, 2 - NAV.clearance + 0.1, 2)).toBe(false);
    expect(isWalkableAt(g, 2 - NAV.clearance - 0.15, 2)).toBe(true);
    expect(isWalkableAt(g, 2 + NAV.clearance - 0.1, 2)).toBe(false);
    expect(isWalkableAt(g, 2 + NAV.clearance + 0.15, 2)).toBe(true);
  });

  it('judges blocks against the floor they stand over', () => {
    const extra: MapBlock[] = [
      // On the platform: a crate (blocks) and a 0.1 m mat (walked onto). Across the yard and the platform, a
      // beam 2 m above the yard floor: it passes overhead in the yard but is only 1 m above the platform.
      { kind: 'crate', center: vec3(4, 1.6, 2), size: vec3(1.2, 1.2, 1.2) },
      { kind: 'barrier', center: vec3(6.5, 1.05, 1), size: vec3(1, 0.1, 1) },
      { kind: 'barrier', center: vec3(0, 2.1, -2.5), size: vec3(20, 0.2, 0.4) },
    ];
    const g = buildNavGrid(platformYard(true, extra), NAV);
    expect(isWalkableAt(g, 4, 2)).toBe(false);
    expect(isWalkableAt(g, 6.5, 1)).toBe(true);
    expect(isWalkableAt(g, -4, -2.5)).toBe(true);
    expect(isWalkableAt(g, 6.5, -2.5)).toBe(false);
  });
});

describe('nav grid on sloping ground (M33c)', () => {
  it('takes its bounds from the terrain and sets each cell floor to the ground height at its centre', () => {
    const g = buildNavGrid(SLOPE_YARD, NAV);
    expect(g.minX).toBe(SLOPE_YARD_TERRAIN.minX);
    expect(g.minZ).toBe(SLOPE_YARD_TERRAIN.minZ);
    expect(g.minX + g.cols * g.cell).toBeGreaterThanOrEqual(15);
    const rng = createRng(2);
    let checked = 0;
    for (let n = 0; n < 400; n++) {
      const x = -14 + rngNext(rng) * 28;
      const z = -14 + rngNext(rng) * 28;
      // The cell's own centre, not the point: the floor is the ground there.
      const i = Math.floor((x - g.minX) / g.cell);
      const j = Math.floor((z - g.minZ) / g.cell);
      const cx = g.minX + (i + 0.5) * g.cell;
      const cz = g.minZ + (j + 0.5) * g.cell;
      if (SLOPE_YARD.blocks.some((b) => Math.abs(cx - b.center.x) < b.size.x / 2 + 0.5 && Math.abs(cz - b.center.z) < b.size.z / 2 + 0.5)) continue;
      expect(floorAt(g, x, z), `(${cx}, ${cz})`).toBeCloseTo(terrainHeightAt(SLOPE_YARD_TERRAIN, cx, cz)!, 4);
      checked++;
    }
    expect(checked).toBeGreaterThan(300);
    // The floor rises along the slope: about 0.15 per metre on the flat side of the yard.
    expect(floorAt(g, 4, 10) - floorAt(g, -4, 10)).toBeCloseTo(1.2, 1);
  });

  it('keeps the crate and the end wall blocking on the slope, and the open ground beside them walkable', () => {
    const g = buildNavGrid(SLOPE_YARD, NAV);
    expect(isWalkableAt(g, -5, 3)).toBe(false); // the crate, whose top is above the ground there by more than a ledge
    expect(isWalkableAt(g, -5, 5)).toBe(true);
    expect(isWalkableAt(g, -14.5, 0)).toBe(false); // against the end wall
    expect(isWalkableAt(g, 0, 10)).toBe(true);
    // Beyond the terrain's edge: not walkable, with no floor.
    expect(isWalkableAt(g, 16, 0)).toBe(false);
    expect(Number.isNaN(floorAt(g, 16, 0))).toBe(true);
  });

  it('lets a floor block override the ground where it is higher, and leaves the ground where it is lower', () => {
    const base = terrainOnly(planeTerrain(0.1));
    const map: MapData = {
      ...base,
      blocks: [
        // A platform whose top is 1 m above the ground at x = 2..4 (the ground is 0.2..0.4 there).
        { kind: 'floor', center: vec3(3, 0.5, 5), size: vec3(2, 1, 4) },
        // A slab sunk below the ground: it must not lower the floor.
        { kind: 'floor', center: vec3(-5, -3.25, -5), size: vec3(4, 0.5, 4) },
      ],
    };
    const g = buildNavGrid(map, NAV);
    expect(floorAt(g, 3, 5)).toBeCloseTo(1, 4);
    expect(floorAt(g, 0, 5)).toBeCloseTo(0, 1);
    expect(floorAt(g, -5, -5)).toBeCloseTo(-0.5, 1);
    expect(isWalkableAt(g, -5, -5)).toBe(true);
  });

  it('finds a path up and down a slope as steep as a ramp may be, every leg walkable and the heights following the ground', () => {
    expect(NAV.maxStep).toBeGreaterThanOrEqual(PHYSICS.maxRampSlope * NAV.cell);
    for (const slope of [GENTLE_SLOPE, PHYSICS.maxRampSlope]) {
      const terrain = planeTerrain(slope);
      const g = buildNavGrid(terrainOnly(terrain), NAV);
      const search = createNavSearch(g);
      for (const [from, to] of [
        [vec3(-10, slope * -10, 2), vec3(10, slope * 10, -3)],
        [vec3(11, slope * 11, 6), vec3(-11, slope * -11, 6)],
      ] as const) {
        const path: Vec3[] = [];
        expect(findPath(g, search, from, to, NAV.snap, path), `slope ${slope}`).toBe(true);
        checkRoute(g, from, to, path);
        // (A cell's floor is the ground at its centre, so it differs from the ground at the point by under a cell's rise.)
        for (const p of path) expect(Math.abs(floorAt(g, p.x, p.z) - terrainHeightAt(terrain, p.x, p.z)!)).toBeLessThanOrEqual(slope * NAV.cell);
      }
    }
  });

  it('finds no route across ground steeper than a character steps up (a cliff, not a ramp), while each side stays connected', () => {
    // A 1 m rise within one 1 m terrain cell (slope 1: 0.2 m per 0.2 m nav cell, over the 0.15 m a step allows).
    const cliff = buildTerrain(-15, -15, 1, 30, 30, (x) => (x >= 0 ? 1 : 0));
    expect(steepestSlope(cliff)).toBeGreaterThan(PHYSICS.maxRampSlope);
    const g = buildNavGrid(terrainOnly(cliff), NAV);
    const search = createNavSearch(g);
    const path: Vec3[] = [];
    expect(findPath(g, search, vec3(-10, 0, 0), vec3(10, 1, 0), 0.5, path)).toBe(false);
    expect(findPath(g, search, vec3(-10, 0, 0), vec3(-4, 0, 6), 0.5, path)).toBe(true);
    expect(findPath(g, search, vec3(4, 1, -6), vec3(10, 1, 0), 0.5, path)).toBe(true);
  });
});
