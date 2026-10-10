import type { LightingPresetId } from '../config/render';

/**
 * A map's baked light probes (G6) and the file they ship in. The probes sit on a regular grid; each holds the bounce
 * light reaching it (RGB, linear, in units of `scale`) and how much of the sky it sees (A, 0..1), one byte each. The file
 * is a small header and those bytes, base64 in the repository (src/map/bakes/), so the game imports it like any module.
 * Pure: no Three.js, no DOM.
 */
export interface ProbeGrid {
  /** The bake's version and lighting preset, and the hash of what it was baked from (render/lightBake.ts bakeHash). */
  version: number;
  preset: LightingPresetId;
  hash: number;
  /** Probes along x, y and z (x fastest in `data`, then y, then z: a 3D texture's layout). */
  nx: number;
  ny: number;
  nz: number;
  /** The first probe's position (metres) and the spacing between probes. */
  origin: readonly [number, number, number];
  spacing: number;
  /** RGB × scale / 255 is the bounce light. */
  scale: number;
  /** RGBA bytes, one probe each. */
  data: Uint8Array;
}

/** What a probe lookup gives: the bounce light (linear RGB) and the sky's visibility (0..1). */
export interface ProbeSample {
  r: number;
  g: number;
  b: number;
  vis: number;
}

/** A sample outside the grid: open sky, no bounce. */
export function openSample(out: ProbeSample): ProbeSample {
  out.r = 0;
  out.g = 0;
  out.b = 0;
  out.vis = 1;
  return out;
}

/**
 * The probes at (x, y, z), blended from the eight round it (trilinear, as the GPU reads the 3D texture), into `out`.
 * A point outside the grid reads its nearest edge, as the texture's clamp does. No allocation: runs every frame for
 * every figure.
 */
export function sampleProbes(g: ProbeGrid, x: number, y: number, z: number, out: ProbeSample): ProbeSample {
  const fx = Math.min(g.nx - 1, Math.max(0, (x - g.origin[0]) / g.spacing));
  const fy = Math.min(g.ny - 1, Math.max(0, (y - g.origin[1]) / g.spacing));
  const fz = Math.min(g.nz - 1, Math.max(0, (z - g.origin[2]) / g.spacing));
  const x0 = Math.min(g.nx - 2, Math.floor(fx));
  const y0 = Math.min(g.ny - 2, Math.floor(fy));
  const z0 = Math.min(g.nz - 2, Math.floor(fz));
  if (x0 < 0 || y0 < 0 || z0 < 0) return openSample(out);
  const tx = fx - x0;
  const ty = fy - y0;
  const tz = fz - z0;
  let r = 0;
  let gr = 0;
  let b = 0;
  let a = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1;
    const dy = (k >> 1) & 1;
    const dz = k >> 2;
    const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz);
    const i = ((x0 + dx) + g.nx * ((y0 + dy) + g.ny * (z0 + dz))) * 4;
    r += w * g.data[i]!;
    gr += w * g.data[i + 1]!;
    b += w * g.data[i + 2]!;
    a += w * g.data[i + 3]!;
  }
  const k = g.scale / 255;
  out.r = r * k;
  out.g = gr * k;
  out.b = b * k;
  out.vis = a / 255;
  return out;
}

/**
 * How a surface or figure's colour scales under the probes when nothing reads them per pixel (Low's vertex colours,
 * every figure): 1 - `indirectShare` × (1 - visibility) + `bounce` × the bounce light, per channel, into `out`.
 */
export function probeTint(s: ProbeSample, indirectShare: number, bounce: number, out: { r: number; g: number; b: number }): void {
  const k = 1 - indirectShare * (1 - s.vis);
  out.r = k + bounce * s.r;
  out.g = k + bounce * s.g;
  out.b = k + bounce * s.b;
}
