import { describe, expect, it } from 'vitest';
import { createRng, rngNext } from './rng';

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(rngNext(a)).toBe(rngNext(b));
  });

  it('differs between seeds', () => {
    expect(rngNext(createRng(1))).not.toBe(rngNext(createRng(2)));
  });

  it('returns values in [0, 1) with a sensible mean', () => {
    const r = createRng(7);
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const u = rngNext(r);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      sum += u;
    }
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.02);
  });

  it('can resume from a snapshot of its state', () => {
    const r = createRng(5);
    rngNext(r);
    const snapshot = { ...r };
    const next = rngNext(r);
    expect(rngNext(snapshot)).toBe(next);
  });
});
