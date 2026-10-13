import type { HitConfig } from '../config/hits';
import { PHYSICS } from '../config/physics';
import { PRACTICE_SPOTS } from '../config/practice';
import { RANGE, type RangeTargetKind, rangeLayout } from '../config/range';
import type { Armament } from './armament';
import { rayCapsule, type VerticalCapsule } from './hitbox';
import { type Vec3, vec3 } from './vec';

/**
 * Practice range targets (M21): steel plates that ring when hit and cut-out figures that go down when hit and stand up
 * again. Plain data in GameState.targets (empty in a match); BBs test against them in stepBBs, and the range steps
 * them here. On the range they face its firing line; in Practice on a map (M94) they stand where bots would play,
 * facing your end of it.
 */
export interface RangeTarget {
  id: number;
  kind: RangeTargetKind;
  /** Steel: the plate's centre. Figures: where the feet are. */
  position: Vec3;
  /** The floor it stands on (m): 0 on the range; a map's floor or ground under it (M94). */
  floor: number;
  /**
   * The way its face points, a unit vector on the floor (x, z): +z, towards the range's firing line, on the range (M94).
   * A steel plate is hit only from that side; a figure's hit volume is a player's, round, so any side counts.
   */
  face: { x: number; z: number };
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
    floor: 0,
    face: { x: 0, z: 1 },
    crouched: lane.crouched === true,
    distance,
    label: lane.label,
    down: 0,
  }));
}

/** Where a target stands on a map (M94, map/practiceSpots.ts): its feet, the way it faces, and what it is. */
export interface TargetSpot {
  /** Where its feet are, on the floor. */
  position: Vec3;
  /** The way it faces (a unit vector on the floor). */
  face: { x: number; z: number };
  /** A figure crouched behind low cover. */
  crouched: boolean;
  /** A steel plate (else a figure). */
  steel: boolean;
  /** How far it is from your start across the map (m). */
  fromStart: number;
}

/** Practice on a map (M94): a target at each spot, numbered in the spots' order, a plate at chest height over its floor. */
export function targetsAtSpots(spots: readonly TargetSpot[]): RangeTarget[] {
  const labels = PRACTICE_SPOTS.labels;
  return spots.map((s, id) => ({
    id,
    kind: s.steel ? 'steel' : 'figure',
    position: vec3(s.position.x, s.position.y + (s.steel ? RANGE.plateHeight : 0), s.position.z),
    floor: s.position.y,
    face: { x: s.face.x, z: s.face.z },
    crouched: s.crouched,
    distance: Math.round(s.fromStart),
    label: s.steel ? labels.steel : s.crouched ? labels.crouched : labels.figure,
    down: 0,
  }));
}

const body: VerticalCapsule = { x: 0, z: 0, y0: 0, y1: 0, r: 0 };
const head: VerticalCapsule = { x: 0, z: 0, y0: 0, y1: 0, r: 0 };

/**
 * Distance along the unit ray `o + t·d` (0 ≤ t ≤ maxT) to where it meets the target, or -1. A steel plate is a disc
 * facing its `face` (+z, the firing line, on the range), hit only from the front; a figure is a player's hit volume
 * (config/hits.ts), standing or crouched, without the lean. A figure that's down can't be hit.
 */
export function rayRangeTarget(o: Vec3, d: Vec3, maxT: number, target: RangeTarget, hits: HitConfig): number {
  const p = target.position;
  if (target.kind === 'steel') {
    // In the plate's own frame: `n` out of its face, `u` across it (x on the range), and up.
    const nx = target.face.x;
    const nz = target.face.z;
    const along = d.x * nx + d.z * nz;
    const before = (o.x - p.x) * nx + (o.z - p.z) * nz;
    if (along >= 0 || before < 0) return -1;
    const t = -before / along;
    if (t < 0 || t > maxT) return -1;
    const u = (o.x + d.x * t - p.x) * nz - (o.z + d.z * t - p.z) * nx;
    const y = o.y + d.y * t - p.y;
    return u * u + y * y <= RANGE.plateRadius * RANGE.plateRadius ? t : -1;
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
function rayRangePost(o: Vec3, d: Vec3, maxT: number, target: RangeTarget): number {
  if (target.kind !== 'steel') return -1;
  post.x = target.position.x - target.face.x * RANGE.postBehind;
  post.z = target.position.z - target.face.z * RANGE.postBehind;
  post.r = RANGE.postWidth / 2;
  post.y0 = target.floor + post.r;
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
