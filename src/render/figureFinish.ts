import * as THREE from 'three';
import { CAMO_ATTRIBUTE, camoGlsl } from './figureCamo';

/**
 * A per-vertex finish for vertex-coloured models (FA8): each vertex carries its own roughness and metalness in a
 * `finish` attribute (vec2), so one MeshStandardMaterial draws matte fabric, a glossy goggle lens and a helmet shell in
 * a single draw call. Three.js has no per-vertex roughness, so the material's shader reads the attribute where it
 * would read its uniform. Every material given it shares one program (customProgramCacheKey).
 *
 * The same patch prints the team camo (G11, render/figureCamo.ts) per pixel on the vertices whose `camo` attribute
 * names a pattern (0: none), from each vertex's own position in the part.
 */
export const FINISH_ATTRIBUTE = 'finish';

const PROGRAM_KEY = 'fa8-vertex-finish';

/** Makes `material` read its roughness and metalness from each vertex's `finish` attribute, and print its camo. Returns it. */
export function useVertexFinish<M extends THREE.MeshStandardMaterial>(material: M): M {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute vec2 ${FINISH_ATTRIBUTE};\nattribute float ${CAMO_ATTRIBUTE};\nvarying vec2 vFinish;\nvarying vec4 vCamo;`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvFinish = ${FINISH_ATTRIBUTE};\nvCamo = vec4(position, ${CAMO_ATTRIBUTE});`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vFinish;\nvarying vec4 vCamo;${camoGlsl()}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb*=mix(1.,camoTone(vCamo.xyz,vCamo.w),step(.5,vCamo.w));')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vFinish.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vFinish.y;');
  };
  material.customProgramCacheKey = () => PROGRAM_KEY;
  return material;
}

/** True if `material` reads the per-vertex finish (useVertexFinish). */
export function hasVertexFinish(material: THREE.Material): boolean {
  return material.customProgramCacheKey() === PROGRAM_KEY;
}
