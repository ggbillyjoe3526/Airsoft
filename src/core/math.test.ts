import { describe, expect, it } from 'vitest';
import { clamp, clamp01, lerp } from './math';

describe('the shared number helpers (DX0)', () => {
  it('clamp holds a value between its bounds and passes one inside through', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-2, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(clamp(0, 0, 3)).toBe(0);
    expect(clamp(3, 0, 3)).toBe(3);
    expect(clamp(Infinity, -1, 1)).toBe(1);
    expect(clamp(-Infinity, -1, 1)).toBe(-1);
  });
  it('clamp01 holds a value between 0 and 1', () => {
    expect([clamp01(-0.5), clamp01(0.25), clamp01(1.5), clamp01(1)]).toEqual([0, 0.25, 1, 1]);
  });
  it('lerp runs from a to b, unclamped, and reaches both ends exactly', () => {
    expect(lerp(2, 10, 0)).toBe(2);
    expect(lerp(2, 10, 1)).toBe(10);
    expect(lerp(2, 10, 0.5)).toBe(6);
    expect(lerp(2, 10, 2)).toBe(18);
    expect(lerp(2, 10, -1)).toBe(-6);
  });
  it('lives once: no other source file defines its own clamp, clamp01 or lerp', () => {
    const sources = import.meta.glob<string>(['../**/*.ts', '!../**/*.test.ts', '!../**/*.d.ts'], { query: '?raw', import: 'default', eager: true });
    const own = Object.entries(sources)
      // The glob's keys are relative to this folder, so the module itself is './math.ts'.
      .filter(([file]) => file !== './math.ts')
      .filter(([, text]) => /(?:function|const|let)\s+(?:clamp|clamp01|lerp)\s*(?:=|\()/.test(text))
      .map(([file]) => file);
    expect(own).toEqual([]);
  });
});
