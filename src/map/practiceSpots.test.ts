import { describe, expect, it } from 'vitest';
import { NAV } from '../config/nav';
import { PRACTICE_SPOTS } from '../config/practice';
import { mapGeometry } from '../content/mapLayout';
import { buildNavGrid, isWalkableAt } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import { castLevelRay } from '../sim/levelRay';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { DEPOT } from './depot';
import type { MapData } from './mapTypes';
import { NEON_HEIGHTS } from './neonHeights';
import { practiceSpots, practiceStart } from './practiceSpots';
import { WOODLAND } from './woodland';

/** The map's spots, with the same nav grid and level ray a session uses (PhysicsWorld.raycastStatic is castLevelRay). */
function spotsOn(map: MapData) {
  const { nav, level } = mapGeometry(map);
  const query: WorldQuery = { raycastStatic: (o, d, max) => castLevelRay(level, o, d, max) };
  return { nav, level, query, spots: practiceSpots(map, nav, query, PRACTICE_SPOTS) };
}

const up = vec3(0, 1, 0);
const downward = vec3(0, -1, 0);

describe.each([
  ['Depot', DEPOT],
  ['Woodland', WOODLAND],
  ['Neon Heights', NEON_HEIGHTS],
])('Practice on %s (M94): targets where the bots would play', (_name, map) => {
  const { nav, level, query, spots } = spotsOn(map);
  const start = practiceStart(map).position;

  it('starts you where Alpha starts round 1, and stands a good number of targets', () => {
    expect(practiceStart(map)).toBe(map.spawns[0][0]);
    expect(spots.length).toBeGreaterThanOrEqual(12);
    expect(spots.length).toBeLessThanOrEqual(PRACTICE_SPOTS.maxTargets);
  });

  it('stands every target on the walkable floor, clear of solid things up to head height', () => {
    for (const s of spots) {
      const p = s.position;
      const at = `(${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)})`;
      expect(isWalkableAt(nav, p.x, p.y, p.z), at).toBe(true);
      // The floor is right under its feet: a ray down from just above meets it at once.
      expect(castLevelRay(level, vec3(p.x, p.y + 0.3, p.z), downward, 1), at).toBeCloseTo(0.3, 1);
      // Nothing solid in the body: a ray up from the floor clears a standing player's height.
      expect(castLevelRay(level, vec3(p.x, p.y + 0.05, p.z), up, 1.75), at).toBe(-1);
    }
  });

  it('keeps your start clear, and no two targets crowd each other on the same floor', () => {
    for (const s of spots) {
      for (const own of map.spawns[0]) {
        expect(Math.hypot(s.position.x - own.position.x, s.position.z - own.position.z)).toBeGreaterThanOrEqual(PRACTICE_SPOTS.clearOfStart);
      }
    }
    for (const [i, a] of spots.entries()) {
      for (const b of spots.slice(i + 1)) {
        const apart = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
        if (Math.abs(a.position.y - b.position.y) < PRACTICE_SPOTS.storeyGap) expect(apart).toBeGreaterThanOrEqual(PRACTICE_SPOTS.minGap);
      }
    }
  });

  it('turns most targets towards your end, each on a level, unit facing', () => {
    let towards = 0;
    for (const s of spots) {
      expect(Math.hypot(s.face.x, s.face.z)).toBeCloseTo(1, 6);
      if (s.face.x * (start.x - s.position.x) + s.face.z * (start.z - s.position.z) > 0) towards++;
    }
    expect(towards / spots.length).toBeGreaterThan(0.75);
  });

  it('sorts them near to far, and says why a bot would be at each', () => {
    for (let i = 1; i < spots.length; i++) expect(spots[i]!.fromStart).toBeGreaterThanOrEqual(spots[i - 1]!.fromStart);
    expect(new Set(spots.map((s) => s.source))).toContain('lane');
    expect(spots.some((s) => s.source === 'overlook')).toBe((map.overlooks ?? []).length > 0);
  });

  it('crouches a figure only behind cover lower than its shoulders, right in front of it', () => {
    const blocked = (x: number, y: number, z: number, fx: number, fz: number) => query.raycastStatic(vec3(x, y, z), vec3(fx, 0, fz), PRACTICE_SPOTS.coverReach) >= 0;
    for (const s of spots) {
      const { x, y, z } = s.position;
      const low = blocked(x, y + PRACTICE_SPOTS.lowRayHeight, z, s.face.x, s.face.z);
      const high = blocked(x, y + PRACTICE_SPOTS.highRayHeight, z, s.face.x, s.face.z);
      expect(s.crouched).toBe(low && !high);
      expect(high).toBe(false); // nothing at head height in front: no target stares at a wall
    }
  });

  it('places the same targets every time (no randomness, any seed)', () => {
    expect(practiceSpots(map, nav, query, PRACTICE_SPOTS)).toEqual(spots);
  });
});

describe('practice spots from map data (M94)', () => {
  const open: WorldQuery = { raycastStatic: () => -1 };
  const field = (extra: Partial<MapData>): MapData => ({
    ...OPEN_FIELD,
    spawns: [[{ position: vec3(0, 0, 20), yaw: 0 }], [{ position: vec3(0, 0, -30), yaw: Math.PI }]],
    ...extra,
  });

  it('stands one at every lane point facing back along the lane, one at the other team’s start facing yours', () => {
    const map = field({ lanes: [[vec3(10, 0, 0), vec3(10, 0, -20)]] });
    const spots = practiceSpots(map, buildNavGrid(map, NAV), open, PRACTICE_SPOTS);
    const at = (x: number, z: number) => spots.find((s) => Math.abs(s.position.x - x) < 0.5 && Math.abs(s.position.z - z) < 0.5);
    // The lane's first point faces your start; the second faces back to the first; the far start faces yours.
    const first = at(10, 0)!;
    expect(first.face.x).toBeCloseTo(-10 / Math.hypot(10, 20), 1);
    expect(first.face.z).toBeCloseTo(20 / Math.hypot(10, 20), 1);
    const second = at(10, -20)!;
    expect(second.face.x).toBeCloseTo(0, 1);
    expect(second.face.z).toBeCloseTo(1, 1);
    const theirs = at(0, -30)!;
    expect(theirs.face.z).toBeCloseTo(1, 6);
    // And between the lane's points, where a bot walks: its 20 m leg holds one more, at its middle.
    expect(at(10, -10)).toBeDefined();
    expect(spots).toHaveLength(4);
  });

  it('leaves out a lane point too near your start, and one off the walkable floor', () => {
    const map = field({ lanes: [[vec3(0, 0, 15), vec3(80, 0, 0)]] }); // 5 m from the start; past the field's edge
    const spots = practiceSpots(map, buildNavGrid(map, NAV), open, PRACTICE_SPOTS);
    expect(spots.every((s) => Math.hypot(s.position.x, s.position.z - 20) >= PRACTICE_SPOTS.clearOfStart)).toBe(true);
    expect(spots.every((s) => Math.abs(s.position.x) < 50)).toBe(true);
  });

  it('crouches a figure behind a crate, and turns one that would face a wall towards your start', () => {
    const crate = { kind: 'crate' as const, center: vec3(0, 0.5, -9), size: vec3(2, 1, 1) }; // 1 m high, just in front of (0, -10)
    const wall = { kind: 'wall' as const, center: vec3(16.5, 1.5, -12), size: vec3(1, 3, 6) }; // tall, 1 m from (18, -12)
    const map = field({ blocks: [...OPEN_FIELD.blocks, crate, wall], lanes: [[vec3(0, 0, -10)], [vec3(10, 0, -12), vec3(18, 0, -12)]] });
    const { nav, level } = mapGeometry(map);
    const query: WorldQuery = { raycastStatic: (o, d, max) => castLevelRay(level, o, d, max) };
    const spots = practiceSpots(map, nav, query, PRACTICE_SPOTS);
    const near = (x: number, z: number) => spots.find((s) => Math.hypot(s.position.x - x, s.position.z - z) < 0.6);
    const behindCrate = near(0, -10)!;
    expect(behindCrate.crouched).toBe(true);
    expect(behindCrate.source).toBe('lane');
    // (18, -12) would face back along its lane, into the wall: it faces your start (0, 20) instead, standing.
    const byWall = near(18, -12)!;
    expect(byWall.face.x).toBeCloseTo(-18 / Math.hypot(18, 32), 1);
    expect(byWall.face.z).toBeCloseTo(32 / Math.hypot(18, 32), 1);
    expect(byWall.crouched).toBe(false);
  });
});
