import * as THREE from 'three';
import { DRESSING } from '../config/dressing';
import type { SkylinePiece } from '../map/mapTypes';

/**
 * The skyline round the field (G8, MapDressing.skyline; Trees: Detailed): sheds, a water tower, a gantry crane, stacked
 * containers, chimneys and a power line, flat-shaded and vertex-coloured, merged into the tree ring's mesh by
 * render/atmosphere.ts (no draw call of its own). Trees too near a piece are left out (skylineClear). Pure geometry:
 * the ring's mesh owns and frees it.
 */

const S = DRESSING.skyline;
const tmp = new THREE.Color();
const m = new THREE.Matrix4();
const from = new THREE.Vector3();
const to = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Non-indexed, no uv, one colour (sRGB hex), as the ring's own parts are (they merge with them). */
function painted(geo: THREE.BufferGeometry, colour: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  tmp.setHex(colour);
  const n = g.getAttribute('position').count;
  const colours = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colours.set([tmp.r, tmp.g, tmp.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}

const hex = (s: string): number => parseInt(s.slice(1), 16);

/** A box from its size and its foot's middle. */
const box = (w: number, h: number, d: number, x: number, y: number, z: number, colour: number): THREE.BufferGeometry => painted(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), colour);

/** A thin bar `thick` m square from a to b. */
function bar(a: THREE.Vector3, b: THREE.Vector3, thick: number, colour: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  m.lookAt(a, b, UP);
  m.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return painted(new THREE.BoxGeometry(thick, thick, len).applyMatrix4(m), colour);
}

/** A piece standing on a footprint (not a line of pylons or trees). */
type Standing = Exclude<SkylinePiece, { kind: 'powerLine' } | { kind: 'treeline' }>;

/** A piece's footprint (x along world x, z along world z), its `turned` applied. */
function footprint(p: Standing): [number, number] {
  const turned = 'turned' in p && p.turned;
  return turned ? [p.depth, p.width] : [p.width, p.depth];
}

/** Every part of the skyline, round a field centred on `centre` (sheds' doors and cranes face it). */
export function skylineGeometries(pieces: readonly SkylinePiece[], centre: { x: number; z: number }): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  pieces.forEach((p, index) => {
    if (p.kind === 'powerLine') {
      powerLine(p.points, p.height, out);
      return;
    }
    if (p.kind === 'treeline') {
      treeline(p.points, p.height, p.depth, index, out);
      return;
    }
    const [w, d] = footprint(p);
    const { x, z, height: h } = p;
    switch (p.kind) {
      case 'shed': {
        const D = S.shed;
        out.push(box(w, h, d, x, 0, z, p.colour ?? hex(D.colour)));
        out.push(box(w + 0.6, 0.4, d + 0.6, x, h, z, hex(D.roof)));
        out.push(box(w + 0.04, 0.7, d + 0.04, x, h - 1.4, z, hex(D.band)));
        // Doors on the side facing the field: along whichever axis it lies further out on.
        const alongX = Math.abs(z - centre.z) >= Math.abs(x - centre.x);
        const length = alongX ? w : d;
        const doors = Math.max(1, Math.floor(length / D.doorEvery));
        const face = alongX ? z - Math.sign(z - centre.z) * (d / 2 + 0.05) : x - Math.sign(x - centre.x) * (w / 2 + 0.05);
        for (let i = 0; i < doors; i++) {
          const along = (alongX ? x - w / 2 : z - d / 2) + ((i + 0.5) / doors) * length;
          const dh = Math.min(D.doorHeight, h - 1.8);
          out.push(alongX ? box(D.doorWidth, dh, 0.1, along, 0, face, hex(D.doors)) : box(0.1, dh, D.doorWidth, face, 0, along, hex(D.doors)));
        }
        break;
      }
      case 'waterTower': {
        const D = S.waterTower;
        const tank = h * D.tank;
        const legsTop = h - tank;
        const r = Math.min(w, d) / 2;
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
          from.set(x + sx * r * 0.9, 0, z + sz * r * 0.9);
          to.set(x + sx * r * 0.55, legsTop, z + sz * r * 0.55);
          out.push(bar(from, to, 0.45, hex(D.legs)));
        }
        out.push(painted(new THREE.CylinderGeometry(r, r, tank * 0.72, S.segments).translate(x, legsTop + tank * 0.36, z), p.colour ?? hex(D.colour)));
        out.push(painted(new THREE.ConeGeometry(r * 1.05, tank * 0.28, S.segments).translate(x, legsTop + tank * 0.86, z), hex(D.roof)));
        break;
      }
      case 'crane': {
        const D = S.crane;
        const c = p.colour ?? hex(D.colour);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(box(D.leg, h - D.leg, D.leg, x + sx * (w / 2 - D.leg / 2), 0, z + sz * (d / 2 - D.leg / 2), c));
        // Beams along the longer side, a cab hung under one.
        const longX = w >= d;
        for (const s of [-1, 1]) out.push(longX ? box(w, D.leg * 1.4, D.leg, x, h - D.leg * 1.4, z + s * (d / 2 - D.leg / 2), c) : box(D.leg, D.leg * 1.4, d, x + s * (w / 2 - D.leg / 2), h - D.leg * 1.4, z, c));
        out.push(box(2.4, 2, 2.4, longX ? x + w * 0.2 : x, h - D.leg * 1.4 - 2, longX ? z : z + d * 0.2, hex(S.shed.roof)));
        break;
      }
      case 'containers': {
        const D = S.containers;
        const rows = Math.max(1, Math.round(h / D.height));
        for (let r = 0; r < rows; r++) {
          const shift = (r % 2) * 0.4;
          out.push(box(w - 0.1, D.height - 0.06, d - 0.1, x + shift, r * D.height, z - shift, p.colour ?? D.colours.map(hex)[(index * 3 + r) % D.colours.length]!));
        }
        break;
      }
      case 'hill': {
        // A low mound: the top of a squashed sphere, sunk a metre so no edge shows a gap.
        const H = DRESSING.hill;
        out.push(painted(new THREE.SphereGeometry(1, H.around, H.rings, 0, Math.PI * 2, 0, Math.PI / 2).scale(w / 2, h + 1, d / 2).translate(x, -1, z), p.colour ?? hex(H.colour)));
        break;
      }
      case 'tower':
        tower(p, w, d, index, centre, out);
        break;
      case 'chimney': {
        const D = S.chimney;
        const r = Math.min(w, d) / 2;
        const c = p.colour ?? hex(D.colour);
        out.push(painted(new THREE.CylinderGeometry(r * D.top, r, h, S.segments).translate(x, h / 2, z), c));
        for (let k = 0; k < D.bands; k++) {
          const y = h * (0.78 + k * 0.1);
          const rr = r * (1 - (1 - D.top) * (y / h)) + 0.08;
          out.push(painted(new THREE.CylinderGeometry(rr, rr, h * 0.04, S.segments).translate(x, y, z), hex(D.band)));
        }
        break;
      }
    }
  });
  return out;
}

/** Pylons at each point and sagging wires between them. */
function powerLine(points: readonly { x: number; z: number }[], h: number, out: THREE.BufferGeometry[]): void {
  const D = S.powerLine;
  const c = hex(D.colour);
  const arm = 2.4;
  const dirs = points.map((_, i) => {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(points.length - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    // The crossarm runs across the line.
    return { x: -(b.z - a.z) / len, z: (b.x - a.x) / len };
  });
  points.forEach((p, i) => {
    out.push(box(D.leg * 2, h, D.leg * 2, p.x, 0, p.z, c));
    from.set(p.x - dirs[i]!.x * arm, h - 0.3, p.z - dirs[i]!.z * arm);
    to.set(p.x + dirs[i]!.x * arm, h - 0.3, p.z + dirs[i]!.z * arm);
    out.push(bar(from, to, D.leg, c));
  });
  const mid = new THREE.Vector3();
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    for (let k = 0; k < D.wires; k++) {
      const s = (k / Math.max(1, D.wires - 1) - 0.5) * 2 * arm * 0.9;
      from.set(a.x + dirs[i]!.x * s, h - 0.35, a.z + dirs[i]!.z * s);
      to.set(b.x + dirs[i + 1]!.x * s, h - 0.35, b.z + dirs[i + 1]!.z * s);
      mid.addVectors(from, to).multiplyScalar(0.5);
      mid.y -= D.sag;
      out.push(bar(from, mid, D.wire, c));
      out.push(bar(mid, to, D.wire, c));
    }
  }
}

/** The tops of the chimneys that smoke (render/smokePlumes.ts): where each plume starts, and its chimney's radius. */
export function smokingChimneys(pieces: readonly SkylinePiece[]): { x: number; y: number; z: number; radius: number }[] {
  return pieces.flatMap((p) => (p.kind === 'chimney' && p.smoke ? [{ x: p.x, y: p.height, z: p.z, radius: (Math.min(p.width, p.depth) / 2) * S.chimney.top }] : []));
}

/** True if a tree at (x, z) stands clear of every piece (DRESSING.skyline.treeClear beyond its footprint). */
export function skylineClear(pieces: readonly SkylinePiece[], x: number, z: number): boolean {
  return pieces.every((p) => {
    // G9: trees may stand on a hill (their crowns rise out of it) and behind a treeline.
    if (p.kind === 'hill' || p.kind === 'treeline') return true;
    if (p.kind === 'powerLine') {
      return p.points.every((q) => Math.hypot(q.x - x, q.z - z) >= S.treeClear);
    }
    const [w, d] = footprint(p);
    return Math.max(Math.abs(x - p.x) - w / 2, Math.abs(z - p.z) - d / 2) >= S.treeClear;
  });
}

// --- G9: the woods' treeline and the city's towers -------------------------------------------------------------------

/** A fixed hash of three numbers to 0..1 (the skyline looks the same every load). */
function hash01(a: number, b: number, c: number): number {
  const h = Math.imul(Math.round(a * 97) ^ Math.imul(Math.round(b * 131), 19349663) ^ Math.imul(Math.round(c * 61), 83492791), 0x5bd1e995) >>> 0;
  return (Math.imul(h ^ (h >>> 15), 2654435761) >>> 0) / 4294967296;
}

/** Two staggered rows of dark conifers along `points`, about `height` tall, `depth` deep (DRESSING.treeline). */
function treeline(points: readonly { x: number; z: number }[], height: number, depth: number, index: number, out: THREE.BufferGeometry[]): void {
  const T = DRESSING.treeline;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const nx = -(b.z - a.z) / len;
    const nz = (b.x - a.x) / len;
    const count = Math.max(1, Math.floor(len / T.spacing));
    for (let k = 0; k < count; k++) {
      for (const row of [0, 1]) {
        const u = hash01(index, i * 1000 + k, row);
        const t = (k + 0.5 * row + u * 0.4) / count;
        const across = (row - 0.5) * depth + (hash01(index, k, row + 7) - 0.5) * depth * 0.5;
        const x = a.x + (b.x - a.x) * t + nx * across;
        const z = a.z + (b.z - a.z) * t + nz * across;
        const h = height * (1 + (hash01(i, k, row + 3) - 0.5) * 2 * T.jitter);
        const colour = hex(T.colours[Math.floor(hash01(k, row, i + 5) * T.colours.length) % T.colours.length]!);
        out.push(painted(new THREE.ConeGeometry(h * T.width, h, T.sides, 1, true).translate(x, h / 2 - 0.5, z), colour));
      }
    }
  }
}

/** A tower's side facing the field: along x (its z face) or along z (its x face), and the face's coordinate and normal. */
function towerFace(p: { x: number; z: number }, w: number, d: number, centre: { x: number; z: number }): { alongX: boolean; at: number; sign: number } {
  const alongX = Math.abs(p.z - centre.z) >= Math.abs(p.x - centre.x);
  const sign = alongX ? -Math.sign(p.z - centre.z) || 1 : -Math.sign(p.x - centre.x) || 1;
  return { alongX, at: alongX ? p.z + sign * (d / 2) : p.x + sign * (w / 2), sign };
}

/** Each window of a tower's field side: its middle (world), and whether it is lit by night. */
function towerWindows(p: Extract<SkylinePiece, { kind: 'tower' }>, w: number, d: number, index: number, centre: { x: number; z: number }): { x: number; y: number; z: number; lit: boolean; alongX: boolean; sign: number }[] {
  const W = DRESSING.tower.window;
  const f = towerFace(p, w, d, centre);
  const length = f.alongX ? w : d;
  const cols = Math.floor((length - 0.8) / W.pitch);
  const out: { x: number; y: number; z: number; lit: boolean; alongX: boolean; sign: number }[] = [];
  for (let y = p.base + W.from; y + W.height / 2 < p.height - 1.2; y += W.floor) {
    for (let c = 0; c < cols; c++) {
      const along = (f.alongX ? p.x : p.z) - ((cols - 1) * W.pitch) / 2 + c * W.pitch;
      out.push({ x: f.alongX ? along : f.at, y, z: f.alongX ? f.at : along, lit: hash01(index, y, c) < DRESSING.tower.lit.share, alongX: f.alongX, sign: f.sign });
    }
  }
  return out;
}

/** A flat quad on a tower's face (normal along x or z, `sign`), `lift` m off it. */
function faceQuad(q: { x: number; y: number; z: number; alongX: boolean; sign: number }, width: number, height: number, lift: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, height);
  // A plane faces +z: turn it to the face's normal.
  if (!q.alongX) g.rotateY(q.sign > 0 ? Math.PI / 2 : -Math.PI / 2);
  else if (q.sign < 0) g.rotateY(Math.PI);
  return g.translate(q.x + (q.alongX ? 0 : q.sign * lift), q.y, q.z + (q.alongX ? q.sign * lift : 0));
}

/** A city block: its body from `base` up, a cornice, dark glass windows on its field side, and a tank or a mast on its roof. */
function tower(p: Extract<SkylinePiece, { kind: 'tower' }>, w: number, d: number, index: number, centre: { x: number; z: number }, out: THREE.BufferGeometry[]): void {
  const T = DRESSING.tower;
  const colour = p.colour ?? hex(T.colours[index % T.colours.length]!);
  out.push(box(w, p.height - p.base, d, p.x, p.base, p.z, colour));
  out.push(box(w + 0.3, 0.4, d + 0.3, p.x, p.height - 0.4, p.z, hex(T.cornice)));
  for (const q of towerWindows(p, w, d, index, centre)) out.push(painted(faceQuad(q, T.window.width, T.window.height, 0.03), hex(T.glass)));
  const top = p.height;
  if (hash01(index, 3, 9) < 0.5) {
    // A water tank on legs, its lid a shallow cone.
    const tx = p.x + (hash01(index, 1, 2) - 0.5) * w * 0.4;
    const tz = p.z + (hash01(index, 2, 1) - 0.5) * d * 0.4;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) out.push(box(0.15, 1.4, 0.15, tx + sx * 0.8, top, tz + sz * 0.8, hex(T.tank.legs)));
    out.push(painted(new THREE.CylinderGeometry(1.2, 1.25, 2.4, 10).translate(tx, top + 1.4 + 1.2, tz), hex(T.tank.colour)));
    out.push(painted(new THREE.ConeGeometry(1.3, 0.6, 10).translate(tx, top + 3.8 + 0.3, tz), hex(T.tank.legs)));
  } else {
    const m = towerMast(p, w, d, index);
    from.set(m.x, top, m.z);
    to.set(m.x, m.top, m.z);
    out.push(bar(from, to, 0.18, hex(T.mast.colour)));
  }
  if (p.sign !== undefined) {
    const f = towerFace(p, w, d, centre);
    const s = blade(p, w, d, f);
    out.push(f.alongX ? box(T.sign.width, T.sign.height, 0.25, s.x, s.y, s.z, hex(T.sign.plate)) : box(0.25, T.sign.height, T.sign.width, s.x, s.y, s.z, hex(T.sign.plate)));
  }
}

/** Where a tower's mast stands and how high its light is. */
function towerMast(p: { x: number; z: number; height: number }, w: number, d: number, index: number): { x: number; z: number; top: number } {
  return { x: p.x + (hash01(index, 5, 1) - 0.5) * w * 0.5, z: p.z + (hash01(index, 1, 5) - 0.5) * d * 0.5, top: p.height + 4 + hash01(index, 7, 7) * 5 };
}

/** A blade sign's foot (its middle along the face, standing out from it), on a tower's field side near one end. */
function blade(p: { x: number; z: number; base: number; height: number }, w: number, d: number, f: { alongX: boolean; at: number; sign: number }): { x: number; y: number; z: number } {
  const T = DRESSING.tower.sign;
  const along = (f.alongX ? p.x - w / 2 : p.z - d / 2) + (f.alongX ? w : d) * 0.22;
  const out = f.at + f.sign * (T.width / 2 + 0.05);
  const y = Math.min(p.height - T.height - 1, p.base + 2.5);
  return f.alongX ? { x: along, y, z: out } : { x: out, y, z: along };
}

/**
 * The skyline's lights (G9): a red light on each tower's mast and its blade sign's faces always, and by `night` the lit
 * windows, as unlit vertex-coloured parts. They ride the tree ring's mesh (render/skyHost.ts): no draw call of their
 * own. Empty for a skyline without towers.
 */
export function skylineLights(pieces: readonly SkylinePiece[], centre: { x: number; z: number }, night: boolean): THREE.BufferGeometry[] {
  const T = DRESSING.tower;
  const out: THREE.BufferGeometry[] = [];
  const glowing = (g: THREE.BufferGeometry, colour: number, k: number): THREE.BufferGeometry => {
    const p = painted(g, colour);
    const c = p.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < c.array.length; i++) (c.array as Float32Array)[i]! *= k;
    return p;
  };
  pieces.forEach((p, index) => {
    if (p.kind !== 'tower') return;
    const [w, d] = footprint(p);
    if (night) {
      for (const q of towerWindows(p, w, d, index, centre)) {
        if (q.lit) out.push(glowing(faceQuad(q, T.window.width * 0.92, T.window.height * 0.9, 0.05), hex(T.lit.colours[Math.floor(hash01(q.x, q.y, q.z) * T.lit.colours.length) % T.lit.colours.length]!), 1.25));
      }
    }
    if (hash01(index, 3, 9) >= 0.5) {
      const m = towerMast(p, w, d, index);
      out.push(glowing(new THREE.BoxGeometry(0.4, 0.4, 0.4).translate(m.x, m.top + 0.2, m.z), hex(T.mast.light), night ? 1.6 : 1));
    }
    if (p.sign !== undefined) {
      const f = towerFace(p, w, d, centre);
      const s = blade(p, w, d, f);
      // Both broad faces of the blade glow in its colour, a little inside its edge.
      for (const side of [-1, 1]) {
        const g = new THREE.PlaneGeometry(T.sign.width - 0.25, T.sign.height - 0.4);
        if (f.alongX) g.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2).translate(s.x + side * 0.14, s.y + T.sign.height / 2, s.z);
        else g.rotateY(side > 0 ? 0 : Math.PI).translate(s.x, s.y + T.sign.height / 2, s.z + side * 0.14);
        out.push(glowing(g, p.sign, night ? 1.4 : 0.9));
      }
    }
  });
  return out;
}
