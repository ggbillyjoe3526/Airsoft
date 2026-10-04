import type { HitConfig } from '../config/hits';
import { PHYSICS } from '../config/physics';
import { RANGE, type RangeTargetKind, rangeLayout } from '../config/range';
import type { Armament } from './armament';
import { rayCapsule, type VerticalCapsule } from './hitbox';
import { type Vec3, vec3 } from './vec';

/**
 * Practice range targets (M21): steel plates that ring when hit and cut-out figures that go down when hit and stand up
 * again. Plain data in GameState.targets (empty in a match); BBs test against them in stepBBs, and the range steps
 * them here.
 */
export interface RangeTarget {
  id: number;
  kind: RangeTargetKind;
  /** Steel: the plate's centre. Figures: where the feet are. */
  position: Vec3;
  /** Figures: crouched (the hit volume's crouched shape). */
  crouched: boolean;
  /** Distance from the firing line (m), for the readout. */
  distance: number;
  /** For the readout: "Steel", "Figure" … */
  label: string;
  /** Seconds until a figure that was hit stands up again (0: standing, and hittable). Steel never goes down. */
  down: number;
}

/** The range's targets, laid out from config/range.ts. */
export function createRangeTargets(): RangeTarget[] {
  return rangeLayout().map(({ lane, distance, x }, id) => ({
    id,
    kind: lane.kind,
    position: lane.kind === 'steel' ? vec3(x, RANGE.plateHeight, -distance) : vec3(x, 0, -distance),
    crouched: lane.crouched === true,
    distance,
    label: lane.label,
    down: 0,
  }));
}

const body: VerticalCapsule = { x: 0, z: 0, y0: 0, y1: 0, r: 0 };
const head: VerticalCapsule = { x: 0, z: 0, y0: 0, y1: 0, r: 0 };

/**
 * Distance along the unit ray `o + t·d` (0 ≤ t ≤ maxT) to where it meets the target, or -1. A steel plate is a disc
 * facing the firing line (+z), hit only from the front; a figure is a player's hit volume (config/hits.ts), standing
 * or crouched, without the lean. A figure that's down can't be hit.
 */
export function rayRangeTarget(o: Vec3, d: Vec3, maxT: number, target: RangeTarget, hits: HitConfig): number {
  const p = target.position;
  if (target.kind === 'steel') {
    if (d.z >= 0 || o.z < p.z) return -1;
    const t = (p.z - o.z) / d.z;
    if (t < 0 || t > maxT) return -1;
    const x = o.x + d.x * t - p.x;
    const y = o.y + d.y * t - p.y;
    return x * x + y * y <= RANGE.plateRadius * RANGE.plateRadius ? t : -1;
  }
  if (target.down > 0) return -1;
  const drop = target.crouched ? hits.crouchDrop : 0;
  // Measured from where a character standing on that floor rests (PHYSICS.groundRestGap up, as characterHitVolume
  // does), so a hit on the range is a hit in a match to the centimetre (audit SIM-12).
  const base = p.y + PHYSICS.groundRestGap;
  body.x = head.x = p.x;
  body.z = head.z = p.z;
  body.r = hits.bodyRadius;
  body.y0 = base + hits.bodyBottom + hits.bodyRadius;
  body.y1 = base + hits.bodyTop - drop - hits.bodyRadius;
  head.r = hits.headRadius;
  head.y0 = head.y1 = base + hits.headHeight - drop;
  const b = rayCapsule(o, d, maxT, body);
  const h = rayCapsule(o, d, b >= 0 ? b : maxT, head);
  return h >= 0 ? h : b;
}

const post: VerticalCapsule = { x: 0, z: 0, y0: 0, y1: 0, r: 0 };

/** Distance along the unit ray to a steel plate's post (from the floor to its hanger, just behind the plate), or -1. */
export function rayRangePost(o: Vec3, d: Vec3, maxT: number, target: RangeTarget): number {
  if (target.kind !== 'steel') return -1;
  post.x = target.position.x;
  post.z = target.position.z - RANGE.postBehind;
  post.r = RANGE.postWidth / 2;
  post.y0 = post.r;
  post.y1 = target.position.y + RANGE.plateRadius + RANGE.postAbovePlate - post.r;
  return rayCapsule(o, d, maxT, post);
}

/** What a BB's path meets first among the range's targets. */
export interface RangeTargetHit {
  /** Index in `targets`, or -1 for none. */
  index: number;
  /** Distance along the ray (maxT when nothing is hit). */
  at: number;
  /** It met a plate's post, not the target itself: the BB stops there, a miss. */
  post: boolean;
}

/** The nearest target (or plate post) along the ray within `maxT`. */
export function firstRangeTargetHit(o: Vec3, d: Vec3, maxT: number, targets: readonly RangeTarget[], hits: HitConfig, out: RangeTargetHit): void {
  out.index = -1;
  out.at = maxT;
  out.post = false;
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!;
    const t = rayRangeTarget(o, d, out.at, target, hits);
    if (t >= 0 && t <= out.at) {
      out.index = i;
      out.at = t;
      out.post = false;
    }
    const p = rayRangePost(o, d, out.at, target);
    if (p >= 0 && p < out.at) {
      out.index = i;
      out.at = p;
      out.post = true;
    }
  }
}

/** A BB reached `target`: a figure goes down for RANGE.figureDownTime; steel just rings (presentation). */
export function hitRangeTarget(target: RangeTarget): void {
  if (target.kind === 'figure') target.down = RANGE.figureDownTime;
}

/** One tick on the range: figures that are down get closer to standing up. */
export function stepRangeTargets(targets: RangeTarget[], dt: number): void {
  for (const t of targets) if (t.down > 0) t.down = Math.max(0, t.down - dt);
}

/** On the range the spare magazines are always full (a range officer keeps topping them up); you still reload. */
export function refillSpares(a: Armament): void {
  for (let i = 0; i < a.ammo.length; i++) {
    const size = a.handling[i]!.magSize;
    const pouch = a.ammo[i]!.pouch;
    for (let m = 0; m < pouch.length; m++) pouch[m] = size;
  }
}
