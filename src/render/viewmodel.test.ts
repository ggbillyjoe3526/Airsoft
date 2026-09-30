import { describe, expect, it } from 'vitest';
import { VIEWMODEL } from '../config/render';
import { magazineOut } from './viewmodel';

describe('magazineOut', () => {
  const R = VIEWMODEL.reload;

  it('starts seated, is fully out mid-reload and is seated again before the reload ends', () => {
    expect(magazineOut(0)).toBe(0);
    expect(magazineOut(R.magOutEnd)).toBe(1);
    expect(magazineOut((R.magOutEnd + R.magInStart) / 2)).toBe(1);
    expect(magazineOut(R.magSeated)).toBe(0);
    expect(magazineOut(1)).toBe(0);
  });

  it('moves smoothly: no jumps between consecutive frames of a reload', () => {
    let prev = magazineOut(0);
    for (let p = 0.01; p <= 1; p += 0.01) {
      const v = magazineOut(p);
      expect(Math.abs(v - prev)).toBeLessThan(0.1);
      prev = v;
    }
  });
});
