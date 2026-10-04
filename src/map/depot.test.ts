import { beforeAll, describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { FLAG } from '../config/modes';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { buildNavGrid, canStep, cellIndex, cellX, cellZ, createNavSearch, findPath, floorAt, isWalkableAt, type NavGrid, nearestWalkable } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter } from '../sim/character';
import { createCommand } from '../sim/commands';
import { leanedEye, stepLean } from '../sim/lean';
import { type Vec3, vec3 } from '../sim/vec';
import { DEPOT, DEPOT_LAYOUT } from './depot';
import type { MapBlock, SpawnPoint } from './mapTypes';

const EPS = 1e-9;
const { halfX, halfZ, lanes, dockHeight, dock: dockPlan } = DEPOT_LAYOUT;
const NAV_GRID = buildNavGrid(DEPOT, NAV);

// Heights above the floor. Characters stand PHYSICS.groundRestGap above it.
const STANDING_EYE = PHYSICS.groundRestGap + BODY.standEyeHeight;
const CROUCHED_EYE = PHYSICS.groundRestGap + BODY.crouchEyeHeight;
const JUMP_APEX = (MOVEMENT.jumpSpeed * MOVEMENT.jumpSpeed) / (2 * MOVEMENT.gravity);
/** Cover must clear a hop (plus the rounded capsule bottom) so nobody climbs it. */
const MIN_UNCLIMBABLE_HEIGHT = JUMP_APEX + 0.2;
/** A crouched player's eyes must be at least this far below the top of crouch cover. */
const CROUCH_HIDE_MARGIN = 0.05;
/**
 * Longest clear line of sight allowed along a lane: keeps fights at AEG/CQB range. Both caps scale with
 * the map: they rose ~13% (23 → 26, 30 → 34 m) when Depot grew ~13% (44 × 28 → 50 × 32 m). Don't raise
 * them to make a layout pass; fix the layout.
 */
const MAX_LANE_SIGHTLINE = 26;
/**
 * Longest clear line of sight allowed in any direction between two places a player can stand. BBs are
 * still accurate-ish here but slow and visible; beyond it, engagements would be cheap long-range picks.
 */
const MAX_ANY_SIGHTLINE = 34;
/** Players this close to a spawn point count as "at spawn" and must be hidden from the other spawn. */
const SPAWN_ZONE_RADIUS = 5;

const top = (b: MapBlock): number => b.center.y + b.size.y / 2;
const bottom = (b: MapBlock): number => b.center.y - b.size.y / 2;
const minX = (b: MapBlock): number => b.center.x - b.size.x / 2;
const maxX = (b: MapBlock): number => b.center.x + b.size.x / 2;
const minZ = (b: MapBlock): number => b.center.z - b.size.z / 2;
const maxZ = (b: MapBlock): number => b.center.z + b.size.z / 2;
/** Everything inside the perimeter except the ground floor: props, the dock and its ramps. */
const props = DEPOT.blocks.filter((b) => !(b.kind === 'floor' && bottom(b) < 0) && Math.abs(b.center.x) < halfX && Math.abs(b.center.z) < halfZ);
/** Cover and walls: what stands on a floor and isn't walked on. */
const cover = props.filter((b) => b.kind !== 'floor' && b.kind !== 'ramp');

/** The dock: the raised floor block. */
const dock = props.find((b) => b.kind === 'floor')!;
/** The floor a block stands on, perhaps on top of another block: the dock under its centre, else the ground. */
const baseOf = (b: MapBlock): number =>
  bottom(b) >= top(dock) - EPS && b.center.x > minX(dock) && b.center.x < maxX(dock) && b.center.z > minZ(dock) && b.center.z < maxZ(dock) ? top(dock) : 0;
/** True if `b` stands on a floor, squarely on top of another block (a crate in a stack), or is a window's lintel. */
const supported = (b: MapBlock): boolean =>
  Math.abs(bottom(b) - baseOf(b)) < EPS ||
  (b.kind === 'wall' && props.some((o) => o.kind === 'wall' && bottom(o) < EPS && o.center.x === b.center.x && o.center.z === b.center.z && top(o) < bottom(b))) ||
  props.some((o) => o !== b && Math.abs(top(o) - bottom(b)) < EPS && minX(o) <= minX(b) + EPS && maxX(o) >= maxX(b) - EPS && minZ(o) <= minZ(b) + EPS && maxZ(o) >= maxZ(b) - EPS);

/**
 * What stops sight: every solid except the ground floor and the ramps (a ramp is a wedge, its box would
 * over-block; leaving ramps out only makes lines longer and hiding harder, so the checks stay strict).
 */
const sightBlockers = DEPOT.blocks.filter((b) => b.kind !== 'ramp' && !(b.kind === 'floor' && bottom(b) < 0));

/** 3D segment vs axis-aligned box (slab method). */
function segmentHitsBox(a: Vec3, b: Vec3, k: MapBlock): boolean {
  let t0 = 0;
  let t1 = 1;
  for (const [p, d, lo, hi] of [
    [a.x, b.x - a.x, minX(k), maxX(k)],
    [a.y, b.y - a.y, bottom(k), top(k)],
    [a.z, b.z - a.z, minZ(k), maxZ(k)],
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

const sees = (a: Vec3, b: Vec3): boolean => !sightBlockers.some((k) => segmentHitsBox(a, b, k));

/** The eye of someone standing (or crouched) at (x, z) on the floor there. */
const eyeAt = (x: number, z: number, eye = STANDING_EYE): Vec3 => vec3(x, floorAt(NAV_GRID, x, z) + eye, z);

/** Every place a player can stand on a `step` grid (walkable nav cells, any floor height). */
function standablePoints(step: number): { x: number; z: number }[] {
  const pts: { x: number; z: number }[] = [];
  for (let x = -halfX + step / 2; x < halfX; x += step) {
    for (let z = -halfZ + step / 2; z < halfZ; z += step) if (isWalkableAt(NAV_GRID, x, z)) pts.push({ x, z });
  }
  return pts;
}

/** Standable points within SPAWN_ZONE_RADIUS of any of the spawns, on a grid. */
function spawnZone(spawns: SpawnPoint[], step: number): { x: number; z: number }[] {
  return standablePoints(step).filter((p) => spawns.some((s) => Math.hypot(p.x - s.position.x, p.z - s.position.z) <= SPAWN_ZONE_RADIUS));
}

/** Breadth-first search over the nav grid (with its step rule); `allowed` can veto cells (to force a route through one lane). */
function reachable(g: NavGrid, from: Vec3, to: Vec3, allowed: (x: number, z: number) => boolean): boolean {
  const goal = cellIndex(g, to.x, to.z);
  const start = cellIndex(g, from.x, from.z);
  const seen = new Uint8Array(g.cols * g.rows);
  const queue = [start];
  seen[start] = 1;
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!;
    if (c === goal) return true;
    const i = c % g.cols;
    const j = (c - i) / g.cols;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= g.cols || nj >= g.rows) continue;
      const n = nj * g.cols + ni;
      if (seen[n] || !canStep(g, c, n) || !allowed(cellX(g, ni), cellZ(g, nj))) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return false;
}

/** A route may use any connector, but must cross the centre line (x = 0) inside `lane`'s band. */
const viaLane =
  (lane: { minZ: number; maxZ: number }) =>
  (x: number, z: number): boolean =>
    Math.abs(x) > 1.6 || (z > lane.minZ && z < lane.maxZ);

/** Walking distance along a nav route. */
function walk(from: Vec3, to: Vec3): number {
  const route: Vec3[] = [];
  expect(findPath(NAV_GRID, createNavSearch(NAV_GRID), from, to, NAV.snap, route), `route ${from.x},${from.z} → ${to.x},${to.z}`).toBe(true);
  let d = 0;
  let p = from;
  for (const q of route) {
    d += Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    p = q;
  }
  return d;
}

/**
 * Route length (metres) from every nav cell to cell `goal` over the same 8-neighbour moves findPath searches (no
 * squeezing diagonally past a blocked cell or a drop); Infinity where there's no route. A string-pulled route is never
 * longer, so this is an upper bound on the walk.
 */
function routeLengths(g: NavGrid, goal: number): Float64Array {
  const dist = new Float64Array(g.cols * g.rows).fill(Number.POSITIVE_INFINITY);
  const heap: [number, number][] = [];
  const push = (d: number, c: number): void => {
    heap.push([d, c]);
    for (let i = heap.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (heap[p]![0] <= heap[i]![0]) break;
      [heap[p], heap[i]] = [heap[i]!, heap[p]!];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  dist[goal] = 0;
  push(0, goal);
  while (heap.length > 0) {
    const [d, c] = pop();
    if (d > dist[c]!) continue;
    const ci = c % g.cols;
    const cj = (c - ci) / g.cols;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= g.cols || nj >= g.rows) continue;
        const n = nj * g.cols + ni;
        if (!canStep(g, c, n)) continue;
        if (di !== 0 && dj !== 0 && !(canStep(g, c, cj * g.cols + ni) && canStep(g, c, nj * g.cols + ci))) continue;
        const nd = d + (di !== 0 && dj !== 0 ? Math.SQRT2 : 1) * g.cell;
        if (nd < dist[n]!) {
          dist[n] = nd;
          push(nd, n);
        }
      }
    }
  }
  return dist;
}

/** Seconds of walk-off time kept spare for the corners (each string-pulled turn re-accelerates) and waypoint reach. */
const WALK_OFF_SLACK = 2;

// ---- Tests -------------------------------------------------------------------------------------

describe('Depot map', () => {
  const [west, east] = DEPOT.spawns;
  const pole = DEPOT.flag!;

  it('keeps every prop inside the perimeter, standing on the ground, on the dock or on another prop', () => {
    expect(top(dock)).toBe(dockHeight);
    for (const b of props) {
      expect(Math.abs(b.center.x) + b.size.x / 2).toBeLessThanOrEqual(halfX + EPS);
      expect(Math.abs(b.center.z) + b.size.z / 2).toBeLessThanOrEqual(halfZ + EPS);
      expect(supported(b), `${b.kind} at ${JSON.stringify(b.center)} floats`).toBe(true);
    }
  });

  it('uses only cover that is unclimbable, and low cover that hides a crouched player', () => {
    expect(CROUCHED_EYE).toBeLessThan(DEPOT_LAYOUT.crouchCoverHeight - CROUCH_HIDE_MARGIN);
    expect(STANDING_EYE).toBeGreaterThan(DEPOT_LAYOUT.crouchCoverHeight);
    // The dock's open edge too: you can jump down from it, not up onto it.
    for (const b of [...cover.filter((c) => Math.abs(bottom(c) - baseOf(c)) < EPS), dock]) {
      const h = top(b) - baseOf(b);
      const where = `${b.kind} at ${JSON.stringify(b.center)} is ${h} m tall`;
      expect(h <= PHYSICS.maxWalkableLedge || h >= MIN_UNCLIMBABLE_HEIGHT, where).toBe(true);
      // Anything a standing player can see over must hide a crouched one.
      if (b.kind !== 'floor' && h < STANDING_EYE) expect(h, where).toBeGreaterThan(CROUCHED_EYE + CROUCH_HIDE_MARGIN);
    }
  });

  it('has no slits: gaps between obstacles on the same floor are either sealed (< 0.3 m) or clearly walkable (≥ 0.9 m)', () => {
    // Blocks that stop someone walking on their floor.
    const blockers = cover.filter((b) => top(b) - baseOf(b) > PHYSICS.maxWalkableLedge);
    const inside = (x: number, z: number, base: number, skip: MapBlock[]): boolean =>
      blockers.some((b) => !skip.includes(b) && baseOf(b) === base && x > minX(b) && x < maxX(b) && z > minZ(b) && z < maxZ(b));
    for (let i = 0; i < blockers.length; i++) {
      for (let j = i + 1; j < blockers.length; j++) {
        const a = blockers[i]!;
        const b = blockers[j]!;
        if (baseOf(a) !== baseOf(b)) continue;
        const gx = Math.max(0, Math.max(minX(a), minX(b)) - Math.min(maxX(a), maxX(b)));
        const gz = Math.max(0, Math.max(minZ(a), minZ(b)) - Math.min(maxZ(a), maxZ(b)));
        const gap = Math.hypot(gx, gz);
        if (gap < 0.3 || gap >= 0.9) continue;
        // The middle of the gap: if a third block fills it, there's no slit there.
        const mx = (Math.max(minX(a), minX(b)) + Math.min(maxX(a), maxX(b))) / 2;
        const mz = (Math.max(minZ(a), minZ(b)) + Math.min(maxZ(a), maxZ(b))) / 2;
        const where = `${gap.toFixed(2)} m between ${a.kind} (${a.center.x}, ${a.center.z}) and ${b.kind} (${b.center.x}, ${b.center.z})`;
        expect(inside(mx, mz, baseOf(a), [a, b]), where).toBe(true);
      }
    }
  });

  it('gives each end three spawns on the ground, clear of geometry, facing the other end', () => {
    for (const [end, spawns] of [
      [0, west],
      [1, east],
    ] as const) {
      expect(spawns.length).toBe(3);
      for (const s of spawns) {
        expect(s.position.y).toBe(0);
        expect(Math.sign(-Math.sin(s.yaw))).toBe(end === 0 ? 1 : -1);
        expect(isWalkableAt(NAV_GRID, s.position.x, s.position.z), `spawn ${JSON.stringify(s.position)} is blocked`).toBe(true);
      }
    }
  });

  it('gives each end a dead-zone spot per player on the ground, clear of geometry, a body apart and away from the spawns', () => {
    for (const [end, spots] of DEPOT.deadZones.entries()) {
      expect(spots.length).toBe(3);
      for (const s of spots) {
        const where = `end ${end} dead-zone spot ${JSON.stringify(s.position)}`;
        expect(s.position.y).toBe(0);
        expect(isWalkableAt(NAV_GRID, s.position.x, s.position.z), `${where} is blocked`).toBe(true);
        for (const sp of DEPOT.spawns[end]!) expect(Math.hypot(s.position.x - sp.position.x, s.position.z - sp.position.z), where).toBeGreaterThan(1);
        for (const o of spots) if (o !== s) expect(Math.hypot(s.position.x - o.position.x, s.position.z - o.position.z), where).toBeGreaterThan(2 * BODY.radius); // figures on neighbouring spots don't overlap
      }
    }
  });

  it(`lets a walk-off from anywhere on the map reach its dead-zone spot with ${WALK_OFF_SLACK} s of walkOffTime to spare (audit SIM-06)`, { timeout: 30_000 }, () => {
    const pace = HITS.walkOffSpeed * MOVEMENT.runSpeed;
    const budget = HITS.walkOffTime - WALK_OFF_SLACK;
    let worst = 0;
    for (const spots of DEPOT.deadZones) {
      for (const spot of spots) {
        const lengths = routeLengths(NAV_GRID, nearestWalkable(NAV_GRID, spot.position.x, spot.position.z, NAV.snap));
        // Every walkable point on a 1 m grid (either end's victims can be hit anywhere, half-time swaps the ends).
        for (let x = -halfX + 0.5; x < halfX; x += 1) {
          for (let z = -halfZ + 0.5; z < halfZ; z += 1) {
            const c = cellIndex(NAV_GRID, x, z);
            if (c < 0 || NAV_GRID.walkable[c] !== 1 || !Number.isFinite(lengths[c]!)) continue;
            let metres = lengths[c]!;
            // Over budget on the grid: measure the real (string-pulled) route the walk-off would follow.
            if (metres / pace > budget) metres = walk(vec3(x, floorAt(NAV_GRID, x, z), z), spot.position);
            worst = Math.max(worst, metres / pace);
            expect(metres / pace, `walk-off from ${x}, ${z} to ${spot.position.x}, ${spot.position.z}`).toBeLessThanOrEqual(budget);
          }
        }
      }
    }
    expect(worst).toBeGreaterThan(HITS.walkOffTime / 2); // the check really covered the far quarter
  });

  it('connects the two ends, and the west end to the pole, through each of the three lanes', () => {
    for (const [name, lane] of Object.entries(lanes)) {
      for (const from of west) {
        expect(reachable(NAV_GRID, from.position, pole, viaLane(lane)), `no ${name} route to the pole`).toBe(true);
        for (const to of east) expect(reachable(NAV_GRID, from.position, to.position, viaLane(lane)), `no ${name} route between the ends`).toBe(true);
      }
    }
  });

  it('runs each bot lane in its own band, from the west end to the east end', () => {
    const bands = [lanes.north, lanes.mid, lanes.south];
    expect(DEPOT.lanes).toHaveLength(bands.length);
    DEPOT.lanes.forEach((points, i) => {
      // The middle of each lane (where it crosses x = 0) lies in its band.
      const crossing = points.findIndex((p) => p.x > 0);
      const [a, b] = [points[crossing - 1]!, points[crossing]!];
      const z = a.z + ((b.z - a.z) * -a.x) / (b.x - a.x);
      expect(z, `lane ${i}`).toBeGreaterThan(bands[i]!.minZ);
      expect(z, `lane ${i}`).toBeLessThan(bands[i]!.maxZ);
      expect(points[0]!.x).toBeLessThan(points[points.length - 1]!.x);
    });
  });

  describe('the loading dock', () => {
    it('is reached by a ramp at each end, and is a drop everywhere else (bots never route off its edge)', () => {
      const onDock = vec3(4.5, dockHeight, dockPlan.edgeZ - 0.4);
      expect(floorAt(NAV_GRID, onDock.x, onDock.z)).toBeCloseTo(dockHeight, 6);
      // Up the west ramp only (east half of the map closed), and up the east ramp only (west half closed).
      expect(reachable(NAV_GRID, west[0]!.position, onDock, (x) => x < 6)).toBe(true);
      expect(reachable(NAV_GRID, east[0]!.position, onDock, (x) => x > 3)).toBe(true);
      // Without the ramps (their cells vetoed), the dock is cut off from the road below.
      const noRamps = (x: number, z: number) => !(z < dockPlan.edgeZ && dockPlan.ramps.some(([x0, x1]) => x > x0! && x < x1!));
      expect(reachable(NAV_GRID, west[0]!.position, onDock, noRamps)).toBe(false);
    });

    it('overlooks the road, not Container Alley: the containers under it are stacked (only the west ramp looks through the connector)', () => {
      // On the dock proper (its west end aside, where the ramp comes up from the connector to mid), nothing in
      // the alley is in sight.
      const onDock = standablePoints(0.5).filter((p) => floorAt(NAV_GRID, p.x, p.z) > dockHeight - EPS && p.x > 2);
      const alley = standablePoints(0.5).filter((p) => p.z < lanes.mid.maxZ && p.z > lanes.mid.minZ && p.x < 3.6);
      expect(onDock.length).toBeGreaterThan(50);
      const open: string[] = [];
      for (const a of onDock) for (const b of alley) if (sees(eyeAt(a.x, a.z), eyeAt(b.x, b.z))) open.push(`(${a.x}, ${a.z}) → (${b.x}, ${b.z})`);
      expect(open.slice(0, 5), `${open.length} lines from the dock into the alley`).toEqual([]);
    });
  });

  describe('the flagpole (Attack / Defend)', () => {
    it('stands in the Bay on the east side, on open ground all round the pole', () => {
      expect(pole.x).toBeGreaterThan(6);
      expect(pole.y).toBe(0);
      // Most of the ground within reach of the rope is standable, so players can work it from any side.
      let open = 0;
      let all = 0;
      const r = FLAG.radius;
      for (let dx = -r; dx <= r; dx += 0.2) {
        for (let dz = -r; dz <= r; dz += 0.2) {
          if (Math.hypot(dx, dz) > r) continue;
          all++;
          if (isWalkableAt(NAV_GRID, pole.x + dx, pole.z + dz)) open++;
        }
      }
      expect(open / all).toBeGreaterThan(0.9);
    });

    it('stands much closer to the defenders’ spawns than to the attackers’, out of sight of the attackers’ spawn', () => {
      const defend = Math.max(...east.map((s) => walk(s.position, pole)));
      const attack = Math.min(...west.map((s) => walk(s.position, pole)));
      expect(attack, `attackers ${attack.toFixed(1)} m, defenders ${defend.toFixed(1)} m`).toBeGreaterThan(defend * 1.6);
      const target = vec3(pole.x, STANDING_EYE, pole.z);
      for (const a of spawnZone(west, 0.5)) expect(sees(eyeAt(a.x, a.z), target), `(${a.x}, ${a.z}) sees the pole`).toBe(false);
    });
  });

  it('hides everyone near one spawn from everyone near the other, standing or crouched', { timeout: 20_000 }, () => {
    const westZone = spawnZone(west, 0.5);
    const eastZone = spawnZone(east, 0.5);
    expect(westZone.length).toBeGreaterThan(50);
    expect(eastZone.length).toBeGreaterThan(50);
    for (const eye of [STANDING_EYE, CROUCHED_EYE]) {
      for (const a of westZone) {
        for (const b of eastZone) expect(sees(eyeAt(a.x, a.z, eye), eyeAt(b.x, b.z, eye)), `(${a.x}, ${a.z}) sees (${b.x}, ${b.z}) at eye ${eye}`).toBe(false);
      }
    }
  });

  it(`keeps every straight west–east line along a lane under ${MAX_LANE_SIGHTLINE} m`, () => {
    for (const [name, lane] of Object.entries(lanes)) {
      for (let z = lane.minZ + BODY.radius; z <= lane.maxZ - BODY.radius; z += 0.25) {
        const row: Vec3[] = [];
        for (let x = -halfX + 0.25; x < halfX; x += 0.5) if (isWalkableAt(NAV_GRID, x, z)) row.push(eyeAt(x, z));
        let longest = 0;
        for (let i = 0; i < row.length; i++) {
          for (let j = row.length - 1; j > i; j--) {
            const d = row[j]!.x - row[i]!.x;
            if (d <= longest) break;
            if (Math.abs(row[j]!.y - row[i]!.y) < EPS && sees(row[i]!, row[j]!)) longest = d;
          }
        }
        expect(longest, `${name} lane, z = ${z.toFixed(2)}: ${longest.toFixed(1)} m clear`).toBeLessThanOrEqual(MAX_LANE_SIGHTLINE);
      }
    }
  });

  it(`has no line of sight longer than ${MAX_ANY_SIGHTLINE} m in any direction, from the ground or the dock`, { timeout: 60_000 }, () => {
    const points = standablePoints(0.5).map((p) => eyeAt(p.x, p.z));
    const limitSq = MAX_ANY_SIGHTLINE * MAX_ANY_SIGHTLINE;
    const open: string[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      for (let j = i + 1; j < points.length; j++) {
        const b = points[j]!;
        if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 <= limitSq) continue;
        if (sees(a, b)) open.push(`(${a.x}, ${a.y.toFixed(2)}, ${a.z}) → (${b.x}, ${b.y.toFixed(2)}, ${b.z}) ${Math.hypot(a.x - b.x, a.z - b.z).toFixed(1)} m`);
      }
    }
    expect(open.slice(0, 10), `${open.length} long sightlines`).toEqual([]);
  });

  describe('with Rapier', () => {
    beforeAll(async () => {
      await initPhysics();
    });

    it('keeps a leaning head clear of a real wall, and lets a lean see past a wall’s end', () => {
      const world = new PhysicsWorld(DEPOT, BODY, 1 / 60);
      const lean = (x: number, z: number, yaw: number, dir: number, crouch: number) => {
        const c = createCharacter(0, vec3(x, PHYSICS.groundRestGap, z), yaw);
        c.grounded = true;
        c.crouchAmount = crouch;
        const cmd = createCommand();
        cmd.lean = dir;
        for (let i = 0; i < 60; i++) stepLean(c, cmd, BODY, HITS, MOVEMENT, world, 1 / 60);
        return { c, eye: leanedEye(c, BODY, HITS, vec3()) };
      };
      // Beside the west spawn wall (x -17.7 .. -17.3), facing -Z: the wall is on the right.
      for (const crouch of [0, 1]) {
        const right = lean(-18.1, 0, 0, 1, crouch);
        expect(right.c.lean).toBeLessThan(1);
        expect(right.eye.x).toBeLessThanOrEqual(-17.7 - MOVEMENT.leanWallClearance + 1e-6);
        expect(lean(-18.1, 0, 0, -1, crouch).c.lean).toBe(-1); // nothing on the left
      }
      // Behind the wall near its north end (z 5.5), facing +X: the right is +Z. Upright, the wall hides the
      // ground beyond its end; leaning right puts the eyes past the end, so that line of sight opens.
      const target = vec3(-16.6, PHYSICS.groundRestGap + BODY.standEyeHeight, 5.6); // on open ground just past the end
      const clear = (from: Vec3) => {
        const d = vec3(target.x - from.x, target.y - from.y, target.z - from.z);
        const len = Math.hypot(d.x, d.y, d.z);
        return world.raycastStatic(from, vec3(d.x / len, d.y / len, d.z / len), len) < 0;
      };
      expect(clear(lean(-18.3, 5.1, -Math.PI / 2, 0, 0).eye)).toBe(false);
      const peek = lean(-18.3, 5.1, -Math.PI / 2, 1, 0);
      expect(peek.c.lean).toBe(1);
      expect(clear(peek.eye)).toBe(true);
      world.dispose();
    });

    it('agrees that the spawn points cannot see each other', () => {
      const world = new PhysicsWorld(DEPOT, BODY, 1 / 60);
      for (const a of west) {
        for (const b of east) {
          const from = vec3(a.position.x, STANDING_EYE, a.position.z);
          const d = vec3(b.position.x - a.position.x, 0, b.position.z - a.position.z);
          const dist = Math.hypot(d.x, d.z);
          expect(world.raycastStatic(from, vec3(d.x / dist, 0, d.z / dist), dist)).toBeGreaterThan(0);
        }
      }
      world.dispose();
    });
  });
});
