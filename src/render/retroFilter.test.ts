import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bayerThreshold, quantize, retroPixelAngle, retroTargetSize } from './retroFilter';
import { RetroFilter } from './retroFilterWebGL';

describe('retro pixel filter maths (M42)', () => {
  it('gives the width of one retro pixel as a tangent of the view, so BBs can be kept a couple of them wide', () => {
    // A 90° view 1000 px high spans 2 tangent units: a 4 px retro pixel is 4 / 500 of them.
    expect(retroPixelAngle(90, 1000, 4)).toBeCloseTo(0.008, 12);
    // Zoomed in (a narrower view), a pixel covers less of the world; a bigger pixel covers more.
    expect(retroPixelAngle(45, 1000, 4)).toBeLessThan(retroPixelAngle(90, 1000, 4));
    expect(retroPixelAngle(90, 1000, 8)).toBeCloseTo(2 * retroPixelAngle(90, 1000, 4), 12);
    expect(retroPixelAngle(90, 0, 4)).toBe(0);
  });

  it('sizes the low-resolution view a texel per retro pixel, rounding up so the page is covered', () => {
    expect(retroTargetSize(1920, 1080, 4)).toEqual({ width: 480, height: 270 });
    expect(retroTargetSize(1366, 768, 4)).toEqual({ width: 342, height: 192 }); // 341.5 up
    expect(retroTargetSize(1001, 1001, 8)).toEqual({ width: 126, height: 126 }); // 125.1 up
    expect(retroTargetSize(3, 1, 8)).toEqual({ width: 1, height: 1 });
    expect(retroTargetSize(0, 0, 4)).toEqual({ width: 1, height: 1 }); // never an empty target
  });

  it('gives each of the 16 Bayer cells its own threshold in (0, 1), repeating every 4 pixels', () => {
    const seen = new Set<number>();
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const t = bayerThreshold(x, y);
        expect(t).toBeGreaterThan(0);
        expect(t).toBeLessThan(1);
        seen.add(t);
        for (const k of [1, 2, 5]) {
          expect(bayerThreshold(x + 4 * k, y)).toBe(t);
          expect(bayerThreshold(x, y + 4 * k)).toBe(t);
        }
        expect(bayerThreshold(x - 4, y - 4)).toBe(t);
      }
    }
    expect(seen.size).toBe(16);
    // Evenly spaced: (i + 0.5) / 16 for i in 0..15.
    expect([...seen].sort((a, b) => a - b).map((t) => Math.round(t * 16 - 0.5))).toEqual([...Array(16).keys()]);
  });

  it('crushes a channel to exactly `levels` shades, from black to white', () => {
    for (const levels of [3, 4, 6, 8]) {
      const out = new Set<number>();
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          for (let i = 0; i <= 1000; i++) out.add(quantize(i / 1000, levels, bayerThreshold(x, y)));
        }
      }
      expect(out.size, `levels ${levels}`).toBe(levels);
      expect([...out].sort((a, b) => a - b)).toEqual(Array.from({ length: levels }, (_, k) => k / (levels - 1)));
    }
    expect(quantize(0, 6, 0.97)).toBe(0);
    expect(quantize(1, 6, 0.03)).toBe(1);
    expect(quantize(-0.5, 6, 0.5)).toBe(0); // clamped
    expect(quantize(2, 6, 0.5)).toBe(1);
  });

  it('dithers a flat colour between two levels so a 4×4 block averages back to it', () => {
    for (const levels of [3, 6, 8]) {
      const steps = levels - 1;
      for (let i = 0; i <= 40; i++) {
        const v = i / 40;
        let sum = 0;
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) sum += quantize(v, levels, bayerThreshold(x, y));
        // One cell of the block can differ by a step: the error is under a sixteenth of one.
        expect(Math.abs(sum / 16 - v), `levels ${levels} v ${v}`).toBeLessThanOrEqual(1 / steps / 16 + 1e-9);
      }
    }
    // A mid-way colour uses both neighbouring levels (a pattern), not one flat shade.
    const cells = new Set<number>();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) cells.add(quantize(0.5 / 5, 6, bayerThreshold(x, y)));
    expect(cells.size).toBe(2);
  });
});

describe('RetroFilter', () => {
  const look = { pixelSize: 4, levels: 6 };
  const uniforms = (f: RetroFilter) => (f as unknown as { material: THREE.ShaderMaterial }).material.uniforms;

  afterEach(() => vi.restoreAllMocks());

  it('starts with the look, nearest filtering and no smoothing on its target', () => {
    const f = new RetroFilter(look, true);
    expect(f.renderTarget.texture.magFilter).toBe(THREE.NearestFilter);
    expect(f.renderTarget.texture.minFilter).toBe(THREE.NearestFilter);
    expect(f.renderTarget.texture.type).toBe(THREE.HalfFloatType);
    expect(uniforms(f).uLevels!.value).toBe(6);
    expect(uniforms(f).uPixel!.value).toBe(4);
    f.dispose();
    expect(new RetroFilter(look, false).renderTarget.texture.type).toBe(THREE.UnsignedByteType);
  });

  it('resizes its target and the shader to the page: a texel per retro pixel, a retro pixel being pixelSize × ratio device pixels', () => {
    const f = new RetroFilter(look, true);
    f.resize(1366, 768, 2);
    expect([f.renderTarget.width, f.renderTarget.height]).toEqual([342, 192]);
    const size = uniforms(f).uViewSize!.value as THREE.Vector2;
    expect([size.x, size.y]).toEqual([342, 192]);
    expect(uniforms(f).uPixel!.value).toBe(8);
    // A new look takes effect with the next resize (the pixel size) and at once (the levels).
    f.setLook({ pixelSize: 8, levels: 3 });
    expect(uniforms(f).uLevels!.value).toBe(3);
    f.resize(1366, 768, 1);
    expect([f.renderTarget.width, f.renderTarget.height]).toEqual([171, 96]);
    expect(uniforms(f).uPixel!.value).toBe(8);
    f.dispose();
  });

  it('frees its target, material and geometry on dispose, once each', () => {
    const f = new RetroFilter(look, true);
    const inner = f as unknown as { material: THREE.ShaderMaterial; quad: THREE.Mesh };
    const target = vi.spyOn(f.renderTarget, 'dispose');
    const material = vi.spyOn(inner.material, 'dispose');
    const geometry = vi.spyOn(inner.quad.geometry, 'dispose');
    f.dispose();
    expect(target).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(geometry).toHaveBeenCalledTimes(1);
  });
});
