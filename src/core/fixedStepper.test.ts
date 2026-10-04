import { describe, expect, it } from 'vitest';
import { SIM, SIM_DT } from '../config/sim';
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

  it('ignores a frame time that is not a number instead of stopping for good', () => {
    const s = createStepper(step, 5);
    expect(advanceStepper(s, Number.NaN)).toBe(0);
    expect(advanceStepper(s, step * 1.5)).toBe(1);
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

  it(`keeps the game in real time down to ${SIM.realTimeDownToFps} frames a second with the game's cap (audit SIM-14)`, () => {
    const s = createStepper(SIM_DT, SIM.maxTicksPerFrame);
    const frame = 1 / SIM.realTimeDownToFps;
    expect(frame).toBeLessThanOrEqual(SIM.maxFrameDt); // a frame that slow is still taken as real time
    let ticks = 0;
    for (let i = 0; i < SIM.realTimeDownToFps * 10; i++) ticks += advanceStepper(s, frame);
    expect(Math.abs(ticks - 10 / SIM_DT)).toBeLessThanOrEqual(1); // ten seconds of frames, ten seconds of ticks
  });
});
