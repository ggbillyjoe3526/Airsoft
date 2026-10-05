import * as THREE from 'three';
import { Kit } from './kit';
import type { GripWrap } from './replicas';

/**
 * Shape helpers for figures: tapered limbs with cloth folds, curved bands (goggles, masks, rails, cummerbunds), helmet
 * shells with a cut edge, and hands whose fingers wrap round a grip. Everything is code; Low gets fewer segments and
 * mitten hands, Ultra every finger joint.
 */

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);

/** A matrix whose Y axis runs along `dir`, Z as close to `ref` as it can be. */
export function basis(dir: THREE.Vector3, ref: THREE.Vector3): THREE.Matrix4 {
  const y = dir.clone().normalize();
  let z = ref.clone().addScaledVector(y, -ref.dot(y));
  if (z.lengthSq() < 1e-6) z = V(1, 0, 0).addScaledVector(y, -y.x);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z);
}

/** Two-bone IK: the middle joint for a chain root → target with lengths l1, l2, bent towards `pole`. */
export function ik(root: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3): THREE.Vector3 {
  const v = target.clone().sub(root);
  const d = Math.min(v.length(), (l1 + l2) * 0.999);
  const dir = v.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return root.clone().addScaledVector(dir, a).addScaledVector(perp, h);
}

export interface Fold {
  /** Where along the limb (0 at the root, 1 at the end). */
  at: number;
  /** Spread along the limb (fraction). */
  width: number;
  /** Depth as a fraction of the radius. */
  amp: number;
}

/**
 * A limb along +Y from 0 to `len`: an elliptical tube whose radii follow `prof` ([t, rx, rz] stops), closed at both
 * ends, with cloth folds (rings of wrinkles that wander round the limb) where `folds` says.
 */
export function limbGeo(len: number, prof: [number, number, number][], radial: number, rings: number, folds: Fold[] = []): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const at = (t: number): [number, number] => {
    for (let i = 1; i < prof.length; i++) {
      const [t1, x1, z1] = prof[i]!;
      const [t0, x0, z0] = prof[i - 1]!;
      if (t <= t1) {
        const u = (t - t0) / Math.max(1e-6, t1 - t0);
        const s = u * u * (3 - 2 * u);
        return [x0 + (x1 - x0) * s, z0 + (z1 - z0) * s];
      }
    }
    const l = prof[prof.length - 1]!;
    return [l[1], l[2]];
  };
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const [rx, rz] = at(t);
    for (let i = 0; i < radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      let k = 1;
      for (const f of folds) {
        const w = Math.exp(-(((t - f.at) / f.width) ** 2));
        k += f.amp * w * Math.sin(a * 2 + t * 70 + f.at * 13) * Math.sin(a * 3 + t * 31);
      }
      pos.push(Math.sin(a) * rx * k, t * len, -Math.cos(a) * rz * k);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < radial; i++) {
      const a = r * radial + i;
      const b = r * radial + ((i + 1) % radial);
      const c = a + radial;
      const d = b + radial;
      idx.push(a, c, b, b, c, d);
    }
  }
  // End caps.
  const c0 = pos.length / 3;
  pos.push(0, 0, 0);
  const c1 = c0 + 1;
  pos.push(0, len, 0);
  for (let i = 0; i < radial; i++) {
    idx.push(c0, i, (i + 1) % radial);
    idx.push(c1, rings * radial + ((i + 1) % radial), rings * radial + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Bends a piece built straight along X (centred, front face at -Z) round the Y axis at radius `r`, so it wraps a
 * head or a torso; the middle of the piece ends up straight ahead (-Z).
 */
export function bend(g: THREE.BufferGeometry, r: number): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g.clone();
  const p = out.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i) / r;
    const rr = r - p.getZ(i);
    p.setXYZ(i, Math.sin(a) * rr, p.getY(i), -Math.cos(a) * rr);
  }
  out.deleteAttribute('normal');
  out.computeVertexNormals();
  return out;
}

/**
 * A curved band whose top and bottom edges follow `lo(xn)` and `hi(xn)` (metres from its centre line, xn from -1 at
 * one end to 1 at the other), bulging `bulge` metres outward at its middle: goggle frames with a nose cut-out, a
 * cupped mesh mask.
 */
export function shapedBand(arc: number, t: number, r: number, segs: number, rows: number, lo: (xn: number) => number, hi: (xn: number) => number, bulge = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(arc, 1, t, segs, rows, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const xn = (p.getX(i) / arc) * 2;
    const v = p.getY(i) + 0.5;
    const y0 = lo(xn);
    const y1 = hi(xn);
    const yn = (v - 0.5) * 2;
    const push = bulge * (1 - xn * xn) ** 2 * (1 - 0.5 * yn * yn);
    p.setXYZ(i, p.getX(i), y0 + (y1 - y0) * v, p.getZ(i) - push);
  }
  return bend(g, r);
}

/** A curved band: `arc` metres long round radius `r`, `h` tall, `t` thick. */
export function band(arc: number, h: number, t: number, r: number, segs: number): THREE.BufferGeometry {
  return bend(new THREE.BoxGeometry(arc, h, t, segs, 1, 1), r);
}

/**
 * A shell (helmet, cap crown, hair) on the unit sphere, cut at a polar angle that changes with direction: `cut(front,
 * side)` gets how far forward (-Z, 1) or back (-1) a point faces and how far to the side (0..1), and returns the
 * polar angle where the shell ends.
 */
export function shellGeo(ws: number, hs: number, cut: (front: number, side: number) => number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const th = Math.acos(THREE.MathUtils.clamp(y, -1, 1));
    const hl = Math.hypot(x, z);
    const dx = hl > 1e-6 ? x / hl : 0;
    const dz = hl > 1e-6 ? z / hl : -1;
    const nt = (th / Math.PI) * cut(-dz, Math.abs(dx));
    p.setXYZ(i, Math.sin(nt) * dx, Math.cos(nt), Math.sin(nt) * dz);
  }
  g.computeVertexNormals();
  return g;
}

/** The same geometry seen from inside (normals and winding flipped): the inside of a helmet. */
export function inside(g: THREE.BufferGeometry, scale: number): THREE.BufferGeometry {
  const o = g.toNonIndexed();
  o.scale(scale, scale, scale);
  const p = o.attributes.position as THREE.BufferAttribute;
  const n = o.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i += 3) {
    for (const a of [p, n]) {
      const x = a.getX(i + 1);
      const y = a.getY(i + 1);
      const z = a.getZ(i + 1);
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, x, y, z);
    }
  }
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return o;
}

/** Places a piece built along +Y (from 0 to its length) between a and b. */
export function between(k: Kit, key: string, geo: THREE.BufferGeometry, a: THREE.Vector3, b: THREE.Vector3, tint: number | THREE.Color, ref = V(0, 0, -1)): THREE.Matrix4 {
  const m = basis(b.clone().sub(a), ref);
  m.setPosition(a);
  k.add(key, geo, m, tint, {});
  return m;
}

/** A capsule from a to b. */
export function capsule(k: Kit, key: string, a: THREE.Vector3, b: THREE.Vector3, r: number, tint: number | THREE.Color, seg = 8): void {
  const len = Math.max(0.001, a.distanceTo(b));
  const g = new THREE.CapsuleGeometry(r, len, Math.max(2, seg / 3), seg);
  g.translate(0, len / 2, 0);
  between(k, key, g, a, b, tint);
}

/** A box of size (w, h, d) placed in frame `m` at local (x, y, z), turned by `e`. */
export function boxIn(k: Kit, key: string, m: THREE.Matrix4, x: number, y: number, z: number, w: number, h: number, d: number, tint: number | THREE.Color, r = 0.01, e?: THREE.Euler): void {
  const local = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(e ?? new THREE.Euler()), V(1, 1, 1));
  k.add(key, k.boxGeo(w, h, d, r), m.clone().multiply(local), tint, {});
}

/** Any geometry placed in frame `m` at local (x, y, z), turned by `e`, scaled by `s`. */
export function geoIn(k: Kit, key: string, m: THREE.Matrix4, g: THREE.BufferGeometry, x: number, y: number, z: number, tint: number | THREE.Color, e?: THREE.Euler, s?: THREE.Vector3): void {
  const local = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(e ?? new THREE.Euler()), s ?? V(1, 1, 1));
  k.add(key, g, m.clone().multiply(local), tint, {});
}

// ---------------------------------------------------------------- hands

export interface HandStyle {
  /** 'glove' (human) or 'robot'. */
  kind: 'glove' | 'robot';
  main: number;
  dark: number;
  accent: number;
}

export interface WorldWrap {
  top: THREE.Vector3;
  bottom: THREE.Vector3;
  hx: number;
  hd: number;
  /** The palm side and the way the fingers go round first. */
  side: THREE.Vector3;
  front: THREE.Vector3;
  /** Extra radius (a support hand wrapping over the firing hand's fingers). */
  extra?: number;
  /** Shift along the grip (fraction of a finger width). */
  shift?: number;
}

/** Turns a replica-space grip into figure space through the replica's matrix. */
export function toWorld(w: GripWrap, m: THREE.Matrix4, side: THREE.Vector3, front: THREE.Vector3, extra = 0, shift = 0): WorldWrap {
  const n = new THREE.Matrix3().setFromMatrix4(m);
  return {
    top: w.top.clone().applyMatrix4(m),
    bottom: w.bottom.clone().applyMatrix4(m),
    hx: w.hx,
    hd: w.hd,
    side: side.clone().applyMatrix3(n).normalize(),
    front: front.clone().applyMatrix3(n).normalize(),
    extra,
    shift,
  };
}

export interface Hand {
  wrist: THREE.Vector3;
  /** The direction from the wrist to the knuckles (for the cuff). */
  out: THREE.Vector3;
}

/**
 * A hand gripping round an axis: four fingers in three joints each that wrap the grip, the thumb round the other
 * way, the palm and the heel of the hand on the grip's side and back, the back of the hand out to the wrist. With a
 * trigger point the index finger reaches it instead of wrapping. Returns where the wrist is, for the arm's IK.
 */
export function gripHand(k: Kit, w: WorldWrap, st: HandStyle, trigger?: THREE.Vector3): Hand {
  const A = w.bottom.clone().sub(w.top).normalize();
  const len = w.bottom.distanceTo(w.top);
  const S = w.side.clone().addScaledVector(A, -w.side.dot(A)).normalize();
  const F = w.front.clone().addScaledVector(A, -w.front.dot(A)).addScaledVector(S, -w.front.dot(S)).normalize();
  if (F.lengthSq() < 0.5) F.crossVectors(A, S).normalize();
  const ex = w.extra ?? 0;
  const P = (t: number, th: number, e: number) => w.top.clone().addScaledVector(A, t).addScaledVector(S, Math.cos(th) * (w.hx + e + ex)).addScaledVector(F, Math.sin(th) * (w.hd + e + ex));
  const nrm = (th: number) => S.clone().multiplyScalar(Math.cos(th) / (w.hx + ex + 0.01)).addScaledVector(F, Math.sin(th) / (w.hd + ex + 0.01)).normalize();
  const full = k.p.smallParts;
  const robot = st.kind === 'robot';
  const fw = 0.0195;
  const t0 = Math.min(0.012, len * 0.15) + (w.shift ?? 0) * fw;
  const ts = [t0, t0 + fw, t0 + fw * 2, t0 + fw * 2.9];
  const radii = [0.0092, 0.0096, 0.009, 0.0079];
  const arcs = [[-0.35, 0.75, 1.62, 2.3], [-0.35, 0.78, 1.68, 2.38], [-0.35, 0.72, 1.6, 2.28], [-0.35, 0.6, 1.38, 1.98]];
  const tm = (ts[0]! + ts[3]!) / 2;
  const fingerKey = robot ? 'joint' : 'glove';
  const seg = (a: THREE.Vector3, b: THREE.Vector3, r: number, tint: number) => {
    if (robot) {
      const len2 = a.distanceTo(b);
      const g = new THREE.BoxGeometry(r * 1.9, len2 * 0.86, r * 1.7);
      g.translate(0, len2 / 2, 0);
      between(k, 'shell', g, a, b, st.main, nrm(0));
      k.add('joint', new THREE.CylinderGeometry(r * 0.75, r * 0.75, r * 2.1, 10).rotateZ(Math.PI / 2), basis(b.clone().sub(a), A).setPosition(a), st.dark, {});
    } else capsule(k, fingerKey, a, b, r, tint, full ? 10 : 6);
  };
  if (full) {
    ts.forEach((t, i) => {
      if (i === 0 && trigger) return;
      const r = radii[i]!;
      const j = arcs[i]!.map((th) => P(t, th, r + 0.002));
      seg(j[0]!, j[1]!, r, st.dark);
      seg(j[1]!, j[2]!, r * 0.95, st.dark);
      seg(j[2]!, j[3]!, r * 0.88, st.dark);
      if (!robot) {
        // Knuckle pad on the glove.
        const kp = P(t, -0.25, r * 2 + 0.006);
        capsule(k, 'figRubber', kp.clone().addScaledVector(A, -0.006), kp.clone().addScaledVector(A, 0.006), 0.006, st.dark, 6);
      }
    });
    if (trigger) {
      const r = radii[0]!;
      const j0 = P(ts[0]! - 0.004, -0.3, r + 0.002);
      const tr = trigger.clone();
      const j1 = tr.clone().addScaledVector(S, w.hx * 0.9 + r).addScaledVector(F, -0.006).addScaledVector(A, -0.002);
      const j2 = tr.clone().addScaledVector(S, r * 0.6).addScaledVector(F, 0.006).addScaledVector(A, 0.004);
      const j3 = tr.clone().addScaledVector(S, -r * 0.4).addScaledVector(F, 0.001).addScaledVector(A, 0.017);
      seg(j0, j1, r, st.dark);
      seg(j1, j2, r * 0.95, st.dark);
      seg(j2, j3, r * 0.88, st.dark);
    }
  } else {
    // Low: the four fingers as one curled block of three pieces.
    const tt = trigger ? (ts[1]! + ts[3]!) / 2 : tm;
    const span = trigger ? fw * 2.6 : fw * 3.8;
    const j = [-0.35, 0.8, 1.7, 2.35].map((th) => P(tt, th, 0.011));
    for (let i = 0; i < 3; i++) {
      const m = basis(j[i + 1]!.clone().sub(j[i]!), A);
      m.setPosition(j[i]!.clone().lerp(j[i + 1]!, 0.5));
      const g = new THREE.BoxGeometry(0.02, j[i]!.distanceTo(j[i + 1]!) + 0.012, span);
      k.add(robot ? 'shell' : 'glove', g, m, robot ? st.main : st.dark, {});
    }
    if (trigger) capsule(k, robot ? 'shell' : 'glove', P(ts[0]! - 0.004, -0.3, 0.011), trigger.clone().addScaledVector(S, 0.008), 0.009, robot ? st.main : st.dark, 4);
  }
  // Palm on the grip's side and the heel round its back.
  const palmKey = robot ? 'shell' : 'glove';
  const palmTint = robot ? st.main : st.dark;
  const pl = (ts[3]! - ts[0]!) + 0.03;
  for (const [th, wdt] of [[-0.55, 0.045], [-1.3, 0.04]] as const) {
    const c = P(tm, th, 0.014);
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(A, nrm(th)).normalize(), A, nrm(th));
    m.setPosition(c);
    k.add(palmKey, k.boxGeo(wdt, pl, 0.026, 0.01), m, palmTint, {});
  }
  // The back of the hand from the knuckles to the wrist.
  const wrist = w.top.clone().addScaledVector(A, tm + 0.012).addScaledVector(S, (w.hx + ex) * 0.75 + 0.012).addScaledVector(F, -(w.hd + ex) - 0.062);
  const knuck = P(tm, -0.3, 0.016);
  const out = knuck.clone().sub(wrist).normalize();
  const bm = basis(out, nrm(-0.6));
  bm.setPosition(wrist.clone().lerp(knuck, 0.5));
  const bl = wrist.distanceTo(knuck) + 0.02;
  if (robot) {
    k.add('shell', k.boxGeo(0.075, bl, 0.03, 0.008), bm, st.main, {});
    k.add('shell', k.boxGeo(0.05, bl * 0.6, 0.006, 0.002), bm.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.005, 0.017)), st.accent, {});
  } else {
    k.add('glove', k.boxGeo(0.078, bl, 0.03, 0.013), bm, st.dark, {});
    if (full) {
      k.add('figRubber', k.boxGeo(0.06, 0.03, 0.012, 0.005), bm.clone().multiply(new THREE.Matrix4().makeTranslation(0, bl * 0.28, 0.017)), 0x1c1e22, {});
      k.add('gear', k.boxGeo(0.05, 0.02, 0.005, 0.002), bm.clone().multiply(new THREE.Matrix4().makeTranslation(0, -bl * 0.25, 0.016)), st.accent, {});
    }
  }
  // Thumb: round the grip the other way.
  const th0 = P(ts[0]! - 0.002, -1.05, 0.02);
  const th1 = P(ts[0]! - 0.012, -1.75, 0.012);
  const th2 = P(ts[0]! - 0.016, -2.45, 0.011);
  const th3 = P(ts[0]! - 0.012, -3.0, 0.01);
  const tb = wrist.clone().lerp(th0, 0.45);
  if (full) {
    seg(tb, th1, 0.0115, st.dark);
    seg(th1, th2, 0.0105, st.dark);
    seg(th2, th3, 0.0098, st.dark);
  } else {
    capsule(k, robot ? 'shell' : 'glove', tb, th2, 0.011, robot ? st.main : st.dark, 4);
  }
  return { wrist, out };
}

/** An open hand held up (calling HIT): fingers straight up from the palm, the palm facing `face`. */
export function openHand(k: Kit, wrist: THREE.Vector3, up: THREE.Vector3, face: THREE.Vector3, st: HandStyle, side: number): void {
  const U = up.clone().normalize();
  const Fc = face.clone().addScaledVector(U, -face.dot(U)).normalize();
  const R = new THREE.Vector3().crossVectors(U, Fc).normalize();
  const robot = st.kind === 'robot';
  const m = new THREE.Matrix4().makeBasis(R, U, Fc);
  m.setPosition(wrist.clone().addScaledVector(U, 0.05));
  k.add(robot ? 'shell' : 'glove', k.boxGeo(0.082, 0.095, 0.03, robot ? 0.006 : 0.013), m, robot ? st.main : st.dark, {});
  const full = k.p.smallParts;
  if (!full) {
    const fm = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.085, 0));
    k.add(robot ? 'shell' : 'glove', k.boxGeo(0.076, 0.08, 0.022, 0.008), fm, robot ? st.main : st.dark, {});
    return;
  }
  const lens = [0.085, 0.095, 0.09, 0.072];
  for (let i = 0; i < 4; i++) {
    const x = (-0.028 + i * 0.019) * side;
    const base = wrist.clone().addScaledVector(U, 0.098).addScaledVector(R, x);
    const tip = base.clone().addScaledVector(U, lens[i]!).addScaledVector(R, x * 0.15).addScaledVector(Fc, 0.006);
    const mid = base.clone().lerp(tip, 0.5);
    if (robot) {
      for (const [a, b] of [[base, mid], [mid, tip]] as const) {
        const g = new THREE.BoxGeometry(0.016, a.distanceTo(b) * 0.88, 0.015);
        g.translate(0, a.distanceTo(b) / 2, 0);
        between(k, 'shell', g, a, b, st.main, Fc);
        k.add('joint', new THREE.CylinderGeometry(0.007, 0.007, 0.018, 10).rotateZ(Math.PI / 2), basis(U, Fc).setPosition(a), st.dark, {});
      }
    } else {
      capsule(k, 'glove', base, mid, 0.0095, st.dark, 8);
      capsule(k, 'glove', mid, tip, 0.0088, st.dark, 8);
    }
  }
  const tb = wrist.clone().addScaledVector(U, 0.035).addScaledVector(R, -0.045 * side);
  const tt = tb.clone().addScaledVector(U, 0.06).addScaledVector(R, -0.03 * side).addScaledVector(Fc, -0.01);
  capsule(k, robot ? 'joint' : 'glove', tb, tt, 0.011, st.dark, 8);
}

export { Y };
