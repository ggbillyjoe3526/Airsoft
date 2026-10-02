import { describe, expect, it } from 'vitest';
import { botSeed, deriveSeed, MAX_SEED, parseSeed, planSeed, randomSeed } from './seed';

/** seed × multiplier + add mod 2^32, computed exactly. */
const exact = (seed: number, multiplier: number, add: number): number => Number((BigInt(seed) * BigInt(multiplier) + BigInt(add)) % 2n ** 32n);

describe('seeds', () => {
  it('read a ?seed= value only if it is a whole number from 0 to 2^32 - 1', () => {
    expect(parseSeed('42')).toBe(42);
    expect(parseSeed('0')).toBe(0);
    expect(parseSeed(String(MAX_SEED))).toBe(MAX_SEED);
    for (const bad of [null, '', 'abc', '-1', '1.5', '1e3', ' 7', String(MAX_SEED + 1), '99999999999']) expect(parseSeed(bad)).toBeUndefined();
  });

  it('pick fresh random seeds in range', () => {
    const seeds = Array.from({ length: 20 }, randomSeed);
    for (const s of seeds) expect(Number.isInteger(s) && s >= 0 && s <= MAX_SEED).toBe(true);
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('derive streams with exact 32-bit arithmetic, so large seeds keep every bit', () => {
    for (const seed of [0, 4, 11, 123456789, 2 ** 31, MAX_SEED - 1, MAX_SEED]) {
      expect(deriveSeed(seed, 15485863, 12345)).toBe(exact(seed, 15485863, 12345));
      expect(planSeed(seed)).toBe(exact(seed, 15485863, 12345));
      expect(botSeed(seed, 5)).toBe(exact(seed, 7919, 5 * 104729));
    }
  });
});
