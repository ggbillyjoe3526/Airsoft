import { describe, expect, it } from 'vitest';
import { QUALITY, QUALITY_CHOICES, QUALITY_PRESETS, QUALITY_STEP_DOWN, type QualityChoice, startingQuality } from '../config/render';
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
    expect(presetBelow('ultra')).toBe('high');
    expect(presetBelow('high')).toBe('medium');
    expect(presetBelow('medium')).toBe('low');
    expect(presetBelow('low')).toBeNull();
    expect(presetBelow('custom')).toBeNull();
  });
});

describe('Ultra and the automatic step-down (G5 QA)', () => {
  it('walks Ultra down through High, Medium and Low in order, one preset at a time, each a cheaper one', () => {
    const walked: string[] = [];
    for (let at: QualityChoice | null = 'ultra'; at; at = presetBelow(at)) walked.push(at);
    expect(walked).toEqual(['ultra', 'high', 'medium', 'low']);
    for (const preset of QUALITY_PRESETS.slice(1)) {
      const below = presetBelow(preset)!;
      expect(QUALITY_PRESETS.indexOf(below), preset).toBe(QUALITY_PRESETS.indexOf(preset) - 1);
      expect(QUALITY[below].renderScale, preset).toBeLessThanOrEqual(QUALITY[preset].renderScale);
    }
  });

  it('never lands on Ultra when stepping down, and none of the game’s own picks for any GPU is Ultra', () => {
    for (const choice of QUALITY_CHOICES) expect(presetBelow(choice.id), choice.id).not.toBe('ultra');
    for (const tier of ['software', 'integrated', 'discrete', 'unknown'] as const) {
      const start = startingQuality(null, null, {}, tier);
      expect(start.choice).not.toBe('ultra');
      // The game's pick (automatic) is the only one that steps; its whole way down never touches Ultra.
      expect(start.automatic).toBe(true);
      for (let at: QualityChoice | null = start.choice; at; at = presetBelow(at)) expect(at).not.toBe('ultra');
    }
  });

  it('keeps a player’s own Ultra (picked, saved or asked for in the address) out of the automatic step-down', () => {
    expect(startingQuality('ultra', null, {}, 'discrete').automatic).toBe(false);
    expect(startingQuality(null, 'ultra', {}, 'discrete').automatic).toBe(false);
    expect(startingQuality(null, 'ultra', {}, 'software')).toMatchObject({ choice: 'ultra', automatic: false });
  });

  it('judges Ultra at a 240 cap as slow only by the usual 20 ms, since 240 frames a second is faster than that', () => {
    expect(slowFrameMs(240)).toBe(QUALITY_STEP_DOWN.p95Ms);
  });
});
