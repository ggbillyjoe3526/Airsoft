import { describe, expect, it } from 'vitest';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { PRACTICE_SPOTS } from '../config/practice';
import { RANGE, type RangeTargetSpec } from '../config/range';
import { mapGeometry } from '../content/mapLayout';
import { buildNavGrid, isWalkableAt } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import { castLevelRay } from '../sim/levelRay';
import { createRangeTargets } from '../sim/rangeTargets';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { DEPOT } from './depot';
import type { MapData } from './mapTypes';
import { NEON_HEIGHTS } from './neonHeights';
import { practiceLayout, startPlate } from './practiceLayout';
import { practiceSpots, practiceStart } from './practiceSpots';
import { WOODLAND } from './woodland';

/** A map's targets and the spots they stand on, with the nav grid and level ray a session uses. */
function layoutOn(map: MapData) {
  const { nav, level } = mapGeometry(map);
  const query: WorldQuery = { raycastStatic: (o, d, max) => castLevelRay(level, o, d, max) };
  return { nav, level, query, spots: practiceSpots(map, nav, query, PRACTICE_SPOTS), specs: practiceLayout(map, nav, query, PRACTICE_SPOTS) };
}

/** The floor a spec stands on (feet, trolley rails or plate post), as sim/rangeTargets.ts derives it. */
function floorOf(s: RangeTargetSpec): number {
  if (s.kind === 'steel') return s.y - (s.start ? RANGE.start.height : RANGE.plateHeight);
  return s.motion === 'mover' ? s.y - RANGE.mover.trolleyHeight : s.y;
}

const MAPS = [
  ['Depot', DEPOT],
  ['Woodland', WOODLAND],
  ['Neon Heights', NEON_HEIGHTS],
] as const;

describe.each(MAPS)('Practice targets on %s (M94): the range’s kinds, where bots would play', (_name, map) => {
  const { nav, level, query, spots, specs } = layoutOn(map);
  const targets = specs.filter((s) => !s.start);

  it('stands one target on every spot, near to far, then the START plate last', () => {
    expect(targets).toHaveLength(spots.length);
    expect(specs.at(-1)!.start).toBe(true);
    expect(specs.filter((s) => s.start)).toHaveLength(1);
    for (const [i, s] of targets.entries()) {
      const p = spots[i]!.position;
      expect([s.x, s.z]).toEqual([p.x, p.z]);
      expect(floorOf(s)).toBeCloseTo(p.y, 9);
      expect(s.distance).toBe(Math.round(spots[i]!.fromStart));
      // Turned the spot's way: yaw 0 faces +z (config/range.ts).
      expect(Math.sin(s.yaw)).toBeCloseTo(spots[i]!.face.x, 9);
      expect(Math.cos(s.yaw)).toBeCloseTo(spots[i]!.face.z, 9);
    }
  });

  it('builds into targets standing on their own floors, turned their own way', () => {
    const built = createRangeTargets(specs);
    for (const [i, t] of built.entries()) {
      expect(t.floor).toBeCloseTo(floorOf(specs[i]!), 9);
      expect(t.face.x).toBeCloseTo(Math.sin(specs[i]!.yaw), 9);
      expect(t.face.z).toBeCloseTo(Math.cos(specs[i]!.yaw), 9);
    }
  });

  it('crouches a figure behind low cover, a pop-up and a still one in turn, and pops one up at a window', () => {
    let crouched = 0;
    for (const [i, s] of targets.entries()) {
      const spot = spots[i]!;
      expect(s.crouched).toBe(spot.crouched);
      if (spot.crouched) {
        expect(s.kind).toBe('figure');
        expect(s.motion).toBe(crouched++ % 2 === 0 ? 'popup' : 'still');
      } else if (spot.source === 'overlook') {
        expect([s.kind, s.motion]).toEqual(['figure', 'popup']);
      }
    }
  });

  it('puts a slider only where its track fits, and a swinger only where its frame fits', () => {
    const across = (x: number, y: number, z: number, rx: number, rz: number, reach: number) => castLevelRay(level, vec3(x, y, z), vec3(rx, 0, rz), reach);
    for (const s of specs) {
      const rx = Math.cos(s.yaw); // across its face: its face (sin, cos) turned a quarter to the right
      const rz = -Math.sin(s.yaw);
      const floor = floorOf(s);
      const at = `${s.label} at (${s.x.toFixed(1)}, ${floor.toFixed(2)}, ${s.z.toFixed(1)})`;
      if (s.motion === 'mover') {
        const M = PRACTICE_SPOTS.mover;
        expect(s.track).toBe(M.track);
        for (const side of [-1, 1]) {
          expect(isWalkableAt(nav, s.x + rx * side * s.track, floor, s.z + rz * side * s.track), at).toBe(true);
          for (const h of M.rayHeights) expect(across(s.x, floor + h, s.z, rx * side, rz * side, s.track + M.margin), at).toBe(-1);
        }
      }
      if (s.motion === 'swinger') {
        const W = RANGE.swinger;
        const leg = W.arm * Math.sin(W.amplitude) + RANGE.plateRadius + W.frameClearance + W.frameWidth;
        for (const side of [-1, 1]) {
          expect(isWalkableAt(nav, s.x + rx * side * leg, floor, s.z + rz * side * leg), at).toBe(true);
          for (const h of [s.y, s.y + W.arm]) expect(across(s.x, h, s.z, rx * side, rz * side, leg), at).toBe(-1);
        }
        expect(castLevelRay(level, vec3(s.x, s.y, s.z), vec3(0, 1, 0), W.arm), at).toBe(-1);
      }
    }
  });

  it('stands the START plate a few steps ahead of where you start, facing you, in plain sight', () => {
    const start = practiceStart(map);
    const p = start.position;
    const plate = specs.at(-1)!;
    expect(plate).toEqual(startPlate(map, nav, query, PRACTICE_SPOTS));
    expect(PRACTICE_SPOTS.start.ahead).toContain(plate.distance);
    expect(Math.hypot(plate.x - p.x, plate.z - p.z)).toBeCloseTo(plate.distance, 6);
    expect(Math.abs(floorOf(plate) - p.y)).toBeLessThanOrEqual(PRACTICE_SPOTS.start.climb);
    // Within a turn of the way you face (yaw 0 faces -z for a character), and its face turned back to you.
    const ahead = { x: -Math.sin(start.yaw), z: -Math.cos(start.yaw) };
    const to = { x: (plate.x - p.x) / plate.distance, z: (plate.z - p.z) / plate.distance };
    expect(ahead.x * to.x + ahead.z * to.z).toBeGreaterThanOrEqual(Math.cos(Math.max(...PRACTICE_SPOTS.start.turns)) - 1e-9);
    expect(Math.sin(plate.yaw) * -to.x + Math.cos(plate.yaw) * -to.z).toBeCloseTo(1, 6);
    // Nothing between your eye and its middle.
    const eye = vec3(p.x, p.y + PHYSICS.groundRestGap + BODY.standEyeHeight, p.z);
    const len = Math.hypot(plate.x - eye.x, plate.y - eye.y, plate.z - eye.z);
    expect(castLevelRay(level, eye, vec3((plate.x - eye.x) / len, (plate.y - eye.y) / len, (plate.z - eye.z) / len), len)).toBe(-1);
  });

  it('lays out the same targets every time', () => {
    expect(layoutOn(map).specs).toEqual(specs);
  });
});

describe('Practice targets on the maps (M94)', () => {
  it('mixes the range’s kinds on every map: plates, small plates, still figures, pop-ups and sliders', () => {
    const everywhere = new Set<string>();
    for (const [name, map] of MAPS) {
      const labels = new Set(layoutOn(map).specs.map((s) => s.label));
      for (const l of labels) everywhere.add(l);
      const L = PRACTICE_SPOTS.labels;
      for (const kind of [L.steel, L.smallSteel, L.figure, L.popup, L.mover]) expect(labels.has(kind), `${name}: ${kind}`).toBe(true);
    }
    // Swingers, crouched figures and crouched pop-ups stand where a map has room or low cover for them.
    for (const kind of Object.values(PRACTICE_SPOTS.labels)) expect(everywhere.has(kind), kind).toBe(true);
  });
});

describe('Practice targets from map data (M94)', () => {
  const open: WorldQuery = { raycastStatic: () => -1 };
  const field = (extra: Partial<MapData>): MapData => ({
    ...OPEN_FIELD,
    spawns: [[{ position: vec3(0, 0, 20), yaw: 0 }], [{ position: vec3(0, 0, -30), yaw: Math.PI }]],
    ...extra,
  });

  it('takes the standing ones in turn near to far: figure, pop-up, steel, figure, slider, small steel', () => {
    // Single-point lanes in the open (no legs, no cover), 14 to 36 m out, then the other team's start at 50 m.
    const map = field({ lanes: [10, 5, 0, -5, -10, -15].map((z) => [vec3(10, 0, z)]) });
    const specs = practiceLayout(map, buildNavGrid(map, NAV), open, PRACTICE_SPOTS);
    expect(specs.map((s) => s.label)).toEqual(['Figure', 'Pop-up', 'Steel', 'Figure', 'Mover', 'Small steel', 'Figure', 'START']);
    const mover = specs[4]!;
    expect([mover.motion, mover.track, mover.speed, mover.phase]).toEqual(['mover', PRACTICE_SPOTS.mover.track, PRACTICE_SPOTS.mover.speeds[0], 0]);
    expect(mover.y).toBeCloseTo(RANGE.mover.trolleyHeight, 9);
    expect(specs[5]!.radius).toBe(RANGE.smallPlateRadius);
    expect(specs[2]!.y).toBeCloseTo(RANGE.plateHeight, 9);
  });

  it('stands the START plate straight ahead of you where it can, facing you', () => {
    const map = field({ lanes: [] });
    const plate = startPlate(map, buildNavGrid(map, NAV), open, PRACTICE_SPOTS)!;
    const ahead = PRACTICE_SPOTS.start.ahead[0];
    expect([plate.x, plate.z, plate.distance]).toEqual([expect.closeTo(0, 9), expect.closeTo(20 - ahead, 9), ahead]);
    expect(plate.y).toBeCloseTo(RANGE.start.height, 9);
    expect(Math.cos(plate.yaw)).toBeCloseTo(1, 9); // facing +z, back to you
  });

  it('has no START plate, so no timed challenge, where you start boxed in', () => {
    const wall = (x: number, z: number, w: number, d: number) => ({ kind: 'wall' as const, center: vec3(x, 1.5, z), size: vec3(w, 3, d) });
    const box = [wall(0, 18, 4, 0.4), wall(0, 22, 4, 0.4), wall(-2, 20, 0.4, 4), wall(2, 20, 0.4, 4)];
    const map = field({ blocks: [...OPEN_FIELD.blocks, ...box], lanes: [[vec3(10, 0, 0)]] });
    const { nav, level } = mapGeometry(map);
    const query: WorldQuery = { raycastStatic: (o, d, max) => castLevelRay(level, o, d, max) };
    expect(startPlate(map, nav, query, PRACTICE_SPOTS)).toBeNull();
    const specs = practiceLayout(map, nav, query, PRACTICE_SPOTS);
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.some((s) => s.start)).toBe(false);
  });
});
