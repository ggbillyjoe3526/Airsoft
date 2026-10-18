import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LEAF_FLECKS } from '../../config/render';
import { vec3 } from '../../sim/vec';
import { LeafFlecks } from './leafFlecks';

/** Dev 6 item 44, acceptance 6: the pooled leaves knocked out of a bush. */
const L = LEAF_FLECKS;
const camera = new THREE.PerspectiveCamera();
camera.position.set(0, 1.6, 5);
camera.updateMatrixWorld();
const at = vec3(0, 1.2, 0);
const from = vec3(0, 1.2, 5);

describe('LeafFlecks', () => {
  it('is one instanced mesh pooled at LEAF_FLECKS.max, empty until leaves are knocked out', () => {
    const f = new LeafFlecks();
    expect(f.object.instanceMatrix.count).toBe(L.max);
    expect(f.live).toBe(0);
    expect(f.object.count).toBe(0);
    f.dispose();
  });

  it('knocks out a count within the range it is given, for a stop and for a brush', () => {
    for (const range of [L.perStop, L.perBrush]) {
      for (let i = 0; i < 20; i++) {
        const f = new LeafFlecks();
        for (let k = 0; k < i; k++) f.spawn(at, from, range);
        f.update(0, camera);
        // A fresh pool per round, so `live` is the sum of i spawns, each within range.
        expect(f.live).toBeGreaterThanOrEqual(Math.min(L.max, i * range[0]));
        expect(f.live).toBeLessThanOrEqual(Math.min(L.max, i * range[1]));
        f.dispose();
      }
    }
  });

  it('does nothing when idle: no leaves, no change after an update', () => {
    const f = new LeafFlecks();
    f.update(0.1, camera);
    expect(f.live).toBe(0);
    expect(f.object.count).toBe(0);
    f.dispose();
  });

  it('lets the leaves fall and fade, then none are left once their lifetime has passed', () => {
    const f = new LeafFlecks();
    f.spawn(at, from, L.perStop);
    f.update(0, camera);
    const n = f.live;
    expect(n).toBeGreaterThanOrEqual(L.perStop[0]);
    f.update(L.lifetime / 2, camera);
    expect(f.live).toBe(n);
    f.update(L.lifetime / 2 + 0.01, camera);
    f.update(0.01, camera); // the frame after their last (fully faded) one
    expect(f.live).toBe(0);
    expect(f.object.count).toBe(0);
    f.dispose();
  });

  it('never grows past its pool, reusing the oldest leaves', () => {
    const f = new LeafFlecks();
    for (let i = 0; i < 100; i++) f.spawn(at, from, L.perStop);
    f.update(0.01, camera);
    expect(f.live).toBe(L.max);
    expect(f.object.count).toBe(L.max);
    f.dispose();
  });

  it('throws them out towards the shooter, up from where the BB went in', () => {
    const f = new LeafFlecks();
    f.spawn(at, from, [6, 6]);
    f.update(0.2, camera);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let meanZ = 0;
    for (let i = 0; i < f.object.count; i++) {
      f.object.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
      meanZ += p.z;
    }
    expect(meanZ / f.object.count).toBeGreaterThan(at.z);
    f.dispose();
  });

  it('holds every leaf of a full-auto burst into a bush for its whole life (BP5: cut short mid-air at 48)', () => {
    const f = new LeafFlecks();
    const rate = 13; // the fastest replica's shots a second
    const dt = 1 / 60;
    let next = 0;
    let shown = 0;
    for (let t = 0; t < 3; t += dt) {
      if (t >= next) {
        f.spawn(at, from, [L.perStop[1], L.perStop[1]]);
        next += 1 / rate;
        shown += L.perStop[1];
      }
      f.update(dt, camera);
    }
    // In the air: every leaf of the last lifetime's shots, none dropped early.
    expect(f.live).toBeGreaterThanOrEqual(Math.floor(L.lifetime * rate) * L.perStop[1]);
    expect(shown).toBeGreaterThan(L.max);
    f.dispose();
  });

  it('comes to rest on the ground under the bush, and lies still there (BP5: they fell on through it)', () => {
    const f = new LeafFlecks();
    const low = vec3(0, 0.6, 0);
    f.spawn(low, from, [6, 6], 0.25);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const lowest = (): number => {
      let y = Infinity;
      for (let i = 0; i < f.object.count; i++) {
        f.object.getMatrixAt(i, m);
        y = Math.min(y, p.setFromMatrixPosition(m).y);
      }
      return y;
    };
    for (let i = 0; i < 50; i++) f.update(1 / 60, camera);
    expect(lowest()).toBeCloseTo(0.25, 6);
    const down: THREE.Vector3[] = [];
    for (let i = 0; i < f.object.count; i++) {
      f.object.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      if (Math.abs(p.y - 0.25) < 1e-9) down[i] = p.clone();
    }
    for (let i = 0; i < 5; i++) f.update(1 / 60, camera);
    expect(f.object.count).toBe(6);
    expect(lowest()).toBeGreaterThanOrEqual(0.25 - 1e-9);
    down.forEach((was, i) => {
      f.object.getMatrixAt(i, m);
      expect(p.setFromMatrixPosition(m).distanceTo(was), `leaf ${i} lies still`).toBeLessThan(1e-9);
    });
    f.dispose();
  });
});
