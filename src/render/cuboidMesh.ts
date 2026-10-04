import * as THREE from 'three';
import { SURFACES } from '../config/render';

/**
 * The map's building brick (render/mapMeshes.ts): an axis-aligned box written into merged vertex buffers, with world-
 * or per-face UVs, a vertex colour darkened towards its foot (the grime band), and, with map detail (audit section 5),
 * 45° bevels on its vertical and top edges painted a little lighter (the "CS edge highlight"), faces cut into tiles so
 * a baked shade has vertices to land on, and that shade (vertex occlusion, ground variation) from a callback.
 */

export type UvMode = 'world' | 'perFace';

/** Merged vertex buffers for one mesh. */
export interface Buffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

export function emptyBuffers(): Buffers {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

/** An axis-aligned box to draw: its corners (world metres). */
export interface Cuboid {
  min: [number, number, number];
  max: [number, number, number];
}

/** How a cuboid is painted: its texture mapping, colour, and where its grime band starts (the ground under it), if any. */
export interface Paint {
  uv: UvMode;
  /** Metres one texture repeat covers (world UVs). */
  worldSize: number;
  color: THREE.Color;
  /** Height of the ground at its foot: side faces darken from here up over SURFACES.grimeHeight. Null: no grime. */
  grimeFrom: number | null;
}

/** A vertex's extra brightness (1 = none) at a point on a surface with a normal: the baked shade. */
export type VertexShade = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number;

/** The cuboid's shape beyond its box: none of it is the plain box of the look before map detail. */
export interface CuboidShape {
  /** Bevel size (metres) on the vertical and top edges; 0 for sharp edges. */
  bevel: number;
  /** Faces are cut into tiles about this size (metres); null leaves each face whole (split only at the grime band). */
  cell: number | null;
  /** The baked shade per vertex, or null for none. */
  shade: VertexShade | null;
}

/** The plain box (Low, and every piece without map detail). */
export const PLAIN: CuboidShape = { bevel: 0, cell: null, shade: null };

// Face definitions: normal, and the two axes used for U and V (V is up on every side face). u × v = n.
export const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
] as const;
type Face = (typeof FACES)[number];

const dot = (a: readonly number[], x: number, y: number, z: number): number => a[0]! * x + a[1]! * y + a[2]! * z;

/**
 * Cut points from `lo` to `hi`: the ends, every point of `at` strictly between them, and, with a `cell`, even cuts of
 * each stretch between those into pieces no longer than about `cell`.
 */
export function cuts(lo: number, hi: number, cell: number | null, at: readonly number[] = []): number[] {
  const fixed = [lo, ...at.filter((a) => a > lo + 1e-6 && a < hi - 1e-6).sort((a, b) => a - b), hi];
  if (cell === null) return fixed;
  const out: number[] = [lo];
  for (let k = 0; k + 1 < fixed.length; k++) {
    const a = fixed[k]!;
    const b = fixed[k + 1]!;
    const n = Math.max(1, Math.round((b - a) / cell));
    for (let i = 1; i <= n; i++) out.push(i === n ? b : a + ((b - a) * i) / n);
  }
  return out;
}

const vertexColor = new THREE.Color();

/** Writes cuboids into one set of buffers. Build-time only (it allocates freely). */
export function appendCuboid(buf: Buffers, box: Cuboid, paint: Paint, shape: CuboidShape = PLAIN): void {
  const half = [(box.max[0] - box.min[0]) / 2, (box.max[1] - box.min[1]) / 2, (box.max[2] - box.min[2]) / 2] as const;
  const centre = [(box.max[0] + box.min[0]) / 2, (box.max[1] + box.min[1]) / 2, (box.max[2] + box.min[2]) / 2] as const;
  const c = shape.bevel;
  const halfAlong = (axis: readonly number[]): number => Math.abs(axis[0]!) * half[0] + Math.abs(axis[1]!) * half[1] + Math.abs(axis[2]!) * half[2];
  const grimeSplit = paint.grimeFrom === null ? [] : [paint.grimeFrom + SURFACES.grimeHeight - centre[1]];

  /** Texture coordinates at a world point, mapped as `face` maps them (per-face: across the whole, unbevelled face). */
  const uvAt = (f: Face, x: number, y: number, z: number): [number, number] => {
    if (paint.uv === 'world') return [dot(f.u, x, y, z) / paint.worldSize, dot(f.v, x, y, z) / paint.worldSize];
    const hu = halfAlong(f.u);
    const hv = halfAlong(f.v);
    return [(dot(f.u, x - centre[0], y - centre[1], z - centre[2]) / hu + 1) / 2, (dot(f.v, x - centre[0], y - centre[1], z - centre[2]) / hv + 1) / 2];
  };

  /** Pushes one vertex: position, normal, UV as `uvFace` maps it, colour (grime below, highlight, baked shade). */
  const vertex = (x: number, y: number, z: number, nx: number, ny: number, nz: number, uvFace: Face, highlight: number): void => {
    buf.positions.push(x, y, z);
    buf.normals.push(nx, ny, nz);
    const [u, v] = uvAt(uvFace, x, y, z);
    buf.uvs.push(u, v);
    vertexColor.copy(paint.color);
    if (ny < 0.9 && ny > -0.9 && paint.grimeFrom !== null) {
      const t = (y - paint.grimeFrom) / SURFACES.grimeHeight;
      if (t < 1) vertexColor.multiplyScalar(SURFACES.grimeShade + (1 - SURFACES.grimeShade) * Math.max(0, t));
    }
    let k = highlight;
    if (shape.shade) k *= shape.shade(x, y, z, nx, ny, nz);
    if (k !== 1) vertexColor.multiplyScalar(k);
    buf.colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
  };

  // The six faces, each a grid of tiles (one tile, or two across the grime band, without a cell size).
  const side = (f: Face): boolean => f.n[1] === 0;
  let sideRows: number[] = [];
  for (const f of FACES) {
    const hu = halfAlong(f.u);
    const hv = halfAlong(f.v);
    const hn = halfAlong(f.n);
    const top = f.n[1] === 1;
    const bevelled = c > 0 && f.n[1] !== -1;
    const us = cuts(-hu + (bevelled ? c : 0), hu - (bevelled ? c : 0), shape.cell);
    const vs = side(f) ? cuts(-hv, hv - (bevelled ? c : 0), shape.cell, grimeSplit) : cuts(-hv + (top && bevelled ? c : 0), hv - (top && bevelled ? c : 0), shape.cell);
    if (side(f)) sideRows = vs;
    const base = buf.positions.length / 3;
    for (const sv of vs) {
      for (const su of us) {
        const x = centre[0] + f.n[0] * hn + f.u[0] * su + f.v[0] * sv;
        const y = centre[1] + f.n[1] * hn + f.u[1] * su + f.v[1] * sv;
        const z = centre[2] + f.n[2] * hn + f.u[2] * su + f.v[2] * sv;
        vertex(x, y, z, f.n[0], f.n[1], f.n[2], f, 1);
      }
    }
    const nu = us.length;
    for (let j = 0; j + 1 < vs.length; j++) {
      for (let i = 0; i + 1 < nu; i++) {
        const a = base + j * nu + i;
        buf.indices.push(a, a + 1, a + nu + 1, a, a + nu + 1, a + nu);
      }
    }
  }
  if (c <= 0) return;

  // Bevels: a strip down each vertical edge, along each top edge, and a triangle at each top corner.
  const hi = SURFACES.bevel.highlight;
  const [cx, cy, cz] = centre;
  const [hx, hy, hz] = half;
  const yTop = cy + hy;
  const xFace = (sx: number): Face => (sx > 0 ? FACES[0] : FACES[1]);
  const zFace = (sz: number): Face => (sz > 0 ? FACES[4] : FACES[5]);
  const ys = sideRows.map((v) => cy + v);
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const n = [sx * Math.SQRT1_2, 0, sz * Math.SQRT1_2] as const;
      strip(
        ys.map((y) => [cx + sx * hx, y, cz + sz * (hz - c)] as const),
        ys.map((y) => [cx + sx * (hx - c), y, cz + sz * hz] as const),
        n,
        xFace(sx),
      );
      const k = 1 / Math.sqrt(3);
      triangle(
        [cx + sx * hx, yTop - c, cz + sz * (hz - c)],
        [cx + sx * (hx - c), yTop - c, cz + sz * hz],
        [cx + sx * (hx - c), yTop, cz + sz * (hz - c)],
        [sx * k, k, sz * k],
        xFace(sx),
      );
    }
  }
  const xs = cuts(-hx + c, hx - c, shape.cell).map((u) => cx + u);
  const zs = cuts(-hz + c, hz - c, shape.cell).map((u) => cz + u);
  for (const sz of [1, -1]) {
    strip(
      xs.map((x) => [x, yTop - c, cz + sz * hz] as const),
      xs.map((x) => [x, yTop, cz + sz * (hz - c)] as const),
      [0, Math.SQRT1_2, sz * Math.SQRT1_2],
      zFace(sz),
    );
  }
  for (const sx of [1, -1]) {
    strip(
      zs.map((z) => [cx + sx * hx, yTop - c, z] as const),
      zs.map((z) => [cx + sx * (hx - c), yTop, z] as const),
      [sx * Math.SQRT1_2, Math.SQRT1_2, 0],
      xFace(sx),
    );
  }

  /** A strip of quads between two matching rows of points, wound to face `n`. */
  function strip(a: readonly (readonly number[])[], b: readonly (readonly number[])[], n: readonly number[], uvFace: Face): void {
    const base = buf.positions.length / 3;
    for (const p of [...a, ...b]) vertex(p[0]!, p[1]!, p[2]!, n[0]!, n[1]!, n[2]!, uvFace, hi);
    const m = a.length;
    const flip = facing(a[0]!, a[1]!, b[0]!, n) < 0;
    for (let i = 0; i + 1 < m; i++) {
      const [p, q, r, s] = [base + i, base + i + 1, base + m + i + 1, base + m + i];
      if (flip) buf.indices.push(p, r, q, p, s, r);
      else buf.indices.push(p, q, r, p, r, s);
    }
  }

  function triangle(p: readonly number[], q: readonly number[], r: readonly number[], n: readonly number[], uvFace: Face): void {
    const base = buf.positions.length / 3;
    for (const v of [p, q, r]) vertex(v[0]!, v[1]!, v[2]!, n[0]!, n[1]!, n[2]!, uvFace, hi);
    if (facing(p, q, r, n) < 0) buf.indices.push(base, base + 2, base + 1);
    else buf.indices.push(base, base + 1, base + 2);
  }
}

/** Which way the triangle p, q, r faces relative to `n`: positive when counter-clockwise seen from where `n` points. */
function facing(p: readonly number[], q: readonly number[], r: readonly number[], n: readonly number[]): number {
  const ax = q[0]! - p[0]!;
  const ay = q[1]! - p[1]!;
  const az = q[2]! - p[2]!;
  const bx = r[0]! - p[0]!;
  const by = r[1]! - p[1]!;
  const bz = r[2]! - p[2]!;
  return (ay * bz - az * by) * n[0]! + (az * bx - ax * bz) * n[1]! + (ax * by - ay * bx) * n[2]!;
}
