import { describe, expect, it } from 'vitest';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { BODY } from '../config/movement';
import { buildNavGrid, createNavSearch, findPath, isWalkableAt } from '../nav/navGrid';
import { buildLevelRay, castLevelRay } from '../sim/levelRay';
import { type Vec3, vec3 } from '../sim/vec';
import { mapData, mapEntry, teamSizeOn } from './maps';
import { steepestSlope, terrainHeightAt, terrainMaxX, terrainMaxZ } from './terrain';
import { WOODLAND, WOODLAND_LAYOUT } from './woodland';

const nav = buildNavGrid(WOODLAND, NAV);
const terrain = WOODLAND.terrain!;
const flag = WOODLAND.flag!;

describe('Woodland: the ground (M33d, acceptance 1)', () => {
  it('has no slope steeper than a ramp, so every part of the field is walkable', () => {
    expect(terrain).toBeDefined();
    expect(steepestSlope(terrain)).toBeLessThanOrEqual(PHYSICS.maxRampSlope);
    // The Knoll's west face is the steepest: a real slope, not a flat field with the limit passed trivially.
    expect(steepestSlope(terrain)).toBeGreaterThan(0.3);
  });

  it('is 120 × 80 m, low at end 0 and rising to the Knoll, whose top is about +6.5 m with the flag on it', () => {
    expect(terrainMaxX(terrain) - terrain.minX).toBe(120);
    expect(terrainMaxZ(terrain) - terrain.minZ).toBe(80);
    const high = (x: number, z: number): number => terrainHeightAt(terrain, x, z)!;
    expect(high(-WOODLAND_LAYOUT.halfX + 6.5, 0)).toBeCloseTo(0, 1);
    expect(flag.y).toBeGreaterThan(6.2);
    expect(flag.y).toBeLessThan(6.8);
    expect(flag.x).toBeCloseTo(WOODLAND_LAYOUT.knoll.x, 5);
    expect(flag.z).toBeCloseTo(WOODLAND_LAYOUT.knoll.z, 5);
    // End 1's camp lies behind the Knoll's crest: higher than the field's slope at the Knoll's foot.
    expect(WOODLAND.spawns[1][0]!.position.y).toBeGreaterThan(3);
    expect(WOODLAND.spawns[1][0]!.position.y).toBeLessThan(flag.y);
  });

  it('uses the new block kinds: trees, boulders, logs and a fence round the edge', () => {
    const kinds = new Set(WOODLAND.blocks.map((b) => b.kind));
    for (const k of ['tree', 'boulder', 'log', 'fence'] as const) expect(kinds.has(k), k).toBe(true);
    // The ground is the terrain, not floor blocks.
    expect(kinds.has('floor')).toBe(false);
    // The fence stands outside the field on all four sides, tall enough that you can't see over it standing.
    const fences = WOODLAND.blocks.filter((b) => b.kind === 'fence');
    for (const b of fences) {
      const outsideX = Math.abs(b.center.x) >= WOODLAND_LAYOUT.halfX;
      const outsideZ = Math.abs(b.center.z) >= WOODLAND_LAYOUT.halfZ;
      expect(outsideX || outsideZ).toBe(true);
      expect(b.size.y).toBeGreaterThanOrEqual(2.4);
    }
    expect(fences.some((b) => b.center.x < -WOODLAND_LAYOUT.halfX)).toBe(true);
    expect(fences.some((b) => b.center.x > WOODLAND_LAYOUT.halfX)).toBe(true);
    expect(fences.some((b) => b.center.z < -WOODLAND_LAYOUT.halfZ)).toBe(true);
    expect(fences.some((b) => b.center.z > WOODLAND_LAYOUT.halfZ)).toBe(true);
  });
});

/**
 * That every spawn, dead-zone spot, lane point and the flag stands on walkable ground, that the camps can't see each
 * other, the longest sightline (141 m, MAP_EXCEPTIONS) and that every lane and spawn route can be walked are the content
 * toolkit's map checks on every map (src/content/mapChecks.ts).
 */
describe('Woodland: spawns, dead zones and the flag (M33d, acceptance 1)', () => {
  it('has five spawns and five dead-zone spots a side, each camp at its own end, facing down the field', () => {
    expect(WOODLAND.spawns[0]).toHaveLength(5);
    expect(WOODLAND.spawns[1]).toHaveLength(5);
    expect(WOODLAND.deadZones[0]).toHaveLength(5);
    expect(WOODLAND.deadZones[1]).toHaveLength(5);
    for (const s of WOODLAND.spawns[0]) expect(s.position.x).toBeLessThan(-WOODLAND_LAYOUT.halfX / 2);
    for (const s of WOODLAND.spawns[1]) expect(s.position.x).toBeGreaterThan(WOODLAND_LAYOUT.halfX / 2);
  });
});

describe('Woodland: a night field with five a side (M33d, acceptance 2)', () => {
  it('is played at night and is dev content (M35), with a flag so both modes are offered', () => {
    expect(WOODLAND.night).toBe(true);
    expect(mapEntry('woodland').tag).toBe('dev');
    expect(WOODLAND.flag).toBeDefined();
    expect(mapData('depot').night ?? false).toBe(false);
    expect(mapEntry('depot').tag).toBe('public');
  });

  it('clamps the team size to what each map has room for: Woodland 5v5, Depot 3v3, picking Woodland sets 4v4', () => {
    expect(teamSizeOn('woodland', 5)).toBe(5);
    expect(teamSizeOn('woodland', 4)).toBe(4);
    expect(teamSizeOn('woodland', 2)).toBe(2);
    expect(teamSizeOn('woodland', 9)).toBe(5);
    expect(teamSizeOn('depot', 5)).toBe(3);
    expect(teamSizeOn('depot', 4)).toBe(3);
    expect(teamSizeOn('depot', 3)).toBe(3);
    expect(teamSizeOn('depot', 1)).toBe(1);
    expect(mapEntry('woodland').teamSize.standard).toBe(4);
    expect(mapEntry('depot').teamSize.standard).toBe(3);
  });
});

describe('Woodland: the fort can be attacked (the Pro difficulty plan, owner 19:08)', () => {
  const level = buildLevelRay(WOODLAND.blocks, PHYSICS.rayGridCell, terrain);
  const { inside, entrances } = WOODLAND_LAYOUT.fort;
  const ground = (x: number, z: number): number => terrainHeightAt(terrain, x, z)!;
  const clear = (a: Vec3, b: Vec3): boolean => {
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    return castLevelRay(level, a, vec3((b.x - a.x) / d, (b.y - a.y) / d, (b.z - a.z) / d), d) < 0;
  };

  it('has at least three ways in, each a walkable route from outside the wall to the flag', () => {
    expect(entrances.length).toBeGreaterThanOrEqual(3);
    const search = createNavSearch(nav);
    const route: Vec3[] = [];
    for (const e of entrances) {
      expect(isWalkableAt(nav, e.x, e.y, e.z), `${e.x}, ${e.z}`).toBe(true);
      expect(findPath(nav, search, e, flag, NAV.snap, route), `from ${e.x}, ${e.z}`).toBe(true);
    }
  });

  it('has no spot inside from which one defender, standing, sees more than two of the ways in (by their middles), so none sees all four', () => {
    let spots = 0;
    for (let x = inside.x0 + 0.25; x < inside.x1; x += 0.5) {
      for (let z = inside.z0 + 0.25; z < inside.z1; z += 0.5) {
        if (!isWalkableAt(nav, x, ground(x, z), z)) continue;
        spots++;
        const eye = vec3(x, ground(x, z) + BODY.standEyeHeight, z);
        const seen = entrances.filter((e) => clear(eye, vec3(e.x, e.y + 1.2, e.z))).length;
        expect(seen, `from ${x}, ${z}`).toBeLessThanOrEqual(2);
      }
    }
    expect(spots).toBeGreaterThan(200);
  });

  it('has cover beside the last 20 m of every lane up to the fort: a log or boulder within 2.5 m every 2 m', () => {
    const cover = WOODLAND.blocks.filter((b) => b.kind !== 'fence' && Math.min(b.size.x, b.size.z) >= 0.8 && Math.max(b.size.x, b.size.z) >= 1.4);
    const nearestCover = (x: number, z: number): number =>
      Math.min(...cover.map((b) => Math.hypot(Math.max(0, Math.abs(x - b.center.x) - b.size.x / 2), Math.max(0, Math.abs(z - b.center.z) - b.size.z / 2))));
    const inFort = (x: number, z: number): boolean => x >= inside.x0 - 1 && x <= inside.x1 + 1 && z >= inside.z0 - 1 && z <= inside.z1 + 1;
    for (const [i, lane] of WOODLAND.lanes.entries()) {
      // Sample the lane every 0.5 m up to where it reaches the fort, then check the last 20 m of it.
      const samples: { x: number; z: number }[] = [];
      for (let k = 1; k < lane.length; k++) {
        const a = lane[k - 1]!;
        const b = lane[k]!;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        for (let s = 0; s < len; s += 0.5) samples.push({ x: a.x + ((b.x - a.x) * s) / len, z: a.z + ((b.z - a.z) * s) / len });
      }
      const reach = samples.findIndex((p) => inFort(p.x, p.z));
      expect(reach, `lane ${i + 1} reaches the fort`).toBeGreaterThan(40);
      for (let k = reach; k >= reach - 40; k -= 4) expect(nearestCover(samples[k]!.x, samples[k]!.z), `lane ${i + 1}, ${(reach - k) / 2} m out`).toBeLessThanOrEqual(2.5);
    }
  });
});
