import type { AirConfig, BallisticsConfig } from '../config/ballistics';

/** Specific gas constant of dry air, J/(kg·K). */
const R_AIR = 287.05;
/** Sutherland's law for air: reference viscosity (Pa·s) at the reference temperature (K), and its constant (K). */
const MU_REF = 1.716e-5;
const T_REF = 273.15;
const SUTHERLAND = 110.4;

/** Air density (kg/m³) from the ideal gas law: 1.204 at 20 °C and sea level. */
export function airDensity(air: AirConfig): number {
  return air.pressure / (R_AIR * (air.temperature + 273.15));
}

/** Dynamic viscosity of air (Pa·s) from Sutherland's law: 1.81e-5 at 20 °C. */
export function airViscosity(air: AirConfig): number {
  const t = air.temperature + 273.15;
  return MU_REF * (t / T_REF) ** 1.5 * ((T_REF + SUTHERLAND) / (t + SUTHERLAND));
}

/**
 * Drag coefficient of a smooth sphere at Reynolds number `re` (Morrison's 2013 fit to the measured curve, good to
 * Re 10⁶). A BB flies at Re ~5,000–40,000, where Cd sits close to 0.4.
 */
export function sphereDragCoefficient(re: number): number {
  if (!(re > 0)) return 0;
  const a = re / 5;
  const b = re / 263_000;
  const c = re / 1e6;
  return 24 / re + (2.6 * a) / (1 + a ** 1.52) + (0.411 * b ** -7.94) / (1 + b ** -8) + (0.25 * c) / (1 + c);
}

/** Highest airspeed (m/s) the drag table covers; faster than any replica (the fastest is about 100 m/s). */
const TABLE_TOP = 200;
/** Table entries per m/s. */
const TABLE_RES = 2;

/**
 * Everything the flight step needs about the air, worked out once per BallisticsConfig: the drag factor ½·ρ·Cd·A (kg/m)
 * tabulated by airspeed, so a BB's step costs a table read instead of a Reynolds number and three powers, and the
 * constants for Magnus lift and spin decay.
 */
export interface AirModel {
  /** ½·ρ·Cd(Re(v))·A at airspeeds 0, 1/TABLE_RES, 2/TABLE_RES … TABLE_TOP m/s. */
  readonly drag: Float64Array;
  /** ½·ρ·A (kg/m): lift force = liftFactor · CL · v². */
  readonly liftFactor: number;
  /** 1.25·ρ·A·spinFriction (kg/m): spin decays at spinDecay · v / m per second. */
  readonly spinDecay: number;
  /** BB radius (m), for the spin ratio ω·r / v. */
  readonly radius: number;
  readonly liftBase: number;
  readonly liftSlope: number;
  readonly gravity: number;
}

const models = new WeakMap<BallisticsConfig, AirModel>();

/** The AirModel of `cfg`, built on first use and kept for as long as the config lives. */
export function airModel(cfg: BallisticsConfig): AirModel {
  let model = models.get(cfg);
  if (!model) {
    model = buildAirModel(cfg);
    models.set(cfg, model);
  }
  return model;
}

function buildAirModel(cfg: BallisticsConfig): AirModel {
  const rho = airDensity(cfg.air);
  const mu = airViscosity(cfg.air);
  const radius = cfg.bbDiameter / 2;
  const area = Math.PI * radius * radius;
  const drag = new Float64Array(TABLE_TOP * TABLE_RES + 2);
  for (let i = 0; i < drag.length; i++) {
    const v = i / TABLE_RES;
    drag[i] = 0.5 * rho * area * sphereDragCoefficient((rho * v * cfg.bbDiameter) / mu);
  }
  // Re 0 has no drag coefficient; the next entry's is close enough for a BB that has all but stopped.
  drag[0] = drag[1]!;
  return {
    drag,
    liftFactor: 0.5 * rho * area,
    spinDecay: 1.25 * rho * area * cfg.spinFriction,
    radius,
    liftBase: cfg.liftBase,
    liftSlope: cfg.liftSlope,
    gravity: cfg.gravity,
  };
}

/** ½·ρ·Cd·A (kg/m) at airspeed `speed` (m/s), read from the model's table with linear interpolation. */
export function dragFactor(model: AirModel, speed: number): number {
  const x = Math.min(speed * TABLE_RES, model.drag.length - 2);
  const i = x | 0;
  const f = x - i;
  return model.drag[i]! + (model.drag[i + 1]! - model.drag[i]!) * f;
}

/** Magnus lift coefficient at spin ratio `s` (ω·r / v). */
export function liftCoefficient(model: AirModel, s: number): number {
  return s / (model.liftBase + model.liftSlope * s);
}
