import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { airDensity, airModel, airViscosity, dragFactor, liftCoefficient, sphereDragCoefficient } from './air';

describe('the air (M30)', () => {
  it('has the density and viscosity of real air at 20 °C and sea level', () => {
    expect(airDensity(BALLISTICS.air)).toBeCloseTo(1.204, 3);
    expect(airViscosity(BALLISTICS.air)).toBeCloseTo(1.81e-5, 7);
    // Colder air is denser (and a little less viscous): drag grows on a cold day.
    const cold = { ...BALLISTICS.air, temperature: 0 };
    expect(airDensity(cold)).toBeGreaterThan(airDensity(BALLISTICS.air));
    expect(airViscosity(cold)).toBeLessThan(airViscosity(BALLISTICS.air));
  });

  it("gives a sphere the drag coefficient of the measured curve: Stokes' 24/Re when slow, about 0.4 at a BB's speeds", () => {
    expect(sphereDragCoefficient(0.01) * 0.01).toBeCloseTo(24, 0);
    // A 6 mm BB between 10 and 110 m/s flies at Re ~4,000-44,000: the flat part of the curve.
    for (const re of [4_000, 10_000, 20_000, 44_000]) {
      expect(sphereDragCoefficient(re), `Re ${re}`).toBeGreaterThan(0.36);
      expect(sphereDragCoefficient(re), `Re ${re}`).toBeLessThan(0.48);
    }
    // The drag crisis past Re ~300,000 (a sphere's wake suddenly narrows), which a BB never reaches.
    expect(sphereDragCoefficient(600_000)).toBeLessThan(0.2);
    expect(sphereDragCoefficient(0)).toBe(0);
  });

  it("tabulates ½ρ·Cd·A by airspeed to match the formula it comes from, and is real BB drag (no game scale)", () => {
    const air = airModel(BALLISTICS);
    const rho = airDensity(BALLISTICS.air);
    const mu = airViscosity(BALLISTICS.air);
    const d = BALLISTICS.bbDiameter;
    const area = (Math.PI * d * d) / 4;
    for (const v of [5, 30.25, 55.5, 88, 120.7]) {
      const exact = 0.5 * rho * area * sphereDragCoefficient((rho * v * d) / mu);
      expect(dragFactor(air, v) / exact, `${v} m/s`).toBeCloseTo(1, 3);
    }
    // ~7.2e-6 kg/m for a 5.95 mm BB at 88 m/s (it was 5e-6, ~60% of real, before M30).
    expect(dragFactor(air, 88)).toBeGreaterThan(6.5e-6);
    expect(dragFactor(air, 88)).toBeLessThan(7.5e-6);
    // Off the top of the table it holds the last value rather than reading past the end.
    expect(Number.isFinite(dragFactor(air, 10_000))).toBe(true);
    expect(airModel(BALLISTICS)).toBe(air); // built once per config
  });

  it('turns spin into lift like a spinning ball: CL ≈ S at a hop-up spin ratio, levelling off near 0.5', () => {
    const air = airModel(BALLISTICS);
    expect(liftCoefficient(air, 0)).toBe(0);
    expect(liftCoefficient(air, 0.02) / 0.02).toBeCloseTo(1, 1);
    expect(liftCoefficient(air, 0.5)).toBeGreaterThan(liftCoefficient(air, 0.2));
    expect(liftCoefficient(air, 100)).toBeLessThan(0.5);
    expect(liftCoefficient(air, 100)).toBeGreaterThan(0.45);
  });
});
