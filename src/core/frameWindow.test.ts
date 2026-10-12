import { describe, expect, it } from 'vitest';
import { FrameWindow } from './frameWindow';

describe('the frame window (IM7)', () => {
  it('sums up the frames of the last seconds of play: count, average, worst and hitches', () => {
    const w = new FrameWindow(10, 50);
    for (let i = 0; i < 120; i++) w.add(i === 60 ? 80 : 10);
    const s = w.summary();
    expect(s.frames).toBe(120);
    expect(s.worstMs).toBe(80);
    expect(s.hitches).toBe(1);
    expect(s.avgMs).toBeCloseTo((119 * 10 + 80) / 120, 6);
    expect(s.seconds).toBeCloseTo(1.27, 2);
  });

  it('forgets frames older than its window, and keeps no more than its seconds', () => {
    const w = new FrameWindow(10, 50);
    for (let i = 0; i < 100; i++) w.add(100); // ten seconds of slow frames, hitches all
    for (let i = 0; i < 1500; i++) w.add(10); // then fifteen seconds of smooth ones
    const s = w.summary();
    expect(s.hitches).toBe(0);
    expect(s.worstMs).toBe(10);
    expect(s.seconds).toBeLessThanOrEqual(10);
    expect(s.frames).toBeGreaterThan(900);
  });

  it('is empty before any play, and unchanged by time spent in the menus (it only counts the frames added)', () => {
    const w = new FrameWindow(10, 50);
    expect(w.summary()).toEqual({ seconds: 0, frames: 0, avgMs: 0, worstMs: 0, hitches: 0 });
    for (let i = 0; i < 60; i++) w.add(16);
    const before = w.summary();
    expect(w.summary()).toEqual(before);
  });
});
