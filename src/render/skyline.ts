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

/** A piece's footprint (x along world x, z along world z), its `turned` applied. */
function footprint(p: Exclude<SkylinePiece, { kind: 'powerLine' }>): [number, number] {
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
    if (p.kind === 'powerLine') {
      return p.points.every((q) => Math.hypot(q.x - x, q.z - z) >= S.treeClear);
    }
    const [w, d] = footprint(p);
    return Math.max(Math.abs(x - p.x) - w / 2, Math.abs(z - p.z) - d / 2) >= S.treeClear;
  });
}
