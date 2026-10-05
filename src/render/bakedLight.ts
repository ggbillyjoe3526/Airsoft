import * as THREE from 'three';
import { BAKED_LIGHT } from '../config/bake';
import type { BakedLightMode } from '../config/render';
import { BAKE_FILES, type BakeFileId } from '../map/bakes/files';
import { lightingPicked } from '../map/lightingChoice';
import type { MapData } from '../map/mapTypes';
import type { Buffers } from './cuboidMesh';
import { decodeProbeFile, fromBase64, type ProbeGrid, type ProbeSample, probeTint, sampleProbes } from './probeGrid';
import type { ProbeUniforms } from './surfaceShader';

/**
 * The maps' baked bounce light in the game (G6): the probe files `node pipeline/bake-light.mjs` writes, loaded once as
 * the game starts and read three ways, by QualitySettings.bakedLight:
 *
 * - `pixel` (Medium and up): a 3D texture every map surface reads per pixel (render/surfaceShader.ts);
 * - `vertex` (Low): the light baked into the map's vertex colours as it is built, no per-pixel cost;
 * - figures, on every preset but `off`: the probes round them, CPU side, as they move (render/characterRenderer.ts).
 *
 * The decoded files are kept here by name, as map/maps.ts keeps the maps' data: a map reads its own through
 * `bakedLightFor`, which is null until the files are loaded, for a map that doesn't opt in and for a file baked under
 * other lighting than the map's (the night maps opt out: their light is their lamps).
 */

const loaded = new Map<BakeFileId, ProbeGrid>();
let loading: Promise<void> | null = null;

/** Loads and decodes every probe file (each its own chunk); a file that fails is left out with a warning (no baked light). */
export function loadBakedLight(): Promise<void> {
  loading ??= Promise.all(
    (Object.keys(BAKE_FILES) as BakeFileId[]).map((id) =>
      BAKE_FILES[id]().then(
        (text) => void loaded.set(id, decodeProbeFile(fromBase64(text))),
        (error: unknown) => console.warn(`The baked light file ${id} could not be loaded; that map is drawn without it.`, error),
      ),
    ),
  ).then(() => undefined);
  return loading;
}

/** Puts a decoded file in place of its name's (the tests and the bake's own checks). */
export function registerBakedLight(id: BakeFileId, grid: ProbeGrid | null): void {
  if (grid) loaded.set(id, grid);
  else loaded.delete(id);
}

/** A map's probes, or null (not opted in, not loaded yet, or a lit-at-night map). */
export function bakedLightFor(map: MapData): ProbeGrid | null {
  if (!map.bakedLight) return null;
  const grid = loaded.get(map.bakedLight.file);
  return grid && grid.preset === lightingPicked(map) ? grid : null;
}

/** The mode a map is drawn in: the quality's, or off without probes. */
export function bakedLightMode(mode: BakedLightMode, grid: ProbeGrid | null): BakedLightMode {
  return grid ? mode : 'off';
}

/**
 * The 3D texture and uniforms the surfaces read per pixel. The texture's texel centres sit on the probes (its box runs
 * half a spacing past the outer probes), linear filtered as sampleProbes blends. Free with `disposeProbeUniforms`.
 */
export function probeUniforms(grid: ProbeGrid): ProbeUniforms {
  const tex = new THREE.Data3DTexture(grid.data, grid.nx, grid.ny, grid.nz);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = false;
  tex.name = 'baked-light';
  tex.needsUpdate = true;
  const half = grid.spacing / 2;
  const L = BAKED_LIGHT.look;
  return {
    bakeTex: { value: tex },
    bakeMin: { value: new THREE.Vector3(grid.origin[0] - half, grid.origin[1] - half, grid.origin[2] - half) },
    bakeSize: { value: new THREE.Vector3(grid.nx * grid.spacing, grid.ny * grid.spacing, grid.nz * grid.spacing) },
    bakeScale: { value: grid.scale },
    bakeOcclusion: { value: L.occlusion },
    bakeBounce: { value: L.bounce },
    bakeLift: { value: L.lift },
  };
}

export function disposeProbeUniforms(u: ProbeUniforms): void {
  u.bakeTex.value?.dispose();
  u.bakeTex.value = null;
}

const sample: ProbeSample = { r: 0, g: 0, b: 0, vis: 1 };
const tint = { r: 1, g: 1, b: 1 };

/**
 * Low's baked light: every vertex colour from `from` on (a mesh's drawn part) scaled by the probes a little off its
 * surface (BAKED_LIGHT.look.vertex). Runs once, as the map is built.
 */
export function tintVertices(buf: Buffers, grid: ProbeGrid, from = 0, to = buf.positions.length / 3): void {
  const V = BAKED_LIGHT.look.vertex;
  const lift = BAKED_LIGHT.look.lift;
  const p = buf.positions;
  const n = buf.normals;
  const c = buf.colors;
  for (let v = from; v < to; v++) {
    const i = v * 3;
    sampleProbes(grid, p[i]! + n[i]! * lift, p[i + 1]! + n[i + 1]! * lift, p[i + 2]! + n[i + 2]! * lift, sample);
    probeTint(sample, V.indirectShare, V.bounce, tint);
    c[i] = c[i]! * tint.r;
    c[i + 1] = c[i + 1]! * tint.g;
    c[i + 2] = c[i + 2]! * tint.b;
  }
}
