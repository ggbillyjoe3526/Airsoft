import { beforeAll, describe, expect, it } from 'vitest';
import { BODY, MOVEMENT } from '../config/movement';
import { PHYSICS } from '../config/physics';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { type Vec3, vec3 } from '../sim/vec';
import { DEPOT, DEPOT_LAYOUT } from './depot';
import type { MapBlock, SpawnPoint } from './mapTypes';

const EPS = 1e-9;
const { halfX, halfZ, lanes } = DEPOT_LAYOUT;

// Heights above the floor. Characters stand PHYSICS.groundRestGap above it.
const STANDING_EYE = PHYSICS.groundRestGap + BODY.standEyeHeight;
const CROUCHED_EYE = PHYSICS.groundRestGap + BODY.crouchEyeHeight;
const JUMP_APEX = (MOVEMENT.jumpSpeed * MOVEMENT.jumpSpeed) / (2 * MOVEMENT.gravity);
/** Cover must clear a hop (plus the rounded capsule bottom) so nobody climbs it. */
const MIN_UNCLIMBABLE_HEIGHT = JUMP_APEX + 0.2;
/** A crouched player's eyes must be at least this far below the top of crouch cover. */
const CROUCH_HIDE_MARGIN = 0.05;
/** Longest clear line of sight allowed along a lane: keeps fights at AEG/CQB range. */
const MAX_LANE_SIGHTLINE = 23;
/**
 * Longest clear line of sight allowed in any direction between two places a player can stand. BBs are
 * still accurate-ish here but slow and visible; beyond it, engagements would be cheap long-range picks.
 */
const MAX_ANY_SIGHTLINE = 30;
/** Players this close to a spawn point count as "at spawn" and must be hidden from the enemy's spawn. */
const SPAWN_ZONE_RADIUS = 5;

const top = (b: MapBlock): number => b.center.y + b.size.y / 2;
const bottom = (b: MapBlock): number => b.center.y - b.size.y / 2;
const minX = (b: MapBlock): number => b.center.x - b.size.x / 2;
const maxX = (b: MapBlock): number => b.center.x + b.size.x / 2;
const minZ = (b: MapBlock): number => b.center.z - b.size.z / 2;
const maxZ = (b: MapBlock): number => b.center.z + b.size.z / 2;
const props = DEPOT.blocks.filter(
  (b) => b.kind !== 'floor' && Math.abs(b.center.x) < halfX && Math.abs(b.center.z) < halfZ,
);

/** Blocks that stop a walking character: they overlap the body's height and are too tall to step onto. */
const blocksWalking = (b: MapBlock): boolean =>
  b.kind !== 'floor' && bottom(b) < BODY.height && top(b) > PHYSICS.maxWalkableLedge;

/** Blocks that stop sight at a given eye height. */
const blockersAt = (eye: number): MapBlock[] => DEPOT.blocks.filter((b) => b.kind !== 'floor' && bottom(b) < eye && top(b) > eye);

/** 2D segment vs axis-aligned rectangle (slab method). */
function segmentHitsBox(ax: number, az: number, bx: number, bz: number, b: MapBlock): boolean {
  let t0 = 0;
  let t1 = 1;
  for (const [p, d, lo, hi] of [
    [ax, bx - ax, minX(b), maxX(b)],
    [az, bz - az, minZ(b), maxZ(b)],
  ] as const) {
    if (Math.abs(d) < EPS) {
      if (p < lo || p > hi) return false;
    } else {
      let ta = (lo - p) / d;
      let tb = (hi - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** Where a character's centre can stand (clear of walking blockers by its radius). */
function standable(x: number, z: number): boolean {
  if (Math.abs(x) > halfX - BODY.radius || Math.abs(z) > halfZ - BODY.radius) return false;
  return DEPOT.blocks
    .filter(blocksWalking)
    .every((b) => x < minX(b) - BODY.radius || x > maxX(b) + BODY.radius || z < minZ(b) - BODY.radius || z > maxZ(b) + BODY.radius);
}

/** Standable points within SPAWN_ZONE_RADIUS of any of the spawns, on a grid. */
function spawnZone(spawns: SpawnPoint[], step: number): { x: number; z: number }[] {
  const pts: { x: number; z: number }[] = [];
  const xs = spawns.map((s) => s.position.x);
  const zs = spawns.map((s) => s.position.z);
  for (let x = Math.min(...xs) - SPAWN_ZONE_RADIUS; x <= Math.max(...xs) + SPAWN_ZONE_RADIUS; x += step) {
    for (let z = Math.min(...zs) - SPAWN_ZONE_RADIUS; z <= Math.max(...zs) + SPAWN_ZONE_RADIUS; z += step) {
      const near = spawns.some((s) => Math.hypot(x - s.position.x, z - s.position.z) <= SPAWN_ZONE_RADIUS);
      if (near && standable(x, z)) pts.push({ x, z });
    }
  }
  return pts;
}

/** Longest stretch along x (inside the walls) at row z with nothing blocking sight at `eye`. */
function longestClearRun(z: number, eye: number): number {
  const intervals = blockersAt(eye)
    .filter((b) => z >= minZ(b) && z <= maxZ(b))
    .map((b) => [Math.max(-halfX, minX(b)), Math.min(halfX, maxX(b))] as const)
    .sort((a, b) => a[0] - b[0]);
  let cursor = -halfX;
  let longest = 0;
  for (const [lo, hi] of intervals) {
    if (lo > cursor) longest = Math.max(longest, lo - cursor);
    cursor = Math.max(cursor, hi);
  }
  return Math.max(longest, halfX - cursor);
}

// ---- Walkability grid (flood fill) --------------------------------------------------------------

const CELL = 0.2;
const COLS = Math.ceil((halfX * 2) / CELL);
const ROWS = Math.ceil((halfZ * 2) / CELL);

function cellCentre(i: number, j: number): { x: number; z: number } {
  return { x: -halfX + (i + 0.5) * CELL, z: -halfZ + (j + 0.5) * CELL };
}

function buildWalkable(): Uint8Array {
  const grid = new Uint8Array(COLS * ROWS);
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const { x, z } = cellCentre(i, j);
      grid[j * COLS + i] = standable(x, z) ? 1 : 0;
    }
  }
  return grid;
}

function cellOf(p: Vec3): number {
  return Math.floor((p.z + halfZ) / CELL) * COLS + Math.floor((p.x + halfX) / CELL);
}

/** Breadth-first search over walkable cells; `allowed` can veto cells (to force a route through one lane). */
function reachable(grid: Uint8Array, from: Vec3, to: Vec3, allowed: (x: number, z: number) => boolean): boolean {
  const goal = cellOf(to);
  const seen = new Uint8Array(grid.length);
  const queue = [cellOf(from)];
  seen[queue[0]!] = 1;
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!;
    if (c === goal) return true;
    const i = c % COLS;
    const j = (c - i) / COLS;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
      const n = nj * COLS + ni;
      if (seen[n] || !grid[n]) continue;
      const { x, z } = cellCentre(ni, nj);
      if (!allowed(x, z)) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return false;
}

// ---- Tests -------------------------------------------------------------------------------------

describe('Depot map', () => {
  const [blue, orange] = DEPOT.spawns;

  it('is mirror-symmetric across x = 0, so both teams get the same map', () => {
    for (const b of DEPOT.blocks) {
      const twin = DEPOT.blocks.find(
        (o) =>
          o.kind === b.kind &&
          Math.abs(o.center.x + b.center.x) < EPS &&
          Math.abs(o.center.y - b.center.y) < EPS &&
          Math.abs(o.center.z - b.center.z) < EPS &&
          Math.abs(o.size.x - b.size.x) < EPS &&
          Math.abs(o.size.y - b.size.y) < EPS &&
          Math.abs(o.size.z - b.size.z) < EPS,
      );
      expect(twin, `no mirror twin for ${b.kind} at ${JSON.stringify(b.center)}`).toBeDefined();
    }
    expect(blue.length).toBe(orange.length);
    blue.forEach((s, i) => {
      const o = orange[i]!;
      expect(o.position.x).toBeCloseTo(-s.position.x, 9);
      expect(o.position.z).toBeCloseTo(s.position.z, 9);
      expect(o.yaw).toBeCloseTo(-s.yaw, 9);
    });
  });

  it('keeps every prop inside the perimeter', () => {
    for (const b of props) {
      expect(Math.abs(b.center.x) + b.size.x / 2).toBeLessThanOrEqual(halfX + EPS);
      expect(Math.abs(b.center.z) + b.size.z / 2).toBeLessThanOrEqual(halfZ + EPS);
      expect(bottom(b)).toBeGreaterThanOrEqual(-EPS);
    }
  });

  it('uses only cover that is unclimbable, and low cover that hides a crouched player', () => {
    expect(CROUCHED_EYE).toBeLessThan(DEPOT_LAYOUT.crouchCoverHeight - CROUCH_HIDE_MARGIN);
    expect(STANDING_EYE).toBeGreaterThan(DEPOT_LAYOUT.crouchCoverHeight);
    for (const b of props.filter((p) => bottom(p) < EPS)) {
      const h = top(b);
      const where = `${b.kind} at ${JSON.stringify(b.center)} is ${h} m tall`;
      expect(h <= PHYSICS.maxWalkableLedge || h >= MIN_UNCLIMBABLE_HEIGHT, where).toBe(true);
      // Anything a standing player can see over must hide a crouched one.
      if (h < STANDING_EYE) expect(h, where).toBeGreaterThan(CROUCHED_EYE + CROUCH_HIDE_MARGIN);
    }
  });

  it('gives each team three spawns on the floor, clear of geometry, facing the enemy side', () => {
    for (const [team, spawns] of [
      [0, blue],
      [1, orange],
    ] as const) {
      expect(spawns.length).toBe(3);
      for (const s of spawns) {
        expect(s.position.y).toBe(0);
        expect(Math.sign(-Math.sin(s.yaw))).toBe(team === 0 ? 1 : -1);
        expect(standable(s.position.x, s.position.z), `spawn ${JSON.stringify(s.position)} is blocked`).toBe(true);
      }
    }
  });

  it('connects the spawns through each of the three lanes', () => {
    const grid = buildWalkable();
    for (const [name, lane] of Object.entries(lanes)) {
      // A route may use any connector, but must cross the centre line inside this lane.
      const viaLane = (x: number, z: number): boolean => Math.abs(x) > 1.6 || (z > lane.minZ && z < lane.maxZ);
      for (const from of blue) {
        for (const to of orange) {
          expect(reachable(grid, from.position, to.position, viaLane), `no ${name} route`).toBe(true);
        }
      }
    }
  });

  it('hides everyone near one spawn from everyone near the other, standing or crouched', () => {
    const blueZone = spawnZone(blue, 0.5);
    const orangeZone = spawnZone(orange, 0.5);
    expect(blueZone.length).toBeGreaterThan(50);
    for (const eye of [STANDING_EYE, CROUCHED_EYE]) {
      const blockers = blockersAt(eye);
      for (const a of blueZone) {
        for (const b of orangeZone) {
          const blocked = blockers.some((k) => segmentHitsBox(a.x, a.z, b.x, b.z, k));
          expect(blocked, `(${a.x}, ${a.z}) sees (${b.x}, ${b.z}) at eye ${eye}`).toBe(true);
        }
      }
    }
  });

  it(`keeps every straight line along a lane under ${MAX_LANE_SIGHTLINE} m`, () => {
    for (const [name, lane] of Object.entries(lanes)) {
      for (let z = lane.minZ + BODY.radius; z <= lane.maxZ - BODY.radius; z += 0.05) {
        const run = longestClearRun(z, STANDING_EYE);
        expect(run, `${name} lane, z = ${z.toFixed(2)}: ${run.toFixed(1)} m clear`).toBeLessThanOrEqual(MAX_LANE_SIGHTLINE);
      }
    }
  });

  it(`has no line of sight longer than ${MAX_ANY_SIGHTLINE} m in any direction`, () => {
    const points: { x: number; z: number }[] = [];
    for (let x = -halfX + 0.5; x < halfX; x += 1) {
      for (let z = -halfZ + 0.5; z < halfZ; z += 1) if (standable(x, z)) points.push({ x, z });
    }
    const blockers = blockersAt(STANDING_EYE);
    const limitSq = MAX_ANY_SIGHTLINE * MAX_ANY_SIGHTLINE;
    const open: string[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      for (let j = i + 1; j < points.length; j++) {
        const b = points[j]!;
        if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 <= limitSq) continue;
        if (!blockers.some((k) => segmentHitsBox(a.x, a.z, b.x, b.z, k))) {
          open.push(`(${a.x}, ${a.z}) → (${b.x}, ${b.z}) ${Math.hypot(a.x - b.x, a.z - b.z).toFixed(1)} m`);
        }
      }
    }
    expect(open.slice(0, 10), `${open.length} long sightlines`).toEqual([]);
  });

  describe('with Rapier', () => {
    beforeAll(async () => {
      await initPhysics();
    });

    it('agrees that the spawn points cannot see each other', () => {
      const world = new PhysicsWorld(DEPOT, BODY, 1 / 60);
      const dir = vec3();
      for (const a of blue) {
        for (const b of orange) {
          const from = vec3(a.position.x, STANDING_EYE, a.position.z);
          const dist = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
          dir.x = (b.position.x - a.position.x) / dist;
          dir.z = (b.position.z - a.position.z) / dist;
          expect(world.raycastStatic(from, dir, dist)).toBeGreaterThan(0);
        }
      }
      world.dispose();
    });
  });
});
