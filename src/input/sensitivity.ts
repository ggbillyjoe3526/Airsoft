import { MOUSE } from '../config/controls';

/** Sensitivity as other shooters and mouse software count it (M18): cm/360 from the mouse's DPI, and "same as" figures. */

const CM_PER_INCH = 2.54;
const FULL_TURN = Math.PI * 2;
const DEGREES_PER_RADIAN = 180 / Math.PI;

/** Centimetres of mouse travel for one full turn at `sensitivity`, with a mouse of `dpi` counts per inch. */
export function cmPer360(sensitivity: number, dpi: number): number {
  const counts = FULL_TURN / (MOUSE.radiansPerCount * sensitivity);
  return (counts / dpi) * CM_PER_INCH;
}

/** The sensitivity that turns a full circle over `cm` of mouse travel with a mouse of `dpi`; the inverse of cmPer360. */
export function sensitivityForCm(cm: number, dpi: number): number {
  const counts = (cm / CM_PER_INCH) * dpi;
  return FULL_TURN / (MOUSE.radiansPerCount * counts);
}

/**
 * The sensitivity a typed cm/360 sets: sensitivityForCm kept to the slider's range and rounded to its step (audit
 * L-32), so the slider, its readout and the game all use the same value.
 */
export function sensitivityFromTypedCm(cm: number, dpi: number): number {
  const v = Math.max(MOUSE.minSensitivity, Math.min(MOUSE.maxSensitivity, sensitivityForCm(cm, dpi)));
  return roundToStep(v, MOUSE.sensitivityStep);
}

/** `v` to the nearest multiple of `step` (a step such as 0.05, whose inverse is a whole number, rounds exactly). */
export function roundToStep(v: number, step: number): number {
  const perUnit = Math.round(1 / step);
  return Math.round(v * perUnit) / perUnit;
}

/** The sensitivity another shooter needs to turn as far per mouse count, given its `degreesPerCount` at sensitivity 1. */
export function sameSensitivityAs(sensitivity: number, degreesPerCount: number): number {
  return (MOUSE.radiansPerCount * sensitivity * DEGREES_PER_RADIAN) / degreesPerCount;
}
