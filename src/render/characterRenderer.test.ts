import { describe, expect, it } from 'vitest';
import { FIGURE } from '../config/characters';
import { flinchEnvelope } from './characterRenderer';

describe('flinchEnvelope', () => {
  const F = FIGURE.flinch;
  it('snaps to full strength quickly, then eases back to nothing', () => {
    expect(flinchEnvelope(0)).toBe(0);
    expect(flinchEnvelope(F.rise)).toBeCloseTo(1, 9);
    expect(flinchEnvelope((F.rise + F.time) / 2)).toBeGreaterThan(0);
    expect(flinchEnvelope((F.rise + F.time) / 2)).toBeLessThan(1);
    expect(flinchEnvelope(F.time)).toBe(0);
    expect(flinchEnvelope(10)).toBe(0);
  });
});
