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
  /** Hop-up strength of the replica that fired it (see ReplicaConfig.hopUp). */
  hopUp: number;
}

export interface BBPool {
  bbs: BB[];
  nextSerial: number;
  /** Next slot to overwrite when the pool is full (oldest first). */
  cursor: number;
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
    });
  }
  return { bbs, nextSerial: 1, cursor: 0 };
}

/** Fires a BB from `origin` along the unit vector `dir`. Reuses a free slot, else the oldest BB. */
export function spawnBB(pool: BBPool, ownerId: number, origin: Vec3, dir: Vec3, speed: number, hopUp: number): BB {
  let bb = pool.bbs.find((b) => !b.active);
  if (!bb) {
    bb = pool.bbs[pool.cursor]!;
    pool.cursor = (pool.cursor + 1) % pool.bbs.length;
  }
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
  return bb;
}

/** Sub-steps per tick; BBs move ~1.5 m per 60 Hz tick, two steps keep the arc smooth. */
const SUBSTEPS = 2;

/**
 * Advances a BB's flight by `dt` (no collision). Pure: depends only on the BB and config.
 * Acceleration = gravity + quadratic drag + hop-up lift, where lift acts perpendicular to the
 * velocity, in the vertical plane, with magnitude hopUp · speed · spin and spin = exp(-age/decay).
 */
export function stepBBFlight(bb: BB, cfg: BallisticsConfig, dt: number): void {
  const h = dt / SUBSTEPS;
  const v = bb.velocity;
  for (let s = 0; s < SUBSTEPS; s++) {
    const speed = Math.hypot(v.x, v.y, v.z);
    let ax = 0;
    let ay = -cfg.gravity;
    let az = 0;
    if (speed > 1e-6) {
      ax -= cfg.drag * speed * v.x;
      ay -= cfg.drag * speed * v.y;
      az -= cfg.drag * speed * v.z;
      // Lift direction: world up with the along-velocity component removed.
      const along = v.y / speed;
      let lx = -along * (v.x / speed);
      let ly = 1 - along * along;
      let lz = -along * (v.z / speed);
      const len = Math.hypot(lx, ly, lz);
      if (len > 1e-6) {
        const lift = (bb.hopUp * speed * Math.exp(-bb.age / cfg.spinDecayTime)) / len;
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
