import { describe, expect, it } from 'vitest';
import { lerpAngle } from './vec';

describe('lerpAngle', () => {
  it('interpolates the short way round, across the ±π seam', () => {
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5, 9);
    // From just under +π to just over -π is a small step, not a spin the long way round.
    const a = Math.PI - 0.1;
    const b = -Math.PI + 0.1;
    expect(lerpAngle(a, b, 0.5)).toBeCloseTo(Math.PI, 9);
    expect(Math.abs(lerpAngle(a, b, 1) - a)).toBeCloseTo(0.2, 9);
  });
});
