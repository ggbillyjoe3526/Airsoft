import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BB_VISUALS } from '../config/render';
import { createBBPool, spawnBB } from '../sim/ballistics';
import { vec3 } from '../sim/vec';
import { BBRenderer } from './bbRenderer';

const DT = 1 / 60;
const eye = { x: 0.3, y: 1.6, z: 0.1 };

/** BBs near and far, flying level, with a tick's path behind them (so a streak shows). */
function scene(): { r: BBRenderer; positions: THREE.Vector3[] } {
  const pool = createBBPool(4);
  const r = new BBRenderer(pool, DT);
  const positions: THREE.Vector3[] = [];
  for (const [x, y, z] of [
    [0.5, 1.2, -1.5],
    [-3, 2.4, -30],
    [10, 0.7, -80],
  ] as const) {
    const bb = spawnBB(pool, 1, vec3(x, y, z), vec3(0.2, 0.05, -1), 88, 0, 0.25e-3);
    bb.prevPosition.x = x - 0.3;
    bb.prevPosition.y = y - 0.02;
    bb.prevPosition.z = z + 1.4;
    bb.age = 1;
    positions.push(new THREE.Vector3(x, y, z));
  }
  return { r, positions };
}

const matrixAt = (mesh: THREE.InstancedMesh, i: number): THREE.Matrix4 => new THREE.Matrix4().fromArray(mesh.instanceMatrix.array as Float32Array, i * 16);

describe('BBRenderer writes the matrices Three would (M77 acceptance 3, REN-10)', () => {
  // The glow's soft dot draws on a canvas: a stub whose 2D context is missing leaves the texture blank.
  beforeEach(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
  afterEach(() => vi.unstubAllGlobals());

  it('a ball is compose(position, identity, (s, s, s)) for every drawn BB', () => {
    const { r, positions } = scene();
    r.update(1, eye);
    const balls = r.object.children[0] as THREE.InstancedMesh;
    expect(balls.count).toBe(3);
    const scales = [0, 1, 2].map((i) => new THREE.Vector3().setFromMatrixScale(matrixAt(balls, i)).x);
    expect(scales[2]!).toBeGreaterThan(scales[0]!); // the far one grew, so scale and position are both exercised
    for (let i = 0; i < 3; i++) {
      const s = scales[i]!;
      const want = new THREE.Matrix4().compose(positions[i]!, new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      const got = matrixAt(balls, i).elements;
      want.elements.forEach((v, k) => expect(got[k]!, `ball ${i} element ${k}`).toBeCloseTo(v, 4));
    }
    r.dispose();
  });

  it('a glow dot is makeRotationFromQuaternion(facing) scaled by s with the position set', () => {
    const { r, positions } = scene();
    r.setGlow(true);
    const facing = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -1.1, 0.2));
    r.update(1, eye, facing);
    const balls = r.object.children[0] as THREE.InstancedMesh;
    const glow = r.object.children[2] as THREE.InstancedMesh;
    expect(glow.count).toBe(3);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Vector3().setFromMatrixScale(matrixAt(balls, i)).x;
      const want = new THREE.Matrix4().compose(positions[i]!, facing, new THREE.Vector3(s, s, s));
      const got = matrixAt(glow, i).elements;
      want.elements.forEach((v, k) => expect(got[k]!, `glow ${i} element ${k}`).toBeCloseTo(v, 4));
      expect(got[3]).toBe(0);
      expect(got[7]).toBe(0);
      expect(got[11]).toBe(0);
      expect(got[15]).toBe(1);
    }
    r.dispose();
  });

  it('keeps writing right matrices over frames and slot reuse (a ball left a stale rotation in none)', () => {
    const { r } = scene();
    r.setGlow(true);
    r.update(1, eye, new THREE.Quaternion().setFromEuler(new THREE.Euler(1, 2, 3)));
    r.setGlow(false);
    r.update(1, eye);
    const balls = r.object.children[0] as THREE.InstancedMesh;
    const m = matrixAt(balls, 0).elements;
    for (const k of [1, 2, 3, 4, 6, 7, 8, 9, 11]) expect(m[k], `element ${k}`).toBe(0);
    r.dispose();
  });

  it('the streak quad matches the cross-product formula it replaced, at several eye positions', () => {
    const half = Math.max(BB_VISUALS.trailAngularWidth, 0) / 2;
    for (const e of [eye, { x: 0, y: 1.6, z: 5 }, { x: -20, y: 30, z: -10 }]) {
      const { r } = scene();
      r.update(1, e);
      const pos = ((r.object.children[1] as THREE.Mesh).geometry.getAttribute('position') as THREE.BufferAttribute).array;
      for (let i = 0; i < 3; i++) {
        const c = (k: number): THREE.Vector3 => new THREE.Vector3(pos[i * 12 + k * 3]!, pos[i * 12 + k * 3 + 1]!, pos[i * 12 + k * 3 + 2]!);
        const head = c(0).add(c(1)).multiplyScalar(0.5);
        const tail = c(2).add(c(3)).multiplyScalar(0.5);
        // The old code, verbatim in Three vectors.
        const along = new THREE.Vector3().subVectors(head, tail);
        const toEye = new THREE.Vector3(e.x - head.x, e.y - head.y, e.z - head.z);
        const side = new THREE.Vector3().crossVectors(along, toEye);
        const len = side.length();
        if (len > 1e-9) side.multiplyScalar(1 / len);
        else side.set(0, 0, 0);
        const headHalf = Math.hypot(head.x - e.x, head.y - e.y, head.z - e.z) * half;
        const tailHalf = Math.hypot(tail.x - e.x, tail.y - e.y, tail.z - e.z) * half;
        const want = [
          head.clone().addScaledVector(side, headHalf),
          head.clone().addScaledVector(side, -headHalf),
          tail.clone().addScaledVector(side, tailHalf),
          tail.clone().addScaledVector(side, -tailHalf),
        ];
        want.forEach((w, k) => expect(c(k).distanceTo(w), `eye ${e.x},${e.y},${e.z} streak ${i} corner ${k}`).toBeLessThan(2e-4 * Math.max(1, headHalf)));
        expect(headHalf).toBeGreaterThan(0);
      }
      r.dispose();
    }
  });

  it('draws an end-on streak as a line (no side), not NaN', () => {
    const pool = createBBPool(1);
    const r = new BBRenderer(pool, DT);
    const bb = spawnBB(pool, 1, vec3(0, 1.6, -10), vec3(0, 0, -1), 88, 0, 0.25e-3);
    bb.prevPosition.z = -8.6;
    bb.age = 1;
    r.update(1, { x: 0, y: 1.6, z: 0 });
    const pos = ((r.object.children[1] as THREE.Mesh).geometry.getAttribute('position') as THREE.BufferAttribute).array;
    for (let k = 0; k < 12; k++) expect(Number.isFinite(pos[k]!), `float ${k}`).toBe(true);
    expect(pos[0]).toBe(pos[3]);
    r.dispose();
  });
});
