import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS, botConfig } from '../config/bots';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { DEPOT, DEPOT_LAYOUT } from '../map/depot';
import { type Bush, foliageDepth } from '../map/foliage';
import type { MapData } from '../map/mapTypes';
import { RAMP_YARD, STACK_HOUSE } from '../map/testYard';
import { WOODLAND } from '../map/woodland';
import { buildNavGrid } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import type { WorldQuery } from '../sim/armament';
import { eyeHeight } from '../sim/character';
import { createCommand } from '../sim/commands';
import { OPEN_NAV } from '../sim/testSupport';
import { type Vec3, vec3 } from '../sim/vec';
import { type AngleFeatures, angleFeaturesOf } from './angleFeatures';
import { createHeldAngle, findHeldAngles, type HeldAngle } from './angles';
import { aimBot } from './botCombat';
import { type CoverBlock, tallCoverBlocks } from './cover';
import { eyeOf } from './perception';
import { boxQuery, depotBots, noWalls } from './testSupport';

/**
 * M40, acceptance 4: held angles (M37) also cover stair and ramp tops on layered floors, bush edges and tree gaps, from
 * the map's own data and nav. Each test here fails with the feature taken out (findHeldAngles without features, or the
 * feature's step removed).
 */

const EYE = BODY.standEyeHeight;
const angles = (n: number) => Array.from({ length: n }, createHeldAngle);

function featuresOf(map: MapData): AngleFeatures {
  const nav = buildNavGrid(map, NAV);
  return angleFeaturesOf(nav, tallCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap), map.foliage ?? [], BOTS);
}

/** Features on the open test floor: just these bushes and posts. */
function openFeatures(bushes: readonly Bush[], posts: readonly CoverBlock[] = []): AngleFeatures {
  return angleFeaturesOf(OPEN_NAV, posts, bushes, BOTS);
}

const post = (x: number, z: number, half = 0.25): CoverBlock => ({ x, z, halfX: half, halfZ: half });

/** Two trunks (0.5 m square, 9 m tall) as walls. */
function trunks(a: CoverBlock, b: CoverBlock): WorldQuery {
  const qa = boxQuery(a.x, a.z, a.halfX, a.halfZ, 9);
  const qb = boxQuery(b.x, b.z, b.halfX, b.halfZ, 9);
  return {
    raycastStatic(o, d, max) {
      const ta = qa.raycastStatic(o, d, max);
      const tb = qb.raycastStatic(o, d, max);
      return ta < 0 ? tb : tb < 0 ? ta : Math.min(ta, tb);
    },
  };
}

const found = (out: readonly HeldAngle[], n: number) => out.slice(0, n);

describe('bush edges (M40)', () => {
  const BUSH: Bush = { x: 0, y: 0, z: -10, radius: 1.2, height: 1.6 };

  it('holds the edge of a tall bush in the open, where walls alone give nothing to hold', () => {
    const eye = vec3(0, EYE, 0);
    expect(findHeldAngles(noWalls, eye, EYE, 0, BOTS, angles(2))).toBe(0);
    const out = angles(2);
    const n = findHeldAngles(noWalls, eye, EYE, 0, BOTS, out, openFeatures([BUSH]), 0);
    expect(n).toBeGreaterThan(0);
    for (const a of found(out, n)) {
      // Just past the bush's side, at head height: where someone stepping out from behind it appears.
      const off = Math.hypot(a.point.x - BUSH.x, a.point.z - BUSH.z);
      expect(off).toBeGreaterThan(BUSH.radius * 0.8);
      expect(off).toBeLessThan(BUSH.radius + BOTS.anglePast + 0.5);
      expect(a.point.y).toBeCloseTo(EYE, 5);
      expect(a.side).not.toBe(0);
    }
  });

  it('ignores a bush too low to hide anyone, and one the holder stands in', () => {
    const eye = vec3(0, EYE, 0);
    const low: Bush = { ...BUSH, height: BOTS.angleBushMinHeight - 0.1 };
    expect(findHeldAngles(noWalls, eye, EYE, 0, BOTS, angles(2), openFeatures([low]), 0)).toBe(0);
    const around: Bush = { ...BUSH, z: 0, radius: 2 };
    expect(findHeldAngles(noWalls, eye, EYE, 0, BOTS, angles(2), openFeatures([around]), 0)).toBe(0);
  });
});

describe('tree gaps (M40)', () => {
  const A = post(-1.5, -10);
  const B = post(1.5, -10);

  it('holds the middle of a gap between two trunks, at head height', () => {
    const eye = vec3(0, EYE, 0);
    const middle = (out: HeldAngle[], n: number) => found(out, n).some((a) => Math.hypot(a.point.x, a.point.z + 10) < 0.05);
    const without = angles(4);
    expect(middle(without, findHeldAngles(trunks(A, B), eye, EYE, 0, BOTS, without))).toBe(false);
    const out = angles(4);
    const n = findHeldAngles(trunks(A, B), eye, EYE, 0, BOTS, out, openFeatures([], [A, B]), 0);
    expect(middle(out, n)).toBe(true);
    const gap = found(out, n).find((a) => Math.hypot(a.point.x, a.point.z + 10) < 0.05)!;
    expect(gap.point.y).toBeCloseTo(EYE, 5);
    expect(gap.side).toBe(0);
  });

  it('skips a gap seen edge-on, one too wide or too narrow to be a way through, and blocks too broad to be posts', () => {
    const eye = vec3(0, EYE, 0);
    const holdsMiddle = (a: CoverBlock, b: CoverBlock) => {
      const out = angles(4);
      const n = findHeldAngles(trunks(a, b), eye, EYE, 0, BOTS, out, openFeatures([], [a, b]), 0);
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      return found(out, n).some((h) => Math.hypot(h.point.x - mx, h.point.z - mz) < 0.05);
    };
    // Edge-on: the two trunks one behind the other along the line of sight (offset a little so both are in view).
    expect(holdsMiddle(post(3, -8), post(3.3, -11))).toBe(false);
    expect(holdsMiddle(post(-3, -10), post(3, -10))).toBe(false);
    expect(holdsMiddle(post(-0.5, -10), post(0.5, -10))).toBe(false);
    expect(holdsMiddle(post(-1.5, -10, 1), post(1.5, -10, 1))).toBe(false);
  });
});

describe('stair and ramp tops (M40)', () => {
  const topsOf = (f: AngleFeatures) => Array.from({ length: f.topCount }, (_, i) => vec3(f.tops[3 * i]!, f.tops[3 * i + 1]!, f.tops[3 * i + 2]!));

  it('finds the top of each Depot dock ramp and each Stack House stair, and none on Woodland\'s hills', () => {
    const depot = topsOf(featuresOf(DEPOT));
    const [west, east] = DEPOT_LAYOUT.dock.ramps;
    // The west ramp rises east to the dock's west end, the east ramp west to its east end.
    for (const x of [west![1], east![0]]) {
      const at = depot.filter((t) => Math.abs(t.x - x) < 0.3);
      expect(at.length, `ramp top at x ${x}`).toBeGreaterThan(0);
      for (const t of at) {
        expect(t.y).toBeCloseTo(DEPOT_LAYOUT.dockHeight, 1);
        expect(t.z).toBeLessThan(DEPOT_LAYOUT.dock.edgeZ);
      }
    }
    expect(depot.every((t) => Math.abs(t.y - DEPOT_LAYOUT.dockHeight) < 0.05)).toBe(true);
    // Stack House: two stairs up to the upper floor, 3 m up.
    const stack = topsOf(featuresOf(STACK_HOUSE));
    expect(stack).toHaveLength(2);
    for (const t of stack) expect(t.y).toBeCloseTo(3, 1);
    expect(topsOf(featuresOf(RAMP_YARD)).length).toBeGreaterThan(0);
    // A hillside is not a stair: the Knoll's slopes ease into a field that still slopes.
    expect(featuresOf(WOODLAND).topCount).toBe(0);
  });

  describe('on Depot\'s dock', () => {
    let physics: PhysicsWorld;
    beforeAll(async () => {
      await initPhysics();
      physics = new PhysicsWorld(DEPOT, BODY, 1 / 60);
    });

    /** On the dock 8 m east of the west ramp's top, looking west along it. */
    const FROM = { x: 6, z: -14 };
    const WEST = Math.PI / 2;

    it('holds the west ramp\'s top, where someone coming up appears head first', () => {
      const f = featuresOf(DEPOT);
      const top = topsOf(f).find((t) => Math.abs(t.x - DEPOT_LAYOUT.dock.ramps[0]![1]) < 0.3)!;
      const eye = vec3(FROM.x, DEPOT_LAYOUT.dockHeight + EYE, FROM.z);
      const atTop = (a: HeldAngle) => Math.hypot(a.point.x - top.x, a.point.z - top.z) < 0.6;
      const without = angles(2);
      expect(found(without, findHeldAngles(physics, eye, eye.y, WEST, BOTS, without)).some(atTop)).toBe(false);
      const out = angles(2);
      const n = findHeldAngles(physics, eye, eye.y, WEST, BOTS, out, f, DEPOT_LAYOUT.dockHeight);
      const held = found(out, n).find(atTop);
      expect(held).toBeDefined();
      expect(held!.point.y).toBeCloseTo(top.y + EYE, 3);
    });

    it('a holding Pro bot there aims at it (its world hands findHeldAngles the map\'s features)', () => {
      const { bots, state } = depotBots('elimination', physics, botConfig('pro'));
      const b = bots.bots[0]!;
      const me = b.character;
      me.position.x = FROM.x;
      me.position.y = DEPOT_LAYOUT.dockHeight;
      me.position.z = FROM.z;
      const w = bots.worldForTests;
      (w.enemyYaw as number[])[me.team] = WEST;
      b.holding = true;
      b.teamWait = 0;
      const eye = vec3();
      eyeOf(me, w.body, w.hits, eye);
      aimBot(b, w, undefined, eye, vec3(), false, createCommand(), 1 / 60);
      expect(b.heldAngleCount).toBeGreaterThan(0);
      const p = b.heldAngles[0]!.point;
      expect(Math.abs(p.x - DEPOT_LAYOUT.dock.ramps[0]![1])).toBeLessThan(0.3);
      expect(p.y).toBeCloseTo(DEPOT_LAYOUT.dockHeight + EYE, 1);
      expect(state.characters.length).toBeGreaterThan(0);
    });
  });
});

describe('held angles on Woodland (M40): bush edges and tree gaps along its lanes', () => {
  it('adds bush edges and tree gaps to the corners, each in plain view through no more leaf than foliageSeeThrough', { timeout: 30_000 }, async () => {
    await initPhysics();
    const physics = new PhysicsWorld(WOODLAND, BODY, 1 / 60);
    const f = featuresOf(WOODLAND);
    expect(f.bushes.length).toBeGreaterThanOrEqual(50);
    expect(f.postCount).toBeGreaterThanOrEqual(100);
    const nearBush = (p: Vec3) => f.bushes.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < b.radius + BOTS.anglePast + 0.3);
    const inGap = (p: Vec3) => {
      let n = 0;
      for (let i = 0; i < f.postCount; i++) if (Math.hypot(f.posts[3 * i]! - p.x, f.posts[3 * i + 1]! - p.z) < f.posts[3 * i + 2]! + BOTS.angleGapMax / 2 + 0.05) n++;
      return n >= 2;
    };
    const tally = { bushWithout: 0, bushWith: 0, gapWithout: 0, gapWith: 0 };
    const out = angles(2);
    for (const lane of WOODLAND.lanes) {
      const ends = [lane[0]!, lane[lane.length - 1]!] as const;
      for (const p of lane) {
        // Both ways along the lane: end 1 holding towards end 0 and end 0 towards end 1.
        for (const [a, b] of [ends, [ends[1], ends[0]]] as const) {
          const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
          const eye = vec3(p.x, p.y + eyeHeight(0, BODY), p.z);
          let n = findHeldAngles(physics, eye, eye.y, yaw, BOTS, out);
          for (const h of found(out, n)) {
            if (nearBush(h.point)) tally.bushWithout++;
            if (inGap(h.point)) tally.gapWithout++;
          }
          n = findHeldAngles(physics, eye, eye.y, yaw, BOTS, out, f, p.y);
          for (const h of found(out, n)) {
            if (nearBush(h.point)) tally.bushWith++;
            if (inGap(h.point)) tally.gapWith++;
            // In plain view: nothing solid in the way, and no more leaf than a bot sees through.
            const len = Math.hypot(h.point.x - eye.x, h.point.y - eye.y, h.point.z - eye.z);
            const dir = vec3((h.point.x - eye.x) / len, (h.point.y - eye.y) / len, (h.point.z - eye.z) / len);
            const wall = physics.raycastStatic(eye, dir, len);
            expect(wall < 0 || wall >= len - 0.05, 'in view').toBe(true);
            expect(foliageDepth(WOODLAND.foliage!, eye, h.point)).toBeLessThanOrEqual(BOTS.foliageSeeThrough + 1e-9);
          }
        }
      }
    }
    physics.dispose();
    // Measured 2026-10-04 over the 66 lane-point holds: bush edges 6 without (a wall's edge that happens to be by a
    // bush) and 32 with; tree gaps 4 and 8.
    expect(tally.bushWith, JSON.stringify(tally)).toBeGreaterThanOrEqual(tally.bushWithout + 15);
    expect(tally.gapWith, JSON.stringify(tally)).toBeGreaterThan(tally.gapWithout);
  });
});
