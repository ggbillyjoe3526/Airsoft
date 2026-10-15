import type { LeavesConfig } from '../config/ballistics';
import type { BB } from './ballistics';
import { type RngState, rngNext } from './rng';
import { length3 } from './vec';

/**
 * A BB that came out of a bush (Dev 6 item 44; sim/bbs.ts finds the crossing, map/foliage.ts firstLeaves) having pushed
 * through `depth` metres of leaves: its speed and backspin drop to keptPerMetre^depth, and its direction is thrown off
 * by up to scatterPerMetre × depth radians, any way round its line (an even pick of the angle, so most BBs come out only
 * a little off and a few well off). Pure apart from `rng` (the simulation's seeded stream; without one the BB is only
 * slowed, as a ricochet without one doesn't scatter). Allocates nothing.
 */
export function deflectInLeaves(bb: BB, depth: number, cfg: LeavesConfig, rng?: RngState): void {
  const v = bb.velocity;
  const speed = length3(v.x, v.y, v.z);
  if (!(speed > 0) || !(depth > 0)) return;
  const kept = cfg.keptPerMetre ** depth;
  bb.spin *= kept;
  // The unit line it was on.
  const ux = v.x / speed;
  const uy = v.y / speed;
  const uz = v.z / speed;
  let nx = ux;
  let ny = uy;
  let nz = uz;
  if (rng) {
    const angle = cfg.scatterPerMetre * depth * rngNext(rng);
    const round = rngNext(rng) * Math.PI * 2;
    // Two unit directions square to the line and to each other: across it from the axis least along it.
    const level = Math.abs(uy) < 0.9;
    // a = u × (level ? up : +x), normalised.
    let ax = level ? -uz : 0;
    let ay = level ? 0 : uz;
    let az = level ? ux : -uy;
    const al = length3(ax, ay, az);
    ax /= al;
    ay /= al;
    az /= al;
    // b = u × a (unit, as u and a are unit and square).
    const bx = uy * az - uz * ay;
    const by = uz * ax - ux * az;
    const bz = ux * ay - uy * ax;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const ca = Math.cos(round) * s;
    const cb = Math.sin(round) * s;
    nx = ux * c + ax * ca + bx * cb;
    ny = uy * c + ay * ca + by * cb;
    nz = uz * c + az * ca + bz * cb;
  }
  const out = speed * kept;
  v.x = nx * out;
  v.y = ny * out;
  v.z = nz * out;
}
