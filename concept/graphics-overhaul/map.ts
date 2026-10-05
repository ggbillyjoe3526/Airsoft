import * as THREE from 'three';
import { DEPOT } from '../../src/map/depot';
import type { MapBlock } from '../../src/map/mapTypes';
import { DECAL_CELLS, decalAtlas, Kit } from './kit';
import type { Preset } from './quality';
import { canvasTex, fbm } from './textures';

/**
 * Depot re-dressed in the overhaul's style, built from the game's own map data (src/map/depot.ts): every block keeps
 * its exact bounds, only its look changes. Each kind is drawn as a prop inside its box.
 */

const PAL = {
  ground: 0xd6cfc2,
  precast: 0xbcb9b1,
  post: 0xa8a69f,
  wallBand: 0x2f8a90,
  office: 0xf1e8d8,
  officeBand: 0xe2783a,
  blue: 0x2f6fd6,
  orange: 0xec7a2c,
  containers: [0x2a8f86, 0xd8602a, 0xb83b37, 0x2b5fae, 0xe1ad34, 0x55913a],
  wood: 0xc29463,
  ply: 0xd6b07a,
  timber: 0xa6743f,
  toilet: [0x2f78d8, 0x3aa46a],
  roof: 0xf4f3ee,
  rackUp: 0xe8622a,
  rackBeam: 0x2e5cb0,
  cardboard: 0xc9a066,
  rocks: [0x8a8a88, 0x96958f, 0x77787a, 0x9d9b95, 0x6a6b6c, 0x84827c, 0x5d5f62],
  wire: 0xb0b5ba,
  film: 0xe6f0f6,
  tank: 0xf6f4ec,
  cage: 0x9aa0a6,
  bags: [0x7a7b55, 0x8e8461, 0x6c6f4c, 0x9a916c],
  generator: 0xf2b42a,
  darkPanel: 0x2a2e35,
  skip: 0xef8f22,
  tread: 0xaab1b8,
  stencil: 0xf2efe8,
  stencilDark: 0x26282c,
};

const hashPos = (x: number, z: number) => {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  cx: number;
  cy: number;
  cz: number;
  w: number;
  h: number;
  d: number;
}
const bounds = (b: MapBlock): Bounds => ({
  x0: b.center.x - b.size.x / 2,
  x1: b.center.x + b.size.x / 2,
  y0: b.center.y - b.size.y / 2,
  y1: b.center.y + b.size.y / 2,
  z0: b.center.z - b.size.z / 2,
  z1: b.center.z + b.size.z / 2,
  cx: b.center.x,
  cy: b.center.y,
  cz: b.center.z,
  w: b.size.x,
  h: b.size.y,
  d: b.size.z,
});

export interface BuiltMap {
  group: THREE.Group;
  /** Meshes that take screen-space reflections (puddles). */
  reflective: THREE.Mesh[];
  /** Emissive bits that bloom. */
  flagCloth?: THREE.Mesh;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Z = V(0, 0, 1);

/** A decal from the atlas laid on a surface: centre `c`, facing `n`, `w` × `h` metres, turned `rot` about `n`. */
export function decal(k: Kit, cell: string, c: THREE.Vector3, n: THREE.Vector3, w: number, h: number, tint: number | THREE.Color, rot = 0): void {
  decalAtlas();
  const r = DECAL_CELLS[cell];
  if (!r) throw new Error(`no decal ${cell}`);
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * r[2], r[1] + uv.getY(i) * r[3]);
  const nn = n.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(Z, nn);
  if (Math.abs(nn.y) > 0.99) q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, Math.PI));
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(nn, rot));
  const m = new THREE.Matrix4().compose(c.clone().addScaledVector(nn, 0.004), q, V(1, 1, 1));
  k.add('decal', g, m, tint, { worldUv: false });
}

/** A plain (unbevelled) box: cheap ribs, wires, slats. */
function bar(k: Kit, key: string, x: number, y: number, z: number, w: number, h: number, d: number, tint: number | THREE.Color, opts: { ground?: number; ry?: number } = {}): void {
  const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), opts.ry ?? 0), V(1, 1, 1));
  k.add(key, new THREE.BoxGeometry(w, h, d), m, tint, opts.ground !== undefined ? { ground: opts.ground } : {});
}

function wall(k: Kit, b: Bounds, perimeter: boolean, office: boolean, band: number): void {
  const p = k.p;
  const along = b.w > b.d ? 'x' : 'z';
  if (office) {
    // Rendered blockwork office wall: plaster with a painted band below, a skirting and a coping.
    const bandH = Math.min(1.1, b.h);
    if (b.y0 < 0.01) {
      k.box('paint', b.cx, b.y0 + bandH / 2, b.cz, b.w + 0.01, bandH, b.d + 0.01, band, { ground: 0, radius: 0.015 });
      if (b.h > bandH) k.box('plaster', b.cx, b.y0 + bandH + (b.h - bandH) / 2, b.cz, b.w, b.h - bandH, b.d, PAL.office, { radius: 0.015 });
      if (p.smallParts) k.box('paint', b.cx, b.y0 + bandH, b.cz, b.w + 0.03, 0.05, b.d + 0.03, 0xf8f4ec, { radius: 0.01 });
      k.box('paint', b.cx, b.y0 + 0.06, b.cz, b.w + 0.025, 0.12, b.d + 0.025, 0x3a3d42, { radius: 0.005 });
    } else {
      k.box('plaster', b.cx, b.cy, b.cz, b.w, b.h, b.d, PAL.office, { radius: 0.015 });
    }
    if (b.y1 > 2.5) k.box('paint', b.cx, b.y1 + 0.03, b.cz, b.w + 0.06, 0.06, b.d + 0.06, 0xd9d2c6, { radius: 0.01 });
    // A conduit run and a junction box along long office walls.
    if (p.smallParts && Math.max(b.w, b.d) > 3 && b.h > 2.5) {
      const len = Math.max(b.w, b.d);
      const side = along === 'x' ? b.d / 2 + 0.03 : b.w / 2 + 0.03;
      const y = b.y0 + 2.35;
      if (along === 'x') {
        k.add('galv', new THREE.CylinderGeometry(0.018, 0.018, len - 0.4, 8).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(b.cx, y, b.cz + side), 0xc8ccd0, {});
        k.box('plastic', b.cx + len * 0.2, y - 0.1, b.cz + side, 0.22, 0.28, 0.08, 0xd8dadc, { radius: 0.01 });
      } else {
        k.add('galv', new THREE.CylinderGeometry(0.018, 0.018, len - 0.4, 8).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(b.cx + side, y, b.cz), 0xc8ccd0, {});
        k.box('plastic', b.cx + side, y - 0.1, b.cz + len * 0.2, 0.08, 0.28, 0.22, 0xd8dadc, { radius: 0.01 });
      }
    }
    return;
  }
  // Precast concrete panel wall: H-section posts every ~4 m, panels about a metre tall slotted between them, the
  // lowest panel painted, a coping beam on top. Grey concrete, not blockwork.
  const len = along === 'x' ? b.w : b.d;
  const th = along === 'x' ? b.d : b.w;
  const bays = Math.max(1, Math.round(len / 4));
  const bay = len / bays;
  const postW = Math.min(0.36, bay * 0.2);
  const at = (s: number, o = 0): [number, number] => (along === 'x' ? [b.cx + s, b.cz + o] : [b.cx + o, b.cz + s]);
  const sz = (a: number, c: number): [number, number] => (along === 'x' ? [a, c] : [c, a]);
  const rows = Math.max(1, Math.round(b.h / 1.0));
  const panelH = b.h / rows;
  for (let i = 0; i <= bays; i++) {
    const s = THREE.MathUtils.clamp(-len / 2 + i * bay, -len / 2 + postW / 2, len / 2 - postW / 2);
    const [x, z] = at(s);
    const [w, d] = sz(postW, th);
    k.box('precast', x, b.y0 + b.h / 2 + 0.04, z, w, b.h + 0.08, d, PAL.post, { ground: b.y0, radius: 0.02 });
  }
  for (let i = 0; i < bays; i++) {
    const s = -len / 2 + (i + 0.5) * bay;
    for (let r = 0; r < rows; r++) {
      const [x, z] = at(s);
      const [w, d] = sz(bay - postW + 0.04, th * 0.62);
      const shade = 0.9 + hashPos(x + r * 1.3, z + r) * 0.14;
      const painted = rows >= 2 && r === 0;
      const tint = painted ? new THREE.Color(band).multiplyScalar(0.92 + hashPos(x, z) * 0.1) : new THREE.Color(PAL.precast).multiplyScalar(shade);
      k.box(painted ? 'paint' : 'precast', x, b.y0 + panelH * (r + 0.5), z, w, panelH - 0.03, d, tint, { ground: b.y0, radius: 0.025 });
    }
    if (rows < 2) {
      // Short walls: a painted stripe along the foot.
      const [x, z] = at(s);
      const [w, d] = sz(bay - postW + 0.05, th * 0.62 + 0.01);
      k.box('paint', x, b.y0 + 0.12, z, w, 0.24, d, band, { ground: b.y0, radius: 0.01 });
    }
  }
  const [cw, cd] = sz(len, th + 0.06);
  k.box('precast', b.cx, b.y1 + 0.07, b.cz, cw, 0.14, cd, 0xa3a19b, { radius: 0.02 });
  if (!perimeter) return;
  // The yard side of a perimeter wall faces the middle of the yard.
  const inward = along === 'x' ? V(0, 0, -Math.sign(b.cz)) : V(-Math.sign(b.cx), 0, 0);
  const faceOff = th * 0.31 + 0.001;
  for (let i = 0; i < bays; i++) {
    const s = -len / 2 + (i + 0.5) * bay;
    const [x, z] = at(s);
    const c = V(x, 0, z).addScaledVector(inward, faceOff);
    const hsh = hashPos(x * 1.7, z * 2.3);
    if (i % 5 === 2) decal(k, 'depot', c.clone().setY(b.y0 + 2.4), inward, 2.2, 0.55, 0xffffff);
    else if (hsh > 0.72) decal(k, 'warning', c.clone().setY(b.y0 + 2.2).addScaledVector(along === 'x' ? V(1, 0, 0) : V(0, 0, 1), -0.8), inward, 0.45, 0.45, 0xffffff);
    else if (hsh < 0.18) decal(k, 'sprayArrow', c.clone().setY(b.y0 + 1.6), inward, 1.4, 0.7, hsh < 0.09 ? PAL.blue : PAL.orange, along === 'x' ? 0 : Math.PI);
  }
  if (!p.smallParts) return;
  // Anti-climb: cranked brackets on every post with three strands of barbed wire, leaning out.
  const outward = inward.clone().negate();
  for (let i = 0; i <= bays; i++) {
    const s = THREE.MathUtils.clamp(-len / 2 + i * bay, -len / 2 + postW / 2, len / 2 - postW / 2);
    const [x, z] = at(s);
    const m = new THREE.Matrix4().compose(V(x, b.y1 + 0.38, z).addScaledVector(outward, 0.12), new THREE.Quaternion().setFromAxisAngle(along === 'x' ? V(1, 0, 0) : V(0, 0, 1), (along === 'x' ? -1 : 1) * Math.sign(along === 'x' ? outward.z : outward.x) * 0.5), V(1, 1, 1));
    k.add('galv', new THREE.BoxGeometry(0.04, 0.62, 0.04), m, 0x8e9499, {});
    // Floodlights on every third post, pointing into the yard.
    if (i % 3 === 1) {
      const pole = V(x, b.y1 + 1.4, z).addScaledVector(inward, 0.05);
      k.add('paintSteel', new THREE.CylinderGeometry(0.05, 0.06, 2.6, 10), new THREE.Matrix4().makeTranslation(pole.x, pole.y, pole.z), 0x4b5058, {});
      const head = pole.clone().setY(b.y1 + 2.65).addScaledVector(inward, 0.28);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), inward.clone().add(V(0, -0.7, 0)).normalize());
      k.add('paintSteel', new THREE.BoxGeometry(0.5, 0.34, 0.16), new THREE.Matrix4().compose(head, q, V(1, 1, 1)), 0x3a3e45, {});
      k.add('galv', new THREE.BoxGeometry(0.44, 0.28, 0.01), new THREE.Matrix4().compose(head.clone().addScaledVector(inward.clone().add(V(0, -0.7, 0)).normalize(), 0.085), q, V(1, 1, 1)), 0xe8eef2, {});
      k.add('paintSteel', new THREE.BoxGeometry(0.06, 0.06, 0.3), new THREE.Matrix4().compose(head.clone().addScaledVector(inward, -0.16).setY(head.y + 0.02), new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), inward), V(1, 1, 1)), 0x3a3e45, {});
    }
    if (i % 4 === 3) {
      // A CCTV camera on a short arm.
      const cam = V(x, b.y1 - 0.25, z).addScaledVector(inward, 0.35);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), inward.clone().add(V(0.4, -0.3, 0.4)).normalize());
      k.add('plastic', new THREE.BoxGeometry(0.12, 0.12, 0.32), new THREE.Matrix4().compose(cam, q, V(1, 1, 1)), 0xe8e9ea, {});
      k.add('galv', new THREE.BoxGeometry(0.04, 0.04, 0.3), new THREE.Matrix4().compose(V(x, b.y1 - 0.18, z).addScaledVector(inward, 0.18), new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), inward), V(1, 1, 1)), 0x9aa0a6, {});
    }
  }
  for (const [hh, oo] of [[0.22, 0.06], [0.42, 0.2], [0.62, 0.32]] as const) {
    const y = b.y1 + hh;
    const [x, z] = at(0, 0);
    const pos = V(x, y, z).addScaledVector(outward, oo);
    const g = new THREE.CylinderGeometry(0.004, 0.004, len, 4);
    if (along === 'x') g.rotateZ(Math.PI / 2);
    else g.rotateX(Math.PI / 2);
    k.add('galv', g, new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z), 0x9aa0a6, {});
  }
}

function container(k: Kit, b: Bounds): void {
  const p = k.p;
  const long = b.w > b.d ? 'x' : 'z';
  const L = long === 'x' ? b.w : b.d;
  const W = long === 'x' ? b.d : b.w;
  const stack = b.h > 3.5 ? 2 : 1;
  const unitH = b.h / stack;
  const ax = long === 'x' ? V(1, 0, 0) : V(0, 0, 1);
  const side = long === 'x' ? V(0, 0, 1) : V(1, 0, 0);
  const P = (a: number, y: number, c: number) => V(b.cx, y, b.cz).addScaledVector(ax, a).addScaledVector(side, c);
  const S = (a: number, c: number): [number, number] => (long === 'x' ? [a, c] : [c, a]);
  for (let s = 0; s < stack; s++) {
    const tint = new THREE.Color(PAL.containers[Math.floor(hashPos(b.cx + s * 3.1, b.cz) * PAL.containers.length)]!);
    const frame = tint.clone().multiplyScalar(0.7);
    const y0 = b.y0 + s * unitH;
    const ym = y0 + unitH / 2;
    const pw = 0.16;
    if (p.smallParts) {
      // Real corrugation: a flat skin with trapezoid ribs every 0.28 m on the sides, the blank end and the roof.
      const [sw, sd] = S(L - 0.3, W - 0.14);
      k.box('paintSteel', b.cx, ym, b.cz, sw, unitH - 0.3, sd, tint, { ground: 0, radius: 0.004 });
      const n = Math.floor((L - 0.4) / 0.28);
      for (let i = 0; i < n; i++) {
        const a = -((n - 1) * 0.28) / 2 + i * 0.28;
        for (const c of [-1, 1]) {
          const q = P(a, ym, c * (W / 2 - 0.07));
          const [w, d] = S(0.13, 0.06);
          bar(k, 'paintSteel', q.x, q.y, q.z, w, unitH - 0.34, d, tint, { ground: 0 });
          if (k.p.bevelSegments > 0) for (const e of [-1, 1]) {
            const q2 = P(a + e * 0.08, ym, c * (W / 2 - 0.085));
            const [w2, d2] = S(0.035, 0.03);
            bar(k, 'paintSteel', q2.x, q2.y, q2.z, w2, unitH - 0.34, d2, tint.clone().multiplyScalar(0.94), { ground: 0 });
          }
        }
      }
      const nE = Math.floor((W - 0.4) / 0.28);
      for (let i = 0; i < nE; i++) {
        const c = -((nE - 1) * 0.28) / 2 + i * 0.28;
        const q = P(-(L / 2 - 0.16), ym, c);
        const [w, d] = S(0.06, 0.13);
        bar(k, 'paintSteel', q.x, q.y, q.z, w, unitH - 0.34, d, tint, { ground: 0 });
      }
      const [rw, rd] = S(L - 0.3, W - 0.16);
      k.box('corrugated', b.cx, y0 + unitH - 0.13, b.cz, rw, 0.04, rd, tint.clone().multiplyScalar(0.92), { radius: 0, uvRot: long === 'z' });
    } else {
      const [sw, sd] = S(L - 0.12, W - 0.12);
      k.box('corrugated', b.cx, ym, b.cz, sw, unitH - 0.1, sd, tint, { ground: 0, radius: 0.01, uvRot: long === 'z' });
    }
    // Frame: corner posts, top and bottom side rails, end headers.
    for (const a of [-1, 1]) for (const c of [-1, 1]) {
      const q = P(a * (L / 2 - pw / 2), ym, c * (W / 2 - pw / 2));
      k.box('paintSteel', q.x, q.y, q.z, pw, unitH, pw, frame, { ground: 0, radius: 0.012 });
    }
    for (const [yy, hh] of [[y0 + 0.09, 0.18], [y0 + unitH - 0.065, 0.13]] as const) {
      for (const c of [-1, 1]) {
        const q = P(0, yy, c * (W / 2 - 0.06));
        const [w, d] = S(L, 0.12);
        k.box('paintSteel', q.x, q.y, q.z, w, hh, d, frame, { radius: 0.01 });
      }
      for (const a of [-1, 1]) {
        const q = P(a * (L / 2 - 0.06), yy, 0);
        const [w, d] = S(0.12, W);
        k.box('paintSteel', q.x, q.y, q.z, w, hh, d, frame, { radius: 0.01 });
      }
    }
    // Corner castings with their oval holes.
    for (const a of [-1, 1]) for (const c of [-1, 1]) for (const yy of [y0 + 0.06, y0 + unitH - 0.06]) {
      const q = P(a * (L / 2 - 0.09), yy, c * (W / 2 - 0.09));
      const [w, d] = S(0.19, 0.19);
      k.box('steel', q.x, q.y, q.z, w, 0.13, d, frame.clone().multiplyScalar(0.8), { radius: 0.01 });
      if (p.smallParts) {
        const h1 = P(a * (L / 2 - 0.09), yy, c * (W / 2 + 0.002));
        const [w1, d1] = S(0.08, 0.01);
        bar(k, 'dark', h1.x, h1.y, h1.z, w1, 0.05, d1, 0x111214);
        const h2 = P(a * (L / 2 + 0.002), yy, c * (W / 2 - 0.09));
        const [w2, d2] = S(0.01, 0.08);
        bar(k, 'dark', h2.x, h2.y, h2.z, w2, 0.05, d2, 0x111214);
      }
    }
    // Forklift pockets on the bottom rail of a short box.
    if (L < 7 && s === 0) for (const a of [-1, 1]) for (const c of [-1, 1]) {
      const q = P(a * 1.0, y0 + 0.09, c * (W / 2 + 0.002));
      const [w, d] = S(0.36, 0.01);
      bar(k, 'dark', q.x, q.y, q.z, w, 0.11, d, 0x15161a);
    }
    // Doors on the +end: two leaves, four locking bars with cam keepers and handles, hinges.
    const de = L / 2 - 0.02;
    for (const c of [-1, 1]) {
      const q = P(de - 0.03, ym, c * (W / 4 - 0.02));
      const [w, d] = S(0.04, W / 2 - 0.16);
      k.box('paintSteel', q.x, q.y, q.z, w, unitH - 0.36, d, tint.clone().multiplyScalar(0.96), { ground: 0, radius: 0.006 });
      if (p.smallParts) for (const yy of [0.25, 0.5, 0.75]) {
        const r = P(de - 0.005, y0 + 0.18 + (unitH - 0.36) * yy, c * (W / 4 - 0.02));
        const [w2, d2] = S(0.02, W / 2 - 0.3);
        bar(k, 'paintSteel', r.x, r.y, r.z, w2, 0.06, d2, tint.clone().multiplyScalar(0.9));
      }
      for (const yy of [0.2, 0.5, 0.8]) {
        const hq = P(de, y0 + 0.18 + (unitH - 0.36) * yy, c * (W / 2 - 0.13));
        const [w3, d3] = S(0.05, 0.07);
        bar(k, 'steel', hq.x, hq.y, hq.z, w3, 0.11, d3, frame);
      }
    }
    for (const c of [-0.75, -0.25, 0.25, 0.75]) {
      const q = P(de + 0.02, ym, c * (W / 2 - 0.1));
      k.add('galv', new THREE.CylinderGeometry(0.019, 0.019, unitH - 0.25, p.smallParts ? 10 : 6), new THREE.Matrix4().makeTranslation(q.x, q.y, q.z), 0xb4b9be, {});
      for (const yy of [y0 + 0.2, y0 + unitH - 0.2]) {
        const kq = P(de + 0.01, yy, c * (W / 2 - 0.1));
        const [w, d] = S(0.05, 0.09);
        k.box('steel', kq.x, kq.y, kq.z, w, 0.08, d, frame, { radius: 0.008 });
      }
      if (p.smallParts) {
        const hq = P(de + 0.05, y0 + unitH * 0.45, c * (W / 2 - 0.1) + 0.06);
        const [w, d] = S(0.03, 0.16);
        k.box('galv', hq.x, hq.y, hq.z, w, 0.04, d, 0xb4b9be, { radius: 0.01 });
      }
    }
    const endN = ax.clone();
    decal(k, 'csc', P(de + 0.0, y0 + unitH * 0.62, -(W / 4 - 0.02)).addScaledVector(endN, 0.002), endN, 0.22, 0.2, 0xffffff);
    decal(k, 'containerCode', P(de - 0.0, y0 + unitH - 0.42, W / 4 - 0.02).addScaledVector(endN, 0.002), endN, 0.9, 0.22, PAL.stencil);
    // Markings on both long sides: the box code up top, a big line logo.
    for (const c of [-1, 1]) {
      const n = side.clone().multiplyScalar(c);
      const face = c * (W / 2 - 0.035);
      const ry = 0;
      decal(k, 'containerCode', P(c * (L / 2 - 1.3), y0 + unitH - 0.45, face), n, 1.6, 0.4, PAL.stencil, ry);
      decal(k, 'containerLogo', P(-c * 0.4, ym + 0.15, face), n, Math.min(2.8, L * 0.42), Math.min(0.7, L * 0.105), new THREE.Color(PAL.stencil).multiplyScalar(0.9), ry);
    }
  }
}

/** A wooden crate: slatted boards inside an edge frame, braces, steel corners, stencils. */
function crate(k: Kit, b: Bounds): void {
  const p = k.p;
  k.box('dark', b.cx, b.cy, b.cz, b.w - 0.1, b.h - 0.1, b.d - 0.1, 0x2a2219, {});
  const e = 0.085;
  const inset = 0.03;
  const boardH = 0.145;
  const tintOf = (i: number, j: number) => {
    const r = hashPos(b.cx + i * 0.71, b.cz + j * 1.37);
    return new THREE.Color(r > 0.82 ? 0xa89c86 : PAL.wood).multiplyScalar(0.84 + r * 0.22);
  };
  // Boards on the four sides (horizontal) and the lid (along x).
  const rows = Math.max(1, Math.round((b.h - 2 * e) / boardH));
  const bh = (b.h - 2 * e) / rows;
  for (let r = 0; r < rows; r++) {
    const y = b.y0 + e + bh * (r + 0.5);
    for (const sz of [-1, 1]) k.box('timber', b.cx, y, b.cz + sz * (b.d / 2 - inset), b.w - 2 * e + 0.02, bh - 0.012, 0.022, tintOf(r, sz), { ground: b.y0, radius: 0.004 });
    for (const sx of [-1, 1]) k.box('timber', b.cx + sx * (b.w / 2 - inset), y, b.cz, 0.022, bh - 0.012, b.d - 2 * e + 0.02, tintOf(r + 9, sx), { ground: b.y0, radius: 0.004 });
  }
  const lids = Math.max(1, Math.round((b.d - 2 * e) / boardH));
  for (let i = 0; i < lids; i++) {
    const z = b.z0 + e + ((b.d - 2 * e) / lids) * (i + 0.5);
    k.box('timber', b.cx, b.y1 - inset, z, b.w - 2 * e + 0.02, 0.022, (b.d - 2 * e) / lids - 0.012, tintOf(i + 20, 3), { radius: 0.004, uvRot: true });
  }
  const frameTint = new THREE.Color(PAL.wood).multiplyScalar(0.78);
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) k.box('timber', b.cx, b.cy + sy * (b.h / 2 - e / 2), b.cz + sz * (b.d / 2 - e / 2), b.w, e, e, frameTint, { ground: b.y0, radius: 0.01 });
    for (const sx of [-1, 1]) k.box('timber', b.cx + sx * (b.w / 2 - e / 2), b.cy + sy * (b.h / 2 - e / 2), b.cz, e, e, b.d - 2 * e, frameTint, { ground: b.y0, radius: 0.01, uvRot: true });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('timber', b.cx + sx * (b.w / 2 - e / 2), b.cy, b.cz + sz * (b.d / 2 - e / 2), e, b.h - 2 * e, e, frameTint, { ground: b.y0, radius: 0.01 });
  // Diagonal braces on the four sides.
  const diag = Math.hypot(b.w - 2 * e, b.h - 2 * e);
  const ang = Math.atan2(b.h - 2 * e, b.w - 2 * e);
  for (const sz of [-1, 1]) {
    const m = new THREE.Matrix4().compose(V(b.cx, b.cy, b.cz + sz * (b.d / 2 - 0.012)), new THREE.Quaternion().setFromAxisAngle(Z, sz * ang), V(1, 1, 1));
    k.add('timber', k.boxGeo(diag - 0.05, e * 0.85, 0.025, 0.006), m, frameTint, { ground: b.y0 });
  }
  const diag2 = Math.hypot(b.d - 2 * e, b.h - 2 * e);
  const ang2 = Math.atan2(b.h - 2 * e, b.d - 2 * e);
  for (const sx of [-1, 1]) {
    const m = new THREE.Matrix4().compose(V(b.cx + sx * (b.w / 2 - 0.012), b.cy, b.cz), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), sx * ang2), V(1, 1, 1));
    k.add('timber', k.boxGeo(0.025, e * 0.85, diag2 - 0.05, 0.006), m, frameTint, { ground: b.y0 });
  }
  if (p.smallParts) {
    // Galvanised corner brackets.
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const x = b.cx + sx * (b.w / 2 - 0.06);
      const y = b.cy + sy * (b.h / 2 - 0.06);
      const z = b.cz + sz * (b.d / 2 - 0.06);
      bar(k, 'galv', x, y, b.cz + sz * (b.d / 2 + 0.002), 0.13, 0.13, 0.004, 0x9ea4aa);
      bar(k, 'galv', b.cx + sx * (b.w / 2 + 0.002), y, z, 0.004, 0.13, 0.13, 0x9ea4aa);
      bar(k, 'galv', x, b.cy + sy * (b.h / 2 + 0.002), z, 0.13, 0.004, 0.13, 0x9ea4aa);
    }
  }
  // Stencils: arrows on one face, the lot stamp on another, a red FRAGILE on a third.
  const r = hashPos(b.cx, b.cz);
  decal(k, 'upArrows', V(b.cx + 0.25, b.cy + 0.05, b.z1 - 0.006), V(0, 0, 1), 0.34, 0.34, PAL.stencilDark);
  decal(k, 'crateStamp', V(b.x0 + 0.006, b.cy + 0.1, b.cz), V(-1, 0, 0), Math.min(0.7, b.d * 0.6), Math.min(0.35, b.d * 0.3), PAL.stencilDark);
  if (r > 0.3) decal(k, 'fragile', V(b.x1 - 0.006, b.cy - 0.1, b.cz), V(1, 0, 0), Math.min(0.6, b.d * 0.55), Math.min(0.3, b.d * 0.27), 0xb8322a, 0.08);
  decal(k, 'crateStamp', V(b.cx - 0.1, b.cy - 0.15, b.z0 + 0.006), V(0, 0, -1), Math.min(0.7, b.w * 0.6), Math.min(0.35, b.w * 0.3), PAL.stencilDark);
}

function barrier(k: Kit, b: Bounds): void {
  const p = k.p;
  const thin = Math.min(b.w, b.d) <= 0.25;
  const along = b.w > b.d ? 'x' : 'z';
  const len = along === 'x' ? b.w : b.d;
  if (thin) {
    // A precast kerb wall with a hazard-banded top.
    k.box('precast', b.cx, b.cy - 0.06, b.cz, b.w, b.h - 0.12, b.d, 0xc0bdb5, { ground: b.y0, radius: 0.02 });
    k.box('hazard', b.cx, b.y1 - 0.06, b.cz, b.w + 0.01, 0.12, b.d + 0.01, 0xffffff, { radius: 0.01 });
    return;
  }
  // A plywood barricade: 1.2 m sheets screwed to a timber frame, posts at the sheet joints, ports in the tall ones,
  // spray-painted team marks.
  const t = Math.min(b.w, b.d);
  const tall = b.h > 2;
  const ports: [number, number][] = [];
  if (tall) {
    const n = Math.max(1, Math.round(len / 1.2));
    for (let i = 0; i < n; i++) ports.push([-len / 2 + (i + 0.5) * (len / n), 0.18]);
  }
  const nSheets = Math.max(1, Math.round(len / 1.22));
  const sheetL = len / nSheets;
  const sheet = (off: number) => {
    const thick = 0.022;
    for (let si = 0; si < nSheets; si++) {
      const s0 = -len / 2 + si * sheetL + 0.004;
      const s1 = s0 + sheetL - 0.008;
      const tint = new THREE.Color(PAL.ply).multiplyScalar(0.86 + hashPos(b.cx + si, b.cz + off) * 0.2);
      const piece = (a: number, c: number, y0: number, y1: number) => {
        if (c - a < 0.01 || y1 - y0 < 0.01) return;
        const mid = (a + c) / 2;
        const x = b.cx + (along === 'x' ? mid : off);
        const z = b.cz + (along === 'z' ? mid : off);
        k.box('plywood', x, b.y0 + (y0 + y1) / 2, z, along === 'x' ? c - a : thick, y1 - y0, along === 'z' ? c - a : thick, tint, { ground: b.y0, radius: 0.004, uvRot: along === 'z' });
      };
      if (!tall) {
        piece(s0, s1, 0, b.h);
        continue;
      }
      const py0 = 1.3;
      const py1 = 1.7;
      piece(s0, s1, 0, py0);
      piece(s0, s1, py1, b.h);
      const edges = [s0, ...ports.flatMap(([c, hw]) => [c - hw, c + hw]).filter((v) => v > s0 && v < s1), s1];
      if (edges.length % 2) edges.splice(edges.length - 1, 0, edges[edges.length - 1]!);
      for (let i = 0; i < edges.length; i += 2) piece(edges[i]!, edges[i + 1]!, py0, py1);
    }
    if (p.smallParts) {
      // Screw heads along the frame lines.
      for (let si = 0; si <= nSheets; si++) {
        const s = -len / 2 + si * sheetL;
        for (let y = 0.15; y < b.h - 0.1; y += 0.4) {
          const x = b.cx + (along === 'x' ? THREE.MathUtils.clamp(s, -len / 2 + 0.04, len / 2 - 0.04) : off + Math.sign(off) * 0.012);
          const z = b.cz + (along === 'z' ? THREE.MathUtils.clamp(s, -len / 2 + 0.04, len / 2 - 0.04) : off + Math.sign(off) * 0.012);
          bar(k, 'galv', x, b.y0 + y, z, along === 'x' ? 0.012 : 0.004, 0.012, along === 'z' ? 0.012 : 0.004, 0x8a9096);
        }
      }
    }
  };
  sheet(-(t / 2 - 0.012));
  sheet(t / 2 - 0.012);
  for (let i = 0; i <= nSheets; i++) {
    const s = THREE.MathUtils.clamp(-len / 2 + i * sheetL, -len / 2 + 0.045, len / 2 - 0.045);
    k.box('timber', b.cx + (along === 'x' ? s : 0), b.cy, b.cz + (along === 'z' ? s : 0), along === 'x' ? 0.09 : t - 0.05, b.h, along === 'z' ? 0.09 : t - 0.05, PAL.timber, { ground: b.y0, radius: 0.01 });
  }
  k.box('timber', b.cx, b.y1 - 0.045, b.cz, along === 'x' ? b.w : t + 0.02, 0.09, along === 'z' ? b.d : t + 0.02, PAL.timber, { radius: 0.01, uvRot: along === 'z' });
  if (tall) for (const y of [1.3, 1.7]) k.box('timber', b.cx, b.y0 + y, b.cz, along === 'x' ? b.w : t + 0.03, 0.05, along === 'z' ? b.d : t + 0.03, PAL.timber, { radius: 0.008, uvRot: along === 'z' });
  // A worn painted stripe and spray-painted marks, team colours by end.
  const team = b.cx < 0 ? PAL.blue : PAL.orange;
  k.box('paint', b.cx, b.y1 - 0.25, b.cz, along === 'x' ? b.w - 0.02 : t + 0.005, 0.1, along === 'z' ? b.d - 0.02 : t + 0.005, team, { radius: 0.004 });
  for (const sgn of [-1, 1]) {
    const n = along === 'x' ? V(0, 0, sgn) : V(sgn, 0, 0);
    const c = V(b.cx, b.y0 + 0.75, b.cz).addScaledVector(n, t / 2);
    const r = hashPos(b.cx + sgn, b.cz);
    if (r > 0.45) decal(k, 'sprayArrow', c, n, Math.min(1.2, len * 0.6), 0.55, team, r > 0.7 ? Math.PI : 0);
    else decal(k, r > 0.2 ? 'sprayA' : 'sprayB', c.setY(b.y0 + (tall ? 0.7 : b.h * 0.5)), n, 0.6, 0.6, 0xf2efe8);
  }
}

function toilet(k: Kit, b: Bounds): void {
  const tint = PAL.toilet[Math.floor(hashPos(b.cx, b.cz) * 2)]!;
  k.box('plastic', b.cx, b.y0 + 0.08, b.cz, b.w, 0.16, b.d, 0x30343a, { ground: b.y0, radius: 0.03 });
  k.box('plastic', b.cx, b.y0 + 0.16 + (b.h - 0.42) / 2, b.cz, b.w - 0.06, b.h - 0.42, b.d - 0.06, tint, { ground: b.y0, radius: 0.06 });
  k.box('plastic', b.cx, b.y1 - 0.13, b.cz, b.w, 0.26, b.d, PAL.roof, { radius: 0.1 });
  const door = new THREE.Color(tint).multiplyScalar(0.85);
  k.box('plastic', b.x0 + 0.02, b.y0 + 1.05, b.cz, 0.04, 1.75, b.d - 0.3, door, { radius: 0.03 });
  if (k.p.smallParts) {
    k.box('plastic', b.x0 + 0.0, b.y0 + 1.7, b.cz, 0.04, 0.12, b.d - 0.5, 0x22262c, { radius: 0.02 });
    k.box('steel', b.x0 - 0.02, b.y0 + 1.05, b.cz + 0.32, 0.05, 0.14, 0.04, 0xc0c4c8, { radius: 0.015 });
    for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) k.box('plastic', b.cx - 0.3 + i * 0.3, b.y0 + 1.1, b.cz + sz * (b.d / 2 - 0.02), 0.08, 1.6, 0.04, door, { radius: 0.02 });
    k.add('plastic', new THREE.CylinderGeometry(0.04, 0.04, 0.35, 10), new THREE.Matrix4().makeTranslation(b.cx + 0.25, b.y1 + 0.12, b.cz - 0.25), 0x2b2e33, {});
  }
}

function rack(k: Kit, b: Bounds): void {
  const along = b.w > b.d ? 'x' : 'z';
  const len = along === 'x' ? b.w : b.d;
  const bays = Math.max(1, Math.round(len / 1.3));
  const u = 0.08;
  for (let i = 0; i <= bays; i++) {
    const s = -len / 2 + u / 2 + (i * (len - u)) / bays;
    for (const side of [-1, 1]) {
      const depth = along === 'x' ? b.d : b.w;
      const o = side * (depth / 2 - u / 2);
      k.box('paintSteel', b.cx + (along === 'x' ? s : o), b.cy, b.cz + (along === 'z' ? s : o), u, b.h, u, PAL.rackUp, { ground: b.y0, radius: 0.012 });
    }
  }
  const levels = [0.12, 1.2, 2.3];
  for (const y of levels) {
    for (const side of [-1, 1]) {
      const depth = along === 'x' ? b.d : b.w;
      const o = side * (depth / 2 - 0.05);
      k.box('paintSteel', b.cx + (along === 'z' ? o : 0), b.y0 + y, b.cz + (along === 'x' ? o : 0), along === 'x' ? b.w : 0.06, 0.1, along === 'z' ? b.d : 0.06, PAL.rackBeam, { radius: 0.01 });
    }
  }
  for (let i = 0; i < bays; i++) {
    const s0 = -len / 2 + (i + 0.5) * (len / bays);
    for (const [li, y] of [0.17, 1.25].entries()) {
      const r = hashPos(b.cx + i * 1.7 + li, b.cz + li * 2.3);
      const hh = 0.55 + r * 0.4;
      const depth = (along === 'x' ? b.d : b.w) - 0.2;
      const ww = len / bays - 0.15;
      const x = b.cx + (along === 'x' ? s0 : 0);
      const z = b.cz + (along === 'z' ? s0 : 0);
      if (r > 0.7) {
        // A pallet of blue drums.
        pallet(k, x, b.y0 + y - 0.05, z, along === 'x' ? ww : depth, along === 'z' ? ww : depth);
        for (const dx of [-0.28, 0.28]) for (const dz of [-0.28, 0.28]) k.add('paintSteel', new THREE.CylinderGeometry(0.27, 0.27, 0.86, k.p.curveSegments), new THREE.Matrix4().makeTranslation(x + dx, b.y0 + y + 0.1 + 0.43, z + dz), 0x2c5fb0, { ground: b.y0 + y });
      } else {
        k.box('carton', x, b.y0 + y + hh / 2, z, along === 'x' ? ww : depth, hh, along === 'z' ? ww : depth, r > 0.45 ? PAL.cardboard : 0xd9b483, { ground: b.y0 + y, radius: 0.015 });
        if (k.p.smallParts) k.box('plastic', x, b.y0 + y + hh + 0.002, z, along === 'x' ? 0.06 : depth + 0.004, 0.006, along === 'z' ? 0.06 : ww + 0.004, 0xc9b28a, { radius: 0 });
      }
    }
  }
}

/** Gabions: a welded galvanised cage packed with grey rubble. Ultra builds every stone; Low paints them. */
function gabion(k: Kit, b: Bounds): void {
  const p = k.p;
  k.box('dark', b.cx, b.cy, b.cz, b.w - 0.08, b.h - 0.08, b.d - 0.08, 0x3d3c39, {});
  if (p.smallParts) {
    let seed = Math.floor(hashPos(b.cx, b.cz) * 1e6) + 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rockGeo = (r1: number) => {
      const g = new THREE.DodecahedronGeometry(1, 0);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const offs = new Map<string, number>();
      for (let i = 0; i < pos.count; i++) {
        const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
        let o = offs.get(key);
        if (o === undefined) offs.set(key, (o = 0.75 + hashPos(pos.getX(i) * 3 + r1, pos.getZ(i) * 5 + pos.getY(i)) * 0.5));
        pos.setXYZ(i, pos.getX(i) * o, pos.getY(i) * o, pos.getZ(i) * o);
      }
      g.computeVertexNormals();
      return g;
    };
    const geos = [0, 1, 2, 3, 4].map((i) => rockGeo(i * 7.7));
    const stone = (c: THREE.Vector3) => {
      const g = geos[Math.floor(rnd() * geos.length)]!;
      const sc = V(0.075 + rnd() * 0.05, 0.06 + rnd() * 0.04, 0.07 + rnd() * 0.05);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6));
      const tint = new THREE.Color(PAL.rocks[Math.floor(rnd() * PAL.rocks.length)]!).multiplyScalar(0.85 + rnd() * 0.25);
      k.add('rock', g, new THREE.Matrix4().compose(c, q, sc), tint, { ground: b.y0, groundRange: 0.4, uvMetres: 0.6 });
    };
    const step = 0.135;
    const faces: [THREE.Vector3, THREE.Vector3, THREE.Vector3, number, number][] = [
      [V(b.cx, b.cy, b.z1 - 0.07), V(1, 0, 0), V(0, 1, 0), b.w, b.h],
      [V(b.cx, b.cy, b.z0 + 0.07), V(1, 0, 0), V(0, 1, 0), b.w, b.h],
      [V(b.x1 - 0.07, b.cy, b.cz), V(0, 0, 1), V(0, 1, 0), b.d, b.h],
      [V(b.x0 + 0.07, b.cy, b.cz), V(0, 0, 1), V(0, 1, 0), b.d, b.h],
      [V(b.cx, b.y1 - 0.07, b.cz), V(1, 0, 0), V(0, 0, 1), b.w, b.d],
    ];
    for (const [c, u, v, fw, fh] of faces) {
      const nu = Math.max(1, Math.round((fw - 0.08) / step));
      const nv = Math.max(1, Math.round((fh - 0.08) / step));
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const pu = -fw / 2 + 0.04 + ((i + 0.5 + (rnd() - 0.5) * 0.5) * (fw - 0.08)) / nu;
        const pv = -fh / 2 + 0.04 + ((j + 0.5 + (rnd() - 0.5) * 0.5) * (fh - 0.08)) / nv;
        stone(c.clone().addScaledVector(u, pu).addScaledVector(v, pv));
      }
    }
  } else {
    k.box('stones', b.cx, b.cy, b.cz, b.w - 0.04, b.h - 0.04, b.d - 0.04, 0xa3a8ad, { ground: b.y0, radius: 0 });
  }
  const step = p.smallParts ? 0.15 : 0.3;
  const wt = p.smallParts ? 0.007 : 0.016;
  const wire = PAL.wire;
  for (let y = b.y0; y <= b.y1 + 1e-6; y += step) {
    for (const sz of [-1, 1]) bar(k, 'galv', b.cx, y, b.cz + sz * (b.d / 2), b.w, wt, wt, wire);
    for (const sx of [-1, 1]) bar(k, 'galv', b.cx + sx * (b.w / 2), y, b.cz, wt, wt, b.d, wire);
  }
  for (let x = b.x0; x <= b.x1 + 1e-6; x += step) for (const sz of [-1, 1]) bar(k, 'galv', x, b.cy, b.cz + sz * (b.d / 2), wt, b.h, wt, wire);
  for (let z = b.z0; z <= b.z1 + 1e-6; z += step) for (const sx of [-1, 1]) bar(k, 'galv', b.cx + sx * (b.w / 2), b.cy, z, wt, b.h, wt, wire);
  for (let x = b.x0; x <= b.x1 + 1e-6; x += step) bar(k, 'galv', x, b.y1, b.cz, wt, wt, b.d, wire);
  for (let z = b.z0; z <= b.z1 + 1e-6; z += step) bar(k, 'galv', b.cx, b.y1, z, b.w, wt, wt, wire);
  // Thicker edge wires.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(k, 'galv', b.cx + sx * (b.w / 2), b.cy, b.cz + sz * (b.d / 2), wt * 2.2, b.h, wt * 2.2, 0x9aa0a6);
}

/** A real pallet: three stringers, seven deck boards with gaps, three bottom boards. */
function pallet(k: Kit, x: number, y: number, z: number, w: number, d: number, tint = 0xc49a5f): void {
  const t = new THREE.Color(tint);
  for (const s of [-1, 0, 1]) k.box('timber', x, y + 0.06, z + s * (d / 2 - 0.05), w, 0.09, 0.09, t.clone().multiplyScalar(0.82), { ground: y, radius: 0.006 });
  const n = 7;
  for (let i = 0; i < n; i++) {
    const bx = x - w / 2 + (w / n) * (i + 0.5);
    k.box('timber', bx, y + 0.12, z, w / n - 0.035, 0.022, d, t.clone().multiplyScalar(0.88 + hashPos(bx, z) * 0.18), { ground: y, radius: 0.004, uvRot: true });
  }
  for (const s of [-1, 0, 1]) k.box('timber', x + s * (w / 2 - 0.06), y + 0.011, z, 0.11, 0.02, d, t.clone().multiplyScalar(0.8), { ground: y, radius: 0.004, uvRot: true });
}

function wrapped(k: Kit, b: Bounds): void {
  pallet(k, b.cx, b.y0, b.cz, b.w - 0.02, b.d - 0.02);
  const rows = 4;
  const h = (b.h - 0.2) / rows;
  for (let r = 0; r < rows; r++) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const t = hashPos(b.cx + sx + r, b.cz + sz) > 0.5 ? PAL.cardboard : 0xd8b27a;
        const x = b.cx + sx * (b.w / 4 - 0.02);
        const y = b.y0 + 0.15 + h * (r + 0.5);
        const z = b.cz + sz * (b.d / 4 - 0.02);
        k.box('carton', x, y, z, b.w / 2 - 0.06, h - 0.02, b.d / 2 - 0.06, t, { ground: b.y0, radius: 0.012 });
        if (k.p.smallParts) k.box('plastic', x, y + h / 2 - 0.009, z, b.w / 2 - 0.055, 0.004, 0.06, 0xbfa070, { radius: 0 });
        if (r === 1 && sx > 0 && sz > 0) decal(k, 'upArrows', V(x, y, b.z1 - 0.04), V(0, 0, 1), 0.22, 0.22, PAL.stencilDark);
        if (r === 2 && sx < 0 && sz < 0) decal(k, 'fragile', V(b.x0 + 0.04, y, z), V(-1, 0, 0), 0.4, 0.2, 0xb8322a);
      }
    }
  }
  k.box('film', b.cx, b.y0 + 0.15 + (b.h - 0.17) / 2, b.cz, b.w - 0.03, b.h - 0.17, b.d - 0.03, PAL.film, { radius: 0.05 });
  k.box('paint', b.cx, b.y0 + b.h * 0.55, b.cz, b.w - 0.02, 0.08, b.d - 0.02, PAL.blue, { radius: 0.04 });
}

function ibc(k: Kit, b: Bounds): void {
  pallet(k, b.cx, b.y0, b.cz, b.w, b.d, 0x8a8f96);
  k.box('tank', b.cx, b.y0 + 0.14 + (b.h - 0.2) / 2, b.cz, b.w - 0.1, b.h - 0.22, b.d - 0.1, PAL.tank, { radius: 0.1 });
  const step = k.p.smallParts ? 0.2 : 0.4;
  const t = 0.022;
  for (let y = b.y0 + 0.2; y < b.y1; y += step) {
    for (const sz of [-1, 1]) k.box('galv', b.cx, y, b.cz + sz * (b.d / 2 - t), b.w, t, t, PAL.cage, { radius: 0.006 });
    for (const sx of [-1, 1]) k.box('galv', b.cx + sx * (b.w / 2 - t), y, b.cz, t, t, b.d, PAL.cage, { radius: 0.006 });
  }
  for (let s = -b.w / 2 + t; s <= b.w / 2; s += step) {
    for (const sz of [-1, 1]) k.box('galv', b.cx + s, b.cy + 0.07, b.cz + sz * (b.d / 2 - t), t, b.h - 0.14, t, PAL.cage, { radius: 0.006 });
    for (const sx of [-1, 1]) k.box('galv', b.cx + sx * (b.w / 2 - t), b.cy + 0.07, b.cz + s, t, b.h - 0.14, t, PAL.cage, { radius: 0.006 });
  }
  k.add('plastic', new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16), new THREE.Matrix4().makeTranslation(b.cx, b.y1 - 0.02, b.cz), 0x2f6fd0, {});
  k.add('plastic', new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(b.cx, b.y0 + 0.24, b.z1 - 0.02), 0x2b2e33, {});
}

/** Bulging sandbags: each bag a soft, flattened pillow with a tied end, laid in a running bond. */
function bagGeo(seg: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg * 2, seg);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = pos.getY(i);
    const z = pos.getZ(i);
    const sx = Math.sign(x) * Math.pow(Math.abs(x), 0.42);
    const sz = Math.sign(z) * Math.pow(Math.abs(z), 0.5);
    y = Math.sign(y) * Math.pow(Math.abs(y), 0.75) * (y < 0 ? 0.82 : 1);
    const tie = Math.max(0, sx - 0.82) * 2.2;
    pos.setXYZ(i, sx, y * (1 - tie * 0.6), sz * (1 - tie * 0.5));
  }
  g.computeVertexNormals();
  return g;
}

function sandbags(k: Kit, b: Bounds): void {
  const along = b.w >= b.d ? 'x' : 'z';
  const len = along === 'x' ? b.w : b.d;
  const depth = along === 'x' ? b.d : b.w;
  const bagL = 0.58;
  const bagH = 0.15;
  const rows = Math.round(b.h / bagH);
  const lines = Math.max(1, Math.round(depth / 0.4));
  const geo = bagGeo(k.p.smallParts ? 8 : 3);
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bagL / 2 : 0;
    const n = Math.ceil(len / bagL) + 1;
    for (let li = 0; li < lines; li++) {
      for (let i = 0; i < n; i++) {
        let s0 = -len / 2 + i * bagL - off;
        let s1 = s0 + bagL - 0.01;
        s0 = Math.max(s0, -len / 2);
        s1 = Math.min(s1, len / 2);
        if (s1 - s0 < 0.18) continue;
        const mid = (s0 + s1) / 2;
        const dd = depth / lines - 0.01;
        const lo = -depth / 2 + (li + 0.5) * (depth / lines);
        const hsh = hashPos(i + r * 7, li + 0.3);
        const tint = new THREE.Color(PAL.bags[Math.floor(hsh * PAL.bags.length)]!).multiplyScalar(0.88 + hashPos(i, r) * 0.18);
        const y = b.y0 + bagH * (r + 0.5);
        const yaw = (along === 'x' ? 0 : Math.PI / 2) + (hsh - 0.5) * 0.12 + (i % 2 ? Math.PI : 0);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((hashPos(r, i) - 0.5) * 0.06, yaw, (hashPos(i, li) - 0.5) * 0.06, 'YXZ'));
        const m = new THREE.Matrix4().compose(V(b.cx + (along === 'x' ? mid : lo), y, b.cz + (along === 'z' ? mid : lo)), q, V((s1 - s0) / 2 + 0.01, bagH * 0.56, dd / 2 + 0.01));
        k.add('fabric', geo, m, tint, { ground: b.y0 });
      }
    }
  }
}

function generator(k: Kit, b: Bounds): void {
  const p = k.p;
  k.box('paintSteel', b.cx, b.y0 + 0.08, b.cz, b.w - 0.05, 0.16, b.d - 0.1, 0x30343a, { ground: b.y0, radius: 0.02 });
  k.box('paintSteel', b.cx, b.y0 + 0.16 + (b.h - 0.2) / 2, b.cz, b.w - 0.1, b.h - 0.24, b.d - 0.12, PAL.generator, { ground: b.y0, radius: 0.05 });
  // Louvred grilles on the long sides, a control panel on the end, door seams.
  for (const sz of [-1, 1]) k.box('louvre', b.cx - 0.15, b.y0 + 0.65, b.cz + sz * (b.d / 2 - 0.055), b.w - 0.7, 0.5, 0.02, 0x5a5e66, { radius: 0.005, uvMetres: 0.5 });
  k.box('paintSteel', b.x1 - 0.045, b.y0 + 0.7, b.cz, 0.02, 0.4, b.d - 0.5, PAL.darkPanel, { radius: 0.01 });
  for (const sz of [-1, 1]) decal(k, 'warning', V(b.cx + b.w * 0.3, b.y0 + 0.75, b.cz + sz * (b.d / 2 - 0.06)), V(0, 0, sz), 0.2, 0.2, 0xffffff);
  if (p.smallParts) {
    for (const sz of [-1, 1]) for (const dx of [-0.55, 0.45]) bar(k, 'dark', b.cx + dx * (b.w / 2), b.y0 + 0.6, b.cz + sz * (b.d / 2 - 0.059), 0.006, b.h - 0.5, 0.004, 0x1a1b1e);
    k.box('glow', b.x1 - 0.03, b.y0 + 0.82, b.cz + 0.12, 0.01, 0.04, 0.04, new THREE.Color(0x40ff70).multiplyScalar(3), {});
    k.box('glow', b.x1 - 0.03, b.y0 + 0.82, b.cz + 0.22, 0.01, 0.04, 0.04, new THREE.Color(0xff5030).multiplyScalar(3), {});
    k.add('steel', new THREE.CylinderGeometry(0.045, 0.045, 0.45, 12), new THREE.Matrix4().makeTranslation(b.x0 + 0.3, b.y1 + 0.15, b.cz - 0.25), 0x55595f, {});
    k.add('steel', new THREE.CylinderGeometry(0.06, 0.05, 0.03, 12), new THREE.Matrix4().makeTranslation(b.x0 + 0.3, b.y1 + 0.39, b.cz - 0.25), 0x3c4046, {});
    k.add('galv', new THREE.TorusGeometry(0.06, 0.015, 6, 16), new THREE.Matrix4().makeTranslation(b.cx, b.y1 + 0.02, b.cz), 0xb0b5ba, {});
    k.add('paintSteel', new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), new THREE.Matrix4().makeTranslation(b.cx + 0.4, b.y1 - 0.02, b.cz + 0.2), 0x2b2e33, {});
  }
}

function skip(k: Kit, b: Bounds): void {
  const g = new THREE.BoxGeometry(b.w, b.h - 0.1, b.d, 1, 1, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 0) {
      pos.setX(i, pos.getX(i) * 0.78);
      pos.setZ(i, pos.getZ(i) * 0.92);
    }
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  k.add('paintSteel', ng, new THREE.Matrix4().makeTranslation(b.cx, b.y0 + 0.1 + (b.h - 0.1) / 2, b.cz), PAL.skip, { ground: b.y0 });
  k.box('dark', b.cx, b.y1 - 0.02, b.cz, b.w - 0.12, 0.04, b.d - 0.12, 0x4a3e32, {});
  const along = b.w > b.d;
  if (along) for (let i = 0; i < 5; i++) for (const sz of [-1, 1]) k.box('paintSteel', b.cx - b.w * 0.36 + i * b.w * 0.18, b.cy + 0.05, b.cz + sz * (b.d / 2 - 0.02), 0.08, b.h - 0.3, 0.06, new THREE.Color(PAL.skip).multiplyScalar(0.85), { radius: 0.02 });
  k.box('steel', b.cx, b.y0 + 0.05, b.cz, b.w * 0.7, 0.1, b.d * 0.85, 0x2f3238, { ground: b.y0, radius: 0.01 });
  if (k.p.smallParts) for (const sx of [-1, 1]) k.add('steel', new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(b.cx + sx * b.w * 0.4, b.y1 - 0.3, b.cz), 0x3a3d42, {});
}

function ramp(k: Kit, blk: MapBlock, b: Bounds): void {
  const g = new THREE.BoxGeometry(b.w, b.h, b.d);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const rise = blk.rise ?? '+x';
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const t = rise === '+x' ? x / b.w + 0.5 : rise === '-x' ? 0.5 - x / b.w : rise === '+z' ? z / b.d + 0.5 : 0.5 - z / b.d;
    if (pos.getY(i) > 0) pos.setY(i, -b.h / 2 + b.h * t + 0.002);
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  k.add('tread', ng, new THREE.Matrix4().makeTranslation(b.cx, b.cy, b.cz), PAL.tread, { ground: b.y0 });
}

function floor(k: Kit, b: Bounds): void {
  if (b.y1 <= 0.01) return;
  k.box('concrete', b.cx, b.cy, b.cz, b.w, b.h, b.d, PAL.ground, { ground: b.y0, radius: 0.02 });
  k.box('hazard', b.cx, b.y1 - 0.085, b.cz, b.w + 0.02, 0.15, b.d + 0.02, 0xffffff, { radius: 0.01 });
  if (k.p.smallParts) {
    for (let x = b.x0 + 1; x < b.x1 - 0.5; x += 2.2) k.box('rubber', x, b.y1 - 0.45, b.z1 + 0.06, 0.25, 0.4, 0.12, 0x24262a, { radius: 0.03 });
  }
}

/** Flat dressing on the yard (it never blocks a player): cracks, tyre marks, oil, drains and manhole covers. */
function groundDressing(k: Kit): void {
  const up = V(0, 1, 0);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = -23 + rnd() * 46;
    const z = -15 + rnd() * 30;
    decal(k, 'crack', V(x, 0.001, z), up, 1.6 + rnd() * 1.6, 1.6 + rnd() * 1.6, 0x4a4540, rnd() * 6);
  }
  for (const [x, z, w, l, r] of [[-6, -10, 1.6, 9, Math.PI / 2], [6, -10.5, 1.6, 7, Math.PI / 2 + 0.1], [10.5, 3.5, 1.6, 5, 0.3], [-15, 11.5, 1.6, 5, 0]] as const) decal(k, 'tyre', V(x, 0.0015, z), up, w, l, 0x3a3734, r);
  for (const [x, z, s] of [[-11, -1.5, 2.2], [9.5, 2.2, 3], [-18, 11.5, 2.6], [15, -12, 2.4], [0.5, -10.5, 2], [-5, 10, 1.6], [20.5, 8, 2.8]] as const) decal(k, 'oil', V(x, 0.002, z), up, s, s * 0.75, 0x2c2824, x * 0.3);
  if (!k.p.smallParts) return;
  for (const [x, z] of [[-3.5, 4.2], [8.2, -7.6], [-19, -3]] as const) {
    k.add('tread', new THREE.CylinderGeometry(0.36, 0.36, 0.03, 28), new THREE.Matrix4().makeTranslation(x, 0.0, z), 0x6f747a, {});
    k.add('steel', new THREE.TorusGeometry(0.37, 0.025, 6, 28).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(x, 0.01, z), 0x55595f, {});
  }
  for (const [x, z, ry] of [[-22.6, 0, 0], [2.8, 15.4, Math.PI / 2], [22.6, -6, 0], [-9, -15.4, Math.PI / 2]] as const) {
    bar(k, 'dark', x, -0.005, z, 0.32, 0.03, 1.0, 0x16171a, { ry });
    for (let i = 0; i < 9; i++) bar(k, 'galv', x + (ry ? (i - 4) * 0.1 : 0), 0.008, z + (ry ? 0 : (i - 4) * 0.1), ry ? 0.025 : 0.34, 0.02, ry ? 0.34 : 0.025, 0x6c7176, { ry: 0 });
  }
}

/** Stencils, bay lines and lane markings painted on the yard, drawn on transparent planes. */
function markings(group: THREE.Group, p: Preset): void {
  const paint = (tex: THREE.Texture, x: number, z: number, w: number, d: number, rot = 0, opacity = 0.9) => {
    const m = p.pbr ? new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }) : new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rot;
    mesh.position.set(x, 0.004, z);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    group.add(mesh);
  };
  const stencil = (text: string, color: string, w = 1024, h = 512, font = 'bold 360px Arial Black, Arial, sans-serif') =>
    canvasTex(w, h, (g) => {
      g.fillStyle = color;
      g.font = font;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 10);
      // Worn paint: punch holes.
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 900; i++) {
        g.globalAlpha = Math.random() * 0.6;
        g.beginPath();
        g.arc(Math.random() * w, Math.random() * h, Math.random() * 6, 0, Math.PI * 2);
        g.fill();
      }
    });
  paint(stencil('03', '#f4f1ea'), -3.2, -5.6, 3.4, 1.7, Math.PI / 2, 0.85);
  paint(stencil('BAY', '#f2c230', 1024, 400, 'bold 300px Arial Black, Arial, sans-serif'), 12.5, 4.6, 3.2, 1.25, -Math.PI / 2, 0.85);
  // Lane lines on Dock Road and car park bays.
  const line = canvasTex(64, 64, (g) => {
    g.fillStyle = '#f5c43a';
    g.fillRect(0, 0, 64, 64);
  });
  paint(line, -6, -10.0, 26, 0.12, 0, 0.8);
  const bays = canvasTex(1024, 256, (g) => {
    g.strokeStyle = '#f6f3ec';
    g.lineWidth = 10;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(10 + i * 250, 0);
      g.lineTo(10 + i * 250, 256);
      g.stroke();
    }
  });
  paint(bays, -14.5, 12.6, 9.5, 2.4, 0, 0.75);
  // Chevrons pointing at the Bay's Main Gate.
  const chev = canvasTex(512, 256, (g) => {
    g.fillStyle = '#f6f3ec';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      const x = 40 + i * 150;
      g.moveTo(x, 20);
      g.lineTo(x + 80, 128);
      g.lineTo(x, 236);
      g.lineTo(x + 40, 236);
      g.lineTo(x + 120, 128);
      g.lineTo(x + 40, 20);
      g.closePath();
      g.fill();
    }
  });
  paint(chev, 1.8, 6.2, 2.4, 1.2, 0, 0.7);
  // The Bay's floor outlined in yellow paint.
  const box = canvasTex(1024, 1024, (g) => {
    g.strokeStyle = '#f2c230';
    g.lineWidth = 14;
    g.strokeRect(10, 10, 1004, 1004);
    g.setLineDash([60, 40]);
    g.lineWidth = 8;
    g.strokeRect(60, 60, 904, 904);
  });
  paint(box, 11.4, 1.0, 5.6, 5.6, 0, 0.85);
}

function puddles(group: THREE.Group, p: Preset, kit: Kit): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const spots: [number, number, number, number][] = [
    [-6.5, 0.8, 2.6, 1.6],
    [7.0, 8.4, 3.2, 1.8],
    [-14.5, 2.5, 2.2, 1.4],
    [2.2, -3.6, 1.8, 1.2],
  ];
  for (const [x, z, w, d] of spots) {
    // An irregular outline: a ring of points pushed in and out by noise.
    const shape = new THREE.Shape();
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 0.78 + (fbm(Math.cos(a) * 0.5 + 0.5 + x, Math.sin(a) * 0.5 + 0.5 + z, 3, 3, 40) - 0.5) * 0.7;
      const px = Math.cos(a) * r * (w / 2);
      const pz = Math.sin(a) * r * (d / 2);
      if (i === 0) shape.moveTo(px, pz);
      else shape.lineTo(px, pz);
    }
    const mat = p.pbr
      ? new THREE.MeshStandardMaterial({ color: 0x8e8a84, roughness: 0.03, metalness: 0.0, envMap: kit.envMap, envMapIntensity: 1.3 })
      : new THREE.MeshLambertMaterial({ color: 0xb9c7d2 });
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.006, z);
    m.receiveShadow = true;
    group.add(m);
    out.push(m);
  }
  return out;
}

function flagPole(k: Kit, x: number, z: number): THREE.Mesh {
  k.box('precast', x, 0.15, z, 0.9, 0.3, 0.9, 0xc4c1b9, { ground: 0, radius: 0.04 });
  k.add('steel', new THREE.CylinderGeometry(0.045, 0.06, 4.6, k.p.curveSegments), new THREE.Matrix4().makeTranslation(x, 2.6, z), 0xe8eaec, {});
  k.add('steel', new THREE.SphereGeometry(0.08, k.p.curveSegments, 8), new THREE.Matrix4().makeTranslation(x, 4.92, z), 0xf2c230, {});
  // The flag: a waved plane with a bold chevron emblem (neutral until captured).
  const tex = canvasTex(512, 320, (g) => {
    g.fillStyle = '#f3f1ea';
    g.fillRect(0, 0, 512, 320);
    g.fillStyle = '#20232a';
    g.fillRect(0, 0, 512, 40);
    g.fillRect(0, 280, 512, 40);
    g.fillStyle = '#f2b52c';
    g.beginPath();
    g.moveTo(170, 80);
    g.lineTo(300, 160);
    g.lineTo(170, 240);
    g.lineTo(220, 240);
    g.lineTo(350, 160);
    g.lineTo(220, 80);
    g.fill();
  });
  const geo = new THREE.PlaneGeometry(1.6, 1.0, 24, 12);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.8;
    pos.setZ(i, Math.sin(u * 4.2 + pos.getY(i) * 0.8) * 0.09 * u);
  }
  geo.computeVertexNormals();
  const mat = k.p.pbr ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  const flag = new THREE.Mesh(geo, mat);
  flag.position.set(x + 0.84, 4.3, z);
  flag.rotation.y = 0.5;
  flag.castShadow = true;
  flag.receiveShadow = true;
  return flag;
}

export function buildDepot(kit: Kit): BuiltMap {
  const group = new THREE.Group();
  const p = kit.p;
  for (const blk of DEPOT.blocks) {
    const b = bounds(blk);
    switch (blk.kind) {
      case 'wall': {
        const perimeter = b.h >= 3.9;
        const office = !perimeter && b.cz > 7 && b.h <= 3.01 && b.h !== 2.6;
        const spawnWest = !perimeter && b.cx < -17;
        const spawnEast = !perimeter && b.cx > 18;
        const band = spawnWest ? PAL.blue : spawnEast ? PAL.orange : office ? PAL.officeBand : PAL.wallBand;
        wall(kit, b, perimeter, office, band);
        break;
      }
      case 'container':
        container(kit, b);
        break;
      case 'crate':
        crate(kit, b);
        break;
      case 'barrier':
        barrier(kit, b);
        break;
      case 'toilet':
        toilet(kit, b);
        break;
      case 'rack':
        rack(kit, b);
        break;
      case 'gabion':
        gabion(kit, b);
        break;
      case 'wrapped':
        wrapped(kit, b);
        break;
      case 'ibc':
        ibc(kit, b);
        break;
      case 'sandbags':
        sandbags(kit, b);
        break;
      case 'generator':
        generator(kit, b);
        break;
      case 'skip':
        skip(kit, b);
        break;
      case 'ramp':
        ramp(kit, blk, b);
        break;
      case 'floor':
        floor(kit, b);
        break;
      default:
        kit.box('plaster', b.cx, b.cy, b.cz, b.w, b.h, b.d, 0xcccccc, { ground: b.y0 });
    }
  }
  // The yard's concrete.
  kit.box('concrete', 0, -0.25, 0, 51, 0.5, 33, PAL.ground, { radius: 0 });
  groundDressing(kit);
  const flagCloth = DEPOT.flag ? flagPole(kit, DEPOT.flag.x, DEPOT.flag.z) : undefined;
  group.add(kit.build());
  if (flagCloth) group.add(flagCloth);
  markings(group, p);
  const reflective = puddles(group, p, kit);
  return { group, reflective, flagCloth };
}
