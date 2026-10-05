import { describe, expect, it } from 'vitest';
import { NIGHT_SIGHT } from '../config/bots';
import { sightConditionsOf } from '../ai/perception';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { DEPOT } from './depot';
import { MAPS } from './maps';
import type { BlockKind, MapBlock, MapData } from './mapTypes';
import { buildNightField, inLight, nightSightRange, underCanopy } from './nightSight';
import { RANGE_MAP } from './range';
import { terrainHeightAt } from './terrain';
import { WOODLAND, WOODLAND_LAYOUT } from './woodland';

/**
 * M33g QA: what nightSight.test.ts leaves out. Acceptance 2 (the canopy grid: built from tree blocks alone, once, a map
 * with no trees has none), 3 (daylight maps have no night field) and 4 (Woodland's light pools).
 */

const block = (kind: BlockKind, x: number, z: number, h = 9): MapBlock => ({ kind, center: vec3(x, h / 2, z), size: vec3(0.5, h, 0.5) });
const night = (blocks: readonly MapBlock[], extra: Partial<MapData> = {}): MapData => ({ ...OPEN_FIELD, blocks: [...OPEN_FIELD.blocks, ...blocks], night: true, ...extra });
const sum = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);

describe('a night map with no trees has no canopy (acceptance 2)', () => {
  it('is moonlit open everywhere, with a lit pool wherever there is a light', () => {
    const map = night([], { lights: [{ position: vec3(5, 2, 5), radius: 3, colour: 0xffffff }] });
    const field = buildNightField(map, NIGHT_SIGHT)!;
    expect(field).not.toBeNull();
    expect(sum(field.canopy)).toBe(0);
    for (let x = -45; x <= 45; x += 7.5) for (let z = -45; z <= 45; z += 7.5) expect(underCanopy(field, vec3(x, 0, z)), `(${x}, ${z})`).toBe(false);
    expect(nightSightRange(field, vec3(-20, 0, 20))).toBe(NIGHT_SIGHT.open);
    expect(nightSightRange(field, vec3(5, 0, 6))).toBe(NIGHT_SIGHT.lit);
  });

  it('counts only blocks of kind tree: walls, fences, logs, crates and the like, however many, cast no canopy', () => {
    const others: BlockKind[] = ['wall', 'fence', 'log', 'crate', 'container', 'barrier', 'boulder', 'gabion', 'sandbags', 'rack'];
    const blocks: MapBlock[] = [];
    for (const k of others) for (const [x, z] of [[9, 9], [11, 9], [9, 11], [11, 11], [10, 10]] as const) blocks.push(block(k, x, z));
    const field = buildNightField(night(blocks), NIGHT_SIGHT)!;
    expect(sum(field.canopy)).toBe(0);
    expect(nightSightRange(field, vec3(10, 0, 10))).toBe(NIGHT_SIGHT.open);
  });

  it('has a night field even with no blocks or lights at all, all open, and never throws', () => {
    const field = buildNightField({ ...OPEN_FIELD, blocks: [], night: true }, NIGHT_SIGHT)!;
    expect(field).not.toBeNull();
    expect(field.lights).toHaveLength(0);
    expect(underCanopy(field, vec3(0, 0, 0))).toBe(false);
    expect(inLight(field, vec3(0, 0, 0))).toBe(false);
    expect(nightSightRange(field, vec3(0, 0, 0))).toBe(NIGHT_SIGHT.open);
    expect(nightSightRange(field, vec3(1e6, 0, -1e6))).toBe(NIGHT_SIGHT.open);
  });

  it('treats a map with `night` and no `lights` as lit nowhere', () => {
    const field = buildNightField(night([]), NIGHT_SIGHT)!;
    expect(field.lights).toHaveLength(0);
    expect(nightSightRange(field, vec3(0, 0, 0))).toBe(NIGHT_SIGHT.open);
  });
});

describe('the canopy comes from the tree blocks alone (acceptance 2)', () => {
  it('needs canopyTrees trunks: one fewer makes no canopy, exactly that many does', () => {
    const cluster = (n: number) => buildNightField(night(Array.from({ length: n }, (_, i) => block('tree', 20 + (i % 2), 20 + Math.floor(i / 2)))), NIGHT_SIGHT)!;
    expect(underCanopy(cluster(NIGHT_SIGHT.canopyTrees - 1), vec3(20.5, 0, 20.5))).toBe(false);
    expect(underCanopy(cluster(NIGHT_SIGHT.canopyTrees), vec3(20.5, 0, 20.5))).toBe(true);
    expect(underCanopy(cluster(NIGHT_SIGHT.canopyTrees + 4), vec3(20.5, 0, 20.5))).toBe(true);
  });

  it('does not count trunks that are far apart, however many: three trunks 10 m from each other shade no one', () => {
    const field = buildNightField(night([block('tree', 0, 0), block('tree', 10, 0), block('tree', 0, 10), block('tree', 10, 10), block('tree', 20, 20)]), NIGHT_SIGHT)!;
    expect(sum(field.canopy)).toBe(0);
  });

  it('follows the config it is given, not the live NIGHT_SIGHT: ranges, trunks needed and radius', () => {
    const trunks = [block('tree', 20, 20), block('tree', 26, 20), block('tree', 23, 26)]; // a 6 m triangle: ~3.5 m from its middle
    const map = night(trunks);
    const wide = buildNightField(map, { ...NIGHT_SIGHT, canopyRadius: 5, lit: 99, open: 77, canopy: 3 })!;
    expect(underCanopy(wide, vec3(23, 0, 22))).toBe(true);
    expect(nightSightRange(wide, vec3(23, 0, 22))).toBe(3);
    expect(nightSightRange(wide, vec3(-30, 0, -30))).toBe(77);
    const narrow = buildNightField(map, { ...NIGHT_SIGHT, canopyRadius: 1 })!;
    expect(underCanopy(narrow, vec3(23, 0, 22))).toBe(false);
    const coarse = buildNightField(map, { ...NIGHT_SIGHT, canopyCell: 4 })!;
    expect(coarse.cell).toBe(4);
    expect(coarse.cols * coarse.rows).toBe(coarse.canopy.length);
  });

  it('covers the whole map: a clump against the far edge shades its ground, and the grid spans every block', () => {
    const edge = [[48.5, 48.5], [49.5, 48.5], [49, 49.5]] as const;
    const field = buildNightField(night(edge.map(([x, z]) => block('tree', x, z))), NIGHT_SIGHT)!;
    expect(underCanopy(field, vec3(49, 0, 49))).toBe(true);
    expect(underCanopy(field, vec3(49.4, 0, 49.8))).toBe(true);
    expect(field.cols * field.rows).toBe(field.canopy.length);
    expect(field.minX).toBeLessThanOrEqual(-50);
    expect(field.minX + field.cols * field.cell).toBeGreaterThanOrEqual(50);
    expect(field.minZ + field.rows * field.cell).toBeGreaterThanOrEqual(50);
    expect(underCanopy(field, vec3(51, 0, 49))).toBe(false); // off the grid
    expect(underCanopy(field, vec3(49, 0, -51))).toBe(false);
    expect(underCanopy(field, vec3(Number.NaN, 0, 0))).toBe(false);
  });

  it('is built once: queries never change the grid, the lights or the field, and share the map\'s own light list', () => {
    const map = night([block('tree', 20, 20), block('tree', 22, 20), block('tree', 21, 22)], { lights: [{ position: vec3(0, 2, 0), radius: 4, colour: 1 }] });
    const field = buildNightField(map, NIGHT_SIGHT)!;
    const grid = field.canopy;
    const snapshot = Uint8Array.from(grid);
    const keys = Object.keys(field).join();
    for (let i = 0; i < 5000; i++) {
      const p = vec3((i % 100) - 50, 0, ((i * 7) % 100) - 50);
      nightSightRange(field, p);
      underCanopy(field, p);
      inLight(field, p);
    }
    expect(field.canopy).toBe(grid);
    expect(Array.from(field.canopy)).toEqual(Array.from(snapshot));
    expect(Object.keys(field).join()).toBe(keys);
    expect(field.lights).toBe(map.lights);
  });
});

describe('daylight maps have no night field (acceptance 3)', () => {
  const daylight: [string, MapData][] = [
    ['Depot', DEPOT],
    ['the practice range', RANGE_MAP],
    ['the open field', OPEN_FIELD],
  ];

  it.each(daylight)('%s has no `night` and no `lights`, so no night field and no sight conditions beyond its bushes', (_n, map) => {
    expect(map.night).toBeFalsy();
    expect(map.lights).toBeUndefined();
    expect(buildNightField(map, NIGHT_SIGHT)).toBeNull();
    const sight = sightConditionsOf(map);
    expect(sight.night).toBeNull();
    expect(sight.foliage).toEqual(map.foliage ?? []);
  });

  it('puts lights only on night maps, and every night map in the Map pop-up has a night field', () => {
    expect(MAPS.length).toBeGreaterThanOrEqual(2);
    for (const m of MAPS) {
      if (m.data.lights && m.data.lights.length > 0) expect(m.data.night, m.id).toBe(true);
      expect(buildNightField(m.data, NIGHT_SIGHT) !== null, m.id).toBe(!!m.data.night);
    }
    expect(MAPS.find((m) => m.id === 'depot')!.data.night).toBeFalsy();
    expect(MAPS.find((m) => m.id === 'woodland')!.data.night).toBe(true);
  });

  it('gives Woodland a night field in its sight conditions together with its bushes', () => {
    const sight = sightConditionsOf(WOODLAND);
    expect(sight.night).not.toBeNull();
    expect(sight.foliage).toBe(WOODLAND.foliage);
    expect(sight.night!.lights).toBe(WOODLAND.lights);
  });
});

describe("Woodland's light pools (acceptance 4)", () => {
  const lights = WOODLAND.lights ?? [];
  const { halfX, halfZ } = WOODLAND_LAYOUT;

  it('lists two camp fires and three lanterns, one at each end behind the camp lines', () => {
    expect(lights).toHaveLength(5);
    const [west, east] = WOODLAND_LAYOUT.campLines as readonly [number, number];
    expect(lights.some((l) => l.position.x < west)).toBe(true);
    expect(lights.some((l) => l.position.x > east)).toBe(true);
    expect(lights.filter((l) => l.position.x > west && l.position.x < east)).toHaveLength(3);
  });

  it('has every light inside the field, above the ground it lights, with a real radius and colour', () => {
    for (const l of lights) {
      const where = `light at ${l.position.x.toFixed(1)}, ${l.position.z.toFixed(1)}`;
      expect(Math.abs(l.position.x), where).toBeLessThan(halfX - 1);
      expect(Math.abs(l.position.z), where).toBeLessThan(halfZ - 1);
      const g = terrainHeightAt(WOODLAND.terrain!, l.position.x, l.position.z);
      expect(g, `${where} is on the terrain`).toBeDefined();
      expect(l.position.y - g!, `${where} height over ground`).toBeGreaterThan(0.2);
      expect(l.position.y - g!, `${where} height over ground`).toBeLessThan(3);
      expect(l.radius, where).toBeGreaterThan(2);
      expect(l.radius, where).toBeLessThan(15);
      expect(Number.isInteger(l.colour) && l.colour > 0 && l.colour <= 0xffffff, where).toBe(true);
      expect([l.position.x, l.position.y, l.position.z].every(Number.isFinite), where).toBe(true);
    }
  });

  it('puts no two lights on the same spot', () => {
    for (let i = 0; i < lights.length; i++) for (let j = i + 1; j < lights.length; j++) expect(Math.hypot(lights[i]!.position.x - lights[j]!.position.x, lights[i]!.position.z - lights[j]!.position.z)).toBeGreaterThan(1);
  });

  it('lights the fort: the flag and both baffled gaps (north and south) are lit, so a defender is seen from the full range', () => {
    const field = buildNightField(WOODLAND, NIGHT_SIGHT)!;
    expect(inLight(field, WOODLAND.flag!)).toBe(true);
    for (const e of [WOODLAND_LAYOUT.fort.entrances[1]!, WOODLAND_LAYOUT.fort.entrances[2]!]) expect(nightSightRange(field, e)).toBe(NIGHT_SIGHT.lit);
  });

  it('leaves most of the field dark: the light pools cover under a fifth of the ground inside the fence', () => {
    const field = buildNightField(WOODLAND, NIGHT_SIGHT)!;
    let lit = 0;
    let total = 0;
    for (let x = -halfX + 0.5; x < halfX; x += 1) {
      for (let z = -halfZ + 0.5; z < halfZ; z += 1) {
        total++;
        // Feet on the ground: a pool lights only the floor under it (M34e).
        if (inLight(field, vec3(x, terrainHeightAt(WOODLAND.terrain!, x, z), z))) lit++;
      }
    }
    expect(lit / total).toBeGreaterThan(0.02);
    expect(lit / total).toBeLessThan(0.2);
  });

  it('makes the range at a spot depend only on its light, canopy and roof: all four ranges occur on Woodland, ordered lit > open > indoor (M34e) > canopy', () => {
    const field = buildNightField(WOODLAND, NIGHT_SIGHT)!;
    const seen = new Set<number>();
    for (let x = -halfX + 0.5; x < halfX; x += 2) {
      for (let z = -halfZ + 0.5; z < halfZ; z += 2) seen.add(nightSightRange(field, vec3(x, terrainHeightAt(WOODLAND.terrain!, x, z), z)));
    }
    expect([...seen].sort((a, b) => b - a)).toEqual([NIGHT_SIGHT.lit, NIGHT_SIGHT.open, NIGHT_SIGHT.indoor, NIGHT_SIGHT.canopy]);
  });

  it('builds the canopy grid from the Woodland trunks: it is only where trees stand', () => {
    const field = buildNightField(WOODLAND, NIGHT_SIGHT)!;
    const trees = WOODLAND.blocks.filter((b) => b.kind === 'tree');
    expect(trees.length).toBeGreaterThan(50);
    let shaded = 0;
    for (let j = 0; j < field.rows; j++) {
      for (let i = 0; i < field.cols; i++) {
        if (field.canopy[j * field.cols + i] !== 1) continue;
        shaded++;
        const x = field.minX + (i + 0.5) * field.cell;
        const z = field.minZ + (j + 0.5) * field.cell;
        const near = trees.filter((t) => Math.hypot(t.center.x - x, t.center.z - z) <= NIGHT_SIGHT.canopyRadius).length;
        expect(near, `cell (${i}, ${j})`).toBeGreaterThanOrEqual(NIGHT_SIGHT.canopyTrees);
      }
    }
    expect(shaded).toBeGreaterThan(500);
    expect(shaded).toBeLessThan(field.canopy.length * 0.8);
  });
});
