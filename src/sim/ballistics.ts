import type { BallisticsConfig } from '../config/ballistics';
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
  /** Hop-up lift it was fired with: its replica's hopUpMax × the shooter's dial (see config/replicas.ts hopUpLift). */
  hopUp: number;
  /** BB mass (kg): drag, hop-up lift and how long the spin lasts all depend on it. */
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
      hopUp: 0,
      mass: 0,
      bounces: 0,
    });
  }
  return { bbs, nextSerial: 1 };
}

/**
 * Fires a BB of `mass` kg from `origin` along the unit vector `dir` at `speed`. Reuses a free slot, else
 * the oldest BB in flight (the smallest serial).
 */
export function spawnBB(pool: BBPool, ownerId: number, origin: Vec3, dir: Vec3, speed: number, hopUp: number, mass: number): BB {
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
  bb.hopUp = hopUp;
  bb.mass = mass;
  bb.bounces = 0;
  return bb;
}

/** Sub-steps per tick; BBs move ~1.5 m per 60 Hz tick, two steps keep the arc smooth. */
const SUBSTEPS = 2;

/**
 * Advances a BB's flight by `dt` (no collision). Pure: depends only on the BB and config.
 * Acceleration = gravity + quadratic drag (dragArea / mass · speed²) + hop-up lift, where lift acts
 * perpendicular to the velocity, in the vertical plane, with magnitude hopUp · (referenceMass / mass) ·
 * speed · spin and spin = exp(-age / (spinDecayTime · mass / referenceMass)).
 */
export function stepBBFlight(bb: BB, cfg: BallisticsConfig, dt: number): void {
  const h = dt / SUBSTEPS;
  const v = bb.velocity;
  const drag = cfg.dragArea / bb.mass;
  const hop = (bb.hopUp * cfg.referenceMass) / bb.mass;
  const spinDecay = (cfg.spinDecayTime * bb.mass) / cfg.referenceMass;
  for (let s = 0; s < SUBSTEPS; s++) {
    const speed = Math.hypot(v.x, v.y, v.z);
    let ax = 0;
    let ay = -cfg.gravity;
    let az = 0;
    if (speed > 1e-6) {
      ax -= drag * speed * v.x;
      ay -= drag * speed * v.y;
      az -= drag * speed * v.z;
      // Lift direction: world up with the along-velocity component removed.
      const along = v.y / speed;
      let lx = -along * (v.x / speed);
      let ly = 1 - along * along;
      let lz = -along * (v.z / speed);
      const len = Math.hypot(lx, ly, lz);
      if (len > 1e-6) {
        const lift = (hop * speed * Math.exp(-bb.age / spinDecay)) / len;
        lx *= lift;
        ly *= lift;
        lz *= lift;
        ax += lx;
        ay += ly;
        az += lz;
      }
    }
    v.x += ax * h;
    v.y += ay * h;
    v.z += az * h;
    bb.position.x += v.x * h;
    bb.position.y += v.y * h;
    bb.position.z += v.z * h;
    bb.age += h;
  }
}
