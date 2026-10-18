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
    expect(high(-WOODLAND_LAYOUT.halfX + 6.5, 0)).toBeCloseTo(1, 1);
    expect(flag.y).toBeGreaterThan(6.2);
    expect(flag.y).toBeLessThan(6.8);
    expect(flag.x).toBeCloseTo(WOODLAND_LAYOUT.knoll.x, 5);
    expect(flag.z).toBeCloseTo(WOODLAND_LAYOUT.knoll.z, 5);
    // End 1's camp lies behind the Knoll's crest, below its top.
    for (const s of WOODLAND.spawns[1]) expect(s.position.y).toBeLessThan(flag.y - 3);
  });

  it('gives end 1\'s camp a smaller height edge at the start (M88, playtest note 13): at most 2 m over end 0\'s, not 3.5 m', () => {
    const mean = (end: 0 | 1): number => WOODLAND.spawns[end].reduce((sum, s) => sum + s.position.y, 0) / WOODLAND.spawns[end].length;
    // Still the uphill end (the ends swap at half-time), but by about 1.5 m: before M88 it was 3.5 m.
    expect(mean(1) - mean(0)).toBeGreaterThan(0.5);
    expect(mean(1) - mean(0)).toBeLessThanOrEqual(2);
    for (const a of WOODLAND.spawns[1]) for (const b of WOODLAND.spawns[0]) expect(a.position.y - b.position.y).toBeLessThanOrEqual(2);
  });

  it('uses the new block kinds: trees, logs and a fence round the edge, and no boulders (WL2, owner: "I hate them")', () => {
    const kinds = new Set(WOODLAND.blocks.map((b) => b.kind));
    for (const k of ['tree', 'log', 'fence'] as const) expect(kinds.has(k), k).toBe(true);
    expect(kinds.has('boulder')).toBe(false);
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
  it('has six spawns and six dead-zone spots a side (6v6, M88), each camp at its own end, facing down the field', () => {
    expect(WOODLAND.spawns[0]).toHaveLength(6);
    expect(WOODLAND.spawns[1]).toHaveLength(6);
    expect(WOODLAND.deadZones[0]).toHaveLength(6);
    expect(WOODLAND.deadZones[1]).toHaveLength(6);
    for (const s of WOODLAND.spawns[0]) expect(s.position.x).toBeLessThan(-WOODLAND_LAYOUT.halfX / 2);
    for (const s of WOODLAND.spawns[1]) expect(s.position.x).toBeGreaterThan(WOODLAND_LAYOUT.halfX / 2);
  });
});

describe('Woodland: West Hill, the meadow swell and the dry ravine (WL3, acceptance 1–3)', () => {
  // Plan metres (x east, z north from the south-west corner) to the terrain's height.
  const plan = (x: number, z: number): number => terrainHeightAt(terrain, x - WOODLAND_LAYOUT.halfX, WOODLAND_LAYOUT.halfZ - z)!;
  /** Height over the field's own slope: the mean of the ground `d` m either side along x (the hill and swell are narrower). */
  const over = (x: number, z: number, d: number): number => plan(x, z) - (plan(x - d, z) + plan(x + d, z)) / 2;

  it('raises West Hill to about 3.4 m at its middle and 2.2 m at its ends (it was 2.6 m all along)', () => {
    expect(over(22, 44, 14)).toBeGreaterThan(3.1);
    expect(over(22, 44, 14)).toBeLessThan(3.7);
    for (const z of [28, 60]) {
      expect(over(22, z, 14)).toBeGreaterThan(1.9);
      expect(over(22, z, 14)).toBeLessThan(2.5);
    }
  });

  it('has a 0.6 m swell on the meadow at plan (46, 53)', () => {
    const ring = (plan(46 - 9, 53) + plan(46 + 9, 53) + plan(46, 53 - 9) + plan(46, 53 + 9)) / 4;
    expect(plan(46, 53) - ring).toBeGreaterThan(0.45);
    expect(plan(46, 53) - ring).toBeLessThan(0.75);
  });

  it('digs the creek into a dry ravine about 2.2 m deep past the meadow, with a bed 3 m wide or more, and 1 m deep by the hill', () => {
    const bedZ = (x: number): number => 12 + 3 * Math.sin(x / 14);
    for (const x of [50, 60, 70]) {
      const depth = (plan(x, bedZ(x) + 9) + plan(x, bedZ(x) - 9)) / 2 - plan(x, bedZ(x));
      expect(depth, `x ${x}`).toBeGreaterThan(2);
      expect(depth, `x ${x}`).toBeLessThan(2.4);
      // The bed is flat across its 3.2 m width.
      expect(Math.abs(plan(x, bedZ(x) + 1.5) - plan(x, bedZ(x))), `x ${x}`).toBeLessThan(0.1);
    }
    const west = (plan(12, bedZ(12) + 9) + plan(12, bedZ(12) - 9)) / 2 - plan(12, bedZ(12));
    expect(west).toBeLessThan(1.2);
  });
});

describe('Woodland: the starts are hidden (M88, playtest note 13)', () => {
  const level = buildLevelRay(WOODLAND.blocks, PHYSICS.rayGridCell, terrain);

  /**
   * The start (M88, playtest note 13: "as blue team the orange team are instantly visible in the distance"): anywhere
   * within this of a spawn (m), about two seconds at a run, on walkable ground. From the Knoll's shoulder beside end 1's
   * camp you looked down the meadow into end 0's; the West Rise now hides each start from the other.
   */
  const START = 8;
  function startZone(end: 0 | 1, step: number): Vec3[] {
    const out: Vec3[] = [];
    const spawns = WOODLAND.spawns[end];
    const xs = spawns.map((s) => s.position.x);
    const zs = spawns.map((s) => s.position.z);
    for (let x = Math.min(...xs) - START; x <= Math.max(...xs) + START; x += step) {
      for (let z = Math.min(...zs) - START; z <= Math.max(...zs) + START; z += step) {
        if (!spawns.some((s) => Math.hypot(s.position.x - x, s.position.z - z) <= START)) continue;
        const y = terrainHeightAt(terrain, x, z);
        if (y === undefined || !isWalkableAt(nav, x, y, z)) continue;
        out.push(vec3(x, y, z));
      }
    }
    return out;
  }
  /** Whether a standing eye at `a` has a clear line to a body at `b`, eye height `at` over its feet. */
  function seesBody(a: Vec3, b: Vec3, at: number): boolean {
    const from = vec3(a.x, a.y + BODY.standEyeHeight, a.z);
    const dx = b.x - from.x;
    const dy = b.y + at - from.y;
    const dz = b.z - from.z;
    const d = Math.hypot(dx, dy, dz);
    return castLevelRay(level, from, vec3(dx / d, dy / d, dz / d), d) < 0;
  }

  it(`has no clear line from anyone standing within ${START} m of a spawn to the head or chest of anyone within ${START} m of the other camp's`, () => {
    // Chest: half way up a standing body.
    const parts = [BODY.standEyeHeight, BODY.height / 2];
    for (const end of [0, 1] as const) {
      const from = startZone(end, 1);
      const to = startZone(end === 0 ? 1 : 0, 1.5);
      expect(from.length).toBeGreaterThan(200);
      expect(to.length).toBeGreaterThan(80);
      for (const a of from) {
        for (const b of to) for (const at of parts) if (seesBody(a, b, at)) expect.fail(`end ${end} start ${a.x.toFixed(1)}, ${a.z.toFixed(1)} sees ${b.x.toFixed(1)}, ${b.z.toFixed(1)} at ${at} m`);
      }
    }
  });

  it('hides the starts behind the West Rise, not by a blind check: its crest sees the Knoll, and the camp\'s view stops on it', () => {
    const crest = WOODLAND_LAYOUT.riseCrest;
    expect(crest.y - WOODLAND.spawns[0][0]!.position.y).toBeGreaterThan(2);
    // From the crest you look across the meadow to the fort's west way in, about 70 m off.
    expect(seesBody(crest, WOODLAND_LAYOUT.fort.entrances[0]!, BODY.standEyeHeight)).toBe(true);
    // From end 0's spawns, the line to the Knoll's shoulder by end 1's camp ends in the rise, before its crest.
    const shoulder = startZone(1, 1.5).reduce((a, b) => (b.y > a.y ? b : a));
    for (const s of WOODLAND.spawns[0]) {
      const from = vec3(s.position.x, s.position.y + BODY.standEyeHeight, s.position.z);
      const dx = shoulder.x - from.x;
      const dy = shoulder.y + BODY.standEyeHeight - from.y;
      const dz = shoulder.z - from.z;
      const d = Math.hypot(dx, dy, dz);
      const hit = castLevelRay(level, from, vec3(dx / d, dy / d, dz / d), d);
      expect(hit).toBeGreaterThan(0);
      expect(from.x + (dx / d) * hit).toBeLessThan(crest.x + 1);
    }
  });
});

describe('Woodland: a night field with five or six a side (M33d, acceptance 2; M88)', () => {
  it('is played at night and is dev content (M35), with a flag so both modes are offered', () => {
    expect(WOODLAND.night).toBe(true);
    expect(mapEntry('woodland').tag).toBe('dev');
    expect(WOODLAND.flag).toBeDefined();
    expect(mapData('depot').night ?? false).toBe(false);
    expect(mapEntry('depot').tag).toBe('public');
  });

  it('clamps the team size to what each map offers: Woodland 5v5 or 6v6 (owner, 2026-10-06, M88), Depot up to 3v3, picking Woodland sets 5v5', () => {
    expect(teamSizeOn('woodland', 6)).toBe(6);
    expect(teamSizeOn('woodland', 5)).toBe(5);
    expect(teamSizeOn('woodland', 4)).toBe(5);
    expect(teamSizeOn('woodland', 1)).toBe(5);
    expect(teamSizeOn('woodland', 9)).toBe(6);
    expect(teamSizeOn('depot', 5)).toBe(3);
    expect(teamSizeOn('depot', 4)).toBe(3);
    expect(teamSizeOn('depot', 3)).toBe(3);
    expect(teamSizeOn('depot', 1)).toBe(1);
    expect(mapEntry('woodland').teamSize.standard).toBe(5);
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

describe('Woodland: no boulders, a roofed hut, a lower fort (WL2)', () => {
  const kinds = (k: string) => WOODLAND.blocks.filter((b) => b.kind === k);
  const hut = WOODLAND.blocks.find((b) => b.kind === 'log' && Math.abs(b.size.x - 3) < 1e-6 && Math.abs(b.size.z - 4) < 1e-6 && b.size.y >= 2.9)!;

  it('has no boulder and no tree with a bare 12 m trunk standing in the meadow', () => {
    expect(kinds('boulder')).toHaveLength(0);
    expect(kinds('tree').filter((b) => b.size.y >= 12 && Math.abs(b.size.x - 1.2) < 1e-9)).toHaveLength(0);
  });

  it('puts a grey tin roof of two ramps on the fort hut, which is 3 m tall', () => {
    expect(hut).toBeDefined();
    const hutTop = hut.center.y + hut.size.y / 2;
    const roofs = kinds('ramp').filter((r) => r.surface === 'metal' && Math.abs(r.center.x - hut.center.x) < 0.01 && Math.abs(r.center.z - hut.center.z) < 3);
    expect(roofs).toHaveLength(2);
    for (const r of roofs) {
      expect(r.center.y - r.size.y / 2).toBeCloseTo(hutTop, 1);
      expect(r.size.x).toBeGreaterThan(hut.size.x);
    }
  });

  it('keeps case spots out of every solid block', () => {
    for (const c of WOODLAND.extraction!.cases) {
      const p = c.position;
      for (const b of WOODLAND.blocks) {
        const inside = Math.abs(p.x - b.center.x) < b.size.x / 2 + 0.2 && Math.abs(p.z - b.center.z) < b.size.z / 2 + 0.2 && p.y < b.center.y + b.size.y / 2 && p.y > b.center.y - b.size.y / 2 - 0.5;
        expect(inside, `case at ${p.x}, ${p.z} in a ${b.kind}`).toBe(false);
      }
    }
  });
});
