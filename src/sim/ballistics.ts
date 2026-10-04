import { BALLISTICS, type BallisticsConfig } from '../config/ballistics';
import { type AirModel, airModel, dragFactor, liftCoefficient } from './air';
import { type Vec3, vec3 } from './vec';

/** One BB in flight. Pooled: `active` false means the slot is free. */
export interface BB {
  active: boolean;
  /** Increasing id so presentation can tell a reused slot is a new BB. */
  serial: number;
  ownerId: number;
  position: Vec3;
  /** Position at the start of the last tick (collision segment and render interpolation). */
  prevPosition: Vec3;
  velocity: Vec3;
  /** Seconds since fired. */
  age: number;
  /**
   * Backspin (rad/s) from the hop-up: its replica's hopUpMax × the shooter's dial (config/replicas.ts hopUpLift) ×
   * BallisticsConfig.spinPerHop at the muzzle, decaying in flight. It lifts the BB (Magnus).
   */
  spin: number;
  /**
   * The spin's axis (unit): level and square to the barrel, so the backspin lifts the BB straight up off the aim line.
   * A spinning BB keeps its axis in flight (it is gyroscopically stable), so it is set once, at the muzzle.
   */
  spinAxis: Vec3;
  /** BB mass (kg): how hard drag and lift push it, and how long the spin lasts, all depend on it. */
  mass: number;
  /** Times it has bounced off a surface (M20): a BB with bounces > 0 is a ricochet. */
  bounces: number;
}

export interface BBPool {
  bbs: BB[];
  nextSerial: number;
}

export function createBBPool(size: number): BBPool {
  const bbs: BB[] = [];
  for (let i = 0; i < size; i++) {
    bbs.push({
      active: false,
      serial: 0,
      ownerId: -1,
      position: vec3(),
      prevPosition: vec3(),
      velocity: vec3(),
      age: 0,
      spin: 0,
      spinAxis: vec3(1, 0, 0),
      mass: 0,
      bounces: 0,
    });
  }
  return { bbs, nextSerial: 1 };
}

/**
 * Fires a BB of `mass` kg from `origin` along the unit vector `dir` at `speed`, with the backspin a hop-up of `hopUp`
 * gives (`hopUpLift`; × `cfg.spinPerHop`, the game's BALLISTICS unless a test flies other air). Reuses a free slot, else the oldest BB in flight (the smallest serial).
 */
export function spawnBB(pool: BBPool, ownerId: number, origin: Vec3, dir: Vec3, speed: number, hopUp: number, mass: number, cfg: Pick<BallisticsConfig, 'spinPerHop'> = BALLISTICS): BB {
  // Drag, lift and spin all divide by the mass: a missing or zero mass would fill the flight with NaN.
  if (!(mass > 0)) throw new Error(`BB mass must be positive (kg), got ${mass}`);
  let bb: BB | undefined;
  let oldest: BB | undefined;
  for (const b of pool.bbs) {
    if (!b.active) {
      bb = b;
      break;
    }
    if (!oldest || b.serial < oldest.serial) oldest = b;
  }
  bb ??= oldest;
  if (!bb) throw new Error('BB pool has no slots');
  bb.active = true;
  bb.serial = pool.nextSerial++;
  bb.ownerId = ownerId;
  bb.position.x = bb.prevPosition.x = origin.x;
  bb.position.y = bb.prevPosition.y = origin.y;
  bb.position.z = bb.prevPosition.z = origin.z;
  bb.velocity.x = dir.x * speed;
  bb.velocity.y = dir.y * speed;
  bb.velocity.z = dir.z * speed;
  bb.age = 0;
  bb.spin = hopUp * cfg.spinPerHop;
  // Spin axis: the barrel's direction crossed with world up (to its right), level. A shot fired straight up or down
  // has no level right-hand side; any level axis will do there, as the lift is then sideways and tiny.
  const ax = -dir.z;
  const az = dir.x;
  const len = Math.sqrt(ax * ax + az * az);
  bb.spinAxis.x = len > 1e-6 ? ax / len : 1;
  bb.spinAxis.y = 0;
  bb.spinAxis.z = len > 1e-6 ? az / len : 0;
  bb.mass = mass;
  bb.bounces = 0;
  return bb;
}

const STILL_AIR: Readonly<Vec3> = vec3();

/** Acceleration scratch for the two evaluations of a step (one BB at a time, never kept). */
const acc = vec3();

/**
 * The BB's acceleration (into `acc`) at velocity (vx, vy, vz) with spin `spin`, in `wind`: gravity, drag against the
 * airflow and Magnus lift across it (ω̂ × airflow, so backspin lifts). Returns the airspeed.
 */
function accelerate(bb: BB, air: AirModel, vx: number, vy: number, vz: number, spin: number, wind: Readonly<Vec3>): number {
  const rx = vx - wind.x;
  const ry = vy - wind.y;
  const rz = vz - wind.z;
  const speed = Math.sqrt(rx * rx + ry * ry + rz * rz);
  acc.x = 0;
  acc.y = -air.gravity;
  acc.z = 0;
  if (speed < 1e-6) return speed;
  const drag = (dragFactor(air, speed) * speed) / bb.mass;
  acc.x -= drag * rx;
  acc.y -= drag * ry;
  acc.z -= drag * rz;
  if (spin > 0) {
    // |ω̂ × v| = speed · sin(angle between them); lift = ½ρA·CL·v² across the airflow, so scale ω̂ × v by
    // ½ρA·CL·speed / (m · sin). Its axis is level and square to the barrel, so the sine stays close to 1.
    const a = bb.spinAxis;
    const lx = a.y * rz - a.z * ry;
    const ly = a.z * rx - a.x * rz;
    const lz = a.x * ry - a.y * rx;
    const cross = Math.sqrt(lx * lx + ly * ly + lz * lz);
    if (cross > 1e-9) {
      const lift = (air.liftFactor * liftCoefficient(air, (spin * air.radius) / speed) * speed * speed) / (bb.mass * cross);
      acc.x += lx * lift;
      acc.y += ly * lift;
      acc.z += lz * lift;
    }
  }
  return speed;
}

/**
 * Advances a BB's flight by `dt` (no collision) in `wind` (m/s; still air by default), with the air model `air`.
 * Second-order (the midpoint method): the forces are worked out at the start of the step and again half way through,
 * and the step moves on with the half-way ones, so one step a 60 Hz tick stays within millimetres of the exact flight
 * at 50 m. Pure: depends only on the BB, the air and the wind.
 */
export function stepFlight(bb: BB, air: AirModel, dt: number, wind: Readonly<Vec3> = STILL_AIR): void {
  const v = bb.velocity;
  const half = dt / 2;
  const decay = air.spinDecay / bb.mass;
  const speed0 = accelerate(bb, air, v.x, v.y, v.z, bb.spin, wind);
  const mx = v.x + acc.x * half;
  const my = v.y + acc.y * half;
  const mz = v.z + acc.z * half;
  const midSpin = bb.spin * (1 - decay * speed0 * half);
  const speed1 = accelerate(bb, air, mx, my, mz, midSpin, wind);
  bb.position.x += mx * dt;
  bb.position.y += my * dt;
  bb.position.z += mz * dt;
  v.x += acc.x * dt;
  v.y += acc.y * dt;
  v.z += acc.z * dt;
  // The air's friction torque: dω/dt = −decay · airspeed · ω (never below zero, however long the step).
  bb.spin = Math.max(0, bb.spin * (1 - decay * speed1 * dt));
  bb.age += dt;
}

/** stepFlight with `cfg`'s air model: for callers that fly one BB now and then (the Loadout's readouts, tests). */
export function stepBBFlight(bb: BB, cfg: BallisticsConfig, dt: number, wind?: Readonly<Vec3>): void {
  stepFlight(bb, airModel(cfg), dt, wind);
}

/**
 * About how long (s) a BB fired at `speed` m/s takes to fly `distance` m, from drag alone (straight-line flight with a
 * constant drag coefficient, the one at the muzzle): t = (e^(k·d) − 1) / (k·v₀), k = ½ρ·Cd·A / m. Within a few per cent
 * of the full flight model over a field's ranges; cheap enough for a bot to lead a target with every tick.
 */
export function flightTimeEstimate(distance: number, speed: number, mass: number, cfg: BallisticsConfig): number {
  if (!(speed > 0) || !(mass > 0)) return Number.POSITIVE_INFINITY;
  const k = dragFactor(airModel(cfg), speed) / mass;
  return Math.expm1(k * Math.max(0, distance)) / (k * speed);
}
