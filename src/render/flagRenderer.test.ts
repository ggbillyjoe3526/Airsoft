import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLAG_VISUALS as F } from '../config/render';
import { clothRipple, FlagRenderer } from './flagRenderer';

describe('clothRipple (flag asset group)', () => {
  const out = { z: 0, slope: 0 };

  it('at power 1 is the plain cloth’s wave, growing straight from the pole to the free edge', () => {
    for (const [x, t] of [
      [0.2, 0.3],
      [0.9, 1.7],
      [F.clothWidth, 4.2],
    ] as const) {
      const phase = x * F.waveNumber - t * F.waveSpeed;
      const share = x / F.clothWidth;
      clothRipple(x, t, 1, out);
      expect(out.z).toBeCloseTo(F.waveAmplitude * Math.sin(phase) * share);
      expect(out.slope).toBeCloseTo(F.waveAmplitude * (share * F.waveNumber * Math.cos(phase) + Math.sin(phase) / F.clothWidth));
    }
  });

  it('above power 1 is damped near the pole, the same at the free edge, and still at the pole', () => {
    const t = 0.37;
    const x = F.clothWidth * 0.2;
    expect(Math.abs(clothRipple(x, t, 1.6, out).z)).toBeLessThan(Math.abs(clothRipple(x, t, 1, { z: 0, slope: 0 }).z));
    expect(clothRipple(F.clothWidth, t, 1.6, out).z).toBeCloseTo(clothRipple(F.clothWidth, t, 1, { z: 0, slope: 0 }).z);
    expect(clothRipple(0, t, 1.6, out).z).toBeCloseTo(0);
    expect(Number.isFinite(out.slope)).toBe(true);
  });

  it('matches its own slope (a finite difference of z)', () => {
    const h = 1e-5;
    const a = clothRipple(0.6, 1.1, 1.6, { z: 0, slope: 0 }).z;
    const b = clothRipple(0.6 + h, 1.1, 1.6, { z: 0, slope: 0 }).z;
    expect(clothRipple(0.6, 1.1, 1.6, out).slope).toBeCloseTo((b - a) / h, 4);
  });
});

describe('FlagRenderer.setDetail', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('swaps in the finial, rope and cleat and the finer painted cloth with map detail, and back', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const flag = new FlagRenderer([0x2f6fd6, 0xf07a22], 2);
    flag.object.visible = true;
    const meshes = (): THREE.Mesh[] => {
      const list: THREE.Mesh[] = [];
      flag.object.traverseVisible((o) => {
        if (o instanceof THREE.Mesh) list.push(o);
      });
      return list;
    };
    const plain = meshes().length;
    flag.setDetail(true);
    const detailed = meshes();
    expect(detailed.length).toBe(plain + 3);
    const cloth = detailed.find((m) => m.material instanceof THREE.MeshStandardMaterial && m.material.map !== null);
    expect(cloth).toBeDefined();
    expect(cloth!.geometry.getAttribute('position').count).toBeGreaterThan((F.clothSegments + 1) * 2);
    flag.setDetail(false);
    expect(meshes().length).toBe(plain);
    flag.dispose();
  });
});
