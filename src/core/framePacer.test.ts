import { describe, expect, it } from 'vitest';
import { FramePacer } from './framePacer';

/** How many of a second's animation frames at `hz` a pacer draws under `cap`. */
function drawnInASecond(hz: number, cap: number, jitterMs = 0): number {
  const pacer = new FramePacer();
  let drawn = 0;
  for (let i = 0; i < hz; i++) {
    const now = 1000 + (i * 1000) / hz + (i % 2 === 0 ? -jitterMs : jitterMs);
    if (pacer.shouldDraw(now, cap)) drawn++;
  }
  return drawn;
}

describe('FramePacer (frame-rate cap, REN-16 / CORE-25)', () => {
  it('draws every frame with no cap', () => {
    expect(drawnInASecond(240, 0)).toBe(240);
  });

  it('draws every frame when the cap is the screen rate, even with a slightly early vsync', () => {
    expect(drawnInASecond(60, 60)).toBe(60);
    expect(drawnInASecond(60, 60, 0.5)).toBe(60);
    expect(drawnInASecond(144, 144, 0.4)).toBe(144);
  });

  it('holds the cap on a faster screen, also when the rates are not multiples', () => {
    expect(drawnInASecond(240, 60)).toBe(60);
    expect(drawnInASecond(120, 30)).toBe(30);
    const n = drawnInASecond(165, 144);
    expect(n).toBeGreaterThanOrEqual(140);
    expect(n).toBeLessThanOrEqual(146);
  });

  it('starts again from now after a long gap instead of bursting to catch up', () => {
    const pacer = new FramePacer();
    expect(pacer.shouldDraw(0, 60)).toBe(true);
    // Half a second later (a hitch): drawn, and the next is a period on, not owed at once.
    expect(pacer.shouldDraw(500, 60)).toBe(true);
    expect(pacer.shouldDraw(504, 60)).toBe(false);
    expect(pacer.shouldDraw(517, 60)).toBe(true);
  });
});
