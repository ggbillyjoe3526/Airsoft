import type { HitConfig } from '../config/hits';
import type { Character } from './character';
import type { Vec3 } from './vec';

/** An upright capsule: vertical axis at (x, z) from y0 to y1 (sphere centres), radius r. */
export interface VerticalCapsule {
  x: number;
  z: number;
  y0: number;
  y1: number;
  r: number;
}

/**
 * Distance along the unit ray `o + t·d` to where it enters a sphere, or -1 if it misses. A ray that
 * starts inside counts as entering at t = 0.
 */
function raySphere(o: Vec3, d: Vec3, cx: number, cy: number, cz: number, r: number): number {
  const ox = o.x - cx;
  const oy = o.y - cy;
  const oz = o.z - cz;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  if (c <= 0) return 0;
  const b = ox * d.x + oy * d.y + oz * d.z;
  if (b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  return -b - Math.sqrt(disc);
}

/**
 * Distance along the unit ray `o + t·d` (0 ≤ t ≤ maxT) to where it first touches the capsule, or -1 if
 * it doesn't. A ray starting inside the capsule hits at t = 0.
 */
export function rayCapsule(o: Vec3, d: Vec3, maxT: number, cap: VerticalCapsule): number {
  let best = Number.POSITIVE_INFINITY;

  // Cylinder side: solve in the horizontal plane, then check the height.
  const ox = o.x - cap.x;
  const oz = o.z - cap.z;
  const a = d.x * d.x + d.z * d.z;
  const c = ox * ox + oz * oz - cap.r * cap.r;
  if (c <= 0 && o.y >= cap.y0 && o.y <= cap.y1) return 0;
  if (a > 1e-12) {
    const b = ox * d.x + oz * d.z;
    const disc = b * b - a * c;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / a;
      if (t >= 0) {
        const y = o.y + d.y * t;
        if (y >= cap.y0 && y <= cap.y1) best = t;
      }
    }
  }

  // End caps.
  const t0 = raySphere(o, d, cap.x, cap.y0, cap.z, cap.r);
  if (t0 >= 0 && t0 < best) best = t0;
  const t1 = raySphere(o, d, cap.x, cap.y1, cap.z, cap.r);
  if (t1 >= 0 && t1 < best) best = t1;

  return best <= maxT ? best : -1;
}

/** Top of a character's hit volume (top of the head) above its feet for a crouch amount (0..1). */
export function hitTop(crouchAmount: number, cfg: HitConfig): number {
  return cfg.headHeight + cfg.headRadius - cfg.crouchDrop * crouchAmount;
}

/**
 * Writes the character's current hit volume: `body` (boots to shoulders) and `head` (a sphere, stored
 * as a capsule with y0 = y1).
 */
export function characterHitVolume(c: Character, cfg: HitConfig, body: VerticalCapsule, head: VerticalCapsule): void {
  const drop = cfg.crouchDrop * c.crouchAmount;
  body.x = head.x = c.position.x;
  body.z = head.z = c.position.z;
  body.r = cfg.bodyRadius;
  body.y0 = c.position.y + cfg.bodyBottom + cfg.bodyRadius;
  body.y1 = c.position.y + cfg.bodyTop - drop - cfg.bodyRadius;
  head.r = cfg.headRadius;
  head.y0 = head.y1 = c.position.y + cfg.headHeight - drop;
}

/** Distance along the unit ray to the character's hit volume (≤ maxT), or -1 if it misses. */
export function rayCharacter(o: Vec3, d: Vec3, maxT: number, body: VerticalCapsule, head: VerticalCapsule): number {
  const tb = rayCapsule(o, d, maxT, body);
  const th = rayCapsule(o, d, tb >= 0 ? tb : maxT, head);
  return th >= 0 ? th : tb;
}
