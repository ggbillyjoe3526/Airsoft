import { describe, expect, it } from 'vitest';
import { advanceStepper, createStepper, stepperAlpha } from './fixedStepper';

describe('fixedStepper', () => {
  const step = 1 / 60;

  it('runs one tick per step of elapsed time and keeps the remainder', () => {
    const s = createStepper(step, 5);
    expect(advanceStepper(s, step * 2.5)).toBe(2);
    expect(stepperAlpha(s)).toBeCloseTo(0.5, 5);
    expect(advanceStepper(s, step * 0.6)).toBe(1);
    expect(stepperAlpha(s)).toBeCloseTo(0.1, 5);
  });

  it('runs zero ticks on a fast frame', () => {
    const s = createStepper(step, 5);
    expect(advanceStepper(s, step * 0.4)).toBe(0);
    expect(stepperAlpha(s)).toBeCloseTo(0.4, 5);
  });

  it('caps catch-up ticks and drops the backlog', () => {
    const s = createStepper(step, 5);
    expect(advanceStepper(s, 1)).toBe(5);
    expect(s.accumulator).toBe(0);
  });

  it('keeps 60 ticks per second at 144 Hz rendering', () => {
    const s = createStepper(step, 5);
    let ticks = 0;
    for (let i = 0; i < 144; i++) ticks += advanceStepper(s, 1 / 144);
    expect(Math.abs(ticks - 60)).toBeLessThanOrEqual(1);
  });

  it('ignores negative frame times', () => {
    const s = createStepper(step, 5);
    expect(advanceStepper(s, -1)).toBe(0);
    expect(s.accumulator).toBe(0);
  });
});
