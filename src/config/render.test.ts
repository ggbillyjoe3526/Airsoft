import { describe, expect, it } from 'vitest';
import { DEFAULT_QUALITY, parseQuality, QUALITY } from './render';

describe('render quality presets', () => {
  it('defaults to high, which keeps the look the game had before presets existed', () => {
    expect(DEFAULT_QUALITY).toBe('high');
    expect(QUALITY.high).toEqual({ maxPixelRatio: 1.5, antialias: true, shadows: true, shadowMapSize: 2048 });
  });

  it('gets cheaper from high to low', () => {
    expect(QUALITY.medium.maxPixelRatio).toBeLessThanOrEqual(QUALITY.high.maxPixelRatio);
    expect(QUALITY.medium.shadowMapSize).toBeLessThan(QUALITY.high.shadowMapSize);
    expect(QUALITY.low).toMatchObject({ maxPixelRatio: 1, antialias: false, shadows: false });
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
});
