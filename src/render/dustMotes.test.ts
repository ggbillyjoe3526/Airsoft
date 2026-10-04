import type * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DUST_MOTES } from '../config/render';
import { DustMotes, moteFade, motePosition } from './dustMotes';

describe('motePosition', () => {
  it('keeps every mote within half a box of the eye, wherever the eye goes and however far they drift', () => {
    const half = DUST_MOTES.box / 2;
    for (const eye of [0, 3.3, -40, 125.7]) {
      for (const base of [0, 1, 7, DUST_MOTES.box - 0.01]) {
        for (const moved of [0, 0.5, -3, 100]) {
          const p = motePosition(base, moved, eye, DUST_MOTES.box);
          expect(Math.abs(p - eye)).toBeLessThanOrEqual(half + 1e-9);
        }
      }
    }
  });

  it('moves a mote smoothly with its drift (no jump except when it wraps round the far side)', () => {
    const a = motePosition(3, 0.1, 0, DUST_MOTES.box);
    const b = motePosition(3, 0.2, 0, DUST_MOTES.box);
    expect(b - a).toBeCloseTo(0.1, 9);
  });
});

describe('moteFade', () => {
  const D = DUST_MOTES;

  it('hides motes right by the camera, so none turns into a blurry blob', () => {
    for (const d of [0, 0.3, 0.5, D.fadeNear]) expect(moteFade(d, d)).toBe(0);
    expect(moteFade(1, 1)).toBeLessThan(0.25); // a metre off: barely there
    expect(moteFade(D.fadeFar, D.fadeFar)).toBe(1);
    expect(moteFade(4, 4)).toBe(1);
  });

  it('grows steadily with distance, then fades again before the box edge so wrapping never pops', () => {
    let last = 0;
    for (let d = 0; d <= D.fadeFar; d += 0.05) {
      const a = moteFade(d, d);
      expect(a).toBeGreaterThanOrEqual(last);
      last = a;
    }
    expect(moteFade(D.box, D.box / 2)).toBe(0);
    expect(moteFade(D.box, D.box / 2 - D.edgeFade)).toBe(1);
  });

  it('caps a mote at a few pixels: even at the fade-in distance the world size would be bigger than the cap', () => {
    // At 1080 p a world-size point is size × 540 / distance pixels; the cap keeps it at maxPixels or under.
    expect((D.size * 540) / D.fadeFar).toBeGreaterThan(D.maxPixels);
    expect(D.maxPixels).toBeLessThanOrEqual(12);
  });
});

describe('DustMotes size cap', () => {
  // The soft dot's canvas is stood in for: nothing is drawn here.
  beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
  afterAll(() => vi.unstubAllGlobals());

  it('scales the cap with the pixel ratio, so a near mote is the same size on screen at any scaling (KNOWN_ISSUES)', () => {
    const motes = new DustMotes(DUST_MOTES.max);
    expect(motes.maxPointSize).toBe(DUST_MOTES.maxPixels);
    motes.setPixelRatio(2);
    expect(motes.maxPointSize).toBe(DUST_MOTES.maxPixels * 2);
    motes.setPixelRatio(0.8); // Low's render scale
    expect(motes.maxPointSize).toBeCloseTo(DUST_MOTES.maxPixels * 0.8, 9);
    // The shader reads the same value as a uniform, not a constant baked into its source.
    const shader = { uniforms: {} as Record<string, { value: number }>, vertexShader: '#include <logdepthbuf_vertex>', fragmentShader: '' };
    (motes.object.material as THREE.PointsMaterial).onBeforeCompile(shader as never, undefined as never);
    expect(shader.uniforms.moteMaxSize!.value).toBeCloseTo(DUST_MOTES.maxPixels * 0.8, 9);
    expect(shader.vertexShader).toContain('min(gl_PointSize, moteMaxSize)');
    motes.dispose();
  });
});

describe('DustMotes (M30)', () => {
  // The motes' sprite is drawn on a canvas; the test only reads positions, so a stand-in canvas will do.
  beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
  afterAll(() => vi.unstubAllGlobals());

  it("drift with the match's wind, so it can be read from the dust in the air", () => {
    const xs = (wind: { x: number; y: number; z: number }) => {
      const motes = new DustMotes(64);
      motes.setCount(64);
      const eye = { x: 0, y: 1.6, z: 0 };
      const read = () => Array.from(motes.object.geometry.getAttribute('position').array as Float32Array);
      motes.update(0, eye, wind); // place them
      const before = read();
      for (let i = 0; i < 30; i++) motes.update(1 / 60, eye, wind); // half a second
      const after = read();
      motes.dispose();
      // Mean movement along x (motes that wrapped round the box are left out).
      let sum = 0;
      let n = 0;
      for (let j = 0; j < before.length; j += 3) {
        const dx = after[j]! - before[j]!;
        if (Math.abs(dx) < DUST_MOTES.box / 2) {
          sum += dx;
          n++;
        }
      }
      return sum / n;
    };
    const calm = xs({ x: 0, y: 0, z: 0 });
    const breeze = xs({ x: 1.5, y: 0, z: 0 });
    // Half a second of a 1.5 m/s breeze carries the dust ~0.75 m further than calm air.
    expect(breeze - calm).toBeGreaterThan(0.6 * DUST_MOTES.windShare);
    expect(breeze - calm).toBeLessThan(0.9 * DUST_MOTES.windShare);
  });
});
