import type { RicochetConfig } from '../config/ballistics';
import type { SurfaceHit } from './armament';
import type { BB } from './ballistics';
import { type RngState, rngNext } from './rng';
import { length3 } from './vec';

/**
 * A BB in flight meets a surface (`hit`) at its current position: bounces it off if the surface is hard enough and the
 * bounce is fast enough (M20). The part of the velocity into the surface comes back scaled by the material's
 * restitution, the part along it by `slide`, the direction scatters a little and the hop-up's backspin is lost. Returns
 * false if the BB stops there instead (soft material, too slow, or out of bounces); the caller then retires it.
 * Pure apart from `rng` (the simulation's seeded stream; without one the bounce doesn't scatter).
 */
export function ricochet(bb: BB, hit: SurfaceHit, cfg: RicochetConfig, rng?: RngState): boolean {
  const e = cfg.restitution[hit.material];
  if (!(e > 0) || bb.bounces >= cfg.maxBounces) return false;
  const v = bb.velocity;
  const n = hit.normal;
  const into = v.x * n.x + v.y * n.y + v.z * n.z;
  if (into >= 0) return false; // grazing the back of a face: nothing to bounce off
  // Along the surface (friction), plus the bounce back out.
  let x = (v.x - into * n.x) * cfg.slide - into * e * n.x;
  let y = (v.y - into * n.y) * cfg.slide - into * e * n.y;
  let z = (v.z - into * n.z) * cfg.slide - into * e * n.z;
  const speed = length3(x, y, z);
  if (speed < cfg.minSpeed) return false;
  // Scatter, then keep the speed and make sure it still leaves the surface.
  if (rng) {
    x += (rngNext(rng) * 2 - 1) * cfg.scatter * speed;
    y += (rngNext(rng) * 2 - 1) * cfg.scatter * speed;
    z += (rngNext(rng) * 2 - 1) * cfg.scatter * speed;
  }
  const out = x * n.x + y * n.y + z * n.z;
  if (out <= 0) {
    // Scattered back into the surface: mirror that part out again.
    x -= 2 * out * n.x;
    y -= 2 * out * n.y;
    z -= 2 * out * n.z;
  }
  const k = speed / Math.max(1e-9, length3(x, y, z));
  v.x = x * k;
  v.y = y * k;
  v.z = z * k;
  bb.position.x += n.x * cfg.liftOff;
  bb.position.y += n.y * cfg.liftOff;
  bb.position.z += n.z * cfg.liftOff;
  bb.spin *= cfg.spinKept;
  bb.bounces++;
  return true;
}
