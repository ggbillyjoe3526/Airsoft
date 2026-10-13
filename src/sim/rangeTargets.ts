import type { HitConfig } from '../config/hits';
import { PHYSICS } from '../config/physics';
import { RANGE, type RangeTargetKind, type RangeTargetMotion, type RangeTargetSpec, rangeLayout } from '../config/range';
import type { Armament } from './armament';
import { rayCapsule, type VerticalCapsule } from './hitbox';
import { type RngState, rngNext } from './rng';
import { copy, type Vec3, vec3 } from './vec';

/**
 * Practice range targets (M21, M93): steel plates that ring when hit and plywood figures that go down when hit and stand
 * up again, still or moving (M93: pop-ups, movers on a track, swingers on a pendulum, small steel). Plain data in
 * GameState.targets (empty in a match); BBs test against them in stepBBs, and the range steps them here. Every target
 * faces along its own yaw, so the same kinds can stand anywhere (config/range.ts RangeTargetSpec).
 */
export interface RangeTarget {
  id: number;
  kind: RangeTargetKind;
  motion: RangeTargetMotion;
  /** Where it is now. Steel: the plate's centre. Figures: where the feet are. Movers and swingers move it every tick. */
  position: Vec3;
  /** Where it was a tick ago: it is drawn between the two. */
  prevPosition: Vec3;
  /** Where it was laid out: a mover's track middle, a swinger's plate at the bottom of its swing; else `position`. */
  home: Vec3;
  /** The ground's height under it (m): a plate's post and a swinger's frame stand on it. */
  floor: number;
  /** Which way it faces (rad about +y; 0 faces +z, the range's firing line), and the same as a flat unit vector. */
  yaw: number;
  face: { x: number; z: number };
  /** Steel: the plate's radius (m). */
  radius: number;
  /** Figures: crouched (the hit volume's crouched shape). */
  crouched: boolean;
  /** Distance from the firing line (m), for the readout. */
  distance: number;
  /** For the readout: "Steel", "Mover" … */
  label: string;
  /** Movers: half the track (m) and the trolley's speed (m/s). */
  track: number;
  speed: number;
  /** Movers and swingers: how far into the cycle it is (s), now and a tick ago. */
  clock: number;
  prevClock: number;
  /**
   * Seconds until a figure that was hit stands up again (0: standing, and hittable), the last RANGE.riseTime of it
   * rising. Steel never goes down.
   */
  down: number;
  /** How long this spell down lasts in all (s): the fall is drawn from its start. */
  downFor: number;
  /** A pop-up standing by itself: seconds before it drops again. */
  up: number;
  /** Pop-ups: stand and drop by themselves (free practice). False in the timed challenge: they stand only when lit. */
  auto: boolean;
  /** The timed challenge (M93): seconds this target stays lit (0: not lit). */
  lit: number;
  /** The timed challenge's START plate (M93). */
  start: boolean;
  /** Out of play (the START plate when the challenge isn't waiting for it): not drawn, and BBs fly through. */
  hidden: boolean;
  /** Its stoppers (targetPosts), worked out once: BBs test them every tick. */
  posts: readonly RangePost[];
}

/** One of a target's stoppers, in its own frame from its home (x across, z along its facing), standing up to `top`. */
export interface RangePost {
  x: number;
  z: number;
  top: number;
}

/** A random time in [a, b] from `rng`, or the middle without one. */
function roll(range: readonly [number, number], rng: RngState | null | undefined): number {
  return rng ? range[0] + rngNext(rng) * (range[1] - range[0]) : (range[0] + range[1]) / 2;
}

/**
 * The targets from `specs` (the range's own unless given). Pop-ups start lying down for a random time from `rng`, so they
 * don't all rise at once; the START plate starts hidden.
 */
export function createRangeTargets(specs: readonly RangeTargetSpec[] = rangeLayout(), rng: RngState | null = null): RangeTarget[] {
  return specs.map((s, id) => {
    const steel = s.kind === 'steel';
    const home = vec3(s.x, s.y, s.z);
    const t: RangeTarget = {
      id,
      kind: s.kind,
      motion: s.motion,
      position: vec3(),
      prevPosition: vec3(),
      home,
      floor: steel ? s.y - (s.start ? RANGE.start.height : RANGE.plateHeight) : s.motion === 'mover' ? s.y - RANGE.mover.trolleyHeight : s.y,
      yaw: s.yaw,
      face: { x: Math.sin(s.yaw), z: Math.cos(s.yaw) },
      radius: steel ? s.radius : 0,
      crouched: s.crouched,
      distance: s.distance,
      label: s.label,
      track: s.track,
      speed: s.speed,
      clock: s.phase,
      prevClock: s.phase,
      down: 0,
      downFor: RANGE.figureDownTime,
      up: 0,
      auto: true,
      lit: 0,
      start: s.start,
      hidden: s.start,
      posts: [],
    };
    t.posts = targetPosts(t);
    placeTarget(t);
    copy(t.prevPosition, t.position);
    if (t.motion === 'popup') {
      // Lying from the start, as if it went down a full spell ago (so it's drawn flat, not falling), for a random time.
      t.down = roll(RANGE.popup.down, rng);
      t.downFor = t.down + RANGE.figureDownTime;
    }
    return t;
  });
}

/** A mover's offset along its track from the middle (m, along its own x), `clock` seconds into its cycle. */
export function moverOffset(clock: number, track: number, speed: number): number {
  if (track <= 0 || speed <= 0) return 0;
  const dwell = RANGE.mover.dwell;
  const travel = (2 * track) / speed;
  const period = 2 * (dwell + travel);
  let u = ((clock % period) + period) % period;
  if (u < dwell) return -track;
  u -= dwell;
  if (u < travel) return -track + speed * u;
  u -= travel;
  if (u < dwell) return track;
  return track - speed * (u - dwell);
}

/** A swinger's arm angle from straight down (rad, about its own z), `clock` seconds into its swing. */
export function swingAngle(clock: number): number {
  const S = RANGE.swinger;
  return S.amplitude * Math.sin((2 * Math.PI * clock) / S.period);
}

/** Moves a mover or swinger to where its clock puts it (others stay at home). */
function placeTarget(t: RangeTarget): void {
  let lx = 0;
  let ly = 0;
  if (t.motion === 'mover') lx = moverOffset(t.clock, t.track, t.speed);
  else if (t.motion === 'swinger') {
    const a = swingAngle(t.clock);
    lx = RANGE.swinger.arm * Math.sin(a);
    ly = RANGE.swinger.arm * (1 - Math.cos(a));
  }
  // Its own x turned to the world by its yaw.
  t.position.x = t.home.x + t.face.z * lx;
  t.position.y = t.home.y + ly;
  t.position.z = t.home.z - t.face.x * lx;
}

const body: VerticalCapsule = { x: 0, z: 0, y0: 0, y1: 0, r: 0 };
const head: VerticalCapsule = { x: 0, z: 0, y0: 0, y1: 0, r: 0 };

/**
 * Distance along the unit ray `o + t·d` (0 ≤ t ≤ maxT) to where it meets the target, or -1. A steel plate is a disc
 * facing along its yaw, hit only from the front; a figure is a player's hit volume (config/hits.ts), standing or
 * crouched, without the lean. A figure that's down can't be hit, nor can a hidden target.
 */
export function rayRangeTarget(o: Vec3, d: Vec3, maxT: number, target: RangeTarget, hits: HitConfig): number {
  if (target.hidden) return -1;
  const p = target.position;
  if (target.kind === 'steel') {
    // In the plate's own frame (it faces +z there): the ray's origin from its centre, and its direction.
    const c = target.face.z;
    const s = target.face.x;
    const rx = o.x - p.x;
    const rz = o.z - p.z;
    const ox = c * rx - s * rz;
    const oz = s * rx + c * rz;
    const dx = c * d.x - s * d.z;
    const dz = s * d.x + c * d.z;
    if (dz >= 0 || oz < 0) return -1;
    const t = -oz / dz;
    if (t < 0 || t > maxT) return -1;
    const x = ox + dx * t;
    const y = o.y + d.y * t - p.y;
    return x * x + y * y <= target.radius * target.radius ? t : -1;
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

/**
 * Where a target's stoppers stand, in its own frame from its home (x across, z along its facing): a plate's post just
 * behind it, a swinger frame's two legs either side of its widest swing. Movers, pop-ups and figures have none.
 */
export function targetPosts(t: RangeTarget): RangePost[] {
  if (t.kind !== 'steel') return [];
  if (t.motion === 'swinger') {
    const S = RANGE.swinger;
    const half = S.arm * Math.sin(S.amplitude) + t.radius + S.frameClearance;
    const top = t.home.y + S.arm;
    return [-half, half].map((x) => ({ x, z: -RANGE.postBehind, top }));
  }
  return [{ x: 0, z: -RANGE.postBehind, top: t.home.y + t.radius + RANGE.postAbovePlate }];
}

const post: VerticalCapsule = { x: 0, z: 0, y0: 0, y1: 0, r: 0 };

/** Distance along the unit ray to the nearest of a target's stoppers (targetPosts, from its floor up), or -1. */
function rayRangePost(o: Vec3, d: Vec3, maxT: number, target: RangeTarget): number {
  if (target.kind !== 'steel' || target.hidden) return -1;
  let best = -1;
  let reach = maxT;
  for (const p of target.posts) {
    post.x = target.home.x + target.face.z * p.x + target.face.x * p.z;
    post.z = target.home.z - target.face.x * p.x + target.face.z * p.z;
    post.r = (target.motion === 'swinger' ? RANGE.swinger.frameWidth : RANGE.postWidth) / 2;
    post.y0 = target.floor + post.r;
    post.y1 = p.top - post.r;
    const t = rayCapsule(o, d, reach, post);
    if (t >= 0 && t <= reach) {
      best = t;
      reach = t;
    }
  }
  return best;
}

/** What a BB's path meets first among the range's targets. */
export interface RangeTargetHit {
  /** Index in `targets`, or -1 for none. */
  index: number;
  /** Distance along the ray (maxT when nothing is hit). */
  at: number;
  /** It met a plate's post (or a swinger's frame), not the target itself: the BB stops there, a miss. */
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

/** A pop-up that stands only when lit (the timed challenge) and isn't: it lies down, ready to rise. */
function held(t: RangeTarget): boolean {
  return t.motion === 'popup' && !t.auto && t.lit <= 0;
}

/**
 * A BB reached `target`: a figure goes down (a pop-up standing by itself for a random time from `rng`, any other figure
 * for RANGE.figureDownTime); steel just rings (presentation).
 */
export function hitRangeTarget(target: RangeTarget, rng?: RngState): void {
  if (target.kind !== 'figure') return;
  knockDown(target, target.motion === 'popup' && target.auto ? roll(RANGE.popup.down, rng) : RANGE.figureDownTime);
}

/** A figure goes down for `seconds` (falling first, rising at the end). */
export function knockDown(target: RangeTarget, seconds: number): void {
  target.down = target.downFor = seconds;
  target.up = 0;
}

/**
 * A figure stays down `seconds` from now: one lying keeps lying (its spell runs on from where its fall began, so it
 * isn't drawn falling again), one standing falls (knockDown).
 */
export function keepDown(target: RangeTarget, seconds: number): void {
  if (target.down <= 0) return knockDown(target, seconds);
  target.downFor += seconds - target.down;
  target.down = seconds;
}

/**
 * Whether pop-ups stand and drop by themselves (`auto`, free practice) or only when lit (the timed challenge). Turned to
 * the challenge they lie down and wait; back to free practice, each rises after a random time from `rng`.
 */
export function setPopupsAuto(targets: readonly RangeTarget[], auto: boolean, rng?: RngState): void {
  for (const t of targets) {
    if (t.motion !== 'popup' || t.auto === auto) continue;
    t.auto = auto;
    if (auto) keepDown(t, Math.max(t.down, roll(RANGE.popup.down, rng)));
    else if (t.down <= 0) knockDown(t, RANGE.figureDownTime);
  }
}

/**
 * One tick on the range: movers and swingers move on, figures that are down get closer to standing up (a held pop-up
 * waits just before it rises), and pop-ups standing by themselves drop when their time is up (random times from `rng`).
 */
export function stepRangeTargets(targets: RangeTarget[], dt: number, rng?: RngState): void {
  for (const t of targets) {
    t.prevClock = t.clock;
    copy(t.prevPosition, t.position);
    if (t.motion === 'mover' || t.motion === 'swinger') {
      t.clock += dt;
      placeTarget(t);
    }
    if (t.down > 0) {
      const floor = held(t) ? RANGE.riseTime : 0;
      if (t.down > floor) t.down = Math.max(floor, t.down - dt);
      if (t.down === 0 && t.motion === 'popup') t.up = roll(RANGE.popup.up, rng);
    } else if (t.motion === 'popup' && t.auto) {
      t.up -= dt;
      if (t.up <= 0) knockDown(t, roll(RANGE.popup.down, rng));
    }
  }
}

/** On the range the spare magazines are always full (a range officer keeps topping them up); you still reload. */
export function refillSpares(a: Armament): void {
  for (let i = 0; i < a.ammo.length; i++) {
    const size = a.handling[i]!.magSize;
    const pouch = a.ammo[i]!.pouch;
    for (let m = 0; m < pouch.length; m++) pouch[m] = size;
  }
}
