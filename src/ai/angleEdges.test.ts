import { describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import type { Bush } from '../map/foliage';
import type { MapData } from '../map/mapTypes';
import { buildNavGrid } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import { OPEN_NAV } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { angleFeaturesOf } from './angleFeatures';
import { createHeldAngle, findHeldAngles } from './angles';
import type { CoverBlock } from './cover';
import { boxQuery, noWalls } from './testSupport';

/**
 * M40's thresholds at their edges (config/bots.ts angle*): a bush just under angleBushMinHeight, a gap just under
 * angleGapMin or just over angleGapMax, a block that is not square, a fall just under angleLevelRise. Each case beside its
 * neighbour on the other side of the line, so a threshold moved or a comparison flipped fails one of the pair.
 */

const EYE = BODY.standEyeHeight;
const angles = (n: number) => Array.from({ length: n }, createHeldAngle);
const post = (x: number, z: number, halfX = 0.25, halfZ = halfX): CoverBlock => ({ x, z, halfX, halfZ });

describe('bush height', () => {
  const bush = (height: number): Bush => ({ x: 0, y: 0, z: -10, radius: 1.2, height });
  const kept = (height: number) => angleFeaturesOf(OPEN_NAV, [], [bush(height)], BOTS).bushes.length;

  it('a bush of angleBushMinHeight counts as a wall, one a hair under does not', () => {
    expect(kept(BOTS.angleBushMinHeight - 0.01)).toBe(0);
    expect(kept(BOTS.angleBushMinHeight)).toBe(1);
    expect(kept(BOTS.angleBushMinHeight + 1)).toBe(1);
  });

  it('in the ray fan, a bush just under the height gives no held angle and one at it does', () => {
    const eye = vec3(0, EYE, 0);
    const held = (height: number) => findHeldAngles(noWalls, eye, EYE, 0, BOTS, angles(2), angleFeaturesOf(OPEN_NAV, [], [bush(height)], BOTS), 0);
    expect(held(BOTS.angleBushMinHeight - 0.01)).toBe(0);
    expect(held(BOTS.angleBushMinHeight)).toBeGreaterThan(0);
  });
});

describe('what counts as a post', () => {
  const count = (b: CoverBlock) => angleFeaturesOf(OPEN_NAV, [b], [], BOTS).postCount;

  it('a square or round block up to anglePostMaxHalf is a post; one a hair over is a wall', () => {
    expect(count(post(0, 0, BOTS.anglePostMaxHalf))).toBe(1);
    expect(count(post(0, 0, BOTS.anglePostMaxHalf + 0.01))).toBe(0);
  });

  it('a long thin block (a wall\'s stub by a door) is no post; one about as deep as wide is', () => {
    const long = 0.5;
    expect(count(post(0, 0, long, long * BOTS.anglePostSquareness - 0.01))).toBe(0);
    expect(count(post(0, 0, long * BOTS.anglePostSquareness - 0.01, long))).toBe(0);
    expect(count(post(0, 0, long, long * BOTS.anglePostSquareness + 0.01))).toBe(1);
    expect(count(post(0, 0, 0.1, 0.5))).toBe(0);
  });

  it('a gap between two thin stubs gets no held angle where one between two posts does', () => {
    const eye = vec3(0, EYE, 0);
    const middleHeld = (a: CoverBlock, b: CoverBlock) => {
      const q = both(a, b);
      const out = angles(4);
      const n = findHeldAngles(q, eye, EYE, 0, BOTS, out, angleFeaturesOf(OPEN_NAV, [a, b], [], BOTS), 0);
      return out.slice(0, n).some((h) => Math.hypot(h.point.x, h.point.z + 10) < 0.05);
    };
    expect(middleHeld(post(-1.5, -10), post(1.5, -10))).toBe(true);
    // The same centres, but each a stub along the line of sight (0.25 wide, 1.5 deep).
    expect(middleHeld(post(-1.5, -10, 0.1, 0.5), post(1.5, -10, 0.1, 0.5))).toBe(false);
  });
});

function both(a: CoverBlock, b: CoverBlock): WorldQuery {
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

describe('gap width between two posts', () => {
  const HALF = 0.25;
  /** True if the middle of the gap, `gap` metres between the posts' faces, is held from the origin. */
  function holdsGap(gap: number): boolean {
    const x = (gap + 2 * HALF) / 2;
    const a = post(-x, -10, HALF);
    const b = post(x, -10, HALF);
    const out = angles(4);
    const n = findHeldAngles(both(a, b), vec3(0, EYE, 0), EYE, 0, BOTS, out, angleFeaturesOf(OPEN_NAV, [a, b], [], BOTS), 0);
    return out.slice(0, n).some((h) => Math.hypot(h.point.x, h.point.z + 10) < 0.05);
  }

  it('holds a gap of angleGapMin and of angleGapMax, not one a hair under or over', () => {
    expect(holdsGap(BOTS.angleGapMin - 0.01)).toBe(false);
    expect(holdsGap(BOTS.angleGapMin + 0.01)).toBe(true);
    expect(holdsGap(BOTS.angleGapMax - 0.01)).toBe(true);
    expect(holdsGap(BOTS.angleGapMax + 0.01)).toBe(false);
  });
});

describe('the fall that makes a stair or ramp top', () => {
  /**
   * A floor with a platform `rise` high across the east half, reached by one ramp 2 m long (so its slope is steeper than
   * angleRampSlope for every rise tried) running up to the east.
   */
  function rampMap(rise: number): MapData {
    return {
      name: `Ramp ${rise}`,
      blocks: [
        { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(40, 0.5, 16) },
        { kind: 'floor', center: vec3(6, rise / 2, 0), size: vec3(12, rise, 16) },
        { kind: 'ramp', center: vec3(-1, rise / 2, 0), size: vec3(2, rise, 3), rise: '+x' },
      ],
      killY: -10,
      spawns: [[], []],
      deadZones: [[], []],
      lanes: [],
    };
  }
  const topsFor = (rise: number) => angleFeaturesOf(buildNavGrid(rampMap(rise), NAV), [], [], BOTS);

  it('a ramp that rises angleLevelRise has a top at its upper end; one a hair lower has none', () => {
    const under = topsFor(BOTS.angleLevelRise - 0.01);
    const at = topsFor(BOTS.angleLevelRise + 0.01);
    expect(under.topCount).toBe(0);
    expect(at.topCount).toBeGreaterThan(0);
    for (let i = 0; i < at.topCount; i++) {
      expect(at.tops[3 * i + 1]!).toBeCloseTo(BOTS.angleLevelRise + 0.01, 1);
      expect(Math.abs(at.tops[3 * i]!)).toBeLessThan(1.5);
    }
  });

  it('a gentle ramp (under angleRampSlope) of the same rise has no top', () => {
    const rise = BOTS.angleLevelRise + 0.5;
    const run = (rise / BOTS.angleRampSlope) * 1.5;
    const map = rampMap(rise);
    const gentle: MapData = {
      ...map,
      blocks: map.blocks.map((b) => (b.kind === 'ramp' ? { ...b, center: vec3(-run / 2, b.center.y, 0), size: vec3(run, rise, 3) } : b)),
    };
    expect(angleFeaturesOf(buildNavGrid(gentle, NAV), [], [], BOTS).topCount).toBe(0);
    expect(topsFor(rise).topCount).toBeGreaterThan(0);
  });
});
