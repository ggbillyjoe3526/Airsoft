import { describe, expect, it } from 'vitest';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { buildNavGrid, cellIndex, isWalkableAt, type NavGrid, nodeAt, nodeX, nodeZ, stepNode } from '../nav/navGrid';
import { buildLevelRay, castLevelRay } from '../sim/levelRay';
import { type Vec3, vec3 } from '../sim/vec';
import { NEON_HEIGHTS, NEON_HEIGHTS_LAYOUT } from './neonHeights';

/**
 * Neon Heights' layout rules (M34c, the owner's approved concept and the Pro difficulty plan's map rules,
 * research/esports-difficulty-2026-10-04.md): two ways up to every raised floor, a corner at every stair top and Sky
 * Bridge end, no spot that holds two stairs at once, the spawn yards out of each other's sight, no street line longer
 * than LONGEST_LINE, and overlooks that really see their areas.
 */

const grid = buildNavGrid(NEON_HEIGHTS, NAV);
const level = buildLevelRay(NEON_HEIGHTS.blocks);
const { links, bridges, raised, spawnWalls } = NEON_HEIGHTS_LAYOUT;

/** Standing eye height above a floor point. */
const eye = (p: Vec3, h = BODY.standEyeHeight): Vec3 => vec3(p.x, p.y + h, p.z);
/** True if nothing in the level stands between `a` and `b`. */
function sees(a: Vec3, b: Vec3): boolean {
  const d = vec3(b.x - a.x, b.y - a.y, b.z - a.z);
  const len = Math.hypot(d.x, d.y, d.z);
  return castLevelRay(level, a, vec3(d.x / len, d.y / len, d.z / len), len) < 0;
}

/** Every node reachable on foot from `from` (4-neighbour steps), skipping nodes `banned` says are gone. */
function reach(g: NavGrid, from: Vec3, banned: (k: number) => boolean = () => false): Uint8Array {
  const seen = new Uint8Array(g.walkable.length);
  const start = nodeAt(g, from.x, from.y, from.z);
  seen[start] = 1;
  const open = [start];
  while (open.length > 0) {
    const k = open.pop()!;
    const c = g.nodeCell[k]!;
    const i = c % g.cols;
    const j = (c - i) / g.cols;
    for (const [ni, nj] of [
      [i + 1, j],
      [i - 1, j],
      [i, j + 1],
      [i, j - 1],
    ] as const) {
      if (ni < 0 || nj < 0 || ni >= g.cols || nj >= g.rows) continue;
      const n = stepNode(g, k, nj * g.cols + ni);
      if (n < 0 || g.walkable[n] !== 1 || seen[n] === 1 || banned(n)) continue;
      seen[n] = 1;
      open.push(n);
    }
  }
  return seen;
}

const reached = (seen: Uint8Array, p: Vec3): boolean => seen[nodeAt(grid, p.x, p.y, p.z)] === 1;
const inArea = (area: readonly number[], x: number, z: number): boolean => x > area[0]! && x < area[1]! && z > area[2]! && z < area[3]!;
const spawn = (end: 0 | 1): Vec3 => NEON_HEIGHTS.spawns[end][0]!.position;

/** A stair top's or bridge end's corner: walking straight on at waist height meets a wall or rail within this. */
const CORNER = 2.5;
/** Two stair tops count as held from one spot when both are this near it... */
const HOLD_RANGE = 20;
/** ...and this close in bearing (degrees): one held angle covers both. */
const HOLD_ANGLE = 45;
/** The longest straight street line between the spawn walls (m): corridors are broken every 15-20 m. */
const LONGEST_LINE = 22;
/** An overlook's spot sees at least this share of its area's walkable ground (at chest height). */
const OVERLOOK_SHARE = 0.1;

describe('Neon Heights layout', () => {
  it('reaches every raised floor from both spawns', () => {
    for (const end of [0, 1] as const) {
      const seen = reach(grid, spawn(end));
      for (const r of raised) expect(reached(seen, r.at), `${r.name} from end ${end}`).toBe(true);
      for (const l of links) expect(reached(seen, l.top), `${l.name} from end ${end}`).toBe(true);
    }
  });

  it('keeps two ways up: every raised floor is still reachable from both spawns with any one stair or bridge gone', () => {
    const cuts = [
      ...links.map((l) => ({ name: l.name, area: l.area, lo: l.bottom.y + 0.05, hi: l.top.y - 0.05 })),
      ...bridges.map((b) => ({ name: b.name, area: b.area, lo: b.y - 0.05, hi: b.y + 0.05 })),
    ];
    for (const cut of cuts) {
      const banned = (k: number) => grid.floorY[k]! >= cut.lo && grid.floorY[k]! <= cut.hi && inArea(cut.area, nodeX(grid, k), nodeZ(grid, k));
      for (const end of [0, 1] as const) {
        const seen = reach(grid, spawn(end), banned);
        for (const r of raised) expect(reached(seen, r.at), `${r.name} from end ${end} without the ${cut.name}`).toBe(true);
      }
    }
  });

  it('turns a corner at every stair top and Sky Bridge end: straight on, a wall or rail within a couple of metres', () => {
    const waist = 0.9;
    const ahead = (from: Vec3, dx: number, dz: number) => castLevelRay(level, eye(from, waist), vec3(dx / Math.hypot(dx, dz), 0, dz / Math.hypot(dx, dz)), 30);
    for (const l of links) {
      const d = ahead(l.top, l.top.x - l.bottom.x, l.top.z - l.bottom.z);
      expect(d, l.name).toBeGreaterThan(0);
      expect(d, l.name).toBeLessThanOrEqual(CORNER);
    }
    const sky = bridges.find((b) => b.name === 'Sky Bridge')!;
    const a = sky.ends[0]!;
    const b = sky.ends[1]!;
    for (const [end, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const d = ahead(end, end.x - other.x, end.z - other.z);
      expect(d, `Sky Bridge end at x ${end.x}`).toBeGreaterThan(0);
      expect(d, `Sky Bridge end at x ${end.x}`).toBeLessThanOrEqual(CORNER);
    }
  });

  it('shuts the view at each Sky Bridge end with a wall, not just something to step round: head high, a partition within a couple of metres', () => {
    const sky = bridges.find((b) => b.name === 'Sky Bridge')!;
    const [a, b] = sky.ends;
    for (const [end, other] of [
      [a!, b!],
      [b!, a!],
    ] as const) {
      const dx = end.x - other.x;
      const d = castLevelRay(level, eye(end, 1.8), vec3(Math.sign(dx), 0, 0), 30);
      expect(d, `Sky Bridge end at x ${end.x}`).toBeGreaterThan(0);
      expect(d, `Sky Bridge end at x ${end.x}`).toBeLessThanOrEqual(CORNER);
    }
  });

  it('has no spot that holds two stairs at once: no two stair tops in sight, in range and in one held angle', () => {
    const held: string[] = [];
    for (let k = 0; k < grid.floorY.length; k += 2) {
      if (grid.walkable[k] !== 1) continue;
      const p = vec3(nodeX(grid, k), grid.floorY[k]!, nodeZ(grid, k));
      const inSight = links.filter((l) => Math.hypot(l.top.x - p.x, l.top.z - p.z) <= HOLD_RANGE && sees(eye(p), eye(l.top, 1)));
      for (let i = 0; i < inSight.length; i++) {
        for (let j = i + 1; j < inSight.length; j++) {
          const s = inSight[i]!;
          const t = inSight[j]!;
          if (s.well === t.well) continue;
          const turn = Math.atan2(s.top.z - p.z, s.top.x - p.x) - Math.atan2(t.top.z - p.z, t.top.x - p.x);
          const angle = (Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) * 180) / Math.PI;
          if (angle < HOLD_ANGLE) held.push(`${s.name} and ${t.name} from (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
        }
      }
    }
    expect(held).toEqual([]);
  });

  it("keeps the spawn yards out of each other's sight", () => {
    for (const a of NEON_HEIGHTS.spawns[0]) {
      for (const b of NEON_HEIGHTS.spawns[1]) expect(sees(eye(a.position), eye(b.position))).toBe(false);
    }
  });

  it(`breaks every street line: none longer than ${LONGEST_LINE} m between the spawn walls`, () => {
    const [west, east] = spawnWalls;
    let longest = 0;
    let where = '';
    for (let k = 0; k < grid.floorY.length; k++) {
      if (grid.walkable[k] !== 1 || grid.floorY[k]! > 0.01) continue;
      // Just off the cell's centre, so no line runs exactly along a block's face.
      const p = eye(vec3(nodeX(grid, k) + 0.05, 0, nodeZ(grid, k) + 0.05));
      if (p.x < west || p.x > east) continue;
      for (const dx of [1, 0]) {
        const out = (sx: number, sz: number, cap: number) => {
          const d = castLevelRay(level, p, vec3(sx, 0, sz), cap);
          return d < 0 ? cap : d;
        };
        const len = dx ? out(1, 0, east - p.x) + out(-1, 0, p.x - west) : out(0, 1, 60) + out(0, -1, 60);
        if (len > longest) {
          longest = len;
          where = `through (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) along ${dx ? 'x' : 'z'}`;
        }
      }
    }
    expect(longest, where).toBeLessThanOrEqual(LONGEST_LINE);
  });

  it('lists overlooks that stand on their floors and see their areas', () => {
    for (const o of NEON_HEIGHTS.overlooks ?? []) {
      const [x0, x1, z0, z1] = o.area;
      const ground: Vec3[] = [];
      for (let x = x0 + 0.25; x < x1; x += 0.5) {
        for (let z = z0 + 0.25; z < z1; z += 0.5) if (cellIndex(grid, x, z) >= 0 && isWalkableAt(grid, x, 0, z)) ground.push(vec3(x, 1.3, z));
      }
      expect(ground.length, o.name).toBeGreaterThan(0);
      for (const f of o.from) {
        expect(isWalkableAt(grid, f.x, f.y, f.z), `${o.name} from (${f.x}, ${f.y}, ${f.z})`).toBe(true);
        expect(f.y, `${o.name}: overlooks are above the street`).toBeGreaterThan(0);
        const share = ground.filter((g) => sees(eye(f), g)).length / ground.length;
        expect(share, `${o.name} from (${f.x}, ${f.y}, ${f.z})`).toBeGreaterThanOrEqual(OVERLOOK_SHARE);
      }
    }
  });
});
