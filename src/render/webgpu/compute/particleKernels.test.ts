import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DRESSING } from '../../../config/dressing';
import { DUST_MOTES, GAS_PUFFS, IMPACT_GRIT, IMPACT_PUFFS } from '../../../config/render';
import { buildTerrain } from '../../../map/terrain';
import { DustMotes } from '../../dustMotes';
import { Fireflies } from '../../fireflies';
import { ImpactGrit } from '../../impactGrit';
import { ImpactPuffs } from '../../impactPuffs';
import { SmokePlumes } from '../../smokePlumes';
import { numberOps as o } from './kernelOps';
import { fireflyKernel, gritScale, gritStep, moteKernel, plumeKernel, puffKernel } from './particleKernels';

/**
 * The compute passes' kernels (W5) against the CPU modules they stand in for: each module runs its own loop (no `gpu`
 * driver hung on it), and the kernel, evaluated on numbers, gives the same place, size and alpha for every particle.
 * The GPU runs the same formula in float32 (kernelOps.ts tslOps): one expression, so the two can't drift apart.
 */

const v3 = (a: ArrayLike<number>, k: number): { x: number; y: number; z: number } => ({ x: a[k]!, y: a[k + 1]!, z: a[k + 2]! });

// The soft dot's canvas: no 2D context here (the sprite isn't drawn).
beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
afterAll(() => vi.unstubAllGlobals());

describe('moteKernel', () => {
  for (const hangs of [false, true]) {
    it(`places and fades every mote as DustMotes.update does${hangs ? ' (a map dust that hangs low)' : ''}`, () => {
      const motes = new DustMotes(DUST_MOTES.max);
      motes.setCount(DUST_MOTES.max);
      if (hangs) motes.setMapDust(0x8899aa);
      const eye = { x: 3.2, y: 1.7, z: -14.5 };
      const wind = { x: 1.5, y: 0, z: -0.8 };
      for (let f = 0; f < 40; f++) motes.update(1 / 60, eye, wind);
      const pos = motes.object.geometry.getAttribute('position').array;
      const col = motes.object.geometry.getAttribute('color').array;
      for (let i = 0; i < DUST_MOTES.max; i++) {
        const d = moteKernel(o, v3(motes.base, i * 3), motes.phase[i]!, motes.time, motes.drift, eye, hangs ? 1 : 0);
        // The module keeps its positions in float32: equal to that rounding.
        expect(d.x).toBeCloseTo(pos[i * 3]!, 5);
        expect(d.y).toBeCloseTo(pos[i * 3 + 1]!, 5);
        expect(d.z).toBeCloseTo(pos[i * 3 + 2]!, 5);
        expect(d.w).toBeCloseTo(col[i * 4 + 3]!, 5);
      }
    });
  }
});

describe('fireflyKernel', () => {
  const terrain = buildTerrain(-20, -20, 1, 40, 40, (x, z) => 0.05 * x + 0.02 * z);
  const bounds = new THREE.Box3(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 2, 20));

  it('moves and pulses every fly as Fireflies.update does', () => {
    const flies = new Fireflies(60, terrain, [{ x: 2, z: 3, radius: 1.2 }] as never, bounds);
    for (let f = 0; f < 50; f++) flies.update(1 / 30);
    const pos = flies.object.geometry.getAttribute('position').array;
    const alpha = flies.object.geometry.getAttribute('flyAlpha').array;
    for (let i = 0; i < 60; i++) {
      const d = fireflyKernel(o, v3(flies.base, i * 3), v3(flies.drift, i * 3), flies.rate[i]!, flies.phase[i]!, flies.time, 0);
      expect(d.x).toBeCloseTo(pos[i * 3]!, 5);
      expect(d.y).toBeCloseTo(pos[i * 3 + 1]!, 5);
      expect(d.z).toBeCloseTo(pos[i * 3 + 2]!, 5);
      expect(d.w).toBeCloseTo(alpha[i]!, 6);
    }
  });

  it('stands every fly at home at full glow under Reduced motion, as setMotion(false) does', () => {
    const flies = new Fireflies(20, terrain, [], bounds);
    for (let f = 0; f < 10; f++) flies.update(1 / 30);
    flies.setMotion(false);
    const pos = flies.object.geometry.getAttribute('position').array;
    for (let i = 0; i < 20; i++) {
      const d = fireflyKernel(o, v3(flies.base, i * 3), v3(flies.drift, i * 3), flies.rate[i]!, flies.phase[i]!, flies.time, 1);
      expect([d.x, d.y, d.z]).toEqual([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
      expect(d.w).toBe(1);
    }
  });
});

describe('plumeKernel', () => {
  it('places, sizes and fades every puff of every plume as SmokePlumes.update does', () => {
    const sources = [
      { x: 10, y: 6, z: -4, radius: 0.4 },
      { x: -30, y: 12, z: 22, radius: 0.6 },
    ];
    const plumes = new SmokePlumes(sources, DRESSING.smoke);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 2, 0);
    camera.lookAt(5, 5, -5);
    for (let f = 0; f < 90; f++) plumes.update(1 / 60, camera, { x: 1.2, z: -0.6 });
    const M = plumes.M;
    const matrix = new THREE.Matrix4();
    const at = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const alpha = plumes.object.geometry.getAttribute('puffAlpha').array;
    let n = 0;
    for (const src of sources) {
      for (let i = 0; i < M.puffs; i++, n++) {
        const d = plumeKernel(o, M, src, src.radius, v3(plumes.jitter, n * 3), i / M.puffs, plumes.time, plumes.wind);
        plumes.object.getMatrixAt(n, matrix);
        matrix.decompose(at, q, s);
        expect(d.x).toBeCloseTo(at.x, 4);
        expect(d.y).toBeCloseTo(at.y, 4);
        expect(d.z).toBeCloseTo(at.z, 4);
        expect(d.w).toBeCloseTo(s.x, 4);
        expect(d.alpha).toBeCloseTo(alpha[n]!, 5);
      }
    }
  });
});

describe('puffKernel', () => {
  for (const cfg of [IMPACT_PUFFS, GAS_PUFFS]) {
    it(`places and sizes every live puff as ImpactPuffs.update does (${cfg === GAS_PUFFS ? 'gas' : 'impact'} puffs)`, () => {
      const puffs = new ImpactPuffs(cfg);
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(1, 1.6, 4);
      puffs.spawn({ x: 0, y: 1, z: 0 }, undefined, 1.3, { x: 0.5, y: 0.2, z: -0.4 });
      puffs.update(0.05, camera);
      puffs.spawn({ x: 3, y: 0.5, z: -6 }, undefined, 0.8);
      for (let f = 0; f < 6; f++) puffs.update(1 / 60, camera);
      const matrix = new THREE.Matrix4();
      const at = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      const live = puffs.puffs.filter((p) => p.age < cfg.lifetime);
      expect(puffs.object.count).toBe(live.length);
      live.forEach((p, k) => {
        const d = puffKernel(o, cfg, p, { x: p.vx, y: p.vy, z: p.vz }, p.scale, p.age, camera.position);
        puffs.object.getMatrixAt(k, matrix);
        matrix.decompose(at, q, s);
        expect(d.x).toBeCloseTo(at.x, 6);
        expect(d.y).toBeCloseTo(at.y, 6);
        expect(d.z).toBeCloseTo(at.z, 6);
        expect(d.w).toBeCloseTo(s.x, 6);
      });
    });
  }

  it('sizes a puff past its life at nothing (the pass keeps a dead slot undrawn)', () => {
    const P = IMPACT_PUFFS;
    expect(puffKernel(o, P, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1, P.lifetime + 0.01, { x: 5, y: 0, z: 0 }).w).toBe(0);
  });
});

describe('gritStep and gritScale', () => {
  it('moves, spins and sizes every chip as ImpactGrit.update does, frame by frame', () => {
    const grit = new ImpactGrit();
    grit.setEnabled(true);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 3);
    grit.spawn({ x: 0, y: 1, z: 0 }, new THREE.Color(0.5, 0.4, 0.3), { x: 0, y: 1.5, z: 4 });
    const thrown = grit.chips.filter((c) => c.age === 0).map((c) => ({ chip: { position: { x: c.x, y: c.y, z: c.z }, velocity: { x: c.vx, y: c.vy, z: c.vz }, roll: c.roll }, spin: c.spin, size: c.size, live: c }));
    expect(thrown.length).toBeGreaterThan(0);
    const dts = [1 / 60, 1 / 30, 1 / 60, 0.02];
    let age = 0;
    for (const dt of dts) {
      grit.update(dt, camera);
      age += dt;
      for (const t of thrown) t.chip = gritStep(o, t.chip, t.spin, dt);
    }
    for (const t of thrown) {
      expect(t.chip.position.x).toBeCloseTo(t.live.x, 9);
      expect(t.chip.position.y).toBeCloseTo(t.live.y, 9);
      expect(t.chip.position.z).toBeCloseTo(t.live.z, 9);
      expect(t.chip.velocity.y).toBeCloseTo(t.live.vy, 9);
      expect(t.chip.roll).toBeCloseTo(t.live.roll, 9);
      const eye = camera.position;
      const fade = 1 - Math.max(0, t.live.age / IMPACT_GRIT.lifetime) ** 2;
      const cpu = Math.max(t.size, Math.hypot(t.live.x - eye.x, t.live.y - eye.y, t.live.z - eye.z) * IMPACT_GRIT.minAngularSize) * fade;
      expect(gritScale(o, t.chip.position, t.size, age, eye)).toBeCloseTo(cpu, 9);
    }
  });
});
