import * as THREE from 'three';
import { WOODLAND, WOODLAND_LAYOUT } from '../../src/map/woodland';
import { terrainHeightAt } from '../../src/map/terrain';
import type { Kit } from './kit';
import { MATS } from './kit';
import { TEX_METRES } from './textures';

/**
 * Shared helpers for the Woodland shot: seeded randomness, the ground's height (in the field and the world round it),
 * and a batcher that keeps per-vertex colour (the Kit bakes one tint per piece; foliage wants hue running through it).
 */

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const UP = V(0, 1, 0);

/** Seeded generator (mulberry32): every shot draws the same forest. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fixed hash of a position to 0..1 (a tree's species, a rock's tilt), stable whatever the build order. */
export function hash2(x: number, z: number, salt = 0): number {
  const h = Math.imul(Math.round(x * 10) ^ Math.imul(Math.round(z * 10), 19349663) ^ Math.imul(salt + 7, 83492791), 0x5bd1e995) >>> 0;
  return (Math.imul(h ^ (h >>> 13), 2654435761) >>> 0) / 4294967296;
}

/** Smooth value noise in 2D (not tiled), for scattering and the world's hills. */
export function noise2(x: number, z: number, salt = 0): number {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(i / 10, j / 10, salt);
  const b = hash2((i + 1) / 10, j / 10, salt);
  const c = hash2(i / 10, (j + 1) / 10, salt);
  const d = hash2((i + 1) / 10, (j + 1) / 10, salt);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

export function fbm2(x: number, z: number, oct = 4, salt = 0): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * noise2(x * f, z * f, salt + o * 13);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

export const MAP = WOODLAND;
export const LAYOUT = WOODLAND_LAYOUT;
const T = WOODLAND.terrain!;
export const HALF_X = WOODLAND_LAYOUT.halfX;
export const HALF_Z = WOODLAND_LAYOUT.halfZ;

/** Plan coordinates (the map file's sketch: x east 0..120, z north 0..80) to the world's. */
export const wx = (px: number) => px - HALF_X;
export const wz = (pz: number) => HALF_Z - pz;

/**
 * The world round the field: the field's edge height carried outwards, then rolling up into wooded hills. It dips a
 * little under the field's own terrain so the two never fight, and the fence hides the seam.
 */
export function outerHeight(x: number, z: number): number {
  const cx = Math.min(HALF_X, Math.max(-HALF_X, x));
  const cz = Math.min(HALF_Z, Math.max(-HALF_Z, z));
  const edge = terrainHeightAt(T, cx, cz) ?? 0;
  const out = Math.hypot(x - cx, z - cz);
  const rise = THREE.MathUtils.smoothstep(out, 4, 60) * (2 + fbm2(x * 0.012, z * 0.012, 3, 5) * 14) + THREE.MathUtils.smoothstep(out, 60, 260) * fbm2(x * 0.006, z * 0.006, 3, 9) * 38;
  return edge - 0.12 + rise + (fbm2(x * 0.08, z * 0.08, 2, 3) - 0.5) * 0.6 * THREE.MathUtils.smoothstep(out, 2, 12);
}

/** The ground's height anywhere: the field's terrain triangles inside the fence, the world outside it. */
export function groundY(x: number, z: number): number {
  return terrainHeightAt(T, x, z) ?? outerHeight(x, z);
}

/** Inside the fence (with a margin, m). */
export const inField = (x: number, z: number, margin = 0) => Math.abs(x) < HALF_X - margin && Math.abs(z) < HALF_Z - margin;

/** Distance from (x, z) to the polyline `pts`. */
export function polyDistance(x: number, z: number, pts: readonly { x: number; z: number }[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  if (pts.length === 1) best = Math.hypot(x - pts[0]!.x, z - pts[0]!.z);
  return best;
}

/** The three lanes' lines (world x, z): dressing that could read as cover stays off them. */
export const LANES = WOODLAND.lanes.map((l) => l.map((p) => ({ x: p.x, z: p.z })));
export const laneDistance = (x: number, z: number) => Math.min(...LANES.map((l) => polyDistance(x, z, l)));

/** Is (x, z) inside (or within `pad` m of) any block's footprint? */
export function inBlock(x: number, z: number, pad = 0, kinds?: readonly string[]): boolean {
  for (const b of WOODLAND.blocks) {
    if (kinds && !kinds.includes(b.kind)) continue;
    if (Math.abs(x - b.center.x) < b.size.x / 2 + pad && Math.abs(z - b.center.z) < b.size.z / 2 + pad) return true;
  }
  return false;
}

/** Is (x, z) inside a bush (MapData.foliage), its footprint shrunk by `shrink` m? */
export function inBush(x: number, z: number, shrink = 0): boolean {
  for (const b of WOODLAND.foliage ?? []) if (Math.hypot(x - b.x, z - b.z) < b.radius - shrink) return true;
  return false;
}

/**
 * A batcher with per-vertex colour: vertices, normals, colours and UVs written straight into growing typed arrays, then
 * one mesh per material from the Kit's own material (so it gets the preset's shading). Indexed, to keep memory down for
 * the big foliage sets.
 */
export class Bulk {
  private p = new Float32Array(3 * 4096);
  private n = new Float32Array(3 * 4096);
  private c = new Float32Array(3 * 4096);
  private t = new Float32Array(2 * 4096);
  private i = new Uint32Array(4096);
  nv = 0;
  ni = 0;

  constructor(readonly key: string) {}

  private grow(verts: number, idx: number): void {
    if ((this.nv + verts) * 3 > this.p.length) {
      const cap = Math.max((this.nv + verts) * 2, this.nv * 2);
      const g3 = (a: Float32Array) => {
        const b = new Float32Array(cap * 3);
        b.set(a.subarray(0, this.nv * 3));
        return b;
      };
      this.p = g3(this.p);
      this.n = g3(this.n);
      this.c = g3(this.c);
      const t = new Float32Array(cap * 2);
      t.set(this.t.subarray(0, this.nv * 2));
      this.t = t;
    }
    if (this.ni + idx > this.i.length) {
      const b = new Uint32Array(Math.max((this.ni + idx) * 2, this.i.length * 2));
      b.set(this.i.subarray(0, this.ni));
      this.i = b;
    }
  }

  /** One vertex; returns its index. */
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, r: number, g: number, b: number, u = 0, w = 0): number {
    this.grow(1, 0);
    const k = this.nv;
    this.p[k * 3] = x;
    this.p[k * 3 + 1] = y;
    this.p[k * 3 + 2] = z;
    this.n[k * 3] = nx;
    this.n[k * 3 + 1] = ny;
    this.n[k * 3 + 2] = nz;
    this.c[k * 3] = r;
    this.c[k * 3 + 1] = g;
    this.c[k * 3 + 2] = b;
    this.t[k * 2] = u;
    this.t[k * 2 + 1] = w;
    this.nv++;
    return k;
  }

  tri(a: number, b: number, c: number): void {
    this.grow(0, 3);
    this.i[this.ni++] = a;
    this.i[this.ni++] = b;
    this.i[this.ni++] = c;
  }

  /**
   * Adds a geometry placed by `m`, coloured per vertex by `col(x, y, z, nx, ny, nz)` (world position and normal) into
   * `out`. UVs: the geometry's own (`ownUv`), else projected from the world along the normal's main axis, `metres` a repeat.
   */
  geo(g: THREE.BufferGeometry, m: THREE.Matrix4 | null, col: (out: THREE.Color, x: number, y: number, z: number, nx: number, ny: number, nz: number) => void, opts: { ownUv?: boolean; metres?: number; flat?: boolean } = {}): void {
    let geo = g;
    if (opts.flat && geo.index) geo = geo.toNonIndexed();
    if (opts.flat || !geo.attributes.normal) geo.computeVertexNormals();
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
    const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    const metres = opts.metres ?? TEX_METRES[MATS[this.key]?.texKey ?? ''] ?? 1;
    const base = this.nv;
    const vp = new THREE.Vector3();
    const vn = new THREE.Vector3();
    const c = new THREE.Color();
    this.grow(pos.count, geo.index ? geo.index.count : pos.count);
    for (let i = 0; i < pos.count; i++) {
      vp.fromBufferAttribute(pos, i);
      vn.fromBufferAttribute(nrm, i);
      if (m) {
        vp.applyMatrix4(m);
        vn.applyMatrix3(nm!).normalize();
      }
      col(c, vp.x, vp.y, vp.z, vn.x, vn.y, vn.z);
      let u = 0;
      let w = 0;
      if (opts.ownUv && uv) {
        u = uv.getX(i);
        w = uv.getY(i);
      } else {
        const ax = Math.abs(vn.x);
        const ay = Math.abs(vn.y);
        const az = Math.abs(vn.z);
        if (ay >= ax && ay >= az) [u, w] = [vp.x, vp.z];
        else if (ax >= az) [u, w] = [vp.z, vp.y];
        else [u, w] = [vp.x, vp.y];
        u /= metres;
        w /= metres;
      }
      this.v(vp.x, vp.y, vp.z, vn.x, vn.y, vn.z, c.r, c.g, c.b, u, w);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i += 3) this.tri(base + geo.index.getX(i), base + geo.index.getX(i + 1), base + geo.index.getX(i + 2));
    else for (let i = 0; i < pos.count; i += 3) this.tri(base + i, base + i + 1, base + i + 2);
  }

  /** The batch as one mesh with the kit's material for its key (null when empty). */
  mesh(kit: Kit, shadows: { cast: boolean; receive: boolean } = { cast: true, receive: true }): THREE.Mesh | null {
    if (this.ni === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p.slice(0, this.nv * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.n.slice(0, this.nv * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.c.slice(0, this.nv * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.t.slice(0, this.nv * 2), 2));
    g.setIndex(new THREE.BufferAttribute(this.i.slice(0, this.ni), 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, kit.mat(this.key));
    mesh.name = this.key;
    mesh.castShadow = shadows.cast;
    mesh.receiveShadow = shadows.receive;
    return mesh;
  }
}

/** A set of batches by material key, built together. */
export class Bulks {
  private readonly map = new Map<string, Bulk>();
  get(key: string): Bulk {
    let b = this.map.get(key);
    if (!b) this.map.set(key, (b = new Bulk(key)));
    return b;
  }
  build(kit: Kit, group: THREE.Group, noCast: readonly string[] = []): void {
    for (const [key, b] of this.map) {
      const m = b.mesh(kit, { cast: !noCast.includes(key), receive: true });
      if (m) group.add(m);
    }
    this.map.clear();
  }
}

/** A matrix from position, Euler turn (YXZ) and scale. */
export function mtx(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V(sx, sy, sz));
}

/** A matrix that stands a +Y-up geometry from a to b (a cylinder between two points), scaled `r` across. */
export function between(a: THREE.Vector3, b: THREE.Vector3, r = 1): THREE.Matrix4 {
  const d = b.clone().sub(a);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  return new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), q, V(r, len, r));
}

/** Scales a geometry's own UVs (cylinders: u round, v along). */
export function scaleUv(g: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

/** Colour helpers. */
export const col = (hex: number) => new THREE.Color(hex);
export const tintFn = (hex: number, f?: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number) => {
  const base = new THREE.Color(hex);
  return (out: THREE.Color, x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    out.copy(base);
    if (f) out.multiplyScalar(f(x, y, z, nx, ny, nz));
  };
};
