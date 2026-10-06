import type { SurfaceTextureId } from '../config/render';
import { type TextureWear, WEATHERING } from '../config/weathering';
import { fbm, hash3, lerp, smooth, tnoise, tnoise2 } from './texelNoise';

/**
 * The texture library's drawings (G6, from the concept's textures.ts): surfaces worked out texel by texel from tiling
 * noise, so they are pure (the same pixels on every machine, testable without a canvas) and the same picture at any
 * Texture detail. Grey precast concrete panels for walls, grey rubble behind galvanised wire for gabions (William: never
 * sand, never brick), and worn paint on steel for the set dressing to come. Each drawing carries its own wear (rain
 * streaks, rust, chipped paint, scratches; config/weathering.ts). Colours are sRGB 0..1, multiplied by each piece's
 * vertex colour, so a white drawing takes its piece's paint.
 */

/** The surfaces the library draws. */
export type LibraryDrawingId = 'blockWall' | 'gabion' | 'paint';
export const LIBRARY_DRAWINGS: readonly LibraryDrawingId[] = ['blockWall', 'gabion', 'paint'];

export function isLibraryDrawing(id: SurfaceTextureId): id is LibraryDrawingId {
  return (LIBRARY_DRAWINGS as readonly string[]).includes(id);
}

/** One texel's colour, written in place (no allocation per texel). */
interface Texel {
  r: number;
  g: number;
  b: number;
}

/**
 * Wear over a texel at (u, v) of the tile: rain streaks running down it, rust blooms, chips and scratches, each as
 * strong as `w` says. Every mark tiles (its noise wraps at the tile's edge).
 */
function wear(t: Texel, u: number, v: number, w: TextureWear, seed: number): void {
  if (w.streaks > 0) {
    // Tall thin streaks: fine across, long down the tile, strongest where a coarser noise says water ran.
    const s = smooth(0.62, 0.92, tnoise2(u, v, 40, 3, seed + 1)) * (0.4 + 0.6 * tnoise(u, v, 4, seed + 2));
    const k = 1 - 0.18 * w.streaks * s;
    t.r *= k;
    t.g *= k;
    t.b *= k * 0.98;
  }
  if (w.rust > 0) {
    const bloom = smooth(0.64, 0.8, fbm(u, v, 6, 3, seed + 3) + 0.08 * tnoise(u, v, 48, seed + 4)) * w.rust;
    const grain = 0.75 + 0.5 * tnoise(u, v, 96, seed + 5);
    t.r = lerp(t.r, 0.45 * grain, bloom * 0.85);
    t.g = lerp(t.g, 0.24 * grain, bloom * 0.85);
    t.b = lerp(t.b, 0.12 * grain, bloom * 0.85);
  }
  if (w.chips > 0) {
    // Chips: small hard-edged flakes where a fine noise peaks, a darker rim round each.
    const n = fbm(u, v, 24, 3, seed + 6);
    const edge = 0.79 - 0.05 * w.chips;
    if (n > edge) {
      const under = n > edge + 0.015 ? 0.52 : 0.4;
      t.r = lerp(t.r, under, w.chips);
      t.g = lerp(t.g, under * 0.98, w.chips);
      t.b = lerp(t.b, under * 0.95, w.chips);
    }
  }
  if (w.scratches > 0) {
    // Scratches: thin ridges of a noise stretched along the tile, lighter than the paint.
    const s = Math.abs(tnoise2(u, v, 6, 48, seed + 7) - 0.5) < 0.006 && tnoise(u, v, 8, seed + 8) > 0.5 ? 1 : 0;
    const k = 0.1 * w.scratches * s;
    t.r += k;
    t.g += k;
    t.b += k;
  }
}

/**
 * Precast concrete panels, one 2 m panel per repeat (config SURFACES.worldSize.blockWall): a cool grey with mottling,
 * formwork tie holes on a 0.5 m grid, small blow holes, faint pour lines and the panel joint along the tile's edges.
 */
function precast(t: Texel, u: number, v: number): void {
  const big = fbm(u, v, 2, 3, 41);
  const mid = fbm(u, v, 10, 3, 42);
  const fine = fbm(u, v, 64, 2, 43);
  const tx = ((u * 4 + 0.5) % 1) - 0.5;
  const ty = ((v * 4 + 0.5) % 1) - 0.5;
  const r = Math.hypot(tx, ty);
  const tie = r < 0.035 ? 1 : 0;
  const ring = r < 0.06 ? 1 : 0;
  const pit = tnoise(u, v, 200, 44) > 0.955 ? 1 : 0;
  const pour = Math.sin((v * 7 + mid * 0.6) * Math.PI * 2) * 0.5 + 0.5;
  // The joint between panels: a dark groove with a lighter arris beside it.
  const ju = Math.min(u, 1 - u);
  const jv = Math.min(v, 1 - v);
  const joint = Math.min(ju, jv) < 0.005 ? 1 : 0;
  const arris = !joint && Math.min(ju, jv) < 0.011 ? 1 : 0;
  const k = 0.78 + (big - 0.5) * 0.14 + (mid - 0.5) * 0.07 + (fine - 0.5) * 0.06 + (pour - 0.5) * 0.025 - tie * 0.4 - ring * 0.04 - pit * 0.16 - joint * 0.36 + arris * 0.05;
  t.r = k * 0.985;
  t.g = k * 0.99;
  t.b = k;
}

/**
 * Angular grey rubble behind galvanised wire (a 1.2 m repeat): Voronoi stones lit like facets from the top left, deep
 * gaps between them, and the welded mesh in front, 16 squares a repeat with a glint down one side of each wire.
 */
function rubble(t: Texel, u: number, v: number): void {
  const n = 8;
  let d1 = 9;
  let d2 = 9;
  let id = 0;
  let fx = 0;
  let fy = 0;
  const cu = Math.floor(u * n);
  const cv = Math.floor(v * n);
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const ci = cu + i;
      const cj = cv + j;
      const wi = ((ci % n) + n) % n;
      const wj = ((cj % n) + n) % n;
      const dx = u * n - (ci + hash3(wi, wj, 17) * 0.8 + 0.1);
      const dy = v * n - (cj + hash3(wi, wj, 18) * 0.8 + 0.1);
      // Leaning towards the Chebyshev distance gives flatter, more angular faces than round cobbles.
      const d = Math.max(Math.abs(dx), Math.abs(dy)) * 0.6 + Math.sqrt(dx * dx + dy * dy) * 0.4;
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash3(wi, wj, 19);
        fx = dx;
        fy = dy;
      } else if (d < d2) d2 = d;
    }
  }
  const edge = smooth(0, 0.14, d2 - d1);
  const grain = fbm(u, v, 40, 2, 20);
  const facet = 0.86 + (-fx - fy) * 0.3;
  const k = (0.5 + id * 0.26 + (grain - 0.5) * 0.12) * facet * (0.3 + edge * 0.7);
  const cool = 0.015 * (id - 0.5);
  t.r = k - cool;
  t.g = k;
  t.b = k + 0.012 + cool;
  // The mesh: a dark wire with a light glint along one side.
  const squares = 16;
  const wu = (u * squares) % 1;
  const wv = (v * squares) % 1;
  const wire = wu < 0.06 || wv < 0.06;
  const glint = !wire && (wu < 0.09 || wv < 0.09);
  if (wire) t.r = t.g = t.b = 0.5 + 0.08 * tnoise(u, v, 64, 21);
  else if (glint) {
    t.r = lerp(t.r, 0.86, 0.6);
    t.g = lerp(t.g, 0.87, 0.6);
    t.b = lerp(t.b, 0.88, 0.6);
  }
}

/** Painted steel: near white (the piece's colour is the paint's), a faint orange-peel mottle and its wear. */
function paint(t: Texel, u: number, v: number): void {
  const f = fbm(u, v, 6, 3, 31);
  const peel = tnoise(u, v, 128, 32);
  const k = 0.93 + (f - 0.5) * 0.06 + (peel - 0.5) * 0.02;
  t.r = k;
  t.g = k;
  t.b = k;
}

const DRAW: Record<LibraryDrawingId, (t: Texel, u: number, v: number) => void> = { blockWall: precast, gabion: rubble, paint };

/** Each drawing's seed for its wear, so two surfaces' streaks don't line up. */
const WEAR_SEED: Record<LibraryDrawingId, number> = { blockWall: 101, gabion: 211, paint: 307 };

/**
 * Draws library surface `id` at `size` texels a side (QualitySettings.textureSize): RGBA bytes, rows top down as a
 * canvas holds them (render/proceduralTextures.ts puts them on one). Pure and deterministic.
 */
export function drawLibraryTexels(id: LibraryDrawingId, size: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const t: Texel = { r: 0, g: 0, b: 0 };
  const draw = DRAW[id];
  const w = WEATHERING.textures[id];
  const seed = WEAR_SEED[id];
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      draw(t, u, v);
      wear(t, u, v, w, seed);
      const o = (y * size + x) * 4;
      out[o] = t.r * 255;
      out[o + 1] = t.g * 255;
      out[o + 2] = t.b * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}
