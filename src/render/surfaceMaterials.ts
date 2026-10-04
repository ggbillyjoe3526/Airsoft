import * as THREE from 'three';
import type { ProceduralTexture } from './proceduralTextures';
import { ensureNormalMap } from './surfaceNormals';

/** A material the map's surfaces are painted with: Lambert, or Standard for steel under environment lighting. */
export type SurfaceMaterial = THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;

export function isSurfaceMaterial(m: THREE.Material): m is SurfaceMaterial {
  return m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshStandardMaterial;
}

/** Put first in a shader, this undoes the define Three.js sets when a material takes the scene's environment. */
export const NO_ENVIRONMENT = '#undef USE_ENVMAP\n';

/**
 * Keeps a Lambert material off the scene's environment map (environment lighting, audit section 5 F1). Since r16x
 * Three.js lights Lambert and Phong materials with `scene.environment` too, which for the map would add a prefiltered
 * environment read on every pixel of the largest part of the screen (DECISIONS 2026-09-28: the map stays plain Lambert).
 * The shader is compiled as if there were no environment map; everything else is Three.js's own Lambert.
 */
export function withoutEnvironment<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = NO_ENVIRONMENT + shader.vertexShader;
    shader.fragmentShader = NO_ENVIRONMENT + shader.fragmentShader;
  };
  material.customProgramCacheKey = () => 'without-environment';
  return material;
}

/**
 * Relief on a surface material (Settings → Graphics, F4): a normal map worked out from its texture (`normal`), or the
 * texture itself as a bump map, or neither when `on` is false. The shader rebuilds once when this changes anything.
 */
export function setReliefMaps(mat: SurfaceMaterial, surface: ProceduralTexture, on: boolean, normal: boolean): void {
  const bump = on && !normal ? mat.map : null;
  const normalMap = on && normal ? ensureNormalMap(surface) : null;
  if (mat.bumpMap === bump && mat.normalMap === normalMap) return;
  mat.bumpMap = bump;
  mat.normalMap = normalMap;
  mat.needsUpdate = true;
}
