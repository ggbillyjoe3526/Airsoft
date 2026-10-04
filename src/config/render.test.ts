import { describe, expect, it } from 'vitest';
import { DEFAULT_QUALITY, DUST_MOTES, parseQuality, QUALITY, QUALITY_CHOICES, SOFTWARE_RENDERING_QUALITY, startingQuality, SURFACES } from './render';

describe('render quality presets', () => {
  it('defaults to high, the full look', () => {
    expect(DEFAULT_QUALITY).toBe('high');
    expect(QUALITY.high).toMatchObject({ maxPixelRatio: 1.5, antialias: true, shadows: true, shadowMapSize: 2048, surfaceRelief: true, replicaSheen: true });
  });

  it('gets cheaper at every step from high to low, in everything the art pass added (M14)', () => {
    const order = QUALITY_CHOICES.map((c) => QUALITY[c.id]); // cheapest first
    for (let i = 1; i < order.length; i++) {
      const [cheaper, dearer] = [order[i - 1]!, order[i]!];
      expect(cheaper.maxPixelRatio).toBeLessThanOrEqual(dearer.maxPixelRatio);
      expect(cheaper.shadowMapSize).toBeLessThanOrEqual(dearer.shadowMapSize);
      expect(cheaper.shadowRadius).toBeLessThanOrEqual(dearer.shadowRadius);
      expect(cheaper.dustMotes).toBeLessThan(dearer.dustMotes);
      expect(Number(cheaper.shadows) + Number(cheaper.surfaceRelief) + Number(cheaper.replicaSheen) + Number(cheaper.antialias)).toBeLessThanOrEqual(
        Number(dearer.shadows) + Number(dearer.surfaceRelief) + Number(dearer.replicaSheen) + Number(dearer.antialias),
      );
    }
    // Low is noticeably cheaper: no shadow pass, no antialiasing, no relief, dust or sheen, one pixel per CSS pixel.
    expect(QUALITY.low).toMatchObject({ maxPixelRatio: 1, antialias: false, shadows: false, surfaceRelief: false, dustMotes: 0, replicaSheen: false });
  });

  it('keeps the surface textures within a small GPU budget', () => {
    const size = SURFACES.textureSize;
    expect(Math.log2(size) % 1).toBe(0); // a power of two, for mipmaps
    const textures = Object.keys(SURFACES.worldSize).length;
    // RGBA with mipmaps (a third more): under 12 MB for the lot, on any preset.
    expect((textures * size * size * 4 * 4) / 3 / 2 ** 20).toBeLessThan(12);
  });

  it('never draws more dust motes than a small budget', () => {
    expect(Math.max(...Object.values(QUALITY).map((q) => q.dustMotes))).toBeLessThanOrEqual(256);
    expect(DUST_MOTES.box).toBeGreaterThan(0);
  });

  it('reads ?quality= values and rejects anything else', () => {
    expect(parseQuality('low')).toBe('low');
    expect(parseQuality('medium')).toBe('medium');
    expect(parseQuality('high')).toBe('high');
    expect(parseQuality(null)).toBeNull();
    expect(parseQuality('')).toBeNull();
    expect(parseQuality('ultra')).toBeNull();
    expect(parseQuality('toString')).toBeNull(); // not fooled by inherited object keys
  });

  it('starts a browser drawing in software on Low, unless a preset was asked for or saved (audit M-02)', () => {
    expect(SOFTWARE_RENDERING_QUALITY).toBe('low');
    expect(startingQuality(null, null, false)).toEqual({ preset: DEFAULT_QUALITY, automatic: false });
    expect(startingQuality(null, null, true)).toEqual({ preset: 'low', automatic: true });
    // A saved pick is the player's: kept even in software.
    expect(startingQuality(null, 'high', true)).toEqual({ preset: 'high', automatic: false });
    expect(startingQuality(null, 'medium', false)).toEqual({ preset: 'medium', automatic: false });
    // ?quality= wins over both.
    expect(startingQuality('high', 'low', true)).toEqual({ preset: 'high', automatic: false });
    expect(startingQuality('medium', null, true)).toEqual({ preset: 'medium', automatic: false });
  });
});
