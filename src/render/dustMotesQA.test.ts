import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DRESSING } from '../config/dressing';
import { DUST_MOTES } from '../config/render';
import { DustMotes, moteHeightFade } from './dustMotes';

/** QA for G8's map-tinted dust motes: the tint, the height fade, Reduced motion and putting the default back. */

const still = { x: 0, y: 0, z: 0 };
const alphas = (m: DustMotes): number[] => Array.from(m.object.geometry.getAttribute('color').array).filter((_, i) => i % 4 === 3);
const colour = (m: DustMotes): THREE.Color => (m.object.material as THREE.PointsMaterial).color;

describe('G8 QA: map dust motes', () => {
  beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
  afterAll(() => vi.unstubAllGlobals());

  it('moteHeightFade is 1 up to `full`, 0 from `none`, and falls evenly between', () => {
    const M = DRESSING.motes;
    expect(moteHeightFade(-5)).toBe(1);
    expect(moteHeightFade(M.full)).toBe(1);
    expect(moteHeightFade(M.none)).toBe(0);
    expect(moteHeightFade(M.none + 10)).toBe(0);
    expect(moteHeightFade((M.full + M.none) / 2)).toBeCloseTo(0.5, 6);
  });

  it('a map tint recolours the motes and null puts the default colour and the default alphas back', () => {
    const plain = new DustMotes(50);
    plain.setCount(50);
    const m = new DustMotes(50);
    m.setCount(50);
    plain.update(0.1, still, still);
    m.update(0.1, still, still);
    const before = alphas(m);
    m.setMapDust(0xd8d6cf);
    expect(colour(m).getHex()).not.toBe(colour(plain).getHex());
    m.update(0, still, still);
    expect(alphas(m).some((a, i) => a < before[i]! - 1e-6)).toBe(true);
    m.setMapDust(null);
    expect(colour(m).getHex()).toBe(colour(plain).getHex());
    expect(colour(plain).getHex()).toBe(new THREE.Color(DUST_MOTES.color).getHex());
    m.update(0, still, still);
    expect(alphas(m)).toEqual(before);
    plain.dispose();
    m.dispose();
  });

  it('the height fade never raises a mote (alpha only ever falls) and stays within 0..1', () => {
    const a = new DustMotes(80);
    const b = new DustMotes(80);
    for (const m of [a, b]) m.setCount(80);
    b.setMapDust(0xd8d6cf);
    for (let i = 0; i < 5; i++) {
      a.update(0.2, { x: 1, y: 2, z: 3 }, still);
      b.update(0.2, { x: 1, y: 2, z: 3 }, still);
    }
    const [pa, pb] = [alphas(a), alphas(b)];
    pb.forEach((v, i) => {
      expect(v).toBeLessThanOrEqual(pa[i]! + 1e-9);
      expect(v).toBeGreaterThanOrEqual(0);
    });
    a.dispose();
    b.dispose();
  });

  it('Reduced motion on keeps them hidden whatever the map tint does, and off shows them again', () => {
    const m = new DustMotes(30);
    m.setCount(30);
    m.setMotion(false);
    m.setMapDust(0xd8d6cf);
    expect(m.object.visible).toBe(false);
    m.setMapDust(null);
    expect(m.object.visible).toBe(false);
    m.setMotion(true);
    expect(m.object.visible).toBe(true);
    m.dispose();
  });
});
