import { describe, expect, it } from 'vitest';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { BODY } from '../config/movement';
import { buildNavGrid, createNavSearch, findPath, floorAt, isWalkableAt } from '../nav/navGrid';
import { buildLevelRay, castLevelRay } from '../sim/levelRay';
import { type Vec3, vec3 } from '../sim/vec';
import { mapEntry, teamSizeOn } from './maps';
import { steepestSlope, terrainHeightAt, terrainMaxX, terrainMaxZ } from './terrain';
import { WOODLAND, WOODLAND_LAYOUT } from './woodland';

/** How far a map's points may sit from the floor under them (as map/mapData.test.ts). */
const ON_FLOOR = 0.05;

const nav = buildNavGrid(WOODLAND, NAV);
const terrain = WOODLAND.terrain!;
const flag = WOODLAND.flag!;
const insideMap = (p: Vec3): boolean => Math.abs(p.x) <= WOODLAND_LAYOUT.halfX && Math.abs(p.z) <= WOODLAND_LAYOUT.halfZ;

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

describe('Woodland: spawns, dead zones and the flag (M33d, acceptance 1)', () => {
  const points = [
    ...WOODLAND.spawns.flat().map((s) => ['spawn', s.position] as const),
    ...WOODLAND.deadZones.flat().map((s) => ['dead-zone spot', s.position] as const),
    ['flag', flag] as const,
  ];

  it('puts all of them inside the map, on walkable ground, standing on the floor under them', () => {
    expect(points.length).toBe(5 * 2 * 2 + 1);
    for (const [what, p] of points) {
      const at = `${what} at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;
      expect(insideMap(p), `${at} inside`).toBe(true);
      expect(isWalkableAt(nav, p.x, p.z), `${at} walkable`).toBe(true);
      expect(Math.abs(p.y - floorAt(nav, p.x, p.z)), `${at} on the floor`).toBeLessThanOrEqual(ON_FLOOR);
    }
  });

  it('keeps every lane point inside the map, walkable and on the ground', () => {
    expect(WOODLAND.lanes).toHaveLength(3);
    for (const lane of WOODLAND.lanes) {
      for (const p of lane) {
        expect(insideMap(p)).toBe(true);
        expect(isWalkableAt(nav, p.x, p.z), `lane point ${p.x}, ${p.z}`).toBe(true);
        // A lane point sits anywhere in its nav cell, so on a slope the cell's floor (taken at the centre) may differ a little.
        expect(Math.abs(p.y - floorAt(nav, p.x, p.z))).toBeLessThanOrEqual(ON_FLOOR + PHYSICS.maxRampSlope * NAV.cell);
      }
    }
  });

  it('has five spawns and five dead-zone spots a side, each camp at its own end, facing down the field', () => {
    expect(WOODLAND.spawns[0]).toHaveLength(5);
    expect(WOODLAND.spawns[1]).toHaveLength(5);
    expect(WOODLAND.deadZones[0]).toHaveLength(5);
    expect(WOODLAND.deadZones[1]).toHaveLength(5);
    for (const s of WOODLAND.spawns[0]) expect(s.position.x).toBeLessThan(-WOODLAND_LAYOUT.halfX / 2);
    for (const s of WOODLAND.spawns[1]) expect(s.position.x).toBeGreaterThan(WOODLAND_LAYOUT.halfX / 2);
  });
});

describe('Woodland: the two camps cannot see each other (M33d, acceptance 1)', () => {
  const level = buildLevelRay(WOODLAND.blocks, PHYSICS.rayGridCell, terrain);

  /** Whether a standing (or crouched) eye at `a` has a clear line to one at `b`. */
  function sees(a: Vec3, b: Vec3, eye: number): boolean {
    const from = vec3(a.x, a.y + eye, a.z);
    const to = vec3(b.x, b.y + eye, b.z);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const d = Math.hypot(dx, dy, dz);
    return castLevelRay(level, from, vec3(dx / d, dy / d, dz / d), d) < 0;
  }

  it('has no clear sight line from any spawn of one camp to any spawn of the other, standing or crouched', () => {
    for (const eye of [BODY.standEyeHeight, BODY.crouchEyeHeight]) {
      for (const a of WOODLAND.spawns[0]) for (const b of WOODLAND.spawns[1]) expect(sees(a.position, b.position, eye), `eye ${eye} from ${a.position.z} to ${b.position.z}`).toBe(false);
    }
  });

  it('does see along an open line: the check is not blind (a spawn sees its camp-mates and the ray hits the Knoll between)', () => {
    const [a, b] = WOODLAND.spawns[0];
    expect(sees(a!.position, b!.position, BODY.standEyeHeight)).toBe(true);
    // And the line really is blocked by the ground or cover, not by the ray missing the map.
    const from = vec3(WOODLAND.spawns[0][2]!.position.x, WOODLAND.spawns[0][2]!.position.y + BODY.standEyeHeight, WOODLAND.spawns[0][2]!.position.z);
    const target = WOODLAND.spawns[1][2]!.position;
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const flat = Math.hypot(dx, dz);
    const hit = castLevelRay(level, from, vec3(dx / flat, 0, dz / flat), flat);
    expect(hit).toBeGreaterThan(0);
    expect(hit).toBeLessThan(flat);
  });
});

describe('Woodland: the lanes are walkable (M33d, acceptance 1)', () => {
  const search = createNavSearch(nav);

  /** A nav path exists from `a` to `b` and ends where asked. */
  function walkable(a: Vec3, b: Vec3): boolean {
    const out: Vec3[] = [];
    if (!findPath(nav, search, a, b, NAV.snap, out)) return false;
    const last = out[out.length - 1]!;
    return Math.hypot(last.x - b.x, last.z - b.z) < NAV.snap;
  }

  it('finds a path from every spawn of each camp to the flag, and between the camps', () => {
    for (const end of [0, 1]) for (const s of WOODLAND.spawns[end]!) expect(walkable(s.position, flag), `end ${end} spawn at z ${s.position.z}`).toBe(true);
    expect(walkable(WOODLAND.spawns[0][0]!.position, WOODLAND.spawns[1][4]!.position)).toBe(true);
    expect(walkable(WOODLAND.spawns[1][0]!.position, WOODLAND.spawns[0][4]!.position)).toBe(true);
  });

  it('finds a path along each lane, point to point, from the camp at end 0 to the Knoll', () => {
    for (const [i, lane] of WOODLAND.lanes.entries()) {
      for (let k = 1; k < lane.length; k++) expect(walkable(lane[k - 1]!, lane[k]!), `lane ${i + 1} leg ${k}`).toBe(true);
      expect(walkable(WOODLAND.spawns[0][2]!.position, lane[0]!), `lane ${i + 1} from the camp`).toBe(true);
      expect(walkable(lane[0]!, flag), `lane ${i + 1} start to the flag`).toBe(true);
      expect(walkable(lane[lane.length - 1]!, flag), `lane ${i + 1} end to the flag`).toBe(true);
    }
  });
});

describe('Woodland: a night field with five a side (M33d, acceptance 2)', () => {
  it('is played at night, still in development, with a flag so both modes are offered', () => {
    expect(WOODLAND.night).toBe(true);
    expect(WOODLAND.inDevelopment).toBe(true);
    expect(WOODLAND.flag).toBeDefined();
    expect(mapEntry('depot').data.night ?? false).toBe(false);
    expect(mapEntry('depot').data.inDevelopment ?? false).toBe(false);
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
