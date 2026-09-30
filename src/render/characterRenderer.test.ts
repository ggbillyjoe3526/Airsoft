import { describe, expect, it } from 'vitest';
import { FIGURE } from '../config/characters';
import * as THREE from 'three';
import { flinchEnvelope, flinchLean } from './characterRenderer';

describe('flinchEnvelope', () => {
  const F = FIGURE.flinch;
  it('snaps to full strength quickly, then eases back to nothing', () => {
    expect(flinchEnvelope(0)).toBe(0);
    expect(flinchEnvelope(F.rise)).toBeCloseTo(1, 9);
    expect(flinchEnvelope((F.rise + F.time) / 2)).toBeGreaterThan(0);
    expect(flinchEnvelope((F.rise + F.time) / 2)).toBeLessThan(1);
    expect(flinchEnvelope(F.time)).toBe(0);
    expect(flinchEnvelope(10)).toBe(0);
  });
});

describe('flinchLean', () => {
  /** Where the top of the upper body ends up in world space after the lean (figure turned by `yaw`). */
  function topOfBody(dirX: number, dirZ: number, yaw: number): THREE.Vector3 {
    const lean = flinchLean(dirX, dirZ, yaw, 0.3, { x: 0, z: 0 });
    const upper = new THREE.Object3D();
    upper.rotation.set(lean.x, 0, lean.z);
    const root = new THREE.Object3D();
    root.rotation.y = yaw;
    root.add(upper);
    root.updateMatrixWorld(true);
    return new THREE.Vector3(0, 1, 0).applyMatrix4(upper.matrixWorld);
  }

  it('pushes the body the way the BB was flying, whichever way the figure faces', () => {
    for (const yaw of [0, 0.7, Math.PI / 2, -2.4, Math.PI]) {
      for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [0.6, -0.8]] as const) {
        const top = topOfBody(dx, dz, yaw);
        const pushed = top.x * dx + top.z * dz;
        expect(pushed, `yaw ${yaw}, BB (${dx}, ${dz})`).toBeGreaterThan(0.25);
        // Nothing sideways to the BB's path.
        expect(Math.abs(top.x * -dz + top.z * dx)).toBeLessThan(0.05);
      }
    }
  });
});
