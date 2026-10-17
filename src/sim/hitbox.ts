import type { FigureLegs, HitConfig } from '../config/hits';
import type { Character } from './character';
import { BODY_POINT, BODY_ROLLED, BODY_SAMPLE, figureBodyPose } from './figureBody';
import { figureLegCycleStep, figureLegPose, LEG_POINT, LEG_POINTS, LEG_SAMPLE } from './figureLegs';
import { copy, type Vec3, vec3 } from './vec';

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
 * A character's hit volume, matching the drawn figure on every pose (M85; render/figures/figureHitVolume.test.ts measures it):
 * the `head` (a sphere, stored as a capsule with y0 = y1) and `parts`, capsules along segments: the chest (hips to
 * shoulders, PART.chest), the hips as two side by side (an oval: they're narrower front to back than across), and each
 * leg's thigh, shin and boot. The head, chest and hips roll with a lean about the hip pivot (sim/lean.ts), as the drawn
 * upper body does, so only what pokes out past cover can be hit; the legs stay put, hang from the hips (squashed
 * towards them by a crouch, as the drawn legs are) and swing on the walk cycle (legSwing). In a match that draws the
 * rigged figures (every match since BD1, unless their files can't be loaded) the legs sit on those figures' leg joints
 * (HitConfig.figureLegs, sim/figureLegs.ts; IM8) and the head, chest (two side by side), shoulders and hips on each
 * figure's own upper body (HitConfig.figureBodies, sim/figureBody.ts; HV1), the hips not rolled by a peek, as the
 * figure's aren't (render/figures/riggedHitVolume.test.ts measures it). The built-in figures have no second chest or shoulders
 * (radius 0: not there). Arms and replicas aren't part of it (owner, DECISIONS 2026-10-01).
 * `bound` holds all of it: a ray that misses the bound misses everything.
 */
export interface HitVolume {
  head: VerticalCapsule;
  parts: SegmentCapsule[];
  bound: VerticalCapsule;
}

/** Where each part sits in HitVolume.parts. */
export const PART = { chest: 0, chestR: 1, shoulders: 2, hipL: 3, hipR: 4, thighL: 5, shinL: 6, bootL: 7, thighR: 8, shinR: 9, bootR: 10, count: 11 } as const;

const capsule = (): VerticalCapsule => ({ x: 0, z: 0, y0: 0, y1: 0, r: 0 });
const segment = (): SegmentCapsule => ({ ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 0 });

export function createHitVolume(): HitVolume {
  const parts: SegmentCapsule[] = [];
  for (let i = 0; i < PART.count; i++) parts.push(segment());
  return { head: capsule(), parts, bound: capsule() };
}

/**
 * The legs' swing right now (radians; the left leg's, the right swings the other way): the walk cycle's (`cycle`), while
 * moving faster than HITS.legs.walkingSpeed, else 0. The drawn legs use it with the cycle interpolated between ticks.
 */
export function legSwing(cycle: number, c: Character, cfg: HitConfig): number {
  const L = cfg.legs;
  return Math.hypot(c.velocity.x, c.velocity.z) > L.walkingSpeed ? Math.sin(cycle) * L.swing : 0;
}

/**
 * Moves the walk cycle on by the ground covered since last tick (c.prevPosition); a jump of more than
 * HITS.legs.maxStride (a respawn, a move to the dead zone) is no step. Call once a tick, after the movement step (the
 * simulation records prevWalkCycle with the other previous-tick values).
 */
export function stepWalkCycle(c: Character, cfg: HitConfig): void {
  const moved = Math.hypot(c.position.x - c.prevPosition.x, c.position.z - c.prevPosition.z);
  if (moved >= cfg.legs.maxStride) return;
  // Never wrapped, so the drawn legs can interpolate from last tick's (a double keeps its precision for any match).
  // With the rigged figures' legs, at their clips' strides (sim/figureLegs.ts).
  c.walkCycle += cfg.figureLegs ? figureLegCycleStep(c, cfg.figureLegs, moved) : moved * cfg.legs.stridesPerMetre * Math.PI * 2;
}

/** The pose a volume is being built for (characterHitVolume): the figure's frame and its lean. */
const frame = { px: 0, py: 0, pz: 0, cosYaw: 1, sinYaw: 0, cosRoll: 1, sinRoll: 0, pivot: 0 };

/** Figure-frame point (x right, y up from the feet, z forward-negative) into world space, turned by the yaw. */
function place(x: number, y: number, z: number, out: Vec3): Vec3 {
  out.x = frame.px + x * frame.cosYaw + z * frame.sinYaw;
  out.y = frame.py + y;
  out.z = frame.pz - x * frame.sinYaw + z * frame.cosYaw;
  return out;
}

/** An upper-body point (figure frame, crouch already taken off its height) rolled by the lean about the hip pivot, placed. */
function upper(x: number, y: number, out: Vec3): Vec3 {
  const h = y - frame.pivot;
  return place(x * frame.cosRoll + h * frame.sinRoll, frame.pivot + h * frame.cosRoll - x * frame.sinRoll, 0, out);
}

/**
 * A leg's point (`y` up from the hip pivot, `z` forward-negative, in the leg's own frame), posed as the drawn leg is:
 * squashed by `squash` towards the hip, swung by `swing` about it, at the hip (`hx` across, `hipY` up), placed.
 */
function leg(y: number, z: number, squash: number, swing: number, hx: number, hipY: number, out: Vec3): Vec3 {
  const sy = y * squash;
  const cs = Math.cos(swing);
  const sn = Math.sin(swing);
  return place(hx, hipY + sy * cs - z * sn, sy * sn + z * cs, out);
}

const pa = vec3();
const pb = vec3();
/** The rigged figures' legs this tick (sim/figureLegs.ts figureLegPose), when the hit rules carry them. */
const legPoints = new Float32Array(LEG_SAMPLE);
/** A rigged figure's upper body this tick (sim/figureBody.ts figureBodyPose), when the hit rules carry them. */
const bodyPoints = new Float32Array(BODY_SAMPLE);

/** Point `point` (BODY_POINT) of bodyPoints, rolled by the peek about the hip pivot unless it is the hips', placed. */
function bodyPoint(point: number, out: Vec3): Vec3 {
  const k = point * 3;
  const x = bodyPoints[k]!;
  const y = bodyPoints[k + 1]!;
  const z = bodyPoints[k + 2]!;
  if (point >= BODY_ROLLED) return place(x, y, z, out);
  const h = y - frame.pivot;
  return place(x * frame.cosRoll + h * frame.sinRoll, frame.pivot + h * frame.cosRoll - x * frame.sinRoll, z, out);
}

/** Point `point` (LEG_POINT) of leg `side` (0 left, 1 right) of legPoints, placed. */
function legPoint(side: number, point: number, out: Vec3): Vec3 {
  const k = (side * LEG_POINTS + point) * 3;
  return place(legPoints[k]!, legPoints[k + 1]!, legPoints[k + 2]!, out);
}

function setSegment(s: SegmentCapsule, r: number): void {
  s.ax = pa.x;
  s.ay = pa.y;
  s.az = pa.z;
  s.bx = pb.x;
  s.by = pb.y;
  s.bz = pb.z;
  s.r = r;
}

/** The legs' parts on the rigged figures' leg joints (IM8), with these radii. */
function figureLegParts(c: Character, legs: FigureLegs, parts: SegmentCapsule[], thigh: number, shin: number, boot: number): void {
  figureLegPose(c, legs, legPoints);
  for (let side = 0; side < 2; side++) {
    const first = side === 0 ? PART.thighL : PART.thighR;
    legPoint(side, LEG_POINT.hip, pa);
    legPoint(side, LEG_POINT.knee, pb);
    setSegment(parts[first]!, thigh);
    copy(pa, pb);
    legPoint(side, LEG_POINT.ankle, pb);
    setSegment(parts[first + 1]!, shin);
    legPoint(side, LEG_POINT.heel, pa);
    legPoint(side, LEG_POINT.toe, pb);
    setSegment(parts[first + 2]!, boot);
  }
}

/** Writes the character's current hit volume (see HitVolume) into `v`. */
export function characterHitVolume(c: Character, cfg: HitConfig, v: HitVolume): void {
  const drop = cfg.crouchDrop * c.crouchAmount;
  const roll = c.lean * cfg.lean.maxAngle;
  frame.px = c.position.x;
  frame.py = c.position.y;
  frame.pz = c.position.z;
  frame.cosYaw = Math.cos(c.yaw);
  frame.sinYaw = Math.sin(c.yaw);
  frame.cosRoll = Math.cos(roll);
  frame.sinRoll = Math.sin(roll);
  frame.pivot = cfg.lean.pivotHeight - drop;
  const parts = v.parts;

  const body = cfg.figureLegs && cfg.figureBodies ? (cfg.figureBodies[c.figure] ?? cfg.figureBodies[0]) : undefined;
  if (body && cfg.figureLegs) {
    figureBodyPose(c, cfg.figureLegs, body, bodyPoints);
    const S = body.shape;
    const P = BODY_POINT;
    bodyPoint(P.head, pa);
    const head = v.head;
    head.x = pa.x;
    head.z = pa.z;
    head.y0 = head.y1 = pa.y;
    head.r = S.head.radius;
    bodyPoint(P.chestBottomL, pa);
    bodyPoint(P.chestTopL, pb);
    setSegment(parts[PART.chest]!, S.chest.radius);
    bodyPoint(P.chestBottomR, pa);
    bodyPoint(P.chestTopR, pb);
    setSegment(parts[PART.chestR]!, S.chest.radius);
    bodyPoint(P.shoulderL, pa);
    bodyPoint(P.shoulderR, pb);
    setSegment(parts[PART.shoulders]!, S.shoulders.radius);
    bodyPoint(P.hipBottomL, pa);
    bodyPoint(P.hipTopL, pb);
    setSegment(parts[PART.hipL]!, S.hips.radius);
    bodyPoint(P.hipBottomR, pa);
    bodyPoint(P.hipTopR, pb);
    setSegment(parts[PART.hipR]!, S.hips.radius);
    figureLegParts(c, cfg.figureLegs, parts, S.legs.thigh, S.legs.shin, S.legs.boot);
    boundHitVolume(v);
    return;
  }

  upper(0, cfg.headHeight - drop, pa);
  const head = v.head;
  head.x = pa.x;
  head.z = pa.z;
  head.y0 = head.y1 = pa.y;
  head.r = cfg.headRadius;

  upper(0, cfg.torsoBottom - drop, pa);
  upper(0, cfg.torsoTop - drop, pb);
  setSegment(parts[PART.chest]!, cfg.bodyRadius);
  // The built-in figures have no second chest or shoulders: radius 0, never hit and out of the bound.
  setSegment(parts[PART.chestR]!, 0);
  setSegment(parts[PART.shoulders]!, 0);
  const H = cfg.hips;
  for (let side = -1; side <= 1; side += 2) {
    upper(side * H.halfWidth, H.bottom - drop, pa);
    upper(side * H.halfWidth, H.top - drop, pb);
    setSegment(parts[side < 0 ? PART.hipL : PART.hipR]!, H.radius);
  }

  const L = cfg.legs;
  if (cfg.figureLegs) {
    figureLegParts(c, cfg.figureLegs, parts, L.thighRadius, L.shinRadius, L.boot.radius);
    boundHitVolume(v);
    return;
  }
  const hipY = frame.pivot;
  const squash = hipY / cfg.lean.pivotHeight;
  const swing = legSwing(c.walkCycle, c, cfg);
  for (let side = -1; side <= 1; side += 2) {
    const hx = side * L.hipSpread;
    // The left leg swings forward as the right goes back (the drawn legs: legL.rotation.x = swing, legR = -swing).
    const a = side < 0 ? swing : -swing;
    const first = side < 0 ? PART.thighL : PART.thighR;
    leg(L.hipLift, 0, squash, a, hx, hipY, pa);
    leg(-L.knee, L.kneeZ, squash, a, hx, hipY, pb);
    setSegment(parts[first]!, L.thighRadius);
    copy(pa, pb);
    leg(-L.ankle, 0, squash, a, hx, hipY, pb);
    setSegment(parts[first + 1]!, L.shinRadius);
    leg(-L.boot.drop, L.boot.heel, squash, a, hx, hipY, pa);
    leg(-L.boot.drop, L.boot.toe, squash, a, hx, hipY, pb);
    setSegment(parts[first + 2]!, L.boot.radius);
  }
  boundHitVolume(v);
}

/** The bound being grown by boundHitVolume: its axis, the reach out from it, and the lowest and highest point. */
const grow = { x: 0, z: 0, reach: 0, lo: 0, hi: 0 };

function growBound(cx: number, cy: number, cz: number, r: number): void {
  const d = Math.hypot(cx - grow.x, cz - grow.z) + r;
  if (d > grow.reach) grow.reach = d;
  if (cy - r < grow.lo) grow.lo = cy - r;
  if (cy + r > grow.hi) grow.hi = cy + r;
}

/**
 * Sets `v.bound` round everything else in `v`: a vertical capsule on the feet's axis whose spheres sit at the lowest
 * and highest point, so it holds the whole cylinder `reach` round the axis between them (a segment capsule lies within
 * its two end spheres).
 */
function boundHitVolume(v: HitVolume): void {
  grow.x = frame.px;
  grow.z = frame.pz;
  grow.reach = 0;
  grow.lo = Number.POSITIVE_INFINITY;
  grow.hi = Number.NEGATIVE_INFINITY;
  growBound(v.head.x, v.head.y0, v.head.z, v.head.r);
  for (const s of v.parts) {
    if (s.r <= 0) continue;
    growBound(s.ax, s.ay, s.az, s.r);
    growBound(s.bx, s.by, s.bz, s.r);
  }
  const b = v.bound;
  b.x = grow.x;
  b.z = grow.z;
  b.r = grow.reach;
  b.y0 = grow.lo;
  b.y1 = grow.hi;
}

/** Widens every part of `v` by `margin` (bots' line-of-fire check: a margin round a teammate). Negative narrows it. */
export function inflateHitVolume(v: HitVolume, margin: number): void {
  v.head.r = Math.max(0, v.head.r + margin);
  // A part that isn't there (radius 0) stays away.
  for (const s of v.parts) if (s.r > 0) s.r = Math.max(0, s.r + margin);
  v.bound.r = Math.max(0, v.bound.r + margin);
}

/** Moves all of `v` by (dx, dz) (bots' line-of-fire check: where a teammate may be when the BBs pass them). */
export function shiftHitVolume(v: HitVolume, dx: number, dz: number): void {
  v.head.x += dx;
  v.head.z += dz;
  v.bound.x += dx;
  v.bound.z += dz;
  for (const s of v.parts) {
    s.ax += dx;
    s.bx += dx;
    s.az += dz;
    s.bz += dz;
  }
}

/** Distance along the unit ray to the character's hit volume (≤ maxT), or -1 if it misses. */
export function rayCharacter(o: Vec3, d: Vec3, maxT: number, v: HitVolume): number {
  if (rayCapsule(o, d, maxT, v.bound) < 0) return -1;
  let nearest = rayCapsule(o, d, maxT, v.head);
  for (const s of v.parts) {
    if (s.r <= 0) continue;
    const t = raySegmentCapsule(o, d, nearest >= 0 ? nearest : maxT, s);
    if (t >= 0) nearest = t;
  }
  return nearest;
}
