import * as THREE from 'three';
import { FIGURE } from '../config/characters';
import type { PartBuilder, PartLook } from './figureParts';
import { basis } from './figureShapes';

/**
 * Third-person hands (G7, from the concept's anatomy): a hand closed round a grip or held up open. Low is a mitten (the
 * four fingers one curled block), detailed hands have every finger in three joints. Gloves for humans; for robots the
 * same hand in shell plates with dark joints. Blocky, as the figures are, and cheap: a figure is a few metres away.
 */

/** A hand's colours: the glove (or a robot's shell) and the darker joints. */
export interface HandStyle {
  robot: boolean;
  main: number;
  joint: number;
}

/**
 * A grip in the figure part's space: its axis from `top` to `bottom`, its half sizes `hx` towards the palm's side and
 * `hd` towards its front, the palm on `side`, the fingers going round towards `front` first. `extra`: wrapped further
 * out (a support hand over the firing hand's fingers); `shift`: along the grip, in finger widths.
 */
export interface GripWrap {
  top: THREE.Vector3;
  bottom: THREE.Vector3;
  hx: number;
  hd: number;
  side: THREE.Vector3;
  front: THREE.Vector3;
  extra?: number;
  shift?: number;
}

/** Where a hand's wrist is and the way the knuckles lie from it: the arm is placed to meet it. */
export interface Hand {
  wrist: THREE.Vector3;
  out: THREE.Vector3;
}

/** A grip moved by `m` (a replica's place in the figure). */
export function wrapIn(w: GripWrap, m: THREE.Matrix4): GripWrap {
  const n = new THREE.Matrix3().setFromMatrix4(m);
  return { ...w, top: w.top.clone().applyMatrix4(m), bottom: w.bottom.clone().applyMatrix4(m), side: w.side.clone().applyMatrix3(n).normalize(), front: w.front.clone().applyMatrix3(n).normalize() };
}

/** A finger's width along the grip, and the gloved hand's sizes (metres). */
const FINGER = 0.0195;
const FINGER_RADIUS = 0.0094;
/** Where each finger joint lies round the grip (radians from the palm's side): knuckle, middle, tip, end. */
const WRAP_ANGLES = [-0.35, 0.78, 1.66, 2.34];
const FIN = FIGURE.finish;

/** A segment of a finger or thumb from `a` to `b`: a box along it, as thick as `r` (a robot's in shell with a dark joint). */
function segment(b: PartBuilder, a: THREE.Vector3, to: THREE.Vector3, r: number, st: HandStyle, ref: THREE.Vector3): void {
  const len = a.distanceTo(to);
  const frame = basis(to.clone().sub(a), ref).setPosition(a);
  const look: PartLook = { finish: st.robot ? FIN.robot : FIN.rubber };
  b.box(st.main, r * 2, len * (st.robot ? 0.86 : 1.1), r * 1.9, 0, len / 2, 0, look, frame);
  if (st.robot) b.box(st.joint, r * 2.1, r * 1.2, r * 1.5, 0, 0, 0, { finish: FIN.rubber }, frame);
}

/**
 * A hand closed round grip `w`: the fingers wrap it (the index finger on `trigger` when given), the thumb round the
 * other way, the palm on its side, the back of the hand out to the wrist. Returns the wrist, for the arm.
 */
export function gripHand(b: PartBuilder, w: GripWrap, st: HandStyle, trigger?: THREE.Vector3): Hand {
  const A = w.bottom.clone().sub(w.top).normalize();
  const len = w.bottom.distanceTo(w.top);
  const S = w.side.clone().addScaledVector(A, -w.side.dot(A)).normalize();
  const F = w.front.clone().addScaledVector(A, -w.front.dot(A)).addScaledVector(S, -w.front.dot(S)).normalize();
  if (F.lengthSq() < 0.5) F.crossVectors(A, S).normalize();
  const ex = w.extra ?? 0;
  /** A point round the grip: `t` along it, `th` radians round from the palm's side, `e` out from its surface. */
  const P = (t: number, th: number, e: number): THREE.Vector3 =>
    w.top.clone().addScaledVector(A, t).addScaledVector(S, Math.cos(th) * (w.hx + e + ex)).addScaledVector(F, Math.sin(th) * (w.hd + e + ex));
  const out = (th: number): THREE.Vector3 => S.clone().multiplyScalar(Math.cos(th)).addScaledVector(F, Math.sin(th)).normalize();
  const t0 = Math.min(0.012, len * 0.15) + (w.shift ?? 0) * FINGER;
  const ts = [t0, t0 + FINGER, t0 + FINGER * 2, t0 + FINGER * 2.9];
  const tm = (ts[0]! + ts[3]!) / 2;
  const look: PartLook = { finish: st.robot ? FIN.robot : FIN.rubber, edge: true };
  if (b.overhaul) {
    ts.forEach((t, i) => {
      if (i === 0 && trigger) return;
      const r = FINGER_RADIUS * (i === 3 ? 0.84 : 1);
      const j = WRAP_ANGLES.map((th) => P(t, th, r + 0.002));
      for (let k = 0; k < 3; k++) segment(b, j[k]!, j[k + 1]!, r * (1 - k * 0.06), st, A);
    });
    if (trigger) {
      // The index finger reaches round to the trigger instead of wrapping.
      const r = FINGER_RADIUS;
      const j0 = P(ts[0]! - 0.004, -0.3, r + 0.002);
      const j1 = trigger.clone().addScaledVector(S, w.hx * 0.9 + r).addScaledVector(F, -0.006);
      const j2 = trigger.clone().addScaledVector(S, r * 0.6).addScaledVector(F, 0.006);
      segment(b, j0, j1, r, st, A);
      segment(b, j1, j2, r * 0.94, st, A);
    }
  } else {
    // Low: the four fingers as one curled block in three pieces (the index finger to the trigger on its own).
    const tt = trigger ? (ts[1]! + ts[3]!) / 2 : tm;
    const span = trigger ? FINGER * 2.6 : FINGER * 3.8;
    const j = WRAP_ANGLES.map((th) => P(tt, th, 0.011));
    for (let i = 0; i < 3; i++) {
      const m = basis(j[i + 1]!.clone().sub(j[i]!), A).setPosition(j[i]!.clone().lerp(j[i + 1]!, 0.5));
      b.box(st.main, 0.02, j[i]!.distanceTo(j[i + 1]!) + 0.012, span, 0, 0, 0, look, m);
    }
    if (trigger) b.rod(st.main, P(ts[0]! - 0.004, -0.3, 0.011), trigger.clone().addScaledVector(S, 0.008), FINGER_RADIUS, look, 4);
  }
  // The palm on the grip's side and the heel of the hand round its back.
  const pl = ts[3]! - ts[0]! + 0.03;
  for (const [th, wide] of [[-0.55, 0.045], [-1.3, 0.04]] as const) {
    const n = out(th);
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(A, n).normalize(), A, n).setPosition(P(tm, th, 0.014));
    b.block(st.main, wide, pl, 0.026, 0, 0, 0, look, m);
  }
  // The back of the hand, from the knuckles to the wrist.
  const wrist = w.top.clone().addScaledVector(A, tm + 0.012).addScaledVector(S, (w.hx + ex) * 0.75 + 0.012).addScaledVector(F, -(w.hd + ex) - 0.062);
  const knuckles = P(tm, -0.3, 0.016);
  const along = knuckles.clone().sub(wrist).normalize();
  const back = basis(along, out(-0.6)).setPosition(wrist.clone().lerp(knuckles, 0.5));
  b.block(st.main, 0.078, wrist.distanceTo(knuckles) + 0.02, 0.03, 0, 0, 0, look, back);
  // The thumb, round the grip the other way.
  const thumb = [P(ts[0]! - 0.002, -1.05, 0.02), P(ts[0]! - 0.012, -1.75, 0.012), P(ts[0]! - 0.016, -2.45, 0.011)];
  const base = wrist.clone().lerp(thumb[0]!, 0.45);
  if (b.overhaul) {
    segment(b, base, thumb[1]!, 0.0115, st, A);
    segment(b, thumb[1]!, thumb[2]!, 0.0105, st, A);
  } else b.rod(st.main, base, thumb[2]!, 0.011, look, 4);
  return { wrist, out: along };
}

/** An open hand held up (calling a hit): the palm facing `face`, the fingers straight up along `up` from the wrist. */
export function openHand(b: PartBuilder, wrist: THREE.Vector3, up: THREE.Vector3, face: THREE.Vector3, st: HandStyle, side: number): void {
  const U = up.clone().normalize();
  const Fc = face.clone().addScaledVector(U, -face.dot(U)).normalize();
  const R = new THREE.Vector3().crossVectors(U, Fc).normalize();
  const palm = new THREE.Matrix4().makeBasis(R, U, Fc).setPosition(wrist.clone().addScaledVector(U, 0.05));
  const look: PartLook = { finish: st.robot ? FIN.robot : FIN.rubber, edge: true };
  b.block(st.main, 0.082, 0.095, 0.03, 0, 0, 0, look, palm);
  // The fingers cast as one plate (M75): each is thinner than a shape that casts on its own.
  b.castOnly(new THREE.BoxGeometry(0.076, 0.1, 0.02).translate(0, 0.09, 0).applyMatrix4(palm), st.main);
  if (!b.overhaul) {
    // Low: the fingers as one straight block, the thumb out to the side.
    b.block(st.main, 0.076, 0.08, 0.022, 0, 0.085, 0, look, palm);
    b.box(st.main, 0.022, 0.06, 0.022, -0.05 * side, 0.01, -0.005, look, palm, new THREE.Euler(0, 0, 0.5 * side));
    return;
  }
  const lengths = [0.085, 0.095, 0.09, 0.072];
  for (let i = 0; i < 4; i++) {
    const x = (-0.028 + i * 0.019) * side;
    const from = wrist.clone().addScaledVector(U, 0.098).addScaledVector(R, x);
    const tip = from.clone().addScaledVector(U, lengths[i]!).addScaledVector(R, x * 0.15).addScaledVector(Fc, 0.006);
    const mid = from.clone().lerp(tip, 0.5);
    segment(b, from, mid, FINGER_RADIUS, st, Fc);
    segment(b, mid, tip, FINGER_RADIUS * 0.92, st, Fc);
  }
  const tb = wrist.clone().addScaledVector(U, 0.035).addScaledVector(R, -0.045 * side);
  segment(b, tb, tb.clone().addScaledVector(U, 0.06).addScaledVector(R, -0.03 * side).addScaledVector(Fc, -0.01), 0.011, st, Fc);
}
