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

/** "APRB" (Airsoft probes), little-endian. */
const MAGIC = 0x42525041;
const HEADER = 40;
const PRESETS: readonly LightingPresetId[] = ['day', 'night'];

/**
 * The probes as the file stores them: four planes (R, G, B, A), each value less the one before it along x (mod 256), so
 * the smooth light gives small numbers that compress about a third better than the bytes themselves.
 */
function toPlanes(data: Uint8Array, nx: number): Uint8Array {
  const n = data.length / 4;
  const out = new Uint8Array(data.length);
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < n; i++) out[c * n + i] = (data[i * 4 + c]! - (i % nx === 0 ? 0 : data[(i - 1) * 4 + c]!)) & 255;
  }
  return out;
}

/** The file's planes back to RGBA bytes, one probe each (toPlanes undone). */
function fromPlanes(planes: Uint8Array, nx: number): Uint8Array {
  const n = planes.length / 4;
  const out = new Uint8Array(planes.length);
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < n; i++) out[i * 4 + c] = (planes[c * n + i]! + (i % nx === 0 ? 0 : out[(i - 1) * 4 + c]!)) & 255;
  }
  return out;
}

/** The file's bytes: a 40-byte header, then the probes (toPlanes). */
export function encodeProbeFile(g: ProbeGrid): Uint8Array {
  const bytes = new Uint8Array(HEADER + g.data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint16(4, g.version, true);
  view.setUint8(6, PRESETS.indexOf(g.preset));
  view.setUint32(8, g.hash >>> 0, true);
  view.setUint16(12, g.nx, true);
  view.setUint16(14, g.ny, true);
  view.setUint16(16, g.nz, true);
  view.setFloat32(20, g.origin[0], true);
  view.setFloat32(24, g.origin[1], true);
  view.setFloat32(28, g.origin[2], true);
  view.setFloat32(32, g.spacing, true);
  view.setFloat32(36, g.scale, true);
  bytes.set(toPlanes(g.data, g.nx), HEADER);
  return bytes;
}

/** Reads a probe file; throws on anything that isn't one (a wrong magic or size). */
export function decodeProbeFile(bytes: Uint8Array): ProbeGrid {
  if (bytes.length < HEADER) throw new Error('probe file too short');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('not a probe file');
  const nx = view.getUint16(12, true);
  const ny = view.getUint16(14, true);
  const nz = view.getUint16(16, true);
  if (bytes.length !== HEADER + nx * ny * nz * 4) throw new Error('probe file size does not match its grid');
  return {
    version: view.getUint16(4, true),
    preset: PRESETS[view.getUint8(6)] ?? 'day',
    hash: view.getUint32(8, true),
    nx,
    ny,
    nz,
    origin: [view.getFloat32(20, true), view.getFloat32(24, true), view.getFloat32(28, true)],
    spacing: view.getFloat32(32, true),
    scale: view.getFloat32(36, true),
    data: fromPlanes(bytes.subarray(HEADER), nx),
  };
}

/** Characters per line of the base64 text (so the file diffs and reads like text). */
const LINE = 100;

/** Bytes to base64 text in lines of LINE characters. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const text = btoa(binary);
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += LINE) lines.push(text.slice(i, i + LINE));
  return `${lines.join('\n')}\n`;
}

/** Base64 text (any line breaks) back to bytes. */
export function fromBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
