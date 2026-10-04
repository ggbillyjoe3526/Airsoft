import * as THREE from 'three';

/**
 * A per-vertex finish for vertex-coloured models (FA8): each vertex carries its own roughness and metalness in a
 * `finish` attribute (vec2), so one MeshStandardMaterial draws matte fabric, a glossy goggle lens and a helmet shell in
 * a single draw call. Three.js has no per-vertex roughness, so the material's shader reads the attribute where it
 * would read its uniform. Every material given it shares one program (customProgramCacheKey).
 */
export const FINISH_ATTRIBUTE = 'finish';

const PROGRAM_KEY = 'fa8-vertex-finish';

/** Makes `material` read its roughness and metalness from each vertex's `finish` attribute. Returns it. */
export function useVertexFinish<M extends THREE.MeshStandardMaterial>(material: M): M {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 ${FINISH_ATTRIBUTE};\nvarying vec2 vFinish;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvFinish = ${FINISH_ATTRIBUTE};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFinish;')
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
