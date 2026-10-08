import { describe, expect, it } from 'vitest';
import { createRng, rngNext } from '../sim/rng';
import { measureSeam, percentileOf, SEAM_LIMITS, SEAM_WINDOW, seamFailures, type SeamReport } from './loopSeamSupport';

const LENGTH = 16 * SEAM_WINDOW;

/** A soft noise bed that closes on itself: seeded noise through a one-pole filter run twice round, so its end leads into its start. */
function closedBed(seed: number): Float32Array {
  const rng = createRng(seed);
  const white = new Float32Array(LENGTH).map(() => 2 * rngNext(rng) - 1);
  const out = new Float32Array(LENGTH);
  let y = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < LENGTH; i++) {
      y = 0.9 * y + 0.1 * white[i]!;
      out[i] = y;
    }
  }
  const peak = out.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  return out.map((x) => x / peak);
}

/** The same bed with a sawtooth riding on it: a slow climb of half the sample range (1 of -1..1) that falls back at the wrap, a click there and nowhere else. */
function clickingBed(seed: number): Float32Array {
  return closedBed(seed).map((x, i) => x + i / LENGTH);
}

describe('measureSeam and seamFailures', () => {
  it('passes a bed that closes on itself, whichever seed it is', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const report = measureSeam(closedBed(seed));
      expect(seamFailures(report), `seed ${seed}`).toEqual([]);
    }
  });

  it('fails a bed with a deliberate click at the wrap: the jump and the bend are past every step inside it', () => {
    const report = measureSeam(clickingBed(1));
    expect(report.jump).toBeGreaterThan(0.9);
    expect(report.jumpPercentile).toBe(100);
    expect(report.curvePercentile).toBe(100);
    const failures = seamFailures(report);
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain('jumps');
    expect(failures[1]).toContain('bends');
  });

  it('fails a bed whose wrap jump is only within its biggest step (the old bound a click in noise passes)', () => {
    // Loud noise has big interior steps, so a jump under the biggest one still sits in the top of its own distribution.
    const rng = createRng(9);
    const loud = new Float32Array(LENGTH).map(() => 2 * rngNext(rng) - 1);
    loud[0] = 1;
    loud[LENGTH - 1] = -0.99;
    let biggest = 0;
    for (let i = 1; i < LENGTH; i++) biggest = Math.max(biggest, Math.abs(loud[i]! - loud[i - 1]!));
    const report = measureSeam(loud);
    expect(report.jump).toBeLessThan(biggest);
    expect(report.jumpPercentile).toBeGreaterThan(SEAM_LIMITS.difference);
    expect(seamFailures(report).some((f) => f.includes('jumps'))).toBe(true);
  });

  it('judges each measure against its own limit, and says which', () => {
    const fine: SeamReport = { jump: 0.1, jumpPercentile: 50, curve: 0.1, curvePercentile: 50, spectral: 5, spectralPercentile: 50 };
    expect(seamFailures(fine)).toEqual([]);
    expect(seamFailures({ ...fine, jumpPercentile: SEAM_LIMITS.difference })).toEqual([]);
    expect(seamFailures({ ...fine, jumpPercentile: SEAM_LIMITS.difference + 0.1 })).toHaveLength(1);
    expect(seamFailures({ ...fine, curvePercentile: SEAM_LIMITS.difference + 0.1 })[0]).toContain('bends');
    expect(seamFailures({ ...fine, spectralPercentile: SEAM_LIMITS.spectral })).toEqual([]);
    expect(seamFailures({ ...fine, spectralPercentile: SEAM_LIMITS.spectral + 0.5 })[0]).toContain('spectrum');
  });

  it('reads a tail that sounds like the head as a small spectral distance, and a different one as a big one', () => {
    const same = closedBed(3);
    const other = same.slice();
    // Last window: a loud tone at a quarter of the sample rate instead of the soft bed.
    for (let i = LENGTH - SEAM_WINDOW; i < LENGTH; i++) other[i] = 0.8 * Math.sin((Math.PI / 2) * i);
    expect(measureSeam(other).spectral).toBeGreaterThan(3 * measureSeam(same).spectral);
  });

  it('refuses a loop too short to measure, and counts percentiles as the share no bigger', () => {
    expect(() => measureSeam(new Float32Array(100))).toThrow(/too short/);
    expect(percentileOf([1, 2, 3, 4], 2)).toBe(50);
    expect(percentileOf([1, 2, 3, 4], 0)).toBe(0);
    expect(percentileOf([1, 2, 3, 4], 4)).toBe(100);
  });
});
