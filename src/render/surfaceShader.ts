import type * as THREE from 'three';
import { type ShaderWear, WEATHERING } from '../config/weathering';
import { NO_ENVIRONMENT } from './surfaceMaterials';

/**
 * The map surfaces' shader additions (G6), composed per material on top of Three.js's own Lambert or Standard shader:
 *
 * - **Weathering** (QualitySettings.weathering, the concept's kit.ts): world-space dirt patches, dirt creeping up the
 *   lowest half metre of every wall, streaks running down from the tops and rust on steel. In world space, so it never
 *   repeats with the texture. Its strengths (config/weathering.ts) are uniforms, so every weathered surface shares
 *   one program (a match start compiles at most a few).
 * - **Baked bounce light** (QualitySettings.bakedLight `pixel`, render/bakedLight.ts): after Three.js's light sum, the
 *   sky fill is scaled by how much of the sky the nearest probes see, and the light bounced off nearby props is added,
 *   one 3D texture read per pixel.
 *
 * Neither changes a vertex, so shadows, collision and what a bot sees are as before. A material with neither is
 * exactly render/surfaceMaterials.ts withoutEnvironment (Low's shader, unchanged).
 */

/** The baked light's uniforms, shared by every surface material of one map build (render/bakedLight.ts makes them). */
export interface ProbeUniforms {
  bakeTex: THREE.IUniform<THREE.Texture | null>;
  bakeMin: THREE.IUniform<THREE.Vector3>;
  bakeSize: THREE.IUniform<THREE.Vector3>;
  /** The texture's RGB times this is the bounce light (the file's encoding scale). */
  bakeScale: THREE.IUniform<number>;
  /** How far the sky fill follows the probes' sky visibility (0 none, 1 fully). */
  bakeOcclusion: THREE.IUniform<number>;
  /** How strong the bounce light is. */
  bakeBounce: THREE.IUniform<number>;
  /** Metres off the surface, along its normal, the probes are read (so a wall doesn't read the probes inside it). */
  bakeLift: THREE.IUniform<number>;
}

/** What a surface material adds to Three.js's shader. */
export interface SurfacePatch {
  /** The material takes the scene's environment map (the steel tread plate's sheen); false keeps it off (Lambert). */
  environment: boolean;
  /** Weathering on this surface, or null for none. */
  wear: ShaderWear | null;
  /** The map's baked light, read per pixel, or null for none. */
  probes: ProbeUniforms | null;
}

const N = WEATHERING.noise;
const M = WEATHERING.mix;
const f = (x: number): string => x.toFixed(3);
const v3 = (c: readonly number[]): string => `vec3(${c.map(f).join(', ')})`;

const WORLD_VARYINGS = 'varying vec3 vSurfW;\nvarying vec3 vSurfN;\n';

/** Cheap 3D value noise and a three-octave sum (the concept's gH, gN, gF). */
const NOISE_GLSL = `
float wH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wN(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wH(i), wH(i + vec3(1, 0, 0)), f.x), mix(wH(i + vec3(0, 1, 0)), wH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wH(i + vec3(0, 0, 1)), wH(i + vec3(1, 0, 1)), f.x), mix(wH(i + vec3(0, 1, 1)), wH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float wF(vec3 p) { return wN(p) * 0.5714 + wN(p * 2.03) * 0.2857 + wN(p * 4.01) * 0.1429; }
`;

/**
 * The weathering, after the texture and vertex colour are in diffuseColor; leaves `wearG` (0..1) for roughness. The
 * surface's strengths are the uniforms `wearGrime` and `wearRust` (rust skipped where it is 0: the branch is the same
 * for every pixel of a surface).
 */
const WEAR_GLSL = `
  float wearG = 0.0;
  {
    vec3 wp = vSurfW;
    float vert = 1.0 - abs(normalize(vSurfN).y);
    float big = wF(wp * ${f(N.patchScale)});
    float fine = wN(wp * ${f(N.fineScale)});
    float patchy = smoothstep(0.5, 0.82, big * 0.85 + fine * 0.2);
    // The ground is at y 0 on every map's floor (the creep is world height, as in the concept).
    float creep = (1.0 - smoothstep(0.0, ${f(N.creep)} + fine * ${f(N.creepVary)}, wp.y)) * vert;
    float streak = smoothstep(0.58, 0.95, wN(vec3((wp.x + wp.z) * ${f(N.streakAcross)}, wp.y * ${f(N.streakAlong)}, (wp.z - wp.x) * ${f(N.streakAcross)}))) * vert * (0.4 + 0.6 * big);
    wearG = clamp(patchy * ${f(M.patches)} + creep * ${f(M.creep)} + streak * ${f(M.streaks)}, 0.0, 1.0) * wearGrime;
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    vec3 dirt = mix(diffuseColor.rgb, vec3(lum), ${f(M.grey)}) * ${v3(M.dirt)};
    diffuseColor.rgb = mix(diffuseColor.rgb, dirt, wearG);
    if (wearRust > 0.0) {
      float rs = smoothstep(0.6, 0.78, wF(wp * ${f(N.rustScale)} + 7.3) + fine * 0.08) * (0.35 + creep * 0.6 + streak * 0.9);
      rs = clamp(rs, 0.0, 1.0) * wearRust;
      diffuseColor.rgb = mix(diffuseColor.rgb, ${v3(M.rust)} * (0.7 + fine * 0.6), rs * ${f(M.rustStrength)});
      wearG = max(wearG, rs);
    }
  }`;

const WEAR_HEAD = 'uniform float wearGrime;\nuniform float wearRust;\n';

/** After Three.js's light sum: the sky fill dimmed by the probes' sky visibility, the bounce added (the concept's gi.ts). */
const PROBE_GLSL = `
  {
    vec3 bakeP = (vSurfW + normalize(vSurfN) * bakeLift - bakeMin) / bakeSize;
    float bakeIn = step(0.0, min(min(bakeP.x, bakeP.y), bakeP.z)) * step(max(max(bakeP.x, bakeP.y), bakeP.z), 1.0);
    vec4 bake = texture(bakeTex, bakeP);
    float bakeVis = mix(1.0, mix(1.0, bake.a, bakeOcclusion), bakeIn);
    reflectedLight.indirectDiffuse = reflectedLight.indirectDiffuse * bakeVis + material.diffuseColor * RECIPROCAL_PI * bake.rgb * bakeScale * bakeBounce * bakeIn;
    reflectedLight.indirectSpecular *= bakeVis;
  }
`;

const PROBE_HEAD = 'uniform highp sampler3D bakeTex;\nuniform vec3 bakeMin;\nuniform vec3 bakeSize;\nuniform float bakeScale;\nuniform float bakeOcclusion;\nuniform float bakeBounce;\nuniform float bakeLift;\n';

/** The weathering a patch draws, or null for none (a surface weathered at 0 is not weathered). */
function wearOf(p: SurfacePatch): ShaderWear | null {
  return p.wear && (p.wear.grime > 0 || p.wear.rust > 0) ? p.wear : null;
}

/** The program cache key for a patch: one program per environment, weathering on or off and baked light on or off. */
export function surfacePatchKey(p: SurfacePatch): string {
  return `surface:${p.environment ? 'env' : 'noenv'}:${wearOf(p) ? 'wear' : 'none'}:${p.probes ? 'probes' : 'none'}`;
}

/** Whether a patch adds anything to Three.js's shader beyond keeping the environment off. */
export function patchesShader(p: SurfacePatch): boolean {
  return p.probes !== null || wearOf(p) !== null;
}

/**
 * Rewrites a Three.js Lambert or Standard shader with the patch's additions. Pure: the tests read what it writes.
 * `shader` is what onBeforeCompile receives; the probes' uniforms are added to it by reference, the weathering's as the
 * surface's own values.
 */
export function applySurfacePatch(shader: THREE.WebGLProgramParametersWithUniforms, p: SurfacePatch): void {
  const wear = wearOf(p);
  let vertex = shader.vertexShader;
  let fragment = shader.fragmentShader;
  if (!p.environment) {
    vertex = NO_ENVIRONMENT + vertex;
    fragment = NO_ENVIRONMENT + fragment;
  }
  if (wear || p.probes) {
    vertex = vertex
      .replace('#include <common>', `#include <common>\n${WORLD_VARYINGS}`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSurfW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSurfN = normalize(mat3(modelMatrix) * objectNormal);');
    let head = `#include <common>\n${WORLD_VARYINGS}`;
    if (wear) head += WEAR_HEAD + NOISE_GLSL;
    if (p.probes) head += PROBE_HEAD;
    fragment = fragment.replace('#include <common>', head);
  }
  if (wear) {
    fragment = fragment
      .replace('#include <color_fragment>', `#include <color_fragment>\n${WEAR_GLSL}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, wearG * ${f(M.roughen)});`);
    shader.uniforms.wearGrime = { value: wear.grime };
    shader.uniforms.wearRust = { value: wear.rust };
  }
  if (p.probes) {
    fragment = fragment.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${PROBE_GLSL}`);
    Object.assign(shader.uniforms, p.probes);
  }
  shader.vertexShader = vertex;
  shader.fragmentShader = fragment;
}

/** Gives a map surface material its patch (onBeforeCompile and its program cache key). Returns the material. */
export function patchSurfaceMaterial<T extends THREE.Material>(material: T, p: SurfacePatch): T {
  material.onBeforeCompile = (shader) => applySurfacePatch(shader, p);
  material.customProgramCacheKey = () => surfacePatchKey(p);
  return material;
}
