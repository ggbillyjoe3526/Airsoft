/**
 * Tiling noise for textures drawn texel by texel (G6, render/textureLibrary.ts; the concept's textures.ts): value noise on
 * a lattice that wraps every `period` cells, so whatever is built from it tiles across a wall without a seam. Pure and
 * deterministic: the same arguments give the same number on every machine.
 */

/** A hash of a lattice point and a seed, 0..1. */
export function hash3(i: number, j: number, seed: number): number {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const wrap = (a: number, period: number): number => ((a % period) + period) % period;

/**
 * Value noise at (u, v) in 0..1 of the tile, on a lattice of `pu` × `pv` cells that wraps at the tile's edges (a
 * different count along each axis stretches it: rain streaks are tall and thin). 0..1, smooth.
 */
export function tnoise2(u: number, v: number, pu: number, pv: number, seed = 0): number {
  const x = u * pu;
  const y = v * pv;
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  // Inside the tile (the usual case) only the far lattice line wraps; anywhere else the modulo does it.
  const i0 = i >= 0 && i < pu ? i : wrap(i, pu);
  const j0 = j >= 0 && j < pv ? j : wrap(j, pv);
  const i1 = i0 + 1 === pu ? 0 : i0 + 1;
  const j1 = j0 + 1 === pv ? 0 : j0 + 1;
  const a = hash3(i0, j0, seed);
  const b = hash3(i1, j0, seed);
  const c = hash3(i0, j1, seed);
  const d = hash3(i1, j1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Value noise on a square lattice of `period` cells. */
export function tnoise(u: number, v: number, period: number, seed = 0): number {
  return tnoise2(u, v, period, period, seed);
}

/** Fractal noise: `octaves` layers of tnoise, each twice as fine and half as strong. 0..1. */
export function fbm(u: number, v: number, period: number, octaves = 4, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let p = period;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * tnoise(u, v, p, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

/** Hermite step from `e0` to `e1` (either order), clamped. */
export function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
