import type * as THREE from 'three';
import { FIGURE } from '../config/characters';

/**
 * The team camo (G11): blotches printed per pixel on the detailed figure's clothes and on your first-person sleeves,
 * from the drawn part's own position (FIGURE.camo). The figure's material reads which vertices wear it from a `camo`
 * attribute (render/figureFinish.ts); the sleeves wear it all over (`useSleeveCamo`). The node renderer's twins build
 * the same sums (render/webgpu/figureNodes.ts), so the two renderers print one pattern. Low draws neither: its figures
 * and sleeves stay plain, at Low's cost.
 */

/** The vertex attribute (float) that says which pattern a vertex of the detailed figure wears: 0 none, else its seed. */
export const CAMO_ATTRIBUTE = 'camo';

/** The pattern's seed on the first-person sleeves (any value at least 1 prints; this one reads well along a forearm). */
export const SLEEVE_CAMO_SEED = 4;

const PROGRAM_KEY = 'g11-sleeve-camo';

/** The pattern's three crossed waves: per wave, its weights on (x, y, z) and on the seed (the phase). */
export const CAMO_WAVES: readonly (readonly [x: number, y: number, z: number, seed: number])[] = [
  [1.3, 0.7, 0, 1],
  [0, 1.1, -0.9, 1.7],
  [0.8, 0, 1.2, -1],
];
/** The warp: the position bends by `warp` × sin(its own components swizzled (y, z, x) × this + seed × CAMO_WARP_SEED). */
export const CAMO_WARP_RATE = 1.7;
export const CAMO_WARP_SEED = 2.3;
/** The smallest blend width (in `n`) of a blotch's edge, so a flat stretch never divides by nothing. */
export const CAMO_EDGE_MIN = 1e-4;

/** A number as a GLSL float literal, exactly as written in config (so the GLSL and the node twin use one value). */
const glsl = (v: number): string => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/**
 * The GLSL of `float camoTone(vec3 p, float seed)`: the colour multiplier at part position `p` (metres) for pattern
 * `seed`, its blotches' edges blended over one pixel's change of the waves (fwidth), so they stay crisp up close and
 * melt into their average far away instead of shimmering. Called in uniform control flow (fwidth needs it).
 */
export function camoGlsl(): string {
  const C = FIGURE.camo;
  const w = (i: number): string => {
    const [x, y, z, s] = CAMO_WAVES[i]!;
    return `sin(q.x * ${glsl(x)} + q.y * ${glsl(y)} + q.z * ${glsl(z)} + seed * ${glsl(s)})`;
  };
  return `
float camoTone(vec3 p, float seed) {
  vec3 q = p * ${glsl(1 / C.scale)};
  q += ${glsl(C.warp)} * sin(q.yzx * ${glsl(CAMO_WARP_RATE)} + seed * ${glsl(CAMO_WARP_SEED)});
  float n = ${w(0)} + ${w(1)} + ${w(2)};
  float edge = max(fwidth(n), ${glsl(CAMO_EDGE_MIN)});
  float dark = smoothstep(${glsl(C.darkAt)} - edge, ${glsl(C.darkAt)} + edge, n);
  float light = 1.0 - smoothstep(${glsl(C.lightAt)} - edge, ${glsl(C.lightAt)} + edge, n);
  return mix(mix(1.0, ${glsl(C.light)}, light), ${glsl(C.dark)}, dark);
}`;
}

/**
 * The pattern's tone at (x, y, z) for `seed`, with hard edges (camoGlsl less its edge blend): for tests and for reading
 * how much of a part each tone covers.
 */
export function camoTone(x: number, y: number, z: number, seed: number): number {
  const C = FIGURE.camo;
  const k = 1 / C.scale;
  let qx = x * k;
  let qy = y * k;
  let qz = z * k;
  const wx = C.warp * Math.sin(qy * CAMO_WARP_RATE + seed * CAMO_WARP_SEED);
  const wy = C.warp * Math.sin(qz * CAMO_WARP_RATE + seed * CAMO_WARP_SEED);
  const wz = C.warp * Math.sin(qx * CAMO_WARP_RATE + seed * CAMO_WARP_SEED);
  qx += wx;
  qy += wy;
  qz += wz;
  let n = 0;
  for (const [a, b, c, s] of CAMO_WAVES) n += Math.sin(qx * a + qy * b + qz * c + seed * s);
  return n > C.darkAt ? C.dark : n < C.lightAt ? C.light : 1;
}

/**
 * Prints the camo over every pixel of `material` (the first-person sleeves on Hand detail High), from the sleeve's own
 * position at FIGURE.camo.sleeve of the figures' size, after its colour and vertex colours. Every sleeve given it shares one program. Returns it.
 */
export function useSleeveCamo<M extends THREE.MeshStandardMaterial>(material: M): M {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCamoPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCamoPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vCamoPos;${camoGlsl()}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= camoTone(vCamoPos * ${glsl(1 / FIGURE.camo.sleeve)}, ${glsl(SLEEVE_CAMO_SEED)});`);
  };
  material.customProgramCacheKey = () => PROGRAM_KEY;
  return material;
}

/** True if `material` prints the camo all over (useSleeveCamo). */
export function hasSleeveCamo(material: THREE.Material): boolean {
  return material.customProgramCacheKey() === PROGRAM_KEY;
}
