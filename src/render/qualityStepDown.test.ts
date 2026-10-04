import { describe, expect, it } from 'vitest';
import { QUALITY_STEP_DOWN } from '../config/render';
import { FrameTimeWatch, presetBelow, slowFrameMs } from './qualityStepDown';

/** Feeds `seconds` of frames: `slowShare` of them at `slowMs`, the rest at 10 ms. Returns whether the watch fired. */
function feed(watch: FrameTimeWatch, seconds: number, slowShare: number, slowMs = 40, threshold: number = QUALITY_STEP_DOWN.p95Ms): boolean {
  let fired = false;
  let t = 0;
  let i = 0;
  while (t < seconds * 1000) {
    const slow = (i++ % 100) < slowShare * 100;
    const ms = slow ? slowMs : 10;
    t += ms;
    if (watch.add(ms, threshold)) fired = true;
  }
  return fired;
}

describe('the automatic quality step-down (REN-03)', () => {
  const window = QUALITY_STEP_DOWN.windowSeconds;

  it('steps down only after the set number of slow windows in a row', () => {
    const watch = new FrameTimeWatch();
    expect(feed(watch, window * (QUALITY_STEP_DOWN.windows - 1) + 0.1, 0.2)).toBe(false);
    expect(feed(watch, window, 0.2)).toBe(true);
  });

  it('ignores the odd hitch: under 5 % of frames slow is a smooth window', () => {
    const watch = new FrameTimeWatch();
    expect(feed(watch, window * 5, 0.03)).toBe(false);
  });

  it('needs the slow windows in a row: a smooth one in between starts the count again', () => {
    const watch = new FrameTimeWatch();
    expect(feed(watch, window, 0.3)).toBe(false);
    expect(feed(watch, window, 0)).toBe(false);
    expect(feed(watch, window * (QUALITY_STEP_DOWN.windows - 1), 0.3)).toBe(false);
  });

  it('starts over on reset (play resumed)', () => {
    const watch = new FrameTimeWatch();
    expect(feed(watch, window * (QUALITY_STEP_DOWN.windows - 1) + 0.1, 0.5)).toBe(false);
    watch.reset();
    expect(feed(watch, window - 0.2, 0.5)).toBe(false);
  });

  it('judges a frame-rate cap by its own period, so a 30 fps cap is not slow', () => {
    expect(slowFrameMs(0)).toBe(QUALITY_STEP_DOWN.p95Ms);
    expect(slowFrameMs(144)).toBe(QUALITY_STEP_DOWN.p95Ms);
    expect(slowFrameMs(30)).toBeGreaterThan(1000 / 30);
    const watch = new FrameTimeWatch();
    expect(feed(watch, window * 4, 1, 1000 / 30, slowFrameMs(30))).toBe(false);
  });

  it('steps High to Medium to Low, and never a Custom mix or below Low', () => {
    expect(presetBelow('high')).toBe('medium');
    expect(presetBelow('medium')).toBe('low');
    expect(presetBelow('low')).toBeNull();
    expect(presetBelow('custom')).toBeNull();
  });
});
