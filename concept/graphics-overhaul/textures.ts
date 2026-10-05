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
  return makeTex('concrete', size, full, 1.2, (u, v) => {
    const big = fbm(u, v, 3, 3, 1);
    const fine = fbm(u, v, 64, 2, 2);
    const speck = tnoise(u, v, 256, 3) > 0.93 ? -0.08 : 0;
    // Expansion joints at the texture's edges (every 4 m), a saw cut halfway.
    const jx = Math.min(u, 1 - u) * 4;
    const jy = Math.min(v, 1 - v) * 4;
    const joint = Math.min(jx, jy) < 0.012 ? 1 : 0;
    const cut = Math.abs(u - 0.5) * 4 < 0.006 ? 0.6 : 0;
    const t = 0.86 + (big - 0.5) * 0.12 + (fine - 0.5) * 0.06 + speck - joint * 0.25 - cut * 0.12;
    return { r: t, g: t * 0.98, b: t * 0.94, h: fine * 0.3 - joint - cut * 0.5, rough: 0.85 + (fine - 0.5) * 0.2 };
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
    const scratch = tnoise(u * 0.5, v * 6, 64, 8) > 0.97 ? 0.15 : 0;
    const t = 0.9 - prof * 0.06 + (grime - 0.5) * 0.08 + scratch;
    return { r: t, g: t, b: t, h: prof, rough: 0.55 + grime * 0.2 };
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
  // Boards 0.15 m wide (8 across), grain along u.
  return makeTex('planks', size, full, 2.2, (u, v) => {
    const board = Math.floor(v * 8);
    const fy = v * 8 - board;
    const gap = fy < 0.05 || fy > 0.95;
    const grain = Math.sin((u * 6 + fbm(u, v, 8, 3, board + 10) * 2.5) * Math.PI * 6) * 0.5 + 0.5;
    const tone = hash(board, 0, 11) * 0.12;
    const knot = tnoise(u, v, 12, 12 + board) > 0.9 ? -0.12 : 0;
    const t = gap ? 0.45 : 0.86 - tone + grain * 0.07 + knot;
    return { r: t, g: t * 0.97, b: t * 0.93, h: gap ? 0 : 0.7 + grain * 0.15, rough: 0.8 };
  });
}

export function plywood(size: number, full: boolean): TexSet {
  return makeTex('plywood', size, full, 0.9, (u, v) => {
    const grain = Math.sin((v * 10 + fbm(u, v, 6, 4, 13) * 4) * Math.PI * 4) * 0.5 + 0.5;
    const big = fbm(u, v, 3, 2, 14);
    const t = 0.88 + grain * 0.06 + (big - 0.5) * 0.08;
    return { r: t, g: t * 0.97, b: t * 0.92, h: grain * 0.4, rough: 0.85 };
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
    const a = Math.sin(u * Math.PI * 2 * 16);
    const b = Math.sin(v * Math.PI * 2 * 16);
    const over = (a * b) * 0.5 + 0.5;
    const f = fbm(u, v, 4, 2, 16);
    const t = 0.92 + (over - 0.5) * 0.08 + (f - 0.5) * 0.04;
    return { r: t, g: t, b: t, h: over, rough: 0.9 };
  });
}

export function stones(size: number, full: boolean): TexSet {
  // Rounded cobbles behind gabion wire: cellular pattern.
  return makeTex('stones', size, full, 3, (u, v) => {
    const n = 12;
    let d1 = 9;
    let d2 = 9;
    let id = 0;
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
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = hash(wi, wj, 19);
        } else if (d < d2) d2 = d;
      }
    }
    const edge = smooth(0, 0.18, d2 - d1);
    const t = (0.78 + id * 0.2) * (0.72 + edge * 0.28);
    return { r: t, g: t * 0.97, b: t * 0.92, h: edge, rough: 0.9 };
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
    const t = 0.94 + (brushed - 0.5) * 0.06;
    return { r: t, g: t, b: t, h: brushed, rough: 0.3 + f * 0.2 };
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
