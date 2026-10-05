import { beforeAll, describe, expect, it } from 'vitest';
import { HITS, ROUNDS } from '../config/hits';
import { BOTS } from '../config/bots';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { expectGrounded, playMatch } from '../ai/depotMatchSupport';
import { buildNavGrid, floorAt, isWalkableAt, nodeAt, nodeX, nodeZ, stepNode } from '../nav/navGrid';
import { initPhysics } from '../physics/physicsWorld';
import { buildLevelRay, castLevelRay } from '../sim/levelRay';
import { type Vec3, vec3 } from '../sim/vec';
import type { MapBlock } from './mapTypes';
import { MAPS } from './maps';
import { NEON_HEIGHTS, NEON_HEIGHTS_LAYOUT } from './neonHeights';

/**
 * Neon Heights' concrete facts (M34c acceptance 1): the size, the storeys, the spawns and dead zones, the flag, the Sky
 * Bridge's sides, the windows' sills, the stairs' pitch, the Capsules balcony's drop and the roofs. The layout rules
 * (acceptance 3) live in neonHeights.test.ts.
 */

const map = NEON_HEIGHTS;
const grid = buildNavGrid(map, NAV);
const level = buildLevelRay(map.blocks);
const STOREY = 3;
const top = (b: MapBlock): number => b.center.y + b.size.y / 2;
const bottom = (b: MapBlock): number => b.center.y - b.size.y / 2;
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
/** Distance a ray from `from` goes along `dir` before a block stops it (-1 when it gets `len` far). */
const ray = (from: Vec3, dir: Vec3, len: number): number => castLevelRay(level, from, dir, len);

describe('Neon Heights map data (M34c)', () => {
  it('is 46 by 30 m inside its perimeter walls', () => {
    const walls = map.blocks.filter((b) => b.kind === 'wall' && near(bottom(b), 0) && near(top(b), 10));
    expect(walls).toHaveLength(4);
    const innerX = Math.min(...walls.filter((w) => w.size.z > 20).map((w) => Math.abs(w.center.x) - w.size.x / 2));
    const innerZ = Math.min(...walls.filter((w) => w.size.x > 40).map((w) => Math.abs(w.center.z) - w.size.z / 2));
    expect(innerX * 2).toBeCloseTo(46, 6);
    expect(innerZ * 2).toBeCloseTo(30, 6);
    // Nothing is built outside the walls.
    for (const b of map.blocks) {
      if (b.kind === 'floor' && near(top(b), 0) && b.size.z > 30) continue; // the street's strips (M34f) run under the walls
      expect(Math.abs(b.center.x) + b.size.x / 2, b.kind).toBeLessThanOrEqual(23.5 + 1e-6);
      expect(Math.abs(b.center.z) + b.size.z / 2, b.kind).toBeLessThanOrEqual(15.5 + 1e-6);
    }
  });

  it('has three storeys at 0, 3 and 6 m, and every walkable floor of the nav grid is on one of them', () => {
    expect(map.storeys).toEqual([0, 3, 6]);
    const onStorey = new Set<number>();
    let ramps = 0;
    for (let k = 0; k < grid.walkable.length; k++) {
      if (grid.walkable[k] !== 1) continue;
      const y = grid.floorY[k]!;
      const s = map.storeys!.find((h) => Math.abs(y - h) < 0.05);
      if (s === undefined) ramps++;
      else onStorey.add(s);
    }
    expect([...onStorey].sort()).toEqual([0, 3, 6]);
    expect(ramps).toBeGreaterThan(0); // stairs between them
    // Roofs are not walkable: nothing is walkable above Level 2.
    expect(Math.max(...Array.from(grid.floorY).filter((y) => !Number.isNaN(y)))).toBeLessThanOrEqual(6 + 0.05);
  });

  it('lists five spawns and five dead-zone spots per end, west spawns facing east and east spawns facing west, all standing on the street', () => {
    for (const end of [0, 1] as const) {
      expect(map.spawns[end], `spawns ${end}`).toHaveLength(5);
      expect(map.deadZones[end], `dead zone ${end}`).toHaveLength(5);
      for (const p of [...map.spawns[end]!, ...map.deadZones[end]!]) {
        expect(p.position.y).toBe(0);
        expect(floorAt(grid, p.position.x, 0, p.position.z)).toBeCloseTo(0, 2);
        expect(isWalkableAt(grid, p.position.x, 0, p.position.z)).toBe(true);
        // Behind the end's spawn wall.
        if (end === 0) expect(p.position.x).toBeLessThan(NEON_HEIGHTS_LAYOUT.spawnWalls[0]!);
        else expect(p.position.x).toBeGreaterThan(NEON_HEIGHTS_LAYOUT.spawnWalls[1]!);
      }
      // Five different places, not one spot five times.
      expect(new Set(map.spawns[end]!.map((p) => `${p.position.x},${p.position.z}`)).size).toBe(5);
      expect(new Set(map.deadZones[end]!.map((p) => `${p.position.x},${p.position.z}`)).size).toBe(5);
    }
    // A spawn looks at the field: forward = (-sin yaw, -cos yaw) points east for the west end, west for the east end.
    expect(-Math.sin(map.spawns[0]![0]!.yaw)).toBeGreaterThan(0.99);
    expect(-Math.sin(map.spawns[1]![0]!.yaw)).toBeLessThan(-0.99);
  });

  it('has four lanes from the west yard to the east half, all walkable from both spawns', () => {
    expect(map.lanes).toHaveLength(4);
    const seen = new Set<number>();
    const from = (p: Vec3): void => {
      const open = [nodeAt(grid, p.x, p.y, p.z)];
      seen.clear();
      seen.add(open[0]!);
      while (open.length > 0) {
        const k = open.pop()!;
        const c = grid.nodeCell[k]!;
        const i = c % grid.cols;
        const j = (c - i) / grid.cols;
        for (const [ni, nj] of [
          [i + 1, j],
          [i - 1, j],
          [i, j + 1],
          [i, j - 1],
        ] as const) {
          if (ni < 0 || nj < 0 || ni >= grid.cols || nj >= grid.rows) continue;
          const n = stepNode(grid, k, nj * grid.cols + ni);
          if (n < 0 || grid.walkable[n] !== 1 || seen.has(n)) continue;
          seen.add(n);
          open.push(n);
        }
      }
    };
    for (const end of [0, 1] as const) {
      from(map.spawns[end]![0]!.position);
      for (const [i, lane] of map.lanes.entries()) {
        expect(lane[0]!.x, `lane ${i} starts in the west yard`).toBeLessThan(NEON_HEIGHTS_LAYOUT.spawnWalls[0]! - 1);
        expect(lane[lane.length - 1]!.x, `lane ${i} ends in the east half`).toBeGreaterThan(4);
        for (const p of lane) expect(seen.has(nodeAt(grid, p.x, p.y, p.z)), `lane ${i} point (${p.x}, ${p.y}, ${p.z}) from end ${end}`).toBe(true);
      }
    }
    // Four different routes: no two lanes share a waypoint.
    const keys = map.lanes.flatMap((l) => l.map((p) => `${p.x},${p.y},${p.z}`));
    expect(new Set(keys).size).toBe(keys.length);
    // One lane runs on each of the three floors it climbs to: the High lane reaches Level 2.
    expect(Math.max(...map.lanes.flat().map((p) => p.y))).toBe(6);
  });

  it("puts the flag on the Tower's atrium floor, open to the galleries over it", () => {
    const atrium = map.overlooks!.find((o) => o.name === 'Atrium')!;
    const [x0, x1, z0, z1] = atrium.area;
    const flag = map.flag!;
    expect(flag.y).toBe(0);
    expect(flag.x).toBeGreaterThan(x0);
    expect(flag.x).toBeLessThan(x1);
    expect(flag.z).toBeGreaterThan(z0);
    expect(flag.z).toBeLessThan(z1);
    expect(flag.x, 'in the east half').toBeGreaterThan(4);
    expect(isWalkableAt(grid, flag.x, 0, flag.z)).toBe(true);
    // Straight up through both galleries' openings to just under the roof: the atrium is open.
    expect(ray(vec3(flag.x, 0.1, flag.z), vec3(0, 1, 0), 8.5)).toBe(-1);
    // ...and the roof is there: a ray goes on up and meets it.
    expect(ray(vec3(flag.x, 0.1, flag.z), vec3(0, 1, 0), 12)).toBeGreaterThan(8.5);
    // The galleries run round it on Level 1 and 2: floor on all four sides of the opening, at 3 and 6 m.
    for (const y of [STOREY, 2 * STOREY]) {
      for (const [x, z] of [
        [x0 - 0.7, (z0 + z1) / 2],
        [x1 + 0.7, (z0 + z1) / 2],
        [(x0 + x1) / 2, z0 - 0.7],
        [(x0 + x1) / 2, z1 + 0.7],
      ] as const) {
        expect(floorAt(grid, x, y, z), `gallery at y ${y} (${x}, ${z})`).toBeCloseTo(y, 2);
      }
    }
  });

  it("builds the Sky Bridge at +6 m with solid 1.2 m sides that stop a body-height shot, a crouched one too, and a rail-high one over them", () => {
    const sky = NEON_HEIGHTS_LAYOUT.bridges.find((b) => b.name === 'Sky Bridge')!;
    expect(sky.y).toBe(6);
    const [x0, x1, z0, z1] = sky.area;
    const sides = map.blocks.filter((b) => b.kind === 'wall' && near(bottom(b), 6) && near(top(b), 6 + 1.2) && b.size.x > 7 && b.center.x > x0 && b.center.x < x1);
    expect(sides, 'a side each, solid walls (not rails)').toHaveLength(2);
    expect(sides.map((s) => Math.sign(s.center.z - (z0 + z1) / 2)).sort()).toEqual([-1, 1]);
    // From the middle of the bridge, sideways at 0.6 m and at 1.1 m above the deck: the side stops it; at 1.4 m it flies over.
    const mid = (x0 + x1) / 2;
    const zMid = (z0 + z1) / 2;
    for (const dz of [-1, 1]) {
      const at = (h: number) => ray(vec3(mid, 6 + h, zMid), vec3(0, 0, dz), 3);
      expect(at(0.6), `side ${dz} at 0.6 m`).toBeGreaterThan(0);
      expect(at(0.6)).toBeLessThan(1.5);
      expect(at(1.1), `side ${dz} at 1.1 m`).toBeGreaterThan(0);
      expect(at(1.4), `side ${dz} at 1.4 m`).toBe(-1);
    }
    // Its floor is walkable end to end at +6 m (the deck itself is a floor, not a ramp).
    for (const e of sky.ends) expect(floorAt(grid, e.x, 6, e.z)).toBeCloseTo(6, 2);
    expect(floorAt(grid, mid, 6, zMid)).toBeCloseTo(6, 2);
  });

  it('cuts every window with a 1.2 m sill: a body-height wall under it, open above it, shut again over the lintel', () => {
    // Capsules' east window (over Neon Avenue), seen from inside the room and from the balcony: Level 1's floor is at 3 m.
    const z = -1;
    const probe = (h: number) => ray(vec3(-4.3, STOREY + h, z), vec3(1, 0, 0), 1.2);
    expect(probe(1.1), 'below the sill').toBeGreaterThan(0);
    expect(probe(1.1), 'below the sill').toBeLessThan(0.6);
    expect(probe(1.3), 'above the sill').toBe(-1);
    expect(probe(2.2), 'under the lintel').toBe(-1);
    expect(probe(2.5), 'over the lintel').toBeGreaterThan(0);
    // Every window on the map has the same sill: the wall pieces standing on a storey's floor with the gap over them
    // (short, thin and not a Sky Bridge side) are all 1.2 m high.
    const sills = map.blocks.filter((b) => b.kind === 'wall' && map.storeys!.some((h) => near(bottom(b), h)) && b.size.y < 2 && b.size.y > 0.5 && Math.max(b.size.x, b.size.z) < 3 && Math.min(b.size.x, b.size.z) < 0.5);
    expect(sills.length, 'windows exist above the street').toBeGreaterThanOrEqual(10);
    for (const s of sills) expect(s.size.y, `sill at (${s.center.x}, ${s.center.y}, ${s.center.z})`).toBeCloseTo(1.2, 6);
  });

  it('climbs every stair exactly one storey over a 6 m run: 1:2, the steepest ramp the physics walks', () => {
    const ramps = map.blocks.filter((b) => b.kind === 'ramp');
    expect(ramps).toHaveLength(NEON_HEIGHTS_LAYOUT.links.length);
    expect(ramps).toHaveLength(7);
    for (const r of ramps) {
      expect(r.rise, 'a stair has a direction').toBeDefined();
      expect(r.size.y, 'a storey high').toBeCloseTo(STOREY, 6);
      const run = r.rise === '+x' || r.rise === '-x' ? r.size.x : r.size.z;
      expect(run, 'over a 6 m run').toBeCloseTo(6, 6);
      expect(r.size.y / run, '1:2').toBeCloseTo(0.5, 6);
      expect(r.size.y / run).toBeLessThanOrEqual(PHYSICS.maxRampSlope + 1e-9);
      // Foot on a storey's floor.
      expect(map.storeys!.some((s) => near(bottom(r), s)), 'starts on a floor').toBe(true);
      expect(r.surface).toBe('metal');
    }
    // Each lands on a walkable floor one storey up at its top, and starts on one at its bottom.
    for (const l of NEON_HEIGHTS_LAYOUT.links) {
      expect(floorAt(grid, l.bottom.x, l.bottom.y, l.bottom.z), `${l.name} bottom`).toBeCloseTo(l.bottom.y, 1);
      expect(floorAt(grid, l.top.x, l.top.y, l.top.z), `${l.name} top`).toBeCloseTo(l.top.y, 1);
      expect(l.top.y - l.bottom.y, l.name).toBeCloseTo(STOREY, 6);
    }
  });

  it('has the Capsules balcony over the avenue railed on three sides, its south end a 3 m drop to the street', () => {
    const x = -2.75; // the balcony's middle
    expect(floorAt(grid, x, STOREY, 0)).toBeCloseTo(STOREY, 2);
    // North end (world -z): a rail; east side (+x, over the avenue): a rail.
    expect(ray(vec3(x, STOREY + 0.5, -8), vec3(0, 0, -1), 3), 'north rail').toBeGreaterThan(0);
    expect(ray(vec3(x, STOREY + 0.5, -4), vec3(1, 0, 0), 3), 'avenue rail').toBeGreaterThan(0);
    // South end (world +z): no rail, at any height a person stands or crouches; the floor stops and the street is 3 m lower.
    for (const h of [0.2, 0.5, 1.0, 1.5]) expect(ray(vec3(x, STOREY + h, 0.5), vec3(0, 0, 1), 3), `south end open at ${h} m`).toBe(-1);
    let edge = -1;
    for (let z = 0.5; z < 4; z += 0.1) {
      if (!isWalkableAt(grid, x, STOREY, z)) {
        edge = z;
        break;
      }
    }
    expect(edge, 'the balcony ends').toBeGreaterThan(0);
    expect(edge).toBeLessThan(3);
    expect(floorAt(grid, x, 0.5, edge + 0.4)).toBeCloseTo(0, 2);
    const here = nodeAt(grid, x, STOREY, edge - 0.2);
    const below = nodeAt(grid, x, 0, edge + 0.4);
    expect(grid.floorY[here]! - grid.floorY[below]!).toBeCloseTo(3, 1);
    // Bots can't walk off it: no step from the balcony to the street.
    const cell = (xx: number, zz: number) => Math.floor((zz - grid.minZ) / grid.cell) * grid.cols + Math.floor((xx - grid.minX) / grid.cell);
    expect(stepNode(grid, here, cell(x, edge + 0.4)), 'no walking off').toBeLessThan(0);
  });

  it('does not make the roofs playable: no walkable floor over Level 2, and a roof is a wall, not a floor', () => {
    for (const b of map.blocks) {
      if (b.kind === 'floor' || b.kind === 'ramp') expect(top(b), `${b.kind} at (${b.center.x}, ${b.center.z})`).toBeLessThanOrEqual(6 + 1e-6);
    }
    const roofs = map.blocks.filter((b) => b.kind === 'wall' && near(bottom(b), 6) && near(top(b), 6.3) && b.size.x > 8);
    expect(roofs.length, 'the Arcade roof').toBeGreaterThanOrEqual(1);
    // Under each roof the highest standable floor is the storey below it (a roof drawn as floor would add a node at its top).
    const highestUnder = (x0: number, x1: number, z0: number, z1: number): number => {
      let top = Number.NEGATIVE_INFINITY;
      for (let k = 0; k < grid.walkable.length; k++) {
        if (grid.walkable[k] !== 1) continue;
        const x = nodeX(grid, k);
        const z = nodeZ(grid, k);
        if (x > x0 + 0.2 && x < x1 - 0.2 && z > z0 + 0.2 && z < z1 - 0.2) top = Math.max(top, grid.floorY[k]!);
      }
      return top;
    };
    expect(highestUnder(-15, -3.5, -10, 2), 'the Arcade (roof at 6 m, Capsules at 3 m)').toBeCloseTo(3, 1);
    expect(highestUnder(-12, -3.5, 5, 15), 'the Repair Shop block (roof at 9 m, Studio at 6 m)').toBeCloseTo(6, 1);
    expect(highestUnder(4, 17, -11, 10), "the Tower (roof at 9 m, Level 2's gallery at 6 m)").toBeCloseTo(6, 1);
    // And you can't climb onto one: no walkable node is higher than Level 2.
    let high = 0;
    for (let k = 0; k < grid.walkable.length; k++) if (grid.walkable[k] === 1 && grid.floorY[k]! > 6.05) high++;
    expect(high).toBe(0);
  });
});

describe('Neon Heights in the game (M34c acceptance 2)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('is the third map, dev, 4v4 standard and 5v5 at most, and has the spawns for 5v5', () => {
    const entry = MAPS.find((m) => m.id === 'neonHeights')!;
    expect(entry.data).toBe(NEON_HEIGHTS);
    expect([entry.tag, entry.teamSize.standard, entry.teamSize.max]).toEqual(['dev', 4, 5]);
    expect(map.spawns[0]!.length).toBeGreaterThanOrEqual(entry.teamSize.max);
    expect(map.spawns[1]!.length).toBeGreaterThanOrEqual(entry.teamSize.max);
  });

  it('plays a 5v5 for twenty seconds with all ten on their spawns and on the ground, nobody falling', () => {
    const placed: Vec3[] = [];
    const stats = playMatch(20, 3, undefined, BOTS, 'elimination', ROUNDS, NEON_HEIGHTS, 5, HITS, (state) => {
      if (placed.length === 0) for (const c of state.characters) placed.push(vec3(c.position.x, c.position.y, c.position.z));
    });
    expect(placed).toHaveLength(10);
    // Five a side, each end in its own yard, no two on the same spot.
    expect(placed.filter((p) => p.x < -18)).toHaveLength(5);
    expect(placed.filter((p) => p.x > 20)).toHaveLength(5);
    expect(new Set(placed.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`)).size).toBe(10);
    expect(stats.minY).toBeGreaterThanOrEqual(-0.1);
    expectGrounded(stats, NEON_HEIGHTS);
  });
});
