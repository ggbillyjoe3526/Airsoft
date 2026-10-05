import * as THREE from 'three';
import { glowTexture } from './woodland-props';
import { tube } from './woodland-trees';
import { Bulks, groundY, HALF_X, HALF_Z, MAP, noise2, rng, V } from './woodland-util';

/**
 * Woodland's wildlife, as still poses for the concept's stills: a red deer stag and a hind at the treeline, a fox at the
 * edge of a camp fire's light, a tawny owl on a branch, a rabbit on the meadow, moths round the lanterns, fireflies over
 * the grass and the creek, bats crossing the moon. In the game they would animate (the deer graze and bolt when someone
 * comes near, the owl turns its head, the fireflies drift and pulse, the moths circle) and never collide or block a
 * shot: decoration only. Animals' eyes catch the light (eyeshine), which reads beautifully at night.
 */

const tmp = new THREE.Color();
const C = (h: number) => new THREE.Color(h);
/** Eyeshine: a faint green-white glow in an animal's eyes. */
const EYESHINE = new THREE.Color(1.6, 2.2, 1.5);

/** An animal's frame: local x right, y up, z forward (its head), placed at `at` turned `yaw`. */
class Frame {
  readonly m: THREE.Matrix4;
  constructor(at: THREE.Vector3, yaw: number, scale = 1) {
    this.m = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(scale, scale, scale));
  }
  p(x: number, y: number, z: number): THREE.Vector3 {
    return V(x, y, z).applyMatrix4(this.m);
  }
}

/** An ellipsoid in an animal's frame: centre, radii, a tilt (pitch about x), coloured by a function of its local unit offset. */
function blob(bk: Bulks, key: string, f: Frame, c: [number, number, number], rad: [number, number, number], col: (o: THREE.Vector3, out: THREE.Color) => void, pitch = 0, detail = 2): void {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const local = new THREE.Matrix4().compose(V(...c), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), pitch), V(...rad));
  const m = f.m.clone().multiply(local);
  const inv = m.clone().invert();
  bk.get(key).geo(g, m, (out, x, y, z) => {
    const o = V(x, y, z).applyMatrix4(inv).normalize();
    col(o, out);
  });
}

function eye(bk: Bulks, f: Frame, x: number, y: number, z: number, r: number, shine = true): void {
  blob(bk, 'wlEye', f, [x, y, z], [r, r, r], (_o, out) => out.set(0x0c0c0e), 0, 1);
  if (shine) blob(bk, 'wlGlow', f, [x + Math.sign(x) * r * 0.25, y + r * 0.15, z + r * 0.75], [r * 0.45, r * 0.45, r * 0.2], (_o, out) => out.copy(EYESHINE), 0, 0);
}

/** A leg from hip to hoof: a tapered thigh and a thin shank. */
function leg(bk: Bulks, f: Frame, x: number, z: number, hipY: number, upper: number, lower: number, kneeZ: number, col: THREE.Color, hoof: THREE.Color, footY = 0): void {
  const hip = f.p(x, hipY, z);
  const knee = f.p(x, footY + lower, z + kneeZ);
  const foot = f.p(x, footY + 0.02, z + kneeZ * 0.3);
  tube(bk.get('wlFur'), hip, knee, upper, upper * 0.45, 7, 2, () => tmp.copy(col));
  tube(bk.get('wlFur'), knee, foot, upper * 0.42, upper * 0.3, 6, 1, () => tmp.copy(col).multiplyScalar(0.8));
  tube(bk.get('wlSolid'), foot, foot.clone().add(V(0, -0.03, 0)), upper * 0.32, upper * 0.34, 6, 1, () => tmp.copy(hoof), { cap: true });
}

/** A red deer: a stag with antlers, or a hind. Standing alert, head up and turned. */
export function deer(bk: Bulks, at: THREE.Vector3, yaw: number, stag: boolean, headTurn = 0): void {
  const s = stag ? 1 : 0.88;
  const f = new Frame(at, yaw, s);
  const body = C(0x8e5c38);
  const dark = C(0x5c3c28);
  const pale = C(0xc8a47a);
  const rump = C(0xe6d6b4);
  const legC = C(0x6a4a32);
  const hoof = C(0x24201c);
  const furCol = (o: THREE.Vector3, out: THREE.Color) => {
    out.copy(body).lerp(pale, THREE.MathUtils.smoothstep(-o.y, 0.3, 0.9));
    out.lerp(rump, THREE.MathUtils.smoothstep(-o.z, 0.75, 0.95) * THREE.MathUtils.smoothstep(o.y, -0.3, 0.3));
  };
  blob(bk, 'wlFur', f, [0, 1.0, 0], [0.24, 0.3, 0.58], furCol);
  blob(bk, 'wlFur', f, [0, 1.03, 0.36], [0.23, 0.33, 0.3], furCol);
  blob(bk, 'wlFur', f, [0, 1.04, -0.4], [0.22, 0.29, 0.28], furCol);
  for (const sx of [-1, 1]) {
    leg(bk, f, sx * 0.12, 0.38, 0.95, 0.09, 0.42, 0.04, legC, hoof);
    leg(bk, f, sx * 0.13, -0.44, 1.0, 0.12, 0.46, -0.1, legC, hoof);
  }
  // Neck (a mane on the stag), head turned towards the viewer.
  const nf = new Frame(f.p(0, 1.12, 0.5), yaw + headTurn, s);
  tube(bk.get('wlFur'), nf.p(0, 0, 0), nf.p(0, 0.42, 0.26), stag ? 0.16 : 0.12, 0.09, 9, 2, (t) => tmp.copy(dark).lerp(body, t * 0.5));
  blob(bk, 'wlFur', nf, [0, 0.5, 0.36], [0.085, 0.1, 0.16], (o, out) => out.copy(body).lerp(dark, Math.max(0, o.y) * 0.4), -0.4);
  blob(bk, 'wlFur', nf, [0, 0.44, 0.5], [0.055, 0.06, 0.09], (o, out) => out.copy(dark).lerp(pale, Math.max(0, -o.y) * 0.6), -0.5);
  blob(bk, 'wlGloss', nf, [0, 0.43, 0.585], [0.03, 0.025, 0.02], (_o, out) => out.set(0x141210), 0, 1);
  eye(bk, nf, 0.07, 0.54, 0.43, 0.018);
  eye(bk, nf, -0.07, 0.54, 0.43, 0.018);
  for (const sx of [-1, 1]) {
    // Ears: flat leaves, cupped forward.
    const base = nf.p(sx * 0.07, 0.6, 0.3);
    const tip = nf.p(sx * 0.19, 0.74, 0.3);
    tube(bk.get('wlFur'), base, tip, 0.04, 0.012, 6, 2, () => tmp.copy(body), { cap: true });
    if (stag) {
      // Antlers: a main beam sweeping up and back, tines forward off it.
      const a0 = nf.p(sx * 0.05, 0.62, 0.36);
      const a1 = nf.p(sx * 0.2, 0.95, 0.28);
      const a2 = nf.p(sx * 0.3, 1.22, 0.12);
      const a3 = nf.p(sx * 0.27, 1.42, 0.02);
      const ant = (p: THREE.Vector3, q: THREE.Vector3, r0: number, r1: number) => tube(bk.get('wlSolid'), p, q, r0, r1, 6, 1, () => tmp.set(0x9c8466), { cap: true });
      ant(a0, a1, 0.028, 0.024);
      ant(a1, a2, 0.024, 0.019);
      ant(a2, a3, 0.019, 0.008);
      ant(a0.clone().lerp(a1, 0.25), nf.p(sx * 0.14, 0.78, 0.55), 0.016, 0.006);
      ant(a1.clone().lerp(a2, 0.2), nf.p(sx * 0.27, 1.06, 0.42), 0.014, 0.005);
      ant(a2.clone().lerp(a3, 0.4), nf.p(sx * 0.4, 1.38, 0.2), 0.012, 0.004);
    }
  }
  // Tail.
  blob(bk, 'wlFur', f, [0, 1.08, -0.68], [0.05, 0.08, 0.04], (_o, out) => out.copy(rump), 0.4, 1);
}

/** A fox, trotting, its head turned: russet with a white chest and tail tip, black socks. */
export function fox(bk: Bulks, at: THREE.Vector3, yaw: number, headTurn = 0): void {
  const f = new Frame(at, yaw);
  const fur = C(0xd2632a);
  const white = C(0xf0e6d6);
  const black = C(0x1e1a18);
  blob(bk, 'wlFur', f, [0, 0.33, 0], [0.1, 0.115, 0.27], (o, out) => out.copy(fur).lerp(white, THREE.MathUtils.smoothstep(-o.y, 0.5, 0.95) * THREE.MathUtils.smoothstep(o.z, 0.2, 0.8)));
  for (const sx of [-1, 1]) {
    leg(bk, f, sx * 0.055, 0.17, 0.32, 0.035, 0.14, 0.02 + (sx > 0 ? 0.05 : -0.02), black, black);
    leg(bk, f, sx * 0.06, -0.18, 0.33, 0.045, 0.15, -0.05 + (sx > 0 ? -0.05 : 0.04), fur.clone().multiplyScalar(0.7), black);
  }
  // Brush: a big tail sweeping low behind, white-tipped.
  const t0 = f.p(0, 0.33, -0.24);
  const t1 = f.p(0.04, 0.26, -0.5);
  const t2 = f.p(0.1, 0.2, -0.72);
  tube(bk.get('wlFur'), t0, t1, 0.045, 0.075, 8, 2, () => tmp.copy(fur));
  tube(bk.get('wlFur'), t1, t2, 0.075, 0.02, 8, 2, (t) => tmp.copy(fur).lerp(white, THREE.MathUtils.smoothstep(t, 0.55, 0.8)), { cap: true });
  const hf = new Frame(f.p(0, 0.38, 0.27), yaw + headTurn);
  blob(bk, 'wlFur', hf, [0, 0.02, 0.04], [0.075, 0.068, 0.085], (o, out) => out.copy(fur).lerp(white, THREE.MathUtils.smoothstep(-o.y, 0.1, 0.6)));
  tube(bk.get('wlFur'), hf.p(0, -0.005, 0.09), hf.p(0, -0.02, 0.21), 0.04, 0.012, 7, 1, (t) => tmp.copy(fur).lerp(white, 0.3 + t * 0.2), { cap: true });
  blob(bk, 'wlGloss', hf, [0, -0.02, 0.215], [0.014, 0.012, 0.012], (_o, out) => out.copy(black), 0, 1);
  eye(bk, hf, 0.035, 0.035, 0.1, 0.011);
  eye(bk, hf, -0.035, 0.035, 0.1, 0.011);
  for (const sx of [-1, 1]) tube(bk.get('wlFur'), hf.p(sx * 0.045, 0.06, 0.02), hf.p(sx * 0.07, 0.15, 0.0), 0.03, 0.004, 4, 1, (t) => tmp.copy(fur).lerp(black, t * 0.7), { cap: true });
}

/** A tawny owl on a branch, facing `yaw`: round body, pale facial disc, big dark eyes. */
export function owl(bk: Bulks, at: THREE.Vector3, yaw: number): void {
  const f = new Frame(at, yaw);
  const brown = C(0x8c6a48);
  const pale = C(0xcdb08a);
  const dark = C(0x4a3626);
  const streak = (o: THREE.Vector3, out: THREE.Color) => {
    out.copy(brown).lerp(pale, THREE.MathUtils.smoothstep(o.z, 0.2, 0.9) * 0.6);
    out.multiplyScalar(0.85 + noise2(o.x * 9, o.y * 14, 120) * 0.3);
  };
  blob(bk, 'wlFur', f, [0, 0.17, 0], [0.12, 0.17, 0.11], streak);
  blob(bk, 'wlFur', f, [0, 0.36, 0.0], [0.105, 0.095, 0.095], streak);
  for (const sx of [-1, 1]) {
    blob(bk, 'wlFur', f, [sx * 0.1, 0.17, -0.02], [0.04, 0.13, 0.09], (_o, out) => out.copy(dark).lerp(brown, 0.4), 0.15, 1);
    // Facial disc halves, the eyes in them.
    blob(bk, 'wlFur', f, [sx * 0.045, 0.37, 0.07], [0.05, 0.055, 0.025], (o, out) => out.copy(pale).multiplyScalar(0.85 + Math.max(0, o.z) * 0.2), 0, 1);
    eye(bk, f, sx * 0.042, 0.375, 0.093, 0.019);
    // Talons round the branch.
    tube(bk.get('wlSolid'), f.p(sx * 0.04, 0.02, 0.03), f.p(sx * 0.045, -0.02, 0.07), 0.01, 0.006, 4, 1, () => tmp.set(0x6a6050));
  }
  tube(bk.get('wlSolid'), f.p(0, 0.355, 0.095), f.p(0, 0.33, 0.115), 0.012, 0.002, 5, 1, () => tmp.set(0xd8c8a0), { cap: true });
  blob(bk, 'wlFur', f, [0, 0.04, -0.09], [0.06, 0.08, 0.03], (_o, out) => out.copy(dark), -0.5, 1);
}

/** A rabbit sitting up on the meadow edge. */
export function rabbit(bk: Bulks, at: THREE.Vector3, yaw: number): void {
  const f = new Frame(at, yaw);
  const fur = C(0x8a7458);
  const white = C(0xece4d6);
  blob(bk, 'wlFur', f, [0, 0.1, -0.02], [0.08, 0.09, 0.12], (o, out) => out.copy(fur).lerp(white, Math.max(0, -o.y) * 0.4));
  blob(bk, 'wlFur', f, [0, 0.17, 0.08], [0.048, 0.05, 0.06], (_o, out) => out.copy(fur));
  for (const sx of [-1, 1]) tube(bk.get('wlFur'), f.p(sx * 0.02, 0.2, 0.07), f.p(sx * 0.04, 0.32, 0.03), 0.018, 0.012, 5, 1, () => tmp.copy(fur).multiplyScalar(0.9), { cap: true });
  eye(bk, f, 0.032, 0.185, 0.11, 0.009);
  eye(bk, f, -0.032, 0.185, 0.11, 0.009);
  blob(bk, 'wlFur', f, [0, 0.11, -0.14], [0.03, 0.03, 0.025], (_o, out) => out.copy(white), 0, 1);
}

/** Moths circling a lantern: pale wings caught in its light. */
export function moths(bk: Bulks, at: THREE.Vector3, seed: number): void {
  const r = rng(seed);
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.18 + r() * 0.35;
    const p = at.clone().add(V(Math.cos(a) * d, (r() - 0.3) * 0.4, Math.sin(a) * d));
    const yaw = r() * Math.PI * 2;
    const f = new Frame(p, yaw);
    const wing = C(0xe8dcc0).multiplyScalar(0.9 + r() * 0.2);
    const b = bk.get('wlPlant');
    for (const sx of [-1, 1]) {
      const flap = 0.3 + r() * 0.6;
      const p0 = f.p(0, 0, 0.008);
      const p1 = f.p(sx * 0.03, Math.sin(flap) * 0.02, 0.012);
      const p2 = f.p(sx * 0.024, Math.sin(flap) * 0.016, -0.016);
      const p3 = f.p(0, 0, -0.01);
      const k = b.nv;
      for (const q of [p0, p1, p2, p3]) b.v(q.x, q.y, q.z, 0, 1, 0, wing.r, wing.g, wing.b);
      b.tri(k, k + 1, k + 2);
      b.tri(k, k + 2, k + 3);
    }
  }
}

/**
 * Fireflies: soft glowing points (bloom makes them sing) in drifts along the creek, the meadow's edges and the
 * treeline, more of them near the view. One draw call; kept out of the AO pass like the sky.
 */
export function fireflies(group: THREE.Group, eye: THREE.Vector3, count: number, nearShare: number, nearReach: number): void {
  const r = rng(6161);
  const pos: number[] = [];
  const col: number[] = [];
  const bushes = MAP.foliage ?? [];
  for (let i = 0; i < count; i++) {
    let x: number;
    let z: number;
    if (i < count * nearShare) {
      const a = r() * Math.PI * 2;
      const d = 1.5 + Math.sqrt(r()) * nearReach;
      x = eye.x + Math.cos(a) * d;
      z = eye.z + Math.sin(a) * d;
    } else if (r() < 0.6 && bushes.length) {
      // Round a bush, where they hang in the still air.
      const b = bushes[Math.floor(r() * bushes.length)]!;
      const a = r() * Math.PI * 2;
      x = b.x + Math.cos(a) * (b.radius + r() * 2.5);
      z = b.z + Math.sin(a) * (b.radius + r() * 2.5);
    } else {
      x = (r() * 2 - 1) * HALF_X;
      z = 10 + r() * (HALF_Z - 8);
    }
    const y = groundY(x, z) + 0.25 + Math.pow(r(), 1.6) * 2.2;
    pos.push(x, y, z);
    const k = 0.5 + Math.pow(r(), 2) * 1.6;
    col.push(1.5 * k, 2.4 * k, 0.45 * k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 0.16, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
  const pts = new THREE.Points(g, m);
  pts.name = 'sky';
  pts.frustumCulled = false;
  group.add(pts);
}

/** A few bats crossing the sky by the moon, seen from `eye`. */
export function bats(bk: Bulks, eye: THREE.Vector3, towards: THREE.Vector3): void {
  const r = rng(808);
  const side = new THREE.Vector3().crossVectors(towards, V(0, 1, 0)).normalize();
  for (let i = 0; i < 3; i++) {
    const d = 45 + r() * 25;
    const p = eye.clone().addScaledVector(towards, d).addScaledVector(side, (r() - 0.5) * 14 + (i - 1) * 4).add(V(0, (r() - 0.6) * 5, 0));
    const f = new Frame(p, r() * Math.PI * 2, 2.2);
    const b = bk.get('wlSolid');
    const c = C(0x101218);
    const k = b.nv;
    const pts = [f.p(0, 0, 0.06), f.p(0.16, 0.04, 0.02), f.p(0.3, 0.07, -0.04), f.p(0.22, 0.0, -0.05), f.p(0.13, 0.01, -0.07), f.p(0, 0, -0.06), f.p(-0.13, 0.01, -0.07), f.p(-0.22, 0, -0.05), f.p(-0.3, 0.07, -0.04), f.p(-0.16, 0.04, 0.02)];
    for (const q of pts) b.v(q.x, q.y, q.z, 0, 1, 0, c.r, c.g, c.b);
    for (let j = 1; j < pts.length - 1; j++) b.tri(k, k + j, k + j + 1);
    b.tri(k, k + pts.length - 1, k + 1);
  }
}
