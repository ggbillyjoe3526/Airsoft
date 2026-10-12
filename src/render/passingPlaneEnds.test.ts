import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PLANE } from '../config/dressing';
import { ATMOSPHERE } from '../config/renderLighting';
import { PassingPlane } from './passingPlane';

/** BP3b QA: the passing plane grows in and shrinks away at the ends of its line, and its line stays in the sky dome. */

const EVERY = 20;
const CROSSING = PLANE.path / PLANE.speed;

/** Steps a plane to absolute time `at` (it only takes deltas) and reads its pose off the matrix. */
function reader(p: PassingPlane) {
  let now = 0;
  return (at: number) => {
    p.update(at - now);
    now = at;
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    p.object.matrix.decompose(pos, new THREE.Quaternion(), scale);
    return { pos, scale: scale.x, visible: p.object.visible };
  };
}

describe('the plane scales in and out over the ends share of its path', () => {
  it('the share is a small positive fraction of the crossing, so it is not the whole path', () => {
    expect(PLANE.ends).toBeGreaterThan(0);
    expect(PLANE.ends).toBeLessThan(0.5);
  });

  it('is tiny at the start, grows to full size, and shrinks again at the end (no pop)', () => {
    const at = reader(new PassingPlane({ x: 0, z: 0 }, 60, EVERY, false));
    const start = at(CROSSING * 0.001);
    expect(start.visible).toBe(true);
    expect(start.scale).toBeLessThan(0.05);
    expect(at(CROSSING * PLANE.ends * 0.5).scale).toBeCloseTo(0.5, 6);
    expect(at(CROSSING * PLANE.ends).scale).toBeCloseTo(1, 6);
    expect(at(CROSSING * 0.5).scale).toBe(1);
    expect(at(CROSSING * (1 - PLANE.ends * 0.5)).scale).toBeCloseTo(0.5, 6);
    expect(at(CROSSING * 0.999).scale).toBeLessThan(0.05);
  });
});

describe('the plane line stays inside the sky dome', () => {
  it('both ends of every pass lie within skyRadius * dome of the field middle, at any height and middle', () => {
    const reach = ATMOSPHERE.skyRadius * PLANE.dome;
    for (const [cx, cz, height] of [[0, 0, 60], [0, 0, 130], [25, -40, 120], [-60, 30, 100]] as const) {
      const at = reader(new PassingPlane({ x: cx, z: cz }, height, EVERY, true));
      for (let pass = 0; pass < 40; pass++) {
        for (const t of [0.0005, 0.9995]) {
          const { pos } = at(pass * EVERY + CROSSING * t);
          const far = Math.hypot(pos.x - cx, pos.y, pos.z - cz);
          expect(far, `pass ${pass} at ${t} (height ${height}, middle ${cx},${cz})`).toBeLessThanOrEqual(reach + 0.5);
        }
      }
    }
  });
});
