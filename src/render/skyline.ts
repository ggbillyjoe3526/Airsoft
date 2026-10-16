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
type Standing = Exclude<SkylinePiece, { kind: 'powerLine' } | { kind: 'treeline' } | { kind: 'skybridge' } | { kind: 'wire' } | { kind: 'wallUnit' }>;

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
    if (p.kind === 'skybridge') {
      skybridge(p, out);
      return;
    }
    if (p.kind === 'wire') {
      wire(p, out);
      return;
    }
    if (p.kind === 'wallUnit') {
      wallUnit(p, index, out);
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
      case 'silo':
        silos(p, w, d, out);
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
    if (p.kind === 'wallUnit') return true;
    if (p.kind === 'powerLine' || p.kind === 'skybridge' || p.kind === 'wire') {
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

type Tower = Extract<SkylinePiece, { kind: 'tower' }>;

/** A storey band of a tower: its footprint (`w` × `d` round the tower's middle) from `y0` up to `y1`. */
interface TowerSection {
  w: number;
  d: number;
  y0: number;
  y1: number;
}

/** A tower's body: one section from its base to its roof, or two where it steps in (MS1 `setback`). */
function towerSections(p: Tower, w: number, d: number): TowerSection[] {
  if (!p.setback) return [{ w, d, y0: p.base, y1: p.height }];
  const at = p.base + (p.height - p.base) * p.setback.at;
  const i = p.setback.inset * 2;
  return [
    { w, d, y0: p.base, y1: at },
    { w: Math.max(2, w - i), d: Math.max(2, d - i), y0: at, y1: p.height },
  ];
}

/** A window (or, on a far tower, a strip of `span` windows) of a tower's field side: its middle, whether lit by night. */
interface TowerWindow {
  x: number;
  y: number;
  z: number;
  lit: boolean;
  alongX: boolean;
  sign: number;
  span: number;
}

/**
 * Each window of a tower's field side, section by section (a setback's upper storeys have their own face). MS1: a tower
 * further than DRESSING.tower.ribbonFrom m from the field's middle has ribbon windows, `ribbon` windows to a pane, a
 * third of the triangles where nobody reads single panes through the haze.
 */
function towerWindows(p: Tower, w: number, d: number, index: number, centre: { x: number; z: number }): TowerWindow[] {
  const T = DRESSING.tower;
  const W = T.window;
  const far = Math.hypot(p.x - centre.x, p.z - centre.z) > T.ribbonFrom;
  const span = far ? T.ribbon : 1;
  const out: TowerWindow[] = [];
  const sections = towerSections(p, w, d);
  sections.forEach((sec, si) => {
    const f = towerFace(p, sec.w, sec.d, centre);
    const length = f.alongX ? sec.w : sec.d;
    const cols = Math.floor(Math.floor((length - 0.8) / W.pitch) / span);
    const pitch = W.pitch * span;
    // The billboard covers the top storeys of the first section's face (MS1): no windows behind it.
    const top = si === 0 && p.billboard !== undefined ? sec.y1 - T.billboard.height - T.billboard.below : sec.y1 - 1.2;
    for (let y = sec.y0 + W.from; y + W.height / 2 < top; y += W.floor) {
      for (let c = 0; c < cols; c++) {
        const along = (f.alongX ? p.x : p.z) - ((cols - 1) * pitch) / 2 + c * pitch;
        out.push({ x: f.alongX ? along : f.at, y, z: f.alongX ? f.at : along, lit: hash01(index, y, c) < T.lit.share, alongX: f.alongX, sign: f.sign, span });
      }
    }
  });
  return out;
}

/** A window's pane width: a single window's, or a ribbon's across `span` of them. */
const paneWidth = (q: TowerWindow): number => DRESSING.tower.window.width + (q.span - 1) * DRESSING.tower.window.pitch;

/** A flat quad on a tower's face (normal along x or z, `sign`), `lift` m off it. */
function faceQuad(q: { x: number; y: number; z: number; alongX: boolean; sign: number }, width: number, height: number, lift: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, height);
  // A plane faces +z: turn it to the face's normal.
  if (!q.alongX) g.rotateY(q.sign > 0 ? Math.PI / 2 : -Math.PI / 2);
  else if (q.sign < 0) g.rotateY(Math.PI);
  return g.translate(q.x + (q.alongX ? 0 : q.sign * lift), q.y, q.z + (q.alongX ? q.sign * lift : 0));
}

/** Where a tower's billboard hangs: the middle of its panel on the first section's field face, and the panel's size. */
function billboardAt(p: Tower, w: number, d: number, centre: { x: number; z: number }): { x: number; y: number; z: number; alongX: boolean; sign: number; width: number; height: number } {
  const B = DRESSING.tower.billboard;
  const sec = towerSections(p, w, d)[0]!;
  const f = towerFace(p, sec.w, sec.d, centre);
  const width = (f.alongX ? sec.w : sec.d) * B.share;
  const y = sec.y1 - B.below - B.height / 2;
  return { x: f.alongX ? p.x : f.at, y, z: f.alongX ? f.at : p.z, alongX: f.alongX, sign: f.sign, width, height: B.height };
}

/**
 * A city block: its body from `base` up (stepping in at a `setback`), a cornice on each section, dark glass windows on
 * its field side, a billboard's frame if it has one, and a tank or a mast on its roof.
 */
function tower(p: Tower, w: number, d: number, index: number, centre: { x: number; z: number }, out: THREE.BufferGeometry[]): void {
  const T = DRESSING.tower;
  const colour = p.colour ?? hex(T.colours[index % T.colours.length]!);
  for (const sec of towerSections(p, w, d)) {
    out.push(box(sec.w, sec.y1 - sec.y0, sec.d, p.x, sec.y0, p.z, colour));
    out.push(box(sec.w + 0.3, 0.4, sec.d + 0.3, p.x, sec.y1 - 0.4, p.z, hex(T.cornice)));
  }
  for (const q of towerWindows(p, w, d, index, centre)) out.push(painted(faceQuad(q, paneWidth(q), T.window.height, 0.03), hex(T.glass)));
  if (p.billboard !== undefined) {
    const b = billboardAt(p, w, d, centre);
    out.push(painted(faceQuad(b, b.width + T.billboard.frame * 2, b.height + T.billboard.frame * 2, 0.2), hex(T.billboard.plate)));
  }
  const top = p.height;
  const roof = towerSections(p, w, d).at(-1)!;
  if (hash01(index, 3, 9) < 0.5) {
    // A water tank on legs, its lid a shallow cone.
    const tx = p.x + (hash01(index, 1, 2) - 0.5) * roof.w * 0.4;
    const tz = p.z + (hash01(index, 2, 1) - 0.5) * roof.d * 0.4;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) out.push(box(0.15, 1.4, 0.15, tx + sx * 0.8, top, tz + sz * 0.8, hex(T.tank.legs)));
    out.push(painted(new THREE.CylinderGeometry(1.2, 1.25, 2.4, 10).translate(tx, top + 1.4 + 1.2, tz), hex(T.tank.colour)));
    out.push(painted(new THREE.ConeGeometry(1.3, 0.6, 10).translate(tx, top + 3.8 + 0.3, tz), hex(T.tank.legs)));
  } else {
    const m = towerMast(p, roof.w, roof.d, index);
    from.set(m.x, top, m.z);
    to.set(m.x, m.top, m.z);
    out.push(bar(from, to, 0.18, hex(T.mast.colour)));
  }
  // A plant room on the roof of a tall one breaks its box.
  if (p.height - p.base > T.plantFrom) out.push(box(roof.w * 0.4, 3, roof.d * 0.35, p.x - roof.w * 0.15, top, p.z + roof.d * 0.12, hex(T.cornice)));
  if (p.sign !== undefined) {
    const f = towerFace(p, w, d, centre);
    const s = blade(p, w, d, f);
    // A blade stands out from the face: thin along it, wide away from it, as its lit panels are (BP3: it lay flat on the face).
    out.push(f.alongX ? box(0.25, T.sign.height, T.sign.width, s.x, s.y, s.z, hex(T.sign.plate)) : box(T.sign.width, T.sign.height, 0.25, s.x, s.y, s.z, hex(T.sign.plate)));
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

// --- MS1: the estate's silos and the city's skybridges ----------------------------------------------------------

/** A row of silos along the longer side of the footprint, each a drum with a cone roof, a walkway over their tops. */
function silos(p: Extract<SkylinePiece, { kind: 'silo' }>, w: number, d: number, out: THREE.BufferGeometry[]): void {
  const D = DRESSING.silo;
  const longX = w >= d;
  const r = Math.min(w, d) / 2;
  const n = Math.max(1, Math.floor((longX ? w : d) / (r * 2 + D.gap)));
  const c = p.colour ?? hex(D.colour);
  const drum = p.height - r * D.roof;
  for (let i = 0; i < n; i++) {
    const along = -((n - 1) * (r * 2 + D.gap)) / 2 + i * (r * 2 + D.gap);
    const x = p.x + (longX ? along : 0);
    const z = p.z + (longX ? 0 : along);
    out.push(painted(new THREE.CylinderGeometry(r, r, drum, S.segments).translate(x, drum / 2, z), c));
    out.push(painted(new THREE.ConeGeometry(r * 1.03, r * D.roof, S.segments).translate(x, drum + (r * D.roof) / 2, z), hex(D.roofColour)));
    // A darker band near the foot, where the hoppers are.
    out.push(painted(new THREE.CylinderGeometry(r + 0.05, r + 0.05, D.band, S.segments).translate(x, D.bandAt, z), hex(D.bandColour)));
  }
  const span = n * (r * 2 + D.gap);
  out.push(longX ? box(span, 0.5, 1.4, p.x, drum + r * D.roof * 0.6, p.z, hex(D.walkway)) : box(1.4, 0.5, span, p.x, drum + r * D.roof * 0.6, p.z, hex(D.walkway)));
  // A stair tower at one end.
  const ex = p.x + (longX ? span / 2 + 1 : 0);
  const ez = p.z + (longX ? 0 : span / 2 + 1);
  out.push(box(2, drum + r * D.roof * 0.6, 2, ex, 0, ez, hex(D.walkway)));
}

/** An enclosed footbridge from one point to the next at `y`, glazed along its sides. */
function skybridge(p: Extract<SkylinePiece, { kind: 'skybridge' }>, out: THREE.BufferGeometry[]): void {
  const D = DRESSING.skybridge;
  for (let i = 0; i + 1 < p.points.length; i++) {
    const a = p.points[i]!;
    const b = p.points[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    m.lookAt(from.set(a.x, 0, a.z), to.set(b.x, 0, b.z), UP);
    m.setPosition((a.x + b.x) / 2, p.y, (a.z + b.z) / 2);
    out.push(painted(new THREE.BoxGeometry(p.width, p.height, len).translate(0, p.height / 2, 0).applyMatrix4(m), p.colour ?? hex(D.colour)));
    // A glazed band down each side and a darker deck under it.
    out.push(painted(new THREE.BoxGeometry(p.width + 0.06, p.height * 0.45, len - 0.4).translate(0, p.height * 0.55, 0).applyMatrix4(m), hex(DRESSING.tower.glass)));
    out.push(painted(new THREE.BoxGeometry(p.width + 0.3, 0.5, len).translate(0, -0.25, 0).applyMatrix4(m), hex(DRESSING.tower.cornice)));
  }
}

/** A cable's points: from its first point to its last, sagging DRESSING.wire.sag m in the middle, `segments` pieces. */
function wirePoints(p: Extract<SkylinePiece, { kind: 'wire' }>): THREE.Vector3[] {
  const D = DRESSING.wire;
  const a = p.points[0]!;
  const b = p.points.at(-1)!;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= D.segments; i++) {
    const t = i / D.segments;
    out.push(new THREE.Vector3(a.x + (b.x - a.x) * t, p.y - D.sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t));
  }
  return out;
}

/** An air-conditioning unit on a wall (MS1): a box standing out from the face, a darker grille, two brackets under it. */
function wallUnit(p: Extract<SkylinePiece, { kind: 'wallUnit' }>, index: number, out: THREE.BufferGeometry[]): void {
  const D = DRESSING.wallUnit;
  const alongX = p.facing === '+z' || p.facing === '-z';
  const sign = p.facing[0] === '+' ? 1 : -1;
  const at = (out: number): [number, number] => (alongX ? [p.x, p.z + sign * out] : [p.x + sign * out, p.z]);
  const sized = (w: number, h: number, d: number, outBy: number, y: number, c: number): THREE.BufferGeometry => {
    const [x, z] = at(outBy);
    return alongX ? box(w, h, d, x, y, z, c) : box(d, h, w, x, y, z, c);
  };
  const colour = hex(D.colours[index % D.colours.length]!);
  out.push(sized(D.width, D.height, D.depth, D.depth / 2, p.y - D.height / 2, colour));
  out.push(sized(D.height * 0.7, D.height * 0.7, 0.04, D.depth + 0.01, p.y - D.height * 0.35, hex(D.grille)));
  for (const e of [-1, 1]) {
    const [x, z] = at(D.depth / 2);
    out.push(alongX ? box(0.05, 0.06, D.depth, x + e * D.width * 0.35, p.y - D.height / 2 - 0.06, z, hex(D.grille)) : box(D.depth, 0.06, 0.05, x, p.y - D.height / 2 - 0.06, z + e * D.width * 0.35, hex(D.grille)));
  }
}

/** A cable strung across a street (MS1). */
function wire(p: Extract<SkylinePiece, { kind: 'wire' }>, out: THREE.BufferGeometry[]): void {
  const pts = wirePoints(p);
  for (let i = 0; i + 1 < pts.length; i++) out.push(bar(pts[i]!, pts[i + 1]!, DRESSING.wire.thick, hex(DRESSING.wire.colour)));
}

/**
 * The skyline's lights (G9): a warm light on each tower's mast and its blade sign's faces always, and by `night` the lit
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
    if (p.kind === 'wire' && p.lanterns !== undefined) {
      // Paper lanterns hung along the cable, a little under it.
      const L = DRESSING.wire.lantern;
      const pts = wirePoints(p);
      for (let i = 1; i + 1 < pts.length; i += L.every) {
        const q = pts[i]!;
        out.push(glowing(new THREE.CylinderGeometry(L.radius, L.radius, L.height, 6).translate(q.x, q.y - L.height / 2 - 0.1, q.z), p.lanterns, night ? L.night : L.day));
      }
      return;
    }
    if (p.kind !== 'tower') return;
    const [w, d] = footprint(p);
    if (night) {
      for (const q of towerWindows(p, w, d, index, centre)) {
        if (q.lit) out.push(glowing(faceQuad(q, paneWidth(q) - 0.08, T.window.height * 0.9, 0.05), hex(T.lit.colours[Math.floor(hash01(q.x, q.y, q.z) * T.lit.colours.length) % T.lit.colours.length]!), 1.25));
      }
    }
    if (p.strips !== undefined) {
      // MS1: a light strip up each edge of the field face, the whole height of the first section.
      const sec = towerSections(p, w, d)[0]!;
      const f = towerFace(p, sec.w, sec.d, centre);
      const half = (f.alongX ? sec.w : sec.d) / 2 - T.strip.inset;
      const y = (sec.y0 + 1 + sec.y1) / 2;
      for (const e of [-1, 1]) {
        const q = { x: f.alongX ? p.x + e * half : f.at, y, z: f.alongX ? f.at : p.z + e * half, alongX: f.alongX, sign: f.sign };
        out.push(glowing(faceQuad(q, T.strip.width, sec.y1 - sec.y0 - 1, 0.06), p.strips, night ? T.strip.night : T.strip.day));
      }
    }
    if (p.billboard !== undefined) {
      // MS1: the billboard's screen, lit by day and night, in two tones (a picture's lit half over its darker half).
      const b = billboardAt(p, w, d, centre);
      const k = night ? T.billboard.night : T.billboard.day;
      out.push(glowing(faceQuad({ ...b, y: b.y + b.height / 4 }, b.width, b.height / 2, 0.25), p.billboard, k));
      out.push(glowing(faceQuad({ ...b, y: b.y - b.height / 4 }, b.width, b.height / 2, 0.25), p.billboard, k * T.billboard.lower));
      // An advert's layout over it: a bright logo block to one side and lines of copy, so it reads as an ad, not a panel.
      const side = (q: number): typeof b => (b.alongX ? { ...b, x: b.x + q } : { ...b, z: b.z + q });
      out.push(glowing(faceQuad({ ...side(-b.width * 0.28), y: b.y + b.height * 0.12 }, b.width * 0.3, b.height * 0.55, 0.28), 0xffffff, k * 0.9));
      for (const [row, share] of [[0.3, 0.5], [0.12, 0.42], [-0.2, 0.36]] as const) {
        out.push(glowing(faceQuad({ ...side(b.width * 0.18), y: b.y + b.height * row }, b.width * share, b.height * 0.07, 0.28), 0x101018, 1));
      }
    }
    if (hash01(index, 3, 9) >= 0.5) {
      const roof = towerSections(p, w, d).at(-1)!;
      const m = towerMast(p, roof.w, roof.d, index);
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
