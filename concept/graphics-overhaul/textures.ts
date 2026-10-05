import * as THREE from 'three';

/**
 * Procedural, tileable textures drawn in code (no image files): a colour map, a normal map from a height field and a
 * roughness map. Every pattern wraps at the texture's edge so it tiles across a wall or a yard without a seam.
 */

function hash(i: number, j: number, seed: number): number {
  let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Value noise on a lattice that wraps every `period` cells: tileable. */
export function tnoise(u: number, v: number, period: number, seed = 0): number {
  const x = u * period;
  const y = v * period;
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = (a: number) => ((a % period) + period) % period;
  const a = hash(w(i), w(j), seed);
  const b = hash(w(i + 1), w(j), seed);
  const c = hash(w(i), w(j + 1), seed);
  const d = hash(w(i + 1), w(j + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function fbm(u: number, v: number, period: number, octaves = 4, seed = 0): number {
  let s = 0;
  let amp = 0.5;
  let p = period;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    s += amp * tnoise(u, v, p, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return s / norm;
}

export interface TexelOut {
  /** Colour 0..1 (multiplied by the material's vertex tint). */
  r: number;
  g: number;
  b: number;
  /** Height 0..1 for the normal map. */
  h: number;
  /** Roughness 0..1. */
  rough?: number;
}

export interface TexSet {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
}

const cache = new Map<string, TexSet>();

/**
 * Draws a texture set `size` texels square from `fn(u, v)`. `bump` scales the height into the normal map. With `full`
 * false only the colour map is made (Low).
 */
export function makeTex(key: string, size: number, full: boolean, bump: number, fn: (u: number, v: number) => TexelOut): TexSet {
  const k = `${key}:${size}:${full}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const col = new Uint8Array(size * size * 4);
  const hgt = new Float32Array(size * size);
  const rgh = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = fn((x + 0.5) / size, (y + 0.5) / size);
      const i = y * size + x;
      col[i * 4] = Math.max(0, Math.min(255, t.r * 255));
      col[i * 4 + 1] = Math.max(0, Math.min(255, t.g * 255));
      col[i * 4 + 2] = Math.max(0, Math.min(255, t.b * 255));
      col[i * 4 + 3] = 255;
      hgt[i] = t.h;
      const r = Math.max(0, Math.min(255, (t.rough ?? 1) * 255));
      rgh[i * 4] = r;
      rgh[i * 4 + 1] = r;
      rgh[i * 4 + 2] = r;
      rgh[i * 4 + 3] = 255;
    }
  }
  const tex = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = full ? 16 : 2;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const set: TexSet = { map: tex(col, true) };
  if (full) {
    const nrm = new Uint8Array(size * size * 4);
    const at = (x: number, y: number) => hgt[((y + size) % size) * size + ((x + size) % size)]!;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * bump * size / 256;
        const dy = (at(x, y + 1) - at(x, y - 1)) * bump * size / 256;
        const n = new THREE.Vector3(-dx, -dy, 1).normalize();
        const i = (y * size + x) * 4;
        nrm[i] = (n.x * 0.5 + 0.5) * 255;
        nrm[i + 1] = (n.y * 0.5 + 0.5) * 255;
        nrm[i + 2] = (n.z * 0.5 + 0.5) * 255;
        nrm[i + 3] = 255;
      }
    }
    set.normalMap = tex(nrm, false);
    set.roughnessMap = tex(rgh, false);
  }
  cache.set(k, set);
  return set;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Each texture covers `metres` square of surface (the world UVs divide by it). */
export const TEX_METRES: Record<string, number> = {
  concrete: 4,
  blocks: 2.4,
  plaster: 2,
  corrugated: 1.2,
  planks: 1.2,
  plywood: 1.2,
  fabric: 0.4,
  stones: 1.2,
  tread: 0.6,
  grass: 3,
  polymer: 0.15,
  metal: 0.3,
  weave: 0.08,
  cladding: 2,
};

export function concrete(size: number, full: boolean): TexSet {
  return makeTex('concrete', size, full, 1.4, (u, v) => {
    const big = fbm(u, v, 3, 3, 1);
    const mid = fbm(u, v, 12, 3, 31);
    const fine = fbm(u, v, 64, 2, 2);
    // Aggregate: small light and dark stones showing through the worn surface.
    const agg = tnoise(u, v, 256, 3);
    const speck = agg > 0.94 ? -0.1 : agg < 0.05 ? 0.06 : 0;
    // Hairline cracks: thin ridges of a noise field.
    const cr = Math.abs(fbm(u, v, 5, 4, 33) - 0.5);
    const crack = cr < 0.006 && mid > 0.45 ? 1 : 0;
    // Expansion joints at the texture's edges (every 4 m), a saw cut halfway, both darker with grime.
    const jx = Math.min(u, 1 - u) * 4;
    const jy = Math.min(v, 1 - v) * 4;
    const joint = Math.min(jx, jy) < 0.012 ? 1 : 0;
    const cut = Math.abs(u - 0.5) * 4 < 0.006 ? 0.6 : 0;
    const blot = smooth(0.55, 0.75, mid) * 0.1;
    const t = 0.86 + (big - 0.5) * 0.16 + (fine - 0.5) * 0.08 + speck - joint * 0.3 - cut * 0.14 - crack * 0.22 - blot;
    return { r: t, g: t * 0.985, b: t * 0.955, h: fine * 0.3 - joint - cut * 0.5 - crack * 0.4 + (agg > 0.94 ? 0.2 : 0), rough: 0.82 + (fine - 0.5) * 0.2 + blot };
  });
}

/** Precast concrete panels: formwork tie holes, small blow holes, faint pour lines. 2 m square. */
export function precast(size: number, full: boolean): TexSet {
  return makeTex('precast', size, full, 1.6, (u, v) => {
    const big = fbm(u, v, 2, 3, 41);
    const mid = fbm(u, v, 10, 3, 42);
    const fine = fbm(u, v, 80, 2, 43);
    // Tie holes on a 0.5 m grid (four across the tile), offset from the edges.
    const tx = (u * 4 + 0.5) % 1 - 0.5;
    const ty = (v * 4 + 0.5) % 1 - 0.5;
    const tie = Math.hypot(tx, ty) < 0.035 ? 1 : 0;
    const tieRing = Math.hypot(tx, ty) < 0.06 ? 1 : 0;
    // Blow holes: tiny pits.
    const pit = tnoise(u, v, 200, 44) > 0.955 ? 1 : 0;
    // Faint horizontal pour lines.
    const pour = Math.sin((v * 7 + mid * 0.6) * Math.PI * 2) * 0.5 + 0.5;
    const t = 0.88 + (big - 0.5) * 0.14 + (mid - 0.5) * 0.06 + (fine - 0.5) * 0.05 + (pour - 0.5) * 0.025 - tie * 0.45 - tieRing * 0.04 - pit * 0.18;
    return { r: t, g: t * 0.99, b: t * 0.97, h: 0.6 + fine * 0.2 - tie * 0.6 - pit * 0.4, rough: 0.88 + (fine - 0.5) * 0.15 };
  });
}

export function blocks(size: number, full: boolean): TexSet {
  // 2.4 m square: 12 courses of 0.2 m, blocks 0.4 m long, every other course offset.
  return makeTex('blocks', size, full, 2.5, (u, v) => {
    const row = Math.floor(v * 12);
    const fy = v * 12 - row;
    const off = row % 2 ? 0.5 : 0;
    const bx = u * 6 + off;
    const col = Math.floor(bx);
    const fx = bx - col;
    const m = 0.035;
    const mortar = fx < m || fx > 1 - m || fy < m * 2 || fy > 1 - m * 2;
    const tone = hash(((col % 6) + 6) % 6, row, 9) * 0.08;
    const fine = fbm(u, v, 48, 2, 4);
    const bevel = Math.min(smooth(0, 0.08, fx), smooth(1, 0.92, fx), smooth(0, 0.14, fy), smooth(1, 0.86, fy));
    const t = mortar ? 0.7 : 0.92 - tone + (fine - 0.5) * 0.06;
    return { r: t, g: t, b: t, h: mortar ? 0 : 0.6 + bevel * 0.4 + fine * 0.15, rough: mortar ? 1 : 0.8 };
  });
}

export function plaster(size: number, full: boolean): TexSet {
  return makeTex('plaster', size, full, 0.6, (u, v) => {
    const f = fbm(u, v, 24, 4, 5);
    const big = fbm(u, v, 2, 2, 6);
    const t = 0.94 + (f - 0.5) * 0.05 + (big - 0.5) * 0.06;
    return { r: t, g: t, b: t, h: f, rough: 0.9 };
  });
}

export function corrugated(size: number, full: boolean): TexSet {
  // Ribs every 0.3 m (four across the 1.2 m tile), trapezoid profile.
  return makeTex('corrugated', size, full, 6, (u, v) => {
    const p = (u * 4) % 1;
    const prof = smooth(0.1, 0.25, p) * (1 - smooth(0.6, 0.75, p));
    const grime = fbm(u, v, 8, 3, 7);
    const scratch = tnoise(u * 0.5, v * 6, 64, 8) > 0.965 ? 0.12 : 0;
    const chip = tnoise(u, v, 90, 9) > 0.93 && prof > 0.5 ? 1 : 0;
    const dent = fbm(u, v, 3, 2, 34);
    const t = 0.9 - prof * 0.07 + (grime - 0.5) * 0.12 + scratch - chip * 0.25;
    return { r: t + chip * 0.05, g: t, b: t - chip * 0.04, h: prof + (dent - 0.5) * 0.25 - chip * 0.1, rough: 0.5 + grime * 0.25 + chip * 0.2 };
  });
}

export function cladding(size: number, full: boolean): TexSet {
  return makeTex('cladding', size, full, 4, (u, v) => {
    const p = (u * 5) % 1;
    const seam = Math.abs(p - 0.5) < 0.03 ? 1 : 0;
    const f = fbm(u, v, 6, 3, 21);
    const t = 0.92 + (f - 0.5) * 0.06 - seam * 0.1;
    return { r: t, g: t, b: t, h: seam, rough: 0.5 };
  });
}

export function planks(size: number, full: boolean): TexSet {
  // Boards 0.15 m wide (8 across), grain along u, weathered: grey where the sun has bleached them, nail holes, splits.
  return makeTex('planks', size, full, 2.4, (u, v) => {
    const board = Math.floor(v * 8);
    const fy = v * 8 - board;
    const gap = fy < 0.04 || fy > 0.96;
    const warp = fbm(u, v, 8, 3, board + 10);
    const grain = Math.sin((u * 6 + warp * 2.5) * Math.PI * 7) * 0.5 + 0.5;
    const fineGrain = Math.sin((u * 40 + warp * 6) * Math.PI * 2) * 0.5 + 0.5;
    const tone = hash(board, 0, 11) * 0.14;
    const knot = tnoise(u, v, 12, 12 + board) > 0.9 ? -0.14 : 0;
    const bleach = smooth(0.5, 0.8, fbm(u, v, 4, 3, 50 + board)) * 0.5;
    const nail = (Math.abs(u * 4 % 1 - 0.06) < 0.012 || Math.abs(u * 4 % 1 - 0.94) < 0.012) && Math.abs(fy - 0.5) < 0.07 ? 1 : 0;
    const split = Math.abs(fy - 0.3 - warp * 0.2) < 0.01 && tnoise(u, v, 6, 51 + board) > 0.7 ? 1 : 0;
    const base = gap ? 0.3 : 0.84 - tone + grain * 0.08 + fineGrain * 0.03 + knot - nail * 0.45 - split * 0.35;
    const grey = base * 0.92;
    const r = lerp(base, grey, bleach);
    const g = lerp(base * 0.94, grey * 0.97, bleach);
    const b = lerp(base * 0.86, grey * 0.97, bleach);
    return { r, g, b, h: gap ? 0 : 0.7 + grain * 0.15 + fineGrain * 0.08 - nail * 0.4 - split * 0.3, rough: 0.8 + bleach * 0.15 };
  });
}

export function plywood(size: number, full: boolean): TexSet {
  return makeTex('plywood', size, full, 0.9, (u, v) => {
    // Rotary-cut veneer: long, gently wandering grain lines along the sheet, not swirls.
    const warp = fbm(u, v, 2, 3, 13) * 1.3 + fbm(u, v, 9, 2, 17) * 0.15;
    const line = Math.pow(Math.abs(Math.sin((v * 12 + warp) * Math.PI)), 8);
    const big = fbm(u, v, 3, 2, 14);
    const fleck = tnoise(u, v, 512, 19) > 0.9 ? -0.03 : 0;
    const t = 0.9 - line * 0.09 + (big - 0.5) * 0.08 + fleck;
    return { r: t, g: t * 0.97, b: t * 0.9, h: 1 - line * 0.5, rough: 0.85 };
  });
}

export function fabric(size: number, full: boolean): TexSet {
  return makeTex('fabric', size, full, 1.6, (u, v) => {
    const w = (Math.sin(u * Math.PI * 2 * 40) * Math.sin(v * Math.PI * 2 * 40)) * 0.5 + 0.5;
    const f = fbm(u, v, 4, 3, 15);
    const t = 0.9 + (w - 0.5) * 0.06 + (f - 0.5) * 0.08;
    return { r: t, g: t, b: t, h: w * 0.6 + f * 0.4, rough: 0.95 };
  });
}

export function weave(size: number, full: boolean): TexSet {
  // Cordura-like weave for gear and clothing.
  return makeTex('weave', size, full, 1.4, (u, v) => {
    const a = Math.sin(u * Math.PI * 2 * 32);
    const b = Math.sin(v * Math.PI * 2 * 32);
    const over = (a * b) * 0.5 + 0.5;
    const f = fbm(u, v, 4, 2, 16);
    const t = 0.92 + (over - 0.5) * 0.08 + (f - 0.5) * 0.04;
    return { r: t, g: t, b: t, h: over * 0.35 + f * 0.4, rough: 0.9 };
  });
}

export function stones(size: number, full: boolean): TexSet {
  // Angular grey rubble behind gabion wire: Voronoi stones, each lit like a facet from the top left, deep gaps.
  return makeTex('stones', size, full, 3, (u, v) => {
    const n = 8;
    let d1 = 9;
    let d2 = 9;
    let id = 0;
    let fx = 0;
    let fy = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const ci = Math.floor(u * n) + i;
        const cj = Math.floor(v * n) + j;
        const wi = ((ci % n) + n) % n;
        const wj = ((cj % n) + n) % n;
        const px = ci + hash(wi, wj, 17) * 0.8 + 0.1;
        const py = cj + hash(wi, wj, 18) * 0.8 + 0.1;
        const dx = u * n - px;
        const dy = v * n - py;
        // Chebyshev-leaning distance gives flatter, more angular faces than round cobbles.
        const d = Math.max(Math.abs(dx), Math.abs(dy)) * 0.6 + Math.sqrt(dx * dx + dy * dy) * 0.4;
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = hash(wi, wj, 19);
          fx = dx;
          fy = dy;
        } else if (d < d2) d2 = d;
      }
    }
    const edge = smooth(0, 0.14, d2 - d1);
    const grain = fbm(u, v, 40, 2, 20);
    const facet = 0.86 + (-fx + fy) * 0.32;
    const t = (0.7 + id * 0.3 + (grain - 0.5) * 0.12) * facet * (0.32 + edge * 0.68);
    const cool = 0.015 * (id - 0.5);
    return { r: t - cool, g: t, b: t + 0.012 + cool, h: edge * (0.6 + (1 - d1) * 0.4) + grain * 0.1, rough: 0.9 };
  });
}

export function tread(size: number, full: boolean): TexSet {
  // Diamond tread plate.
  return makeTex('tread', size, full, 3, (u, v) => {
    const n = 6;
    const cx = (u * n) % 1;
    const cy = (v * n + (Math.floor(u * n) % 2) * 0.5) % 1;
    const dx = (cx - 0.5) * 3.2;
    const dy = cy - 0.5;
    const ridge = Math.abs(dx + dy) < 0.12 || Math.abs(dx - dy) < 0.12 ? 0 : 0;
    const lozenge = Math.abs(dx * 0.6) + Math.abs(dy * 2.6) < 0.5 ? 1 : ridge;
    const f = fbm(u, v, 6, 2, 22);
    const t = 0.78 + lozenge * 0.1 + (f - 0.5) * 0.08;
    return { r: t, g: t, b: t, h: lozenge, rough: 0.45 + (1 - lozenge) * 0.2 };
  });
}

export function grass(size: number, full: boolean): TexSet {
  return makeTex('grass', size, full, 1.2, (u, v) => {
    const f = fbm(u, v, 6, 4, 23);
    const blades = tnoise(u, v, 200, 24);
    const t = 0.85 + (f - 0.5) * 0.22 + (blades - 0.5) * 0.1;
    return { r: t * 0.95, g: t, b: t * 0.85, h: blades, rough: 0.95 };
  });
}

export function polymer(size: number, full: boolean): TexSet {
  return makeTex('polymer', size, full, 0.25, (u, v) => {
    const f = tnoise(u, v, 32, 25) * 0.6 + tnoise(u, v, 8, 28) * 0.4;
    const t = 0.95 + (f - 0.5) * 0.04;
    return { r: t, g: t, b: t, h: f, rough: 0.55 + f * 0.15 };
  });
}

export function metal(size: number, full: boolean): TexSet {
  return makeTex('metal', size, full, 0.3, (u, v) => {
    const brushed = tnoise(u * 0.05, v, 128, 26);
    const f = fbm(u, v, 4, 3, 27);
    const scratch = Math.abs(tnoise(u * 0.3, v * 3, 48, 29) - 0.5) < 0.008 ? 1 : 0;
    const t = 0.94 + (brushed - 0.5) * 0.06 + scratch * 0.08;
    return { r: t, g: t, b: t, h: brushed - scratch * 0.3, rough: 0.3 + f * 0.25 - scratch * 0.1 };
  });
}

/** Canvas texture with text or shapes (decals: stencils, logos, numbers). */
export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export { lerp, smooth };

export function hazard(size: number, full: boolean): TexSet {
  return makeTex('hazard', size, full, 0.5, (u, v) => {
    const s = ((u + v) * 4) % 1;
    const yellow = s < 0.5;
    const f = fbm(u, v, 8, 2, 30);
    const wear = f > 0.68 ? 0.25 : 0;
    const r = yellow ? 0.96 : 0.12;
    const g = yellow ? 0.76 : 0.12;
    const b = yellow ? 0.12 : 0.13;
    return { r: r * (1 - wear) + 0.6 * wear, g: g * (1 - wear) + 0.58 * wear, b: b * (1 - wear) + 0.55 * wear, h: wear, rough: 0.6 };
  });
}
TEX_METRES.hazard = 0.6;

TEX_METRES.precast = 2;
TEX_METRES.camo = 0.7;
TEX_METRES.perforated = 0.05;
TEX_METRES.panel = 0.6;
TEX_METRES.carton = 0.8;
TEX_METRES.louvre = 0.5;

/** Camouflage cloth: three tones of soft blobs over the weave (tinted per team). */
export function camo(size: number, full: boolean): TexSet {
  return makeTex('camo', size, full, 1.2, (u, v) => {
    const a = fbm(u, v, 5, 3, 60);
    const b = fbm(u + 0.31, v + 0.17, 7, 3, 61);
    const c = fbm(u + 0.6, v + 0.4, 9, 2, 62);
    // Soft-edged blobs, like printed multi-tone camouflage, not hard digital shapes.
    const ma = smooth(0.54, 0.58, a);
    const mb = smooth(0.58, 0.62, b);
    const mc = smooth(0.66, 0.7, c) * (1 - mb);
    let t = 0.95 + (0.72 - 0.95) * ma;
    t += (0.52 - t) * mb;
    t += (1.02 - t) * mc;
    const hue = 0.02 * ma - 0.04 * mb;
    const w = Math.sin(u * Math.PI * 2 * 90) * Math.sin(v * Math.PI * 2 * 90) * 0.5 + 0.5;
    const tt = t + (w - 0.5) * 0.015;
    return { r: tt + hue, g: tt, b: tt - hue, h: w * 0.12 + fbm(u, v, 24, 2, 63) * 0.3, rough: 0.92 };
  });
}

/** Perforated steel for mesh face masks: round holes on a staggered grid. */
export function perforated(size: number, full: boolean): TexSet {
  return makeTex('perforated', size, full, 3, (u, v) => {
    const n = 10;
    const row = Math.floor(v * n);
    const fx = (u * n + (row % 2) * 0.5) % 1 - 0.5;
    const fy = v * n - row - 0.5;
    const hole = Math.hypot(fx, fy) < 0.32;
    const t = hole ? 0.12 : 0.9;
    return { r: t, g: t, b: t, h: hole ? 0 : 1, rough: hole ? 1 : 0.5 };
  });
}

/** Painted metal panels for the robot shells: panel lines, screws, chipped edges. */
export function panel(size: number, full: boolean): TexSet {
  return makeTex('panel', size, full, 2, (u, v) => {
    const line = Math.min(Math.abs(u - 0.5), Math.abs(v - 0.33), Math.abs(v - 0.83)) < 0.004 ? 1 : 0;
    const sx = (u * 8) % 1 - 0.5;
    const sy = (v * 6 + 0.5) % 1 - 0.5;
    const screw = Math.hypot(sx, sy) < 0.06 && (Math.floor(u * 8) % 3 === 0) ? 1 : 0;
    const chip = fbm(u, v, 40, 3, 63) > 0.76 && Math.min(u % 0.5, v % 0.5) < 0.08 ? 1 : 0;
    const f = fbm(u, v, 6, 3, 64);
    const t = 0.94 + (f - 0.5) * 0.05 - line * 0.35 - screw * 0.2;
    return { r: chip ? 0.62 : t, g: chip ? 0.63 : t, b: chip ? 0.66 : t, h: 0.6 - line * 0.6 + screw * 0.3 - chip * 0.15, rough: chip ? 0.35 : 0.45 + f * 0.1 };
  });
}

/** Corrugated cardboard: faint flutes, print-free. */
export function carton(size: number, full: boolean): TexSet {
  return makeTex('carton', size, full, 0.6, (u, v) => {
    const fl = Math.sin(u * Math.PI * 2 * 80) * 0.5 + 0.5;
    const f = fbm(u, v, 6, 3, 65);
    const scuff = fbm(u, v, 20, 2, 66) > 0.68 ? 0.06 : 0;
    const t = 0.92 + (f - 0.5) * 0.1 + fl * 0.02 + scuff;
    return { r: t, g: t * 0.97, b: t * 0.92, h: fl * 0.3 + f * 0.3, rough: 0.95 };
  });
}

/** Louvred grille: horizontal slats with dark gaps (generators, vents). */
export function louvre(size: number, full: boolean): TexSet {
  return makeTex('louvre', size, full, 4, (u, v) => {
    const p = (v * 10) % 1;
    const slat = smooth(0.0, 0.15, p) * (1 - smooth(0.7, 0.85, p));
    const t = 0.25 + slat * 0.7;
    return { r: t, g: t, b: t, h: slat, rough: 0.5 };
  });
}

TEX_METRES.timber = 1.2;

/** A single sawn board's grain (no gaps): crate boards, posts and battens built as separate pieces. */
export function timber(size: number, full: boolean): TexSet {
  return makeTex('timber', size, full, 1.8, (u, v) => {
    const warp = fbm(u, v, 6, 3, 70);
    const grain = Math.sin((v * 14 + warp * 3) * Math.PI * 2) * 0.5 + 0.5;
    const fine = Math.sin((v * 90 + warp * 9) * Math.PI * 2) * 0.5 + 0.5;
    const knot = tnoise(u, v, 10, 71) > 0.92 ? -0.12 : 0;
    const bleach = smooth(0.5, 0.8, fbm(u, v, 3, 3, 72)) * 0.45;
    const base = 0.86 + grain * 0.07 + fine * 0.03 + knot + (warp - 0.5) * 0.08;
    const grey = base * 0.9;
    return { r: lerp(base, grey, bleach), g: lerp(base * 0.94, grey * 0.97, bleach), b: lerp(base * 0.86, grey * 0.97, bleach), h: 0.6 + grain * 0.2 + fine * 0.1, rough: 0.82 + bleach * 0.12 };
  });
}
