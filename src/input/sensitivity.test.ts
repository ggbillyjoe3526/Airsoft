import { describe, expect, it } from 'vitest';
import { MOUSE } from '../config/controls';
import { cmPer360, sameSensitivityAs, sensitivityForCm } from './sensitivity';

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

  it('gives the same feel in another shooter from its turn per count', () => {
    // CS2 turns 0.022° per count at 1.00; ours turns 0.0573° at 1.00, so CS2 needs about 2.60.
    expect(sameSensitivityAs(1, 0.022)).toBeCloseTo(2.604, 3);
    expect(sameSensitivityAs(2, 0.022)).toBeCloseTo(2 * sameSensitivityAs(1, 0.022), 9);
  });
});
