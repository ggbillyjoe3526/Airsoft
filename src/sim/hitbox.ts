import type { HitConfig } from '../config/hits';
import type { Character } from './character';
import { leanOffset } from './lean';
import { type Vec3, vec3 } from './vec';

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

/**
 * A capsule along any segment: from (ax, ay, az) to (bx, by, bz) (sphere centres), radius r. A radius of 0 means
 * "not there" (rayCharacter skips it).
 */
export interface SegmentCapsule {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  r: number;
}

/**
 * Distance along the unit ray `o + t·d` (0 ≤ t ≤ maxT) to where it first touches a segment capsule, or -1 if it
 * doesn't. A ray starting inside hits at t = 0. Same scheme as rayCapsule: the side of the finite cylinder, then
 * the two end spheres.
 */
export function raySegmentCapsule(o: Vec3, d: Vec3, maxT: number, cap: SegmentCapsule): number {
  const ux = cap.bx - cap.ax;
  const uy = cap.by - cap.ay;
  const uz = cap.bz - cap.az;
  const len2 = ux * ux + uy * uy + uz * uz;
  const ox = o.x - cap.ax;
  const oy = o.y - cap.ay;
  const oz = o.z - cap.az;
  const r2 = cap.r * cap.r;
  // Start inside: the closest point of the segment to `o` is within r.
  const s0 = len2 > 1e-12 ? Math.max(0, Math.min(1, (ox * ux + oy * uy + oz * uz) / len2)) : 0;
  const ix = ox - ux * s0;
  const iy = oy - uy * s0;
  const iz = oz - uz * s0;
  if (ix * ix + iy * iy + iz * iz <= r2) return 0;

  let best = Number.POSITIVE_INFINITY;
  if (len2 > 1e-12) {
    // Cylinder side: the parts of `o` and `d` across the axis (scaled by len2 to avoid a square root).
    const du = d.x * ux + d.y * uy + d.z * uz;
    const ou = ox * ux + oy * uy + oz * uz;
    const a = len2 - du * du;
    if (a > 1e-12) {
      const b = len2 * (ox * d.x + oy * d.y + oz * d.z) - ou * du;
      const c = len2 * (ox * ox + oy * oy + oz * oz) - ou * ou - r2 * len2;
      const disc = b * b - a * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / a;
        const along = ou + du * t;
        if (t >= 0 && along >= 0 && along <= len2) best = t;
      }
    }
  }

  const t0 = raySphere(o, d, cap.ax, cap.ay, cap.az, cap.r);
  if (t0 >= 0 && t0 < best) best = t0;
  const t1 = raySphere(o, d, cap.bx, cap.by, cap.bz, cap.r);
  if (t1 >= 0 && t1 < best) best = t1;

  return best <= maxT ? best : -1;
}

/** Top of a character's hit volume (top of the head) above its feet for a crouch amount (0..1). */
export function hitTop(crouchAmount: number, cfg: HitConfig): number {
  return cfg.headHeight + cfg.headRadius - cfg.crouchDrop * crouchAmount;
}

/**
 * A character's hit volume: `body` (boots to shoulders), `head` (a sphere, stored as a capsule with
 * y0 = y1) and `shoulder` (a sphere at the top of the body). Upright, the shoulder sphere sits inside the
 * body; leaning, the head and shoulder swing out with the upper body (sim/lean.ts) while the body's top
 * comes down towards the hips, so only what pokes out past cover can be hit, and `torso` (a capsule from the
 * hips to the shoulder sphere, as wide as the body) covers the tilted upper body in between. Upright, `torso`
 * has radius 0 (the body already covers it).
 */
export interface HitVolume {
  body: VerticalCapsule;
  head: VerticalCapsule;
  shoulder: VerticalCapsule;
  torso: SegmentCapsule;
}

const capsule = (): VerticalCapsule => ({ x: 0, z: 0, y0: 0, y1: 0, r: 0 });

export function createHitVolume(): HitVolume {
  return { body: capsule(), head: capsule(), shoulder: capsule(), torso: { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 0 } };
}

const offset = vec3();

/** Writes the character's current hit volume (see HitVolume) into `v`. */
export function characterHitVolume(c: Character, cfg: HitConfig, v: HitVolume): void {
  const drop = cfg.crouchDrop * c.crouchAmount;
  const p = c.position;
  const lean = Math.abs(c.lean);
  const { body, head, shoulder, torso } = v;
  body.x = p.x;
  body.z = p.z;
  body.r = cfg.bodyRadius;
  body.y0 = p.y + cfg.bodyBottom + cfg.bodyRadius;
  // Leaning, the body capsule's top comes down from the shoulders to the hips; the shoulder sphere and the
  // torso capsule (hips to shoulder sphere) cover the tilted upper body.
  const top = cfg.bodyTop - drop - cfg.bodyRadius;
  const hips = cfg.lean.pivotHeight - drop;
  body.y1 = p.y + Math.max(cfg.bodyBottom + cfg.bodyRadius, top - (top - hips) * lean);

  leanOffset(top, c.lean, c.crouchAmount, c.yaw, cfg, offset);
  shoulder.x = p.x + offset.x;
  shoulder.z = p.z + offset.z;
  shoulder.y0 = shoulder.y1 = p.y + top + offset.y;
  shoulder.r = cfg.bodyRadius;

  // The hip point doesn't move with the lean (leanOffset is zero at the pivot).
  torso.ax = p.x;
  torso.ay = p.y + hips;
  torso.az = p.z;
  torso.bx = shoulder.x;
  torso.by = shoulder.y0;
  torso.bz = shoulder.z;
  torso.r = lean > 0 ? cfg.bodyRadius : 0;

  const headHeight = cfg.headHeight - drop;
  leanOffset(headHeight, c.lean, c.crouchAmount, c.yaw, cfg, offset);
  head.x = p.x + offset.x;
  head.z = p.z + offset.z;
  head.y0 = head.y1 = p.y + headHeight + offset.y;
  head.r = cfg.headRadius;
}

/** Distance along the unit ray to the character's hit volume (≤ maxT), or -1 if it misses. */
export function rayCharacter(o: Vec3, d: Vec3, maxT: number, v: HitVolume): number {
  const body = rayCapsule(o, d, maxT, v.body);
  const shoulder = rayCapsule(o, d, body >= 0 ? body : maxT, v.shoulder);
  let nearest = shoulder >= 0 ? shoulder : body;
  if (v.torso.r > 0) {
    const torso = raySegmentCapsule(o, d, nearest >= 0 ? nearest : maxT, v.torso);
    if (torso >= 0) nearest = torso;
  }
  const head = rayCapsule(o, d, nearest >= 0 ? nearest : maxT, v.head);
  return head >= 0 ? head : nearest;
}
