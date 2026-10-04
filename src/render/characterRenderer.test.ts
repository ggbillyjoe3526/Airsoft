import { describe, expect, it } from 'vitest';
import { FIGURE } from '../config/characters';
import * as THREE from 'three';
import { HITS } from '../config/hits';
import { createCharacter } from '../sim/character';
import { characterHitVolume, createHitVolume, type VerticalCapsule } from '../sim/hitbox';
import { leanOffset } from '../sim/lean';
import { vec3 } from '../sim/vec';
import { figureLeanRoll } from './characterModels';
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

describe('figureLeanRoll', () => {
  it('tilts the drawn upper body exactly as the simulation moves the head, whichever way the figure faces', () => {
    for (const yaw of [0, 0.9, -Math.PI / 2, 2.5]) {
      for (const lean of [1, -1, 0.4]) {
        for (const crouch of [0, 1]) {
          // The figure: turned by yaw, upper body pivoting at the (crouched) hips.
          const hip = FIGURE.hipHeight - crouch * FIGURE.crouchDrop;
          const root = new THREE.Object3D();
          root.rotation.y = yaw;
          const upper = new THREE.Object3D();
          upper.position.y = hip;
          upper.rotation.z = figureLeanRoll(lean, HITS);
          root.add(upper);
          root.updateMatrixWorld(true);
          const head = new THREE.Vector3(0, FIGURE.headHeight - FIGURE.hipHeight, 0).applyMatrix4(upper.matrixWorld);
          // The simulation's head (hit volume and eyes) for the same lean.
          const headHeight = HITS.headHeight - HITS.crouchDrop * crouch;
          const o = leanOffset(headHeight, lean, crouch, yaw, HITS, vec3());
          const where = `yaw ${yaw}, lean ${lean}, crouch ${crouch}`;
          expect(head.x, where).toBeCloseTo(o.x, 6);
          expect(head.y, where).toBeCloseTo(headHeight + o.y, 6);
          expect(head.z, where).toBeCloseTo(o.z, 6);
        }
      }
    }
  });
});

describe('a leaning figure and its hit volume', () => {
  /** Distance from a point to a vertical capsule's surface (negative inside). */
  const toCapsule = (p: THREE.Vector3, c: VerticalCapsule) => Math.hypot(p.x - c.x, p.y - Math.max(c.y0, Math.min(c.y1, p.y)), p.z - c.z) - c.r;

  it('keep the drawn torso inside the hit volume at any lean, so a BB on the visible body counts', () => {
    const volume = createHitVolume();
    const t = FIGURE.torso;
    for (const lean of [0, 0.5, 1, -1]) {
      for (const crouch of [0, 1]) {
        const c = createCharacter(0, vec3(), 0.7);
        c.lean = lean;
        c.crouchAmount = crouch;
        characterHitVolume(c, HITS, volume);
        const root = new THREE.Object3D();
        root.rotation.y = c.yaw;
        const upper = new THREE.Object3D();
        upper.position.y = FIGURE.hipHeight - crouch * FIGURE.crouchDrop;
        upper.rotation.z = figureLeanRoll(lean, HITS);
        root.add(upper);
        root.updateMatrixWorld(true);
        // Points down the middle of the torso and across the shoulders (in the upper body's own frame).
        for (const [x, y] of [[0, t.height * 0.5], [0, t.height], [t.width * 0.3, t.height * 0.85], [-t.width * 0.3, t.height * 0.85]] as const) {
          const p = new THREE.Vector3(x, t.bottom - FIGURE.hipHeight + y, 0).applyMatrix4(upper.matrixWorld);
          const inside = Math.min(toCapsule(p, volume.body), toCapsule(p, volume.shoulder), toCapsule(p, volume.head));
          expect(inside, `lean ${lean}, crouch ${crouch}, torso point (${x}, ${y})`).toBeLessThanOrEqual(0.02);
        }
      }
    }
  });
});
