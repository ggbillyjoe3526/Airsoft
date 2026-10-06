import { describe, expect, it } from 'vitest';
import { QUALITY, QUALITY_PRESETS, SURFACES } from '../config/render';
import { WEATHERING } from '../config/weathering';
import { DEPOT } from '../map/depot';
import { texturesFor } from './mapMeshes';
import { drawLibraryTexels, isLibraryDrawing, LIBRARY_DRAWINGS } from './textureLibrary';

/**
 * The texture library (G6): grey precast panels, grey rubble in wire (never sand, never brick), worn paint on steel;
 * pure texel drawings, the same at every Texture detail size.
 */

/** Mean sRGB colour (0..1) and how far it strays from grey (the largest channel less the smallest). */
function stats(px: Uint8ClampedArray): { r: number; g: number; b: number; spread: number; min: number; max: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let min = 255;
  let max = 0;
  const n = px.length / 4;
  for (let i = 0; i < px.length; i += 4) {
    r += px[i]!;
    g += px[i + 1]!;
    b += px[i + 2]!;
    const l = (px[i]! + px[i + 1]! + px[i + 2]!) / 3;
    min = Math.min(min, l);
    max = Math.max(max, l);
  }
  r /= n * 255;
  g /= n * 255;
  b /= n * 255;
  return { r, g, b, spread: Math.max(r, g, b) - Math.min(r, g, b), min, max };
}

describe('the texture library (G6)', () => {
  it('draws the same texels every time, opaque, at the size asked', () => {
    for (const id of LIBRARY_DRAWINGS) {
      const a = drawLibraryTexels(id, 64);
      expect(a.length, id).toBe(64 * 64 * 4);
      expect(Array.from(drawLibraryTexels(id, 64))).toEqual(Array.from(a));
      for (let i = 3; i < a.length; i += 4) if (a[i] !== 255) throw new Error(`${id}: texel ${i / 4} is not opaque`);
    }
  });

  it('follows Texture detail: each preset’s size, Low still 256', () => {
    expect(QUALITY.low.textureSize).toBe(256);
    for (const p of QUALITY_PRESETS) expect(drawLibraryTexels('blockWall', QUALITY[p].textureSize).length, p).toBe(QUALITY[p].textureSize ** 2 * 4);
  });

  it('is the same picture at any size (a smaller one is the larger one, coarser)', () => {
    const small = stats(drawLibraryTexels('blockWall', 128));
    const large = stats(drawLibraryTexels('blockWall', 256));
    expect(Math.abs(small.r - large.r)).toBeLessThan(0.02);
    expect(Math.abs(small.b - large.b)).toBeLessThan(0.02);
  });

  it('paints the precast walls and the gabions grey, never sand or brick, and with something to see', () => {
    for (const id of ['blockWall', 'gabion'] as const) {
      const s = stats(drawLibraryTexels(id, 128));
      // Grey: no channel far from the others (sand and brick lean red-yellow by 0.15 and more).
      expect(s.spread, id).toBeLessThan(0.06);
      expect(s.r - s.b, id).toBeLessThan(0.06);
      // Detail: joints, tie holes, stones and wire.
      expect(s.max - s.min, id).toBeGreaterThan(60);
    }
    // The gabion's rubble is darker than the precast panels (stones and their shadows between).
    expect(stats(drawLibraryTexels('gabion', 128)).g).toBeLessThan(stats(drawLibraryTexels('blockWall', 128)).g);
    // No sand left anywhere in the gabion's look.
    expect(Object.keys(SURFACES.siteProps.gabion)).not.toContain('sand');
  });

  it('wears each drawing as config/weathering.ts says (more wear, darker)', () => {
    expect(WEATHERING.textures.paint.chips).toBeGreaterThan(0);
    const s = stats(drawLibraryTexels('paint', 128));
    // Near-white paint, chipped and scratched: bright overall, with dark marks.
    expect(s.g).toBeGreaterThan(0.6);
    expect(s.min).toBeLessThan(s.max - 60);
  });

  it('names its surfaces as map surfaces; Depot asks for none but the core set (paint waits for the set dressing)', () => {
    for (const id of LIBRARY_DRAWINGS) expect(isLibraryDrawing(id)).toBe(true);
    expect(isLibraryDrawing('concrete')).toBe(false);
    expect(texturesFor(DEPOT)).not.toContain('paint');
    expect(texturesFor(DEPOT)).toContain('blockWall');
  });
});
