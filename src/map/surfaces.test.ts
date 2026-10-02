import { describe, expect, it } from 'vitest';
import { vec3 } from '../sim/vec';
import type { MapBlock, RampRise } from './mapTypes';
import { RAMP_FACES, rampCorners, surfaceHeightAt } from './surfaces';

/** A 4 m long, 2 m wide ramp from y = 0 up to y = 1, centred at (10, 0.5, -3). */
function ramp(rise: RampRise): MapBlock {
  const alongX = rise === '+x' || rise === '-x';
  return { kind: 'ramp', center: vec3(10, 0.5, -3), size: alongX ? vec3(4, 1, 2) : vec3(2, 1, 4), rise };
}

describe('surfaceHeightAt', () => {
  it('is a floor block’s top anywhere over it, edges included, and nothing beyond', () => {
    const floor: MapBlock = { kind: 'floor', center: vec3(0, 0.75, 0), size: vec3(4, 0.5, 2) };
    expect(surfaceHeightAt(floor, 0, 0)).toBe(1);
    expect(surfaceHeightAt(floor, 2, -1)).toBe(1);
    expect(surfaceHeightAt(floor, 2.01, 0)).toBeUndefined();
    expect(surfaceHeightAt(floor, 0, 1.01)).toBeUndefined();
  });

  it('is undefined on anything that isn’t a floor or a ramp', () => {
    const crate: MapBlock = { kind: 'crate', center: vec3(0, 0.6, 0), size: vec3(1.2, 1.2, 1.2) };
    expect(surfaceHeightAt(crate, 0, 0)).toBeUndefined();
  });

  it('rises along a ramp from its bottom at the low edge to its top at the high edge, whichever way it faces', () => {
    const cases: [RampRise, number, number][] = [
      ['+x', 1, 0],
      ['-x', -1, 0],
      ['+z', 0, 1],
      ['-z', 0, -1],
    ];
    for (const [rise, ux, uz] of cases) {
      const b = ramp(rise);
      const at = (t: number): number | undefined => surfaceHeightAt(b, 10 + ux * 2 * t, -3 + uz * 2 * t);
      expect(at(-1), `${rise} low edge`).toBeCloseTo(0, 9);
      expect(at(0), `${rise} centre`).toBeCloseTo(0.5, 9);
      expect(at(0.5), `${rise} three quarters up`).toBeCloseTo(0.75, 9);
      expect(at(1), `${rise} high edge`).toBeCloseTo(1, 9);
      expect(at(1.01), `${rise} past the high edge`).toBeUndefined();
      // Level across the ramp.
      expect(surfaceHeightAt(b, 10 + uz * 0.9, -3 + ux * 0.9), `${rise} across`).toBeCloseTo(0.5, 9);
    }
  });

  it('refuses a ramp without a rise', () => {
    const b: MapBlock = { kind: 'ramp', center: vec3(0, 0.5, 0), size: vec3(4, 1, 2) };
    expect(() => surfaceHeightAt(b, 0, 0)).toThrow();
  });
});

describe('rampCorners', () => {
  it('builds a closed wedge whose faces point outward and whose slope is the walkable surface', () => {
    for (const rise of ['+x', '-x', '+z', '-z'] as const) {
      const b = ramp(rise);
      const p = new Float32Array(18);
      rampCorners(b, p);
      const corner = (k: number) => vec3(p[k * 3]!, p[k * 3 + 1]!, p[k * 3 + 2]!);
      // The wedge's centroid is inside it; every face's normal points away from it.
      const mid = vec3();
      for (let k = 0; k < 6; k++) {
        mid.x += p[k * 3]! / 6;
        mid.y += p[k * 3 + 1]! / 6;
        mid.z += p[k * 3 + 2]! / 6;
      }
      let area = 0;
      for (const face of RAMP_FACES) {
        const a = corner(face[0]!);
        const b1 = corner(face[1]!);
        const c = corner(face[2]!);
        const e1 = vec3(b1.x - a.x, b1.y - a.y, b1.z - a.z);
        const e2 = vec3(c.x - a.x, c.y - a.y, c.z - a.z);
        const n = vec3(e1.y * e2.z - e1.z * e2.y, e1.z * e2.x - e1.x * e2.z, e1.x * e2.y - e1.y * e2.x);
        expect(n.x * (a.x - mid.x) + n.y * (a.y - mid.y) + n.z * (a.z - mid.z), `${rise} face ${face}`).toBeGreaterThan(0);
        area += Math.hypot(n.x, n.y, n.z);
      }
      expect(area).toBeGreaterThan(0);
      // The slope's corners (0, 1, 4, 5) lie on the surface surfaceHeightAt reports.
      for (const k of [0, 1, 4, 5]) {
        const q = corner(k);
        expect(b.center.y + q.y, `${rise} corner ${k}`).toBeCloseTo(surfaceHeightAt(b, b.center.x + q.x, b.center.z + q.z)!, 6);
      }
    }
  });
});
