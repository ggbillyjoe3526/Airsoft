import { describe, expect, it } from 'vitest';
import { MOUSE } from '../config/controls';
import { cmPer360, sameSensitivityAs, sensitivityForCm, sensitivityFromTypedCm } from './sensitivity';

describe('sensitivity as cm/360 (M18)', () => {
  it('works out the mouse travel for a full turn from the DPI', () => {
    // 0.001 rad per count at 1.00: 6283 counts per turn, 7.85 inches at 800 DPI.
    expect(cmPer360(1, 800)).toBeCloseTo(19.95, 2);
    // Double the sensitivity or the DPI and the turn takes half the travel.
    expect(cmPer360(2, 800)).toBeCloseTo(cmPer360(1, 800) / 2, 9);
    expect(cmPer360(1, 1600)).toBeCloseTo(cmPer360(1, 800) / 2, 9);
  });

  it('turns a typed cm/360 back into the same sensitivity', () => {
    for (const dpi of [400, 800, 1600, 3200]) {
      for (const sens of [MOUSE.minSensitivity, 0.73, 1, 2.5, MOUSE.maxSensitivity]) {
        expect(sensitivityForCm(cmPer360(sens, dpi), dpi)).toBeCloseTo(sens, 9);
      }
    }
  });

  it('keeps a typed cm/360 exactly, so the box shows what was typed, within the slider\'s range (audit UI-24)', () => {
    // 36.4 cm at 800 DPI is about 0.548: rounded to the old 0.05 step it became 0.55 and the box read 36.3.
    for (const dpi of [400, 800, 1600]) {
      for (const cm of [7.7, 19.95, 33.3, 36.4, 61, 99.7]) {
        const v = sensitivityFromTypedCm(cm, dpi);
        if (v <= MOUSE.minSensitivity || v >= MOUSE.maxSensitivity) continue;
        expect(Math.abs(cmPer360(v, dpi) - cm)).toBeLessThan(0.05);
      }
    }
    expect(sensitivityFromTypedCm(1, 800)).toBe(MOUSE.maxSensitivity);
    expect(sensitivityFromTypedCm(500, 800)).toBe(MOUSE.minSensitivity);
    // The slider's finer step: 0.20 → 0.21 is a 5 % change, not 25 %.
    expect(MOUSE.sensitivityStep).toBeLessThanOrEqual(0.01);
  });

  it('gives the same feel in another shooter from its turn per count', () => {
    // CS2 turns 0.022° per count at 1.00; ours turns 0.0573° at 1.00, so CS2 needs about 2.60.
    expect(sameSensitivityAs(1, 0.022)).toBeCloseTo(2.604, 3);
    expect(sameSensitivityAs(2, 0.022)).toBeCloseTo(2 * sameSensitivityAs(1, 0.022), 9);
  });
});
