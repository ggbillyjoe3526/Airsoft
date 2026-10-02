/**
 * Fixed-timestep accumulator. The simulation always advances in `step`-sized ticks, while
 * rendering runs at the display rate and interpolates with `stepperAlpha`.
 */
export interface FixedStepper {
  readonly step: number;
  readonly maxTicks: number;
  accumulator: number;
}

export function createStepper(step: number, maxTicks: number): FixedStepper {
  return { step, maxTicks, accumulator: 0 };
}

/** Adds elapsed frame time and returns how many ticks to run now. Excess time beyond maxTicks is dropped. */
export function advanceStepper(s: FixedStepper, frameDt: number): number {
  if (Number.isFinite(frameDt)) s.accumulator += Math.max(0, frameDt); // one bad timestamp must not stop the clock for good
  let ticks = Math.floor(s.accumulator / s.step);
  if (ticks > s.maxTicks) {
    ticks = s.maxTicks;
    s.accumulator = 0;
    return ticks;
  }
  s.accumulator -= ticks * s.step;
  return ticks;
}

/** Interpolation factor between the previous and current simulation state, in [0, 1). */
export function stepperAlpha(s: FixedStepper): number {
  return Math.min(1, s.accumulator / s.step);
}
