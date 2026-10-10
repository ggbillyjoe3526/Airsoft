import type { LightingPresetId } from '../config/render';
import type { ProbeGrid } from './probeGrid';

/**
 * The baked light probe file (G6): a 40-byte header and the probes, base64 in the repository (src/map/bakes/). Apart
 * from render/probeGrid.ts so the game loads it with the files (render/bakedLight.ts), not in its main chunk. Pure.
 */

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
