import * as THREE from 'three';
import { BAKED_LIGHT } from '../config/bake';
import type { MapBlock, MapData } from '../map/mapTypes';
import { surfaceHeightAt } from '../map/surfaces';
import { keyDirection, resolveLighting } from './lightingPreset';
import { blockPieces, blockShade, blockTint, drawnBlocks, styleOf } from './mapMeshes';
import type { ProbeGrid } from './probeGrid';

/**
 * The offline bake of a map's bounce light (G6; the concept's gi.ts, without a browser): `pipeline/bake-light.mjs` runs
 * it and writes the probe file the game ships (src/map/bakes/). Two steps, both deterministic (no randomness, the same
 * map gives the same bytes):
 *
 * 1. Voxelise: every piece the map is drawn as (its blocks and look-only decor, without map detail) fills the voxels
 *    whose centres it holds, with its colour times its texture's albedo; a ramp only below its slope.
 * 2. Probes: from each probe on the grid, rays spread evenly over the sphere walk the voxels. A ray that leaves the
 *    grid, or lands on the open ground, sees the sky; one that hits a prop brings back the prop's colour, lit by the sun
 *    if the sun reaches that voxel and by the sky. Each probe keeps the bounce (RGB) and the share of rays that saw the
 *    sky (A); probes inside solid voxels take their open neighbours' average.
 */

const B = BAKED_LIGHT.bake;

/** One solid of the bake: a box (metres) and the light it reflects (linear RGB); a ramp is solid only under its slope. */
export interface BakeSolid {
  min: [number, number, number];
  max: [number, number, number];
  colour: [number, number, number];
  ramp?: MapBlock;
}

/** Everything a map's bake reads: its solids, its sun and sky under the bake's preset, its ground height. */
export interface BakeInputs {
  solids: BakeSolid[];
  /** Unit direction towards the sun, and its light (linear RGB times its intensity). */
  sunDir: [number, number, number];
  sun: [number, number, number];
  /** The sky fill's light (linear RGB times the hemisphere's intensity). */
  sky: [number, number, number];
  /** The lowest walkable top: the probe grid's floor. */
  ground: number;
}

const linear = (hex: number, k: number): [number, number, number] => {
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return [c.r * k, c.g * k, c.b * k];
};

/** What `map`'s bake reads (pure). */
export function bakeInputs(map: MapData): BakeInputs {
  const solids: BakeSolid[] = [];
  let ground = Infinity;
  for (const block of drawnBlocks(map)) {
    if (block.kind === 'floor') ground = Math.min(ground, block.center.y + block.size.y / 2);
    if (block.kind === 'ramp') {
      const c = new THREE.Color().setHex(blockTint(block), THREE.SRGBColorSpace).multiplyScalar(blockShade(block) * B.albedo[styleOf(block).texture]);
      const { center: p, size: s } = block;
      solids.push({ min: [p.x - s.x / 2, p.y - s.y / 2, p.z - s.z / 2], max: [p.x + s.x / 2, p.y + s.y / 2, p.z + s.z / 2], colour: [c.r, c.g, c.b], ramp: block });
      continue;
    }
    for (const piece of blockPieces(block, map.blocks, false)) {
      const a = B.albedo[piece.texture];
      solids.push({ min: [...piece.box.min], max: [...piece.box.max], colour: [piece.color.r * a, piece.color.g * a, piece.color.b * a] });
    }
  }
  if (!Number.isFinite(ground)) ground = 0;
  const preset = resolveLighting(map, B.preset);
  const d = keyDirection(preset);
  return {
    solids,
    sunDir: [d.x, d.y, d.z],
    sun: linear(preset.key.colour, preset.key.intensity),
    sky: linear(preset.hemi.sky, preset.hemi.intensity),
    ground,
  };
}

/** FNV-1a over a string. */
function fnv(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/**
 * The hash a bake is pinned by: the bake's parameters and every input, rounded to 0.1 mm or 1e-4 of light, so a map, a
 * tint, the sun or the bake itself changing asks for a re-bake (map/bakes test), and nothing else does.
 */
export function bakeHash(inputs: BakeInputs): number {
  const round = (_key: string, v: unknown): unknown => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v);
  const solids = inputs.solids.map((s) => ({ min: s.min, max: s.max, colour: s.colour, ramp: s.ramp ? s.ramp.rise ?? '' : null }));
  return fnv(JSON.stringify({ bake: B, solids, sunDir: inputs.sunDir, sun: inputs.sun, sky: inputs.sky, ground: inputs.ground }, round));
}

/** Directions spread evenly over the sphere (a Fibonacci set): x, y, z per ray. */
export function rayDirections(count: number): Float64Array {
  const out = new Float64Array(count * 3);
  for (let i = 0; i < count; i++) {
    const y = 1 - ((i + 0.5) / count) * 2;
    const r = Math.sqrt(1 - y * y);
    const phi = i * 2.399963229728653;
    out[i * 3] = Math.cos(phi) * r;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(phi) * r;
  }
  return out;
}

/** The voxel grid: solid or not, and each solid voxel's light (linear RGB). */
interface Voxels {
  nx: number;
  ny: number;
  nz: number;
  min: [number, number, number];
  solid: Uint8Array;
  colour: Float32Array;
}

/** The voxel range a span [lo, hi) covers by centres, or the one voxel holding its middle when it is thinner than one. */
function range(lo: number, hi: number, origin: number, v: number, n: number): [number, number] {
  let a = Math.ceil((lo - origin) / v - 0.5);
  let b = Math.floor((hi - origin) / v - 0.5);
  if (b < a) a = b = Math.floor(((lo + hi) / 2 - origin) / v);
  return [Math.max(0, a), Math.min(n - 1, b)];
}

function voxelise(inputs: BakeInputs, min: [number, number, number], max: [number, number, number]): Voxels {
  const v = B.voxel;
  const nx = Math.ceil((max[0] - min[0]) / v);
  const ny = Math.ceil((max[1] - min[1]) / v);
  const nz = Math.ceil((max[2] - min[2]) / v);
  const solid = new Uint8Array(nx * ny * nz);
  const colour = new Float32Array(nx * ny * nz * 3);
  for (const s of inputs.solids) {
    const [x0, x1] = range(s.min[0], s.max[0], min[0], v, nx);
    const [y0, y1] = range(s.min[1], s.max[1], min[1], v, ny);
    const [z0, z1] = range(s.min[2], s.max[2], min[2], v, nz);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        // A ramp is solid only under its slope.
        const top = s.ramp ? (surfaceHeightAt(s.ramp, min[0] + (x + 0.5) * v, min[2] + (z + 0.5) * v) ?? -Infinity) : Infinity;
        for (let y = y0; y <= y1; y++) {
          if (min[1] + (y + 0.5) * v > top) break;
          const k = x + nx * (y + ny * z);
          solid[k] = 1;
          colour[k * 3] = s.colour[0];
          colour[k * 3 + 1] = s.colour[1];
          colour[k * 3 + 2] = s.colour[2];
        }
      }
    }
  }
  return { nx, ny, nz, min, solid, colour };
}

/** Bakes the probe grid from `inputs` (deterministic). `hash` is stamped into the grid (bakeHash of the same inputs). */
export function bakeProbes(inputs: BakeInputs, hash: number = bakeHash(inputs)): ProbeGrid {
  // The grid: round the solids, from a few voxels under the ground to `headroom` above the highest top.
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const s of inputs.solids) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a]!, s.min[a]!);
      hi[a] = Math.max(hi[a]!, s.max[a]!);
    }
  }
  if (!Number.isFinite(lo[0])) throw new Error('nothing to bake: the map has no solids');
  const v = B.voxel;
  lo[1] = Math.max(lo[1], inputs.ground - 4 * v);
  hi[1] += B.headroom;
  const vox = voxelise(inputs, lo, hi);
  const { nx, ny, nz, solid, colour } = vox;
  const at = (x: number, y: number, z: number): number => x + nx * (y + ny * z);

  // Voxels the sun reaches (asked for as rays hit them): 0 unknown, 1 shade, 2 sunlit.
  const lit = new Uint8Array(nx * ny * nz);
  const [sx, sy, sz] = inputs.sunDir;
  const sunLit = (x: number, y: number, z: number): boolean => {
    const k = at(x, y, z);
    if (lit[k]) return lit[k] === 2;
    // From just outside the voxel's sunward face, walk towards the sun until something blocks it or the grid ends.
    let px = lo[0] + (x + 0.5) * v + sx * v * 1.2;
    let py = lo[1] + (y + 0.5) * v + sy * v * 1.2;
    let pz = lo[2] + (z + 0.5) * v + sz * v * 1.2;
    let result = 2;
    for (;;) {
      const ix = Math.floor((px - lo[0]) / v);
      const iy = Math.floor((py - lo[1]) / v);
      const iz = Math.floor((pz - lo[2]) / v);
      if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) break;
      if (solid[at(ix, iy, iz)] && !(ix === x && iy === y && iz === z)) {
        result = 1;
        break;
      }
      px += sx * v;
      py += sy * v;
      pz += sz * v;
    }
    lit[k] = result;
    return result === 2;
  };

  // The probes.
  const sp = B.probe;
  const origin: [number, number, number] = [lo[0], inputs.ground, lo[2]];
  const px = Math.round((hi[0] - lo[0]) / sp) + 1;
  const py = Math.round((hi[1] - inputs.ground) / sp) + 1;
  const pz = Math.round((hi[2] - lo[2]) / sp) + 1;
  const count = px * py * pz;
  const out = new Float32Array(count * 4);
  const done = new Uint8Array(count);
  const dirs = rayDirections(B.rays);
  const step = v * 0.9;
  const steps = Math.ceil(B.maxDist / step);
  const sunE = [inputs.sun[0] * B.sunShare, inputs.sun[1] * B.sunShare, inputs.sun[2] * B.sunShare];
  const skyE = [inputs.sky[0] * B.skyShare, inputs.sky[1] * B.skyShare, inputs.sky[2] * B.skyShare];
  for (let iz = 0; iz < pz; iz++) {
    for (let iy = 0; iy < py; iy++) {
      for (let ix = 0; ix < px; ix++) {
        const wx = origin[0] + ix * sp;
        const wy = origin[1] + iy * sp;
        const wz = origin[2] + iz * sp;
        const q = ix + px * (iy + py * iz);
        const cx = Math.floor((wx - lo[0]) / v);
        const cy = Math.floor((wy - lo[1]) / v);
        const cz = Math.floor((wz - lo[2]) / v);
        if (cx >= 0 && cy >= 0 && cz >= 0 && cx < nx && cy < ny && cz < nz && solid[at(cx, cy, cz)]) continue;
        let open = 0;
        let br = 0;
        let bg = 0;
        let bb = 0;
        for (let r = 0; r < B.rays; r++) {
          const dx = dirs[r * 3]!;
          const dy = dirs[r * 3 + 1]!;
          const dz = dirs[r * 3 + 2]!;
          let hit = -1;
          let hx = 0;
          let hy = 0;
          let hz = 0;
          for (let s = 1; s <= steps; s++) {
            const t = s * step;
            const ux = Math.floor((wx + dx * t - lo[0]) / v);
            const uy = Math.floor((wy + dy * t - lo[1]) / v);
            const uz = Math.floor((wz + dz * t - lo[2]) / v);
            if (ux < 0 || uy < 0 || uz < 0 || ux >= nx || uy >= ny || uz >= nz) break;
            const k = at(ux, uy, uz);
            if (solid[k]) {
              hit = k;
              hx = ux;
              hy = uy;
              hz = uz;
              break;
            }
          }
          if (hit < 0 || lo[1] + (hy + 1) * v <= inputs.ground + B.groundY) {
            open++;
            continue;
          }
          const sun = sunLit(hx, hy, hz);
          br += colour[hit * 3]! * ((sun ? sunE[0]! : 0) + skyE[0]!);
          bg += colour[hit * 3 + 1]! * ((sun ? sunE[1]! : 0) + skyE[1]!);
          bb += colour[hit * 3 + 2]! * ((sun ? sunE[2]! : 0) + skyE[2]!);
        }
        out[q * 4] = (br / B.rays) * B.gain;
        out[q * 4 + 1] = (bg / B.rays) * B.gain;
        out[q * 4 + 2] = (bb / B.rays) * B.gain;
        out[q * 4 + 3] = Math.min(1, (open / B.rays) * B.openGain + B.openFloor);
        done[q] = 1;
      }
    }
  }
  fillSolidProbes(out, done, px, py, pz);
  return quantise(out, { px, py, pz, origin, spacing: sp, hash });
}

/** Probes inside solids take the average of their done neighbours, pass by pass; any left over see open sky. */
function fillSolidProbes(out: Float32Array, done: Uint8Array, px: number, py: number, pz: number): void {
  const sum = new Float64Array(4);
  for (let pass = 0; pass < B.fillPasses; pass++) {
    const add: number[] = [];
    for (let iz = 0; iz < pz; iz++) {
      for (let iy = 0; iy < py; iy++) {
        for (let ix = 0; ix < px; ix++) {
          const q = ix + px * (iy + py * iz);
          if (done[q]) continue;
          sum.fill(0);
          let n = 0;
          for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
            const jx = ix + dx;
            const jy = iy + dy;
            const jz = iz + dz;
            if (jx < 0 || jy < 0 || jz < 0 || jx >= px || jy >= py || jz >= pz) continue;
            const j = jx + px * (jy + py * jz);
            if (!done[j]) continue;
            for (let c = 0; c < 4; c++) sum[c] = sum[c]! + out[j * 4 + c]!;
            n++;
          }
          if (n) add.push(q, sum[0]! / n, sum[1]! / n, sum[2]! / n, sum[3]! / n);
        }
      }
    }
    for (let i = 0; i < add.length; i += 5) {
      const q = add[i]!;
      for (let c = 0; c < 4; c++) out[q * 4 + c] = add[i + 1 + c]!;
      done[q] = 1;
    }
  }
  for (let q = 0; q < done.length; q++) if (!done[q]) out[q * 4 + 3] = 1;
}

/** The float probes as bytes: RGB over the brightest channel (the file's scale), A as is. */
function quantise(out: Float32Array, g: { px: number; py: number; pz: number; origin: [number, number, number]; spacing: number; hash: number }): ProbeGrid {
  let peak = 0;
  for (let i = 0; i < out.length; i++) if (i % 4 !== 3) peak = Math.max(peak, out[i]!);
  // A scale with few mantissa bits, so it survives the file's float32 exactly.
  const scale = peak > 0 ? Math.ceil(peak * 64) / 64 : 1;
  const data = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) data[i] = Math.round(Math.min(1, Math.max(0, i % 4 === 3 ? out[i]! : out[i]! / scale)) * 255);
  return { version: B.version, preset: B.preset, hash: g.hash, nx: g.px, ny: g.py, nz: g.pz, origin: [Math.fround(g.origin[0]), Math.fround(g.origin[1]), Math.fround(g.origin[2])], spacing: Math.fround(g.spacing), scale, data };
}
