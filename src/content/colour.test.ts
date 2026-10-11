import { describe, expect, it } from 'vitest';
import { colourDistance, deltaE00, labOf } from './colour';

/** The skin checks' colour difference (CT4): CIEDE2000 against Sharma, Wu and Dalal's published test pairs. */
describe('CIEDE2000', () => {
  it.each([
    [{ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ L: 50, a: 0, b: 0 }, { L: 50, a: -1, b: 2 }, 2.3669],
    [{ L: 50, a: 2.49, b: -0.001 }, { L: 50, a: -2.49, b: 0.0011 }, 7.2195],
    [{ L: 50, a: 2.5, b: 0 }, { L: 73, a: 25, b: -18 }, 27.1492],
    [{ L: 60.2574, a: -34.0099, b: 36.2677 }, { L: 60.4626, a: -34.1751, b: 39.4387 }, 1.2644],
    [{ L: 2.0776, a: 0.0795, b: -1.135 }, { L: 0.9033, a: -0.0636, b: -0.5514 }, 0.9082],
  ])('matches the published pair %#', (p, q, want) => {
    expect(deltaE00(p, q)).toBeCloseTo(want, 3);
    expect(deltaE00(q, p)).toBeCloseTo(want, 3);
  });

  it('reads sRGB hex as L*a*b* (D65): white, mid grey, black', () => {
    expect(labOf(0xffffff).L).toBeCloseTo(100, 2);
    expect(Math.abs(labOf(0xffffff).a) + Math.abs(labOf(0xffffff).b)).toBeLessThan(0.01);
    expect(labOf(0x808080).L).toBeCloseTo(53.585, 2);
    expect(labOf(0x000000).L).toBe(0);
    expect(colourDistance(0x2f6fd6, 0x2f6fd6)).toBe(0);
    expect(colourDistance(0x000000, 0xffffff)).toBeCloseTo(100, 0);
  });
});
