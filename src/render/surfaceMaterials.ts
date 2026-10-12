import * as THREE from 'three';
import type { ProceduralTexture } from './proceduralTextures';
import { ensureNormalMap } from './surfaceNormals';

/** A material the map's surfaces are painted with: Lambert, or Standard for steel under environment lighting. */
export type SurfaceMaterial = THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;

export function isSurfaceMaterial(m: THREE.Material): m is SurfaceMaterial {
  return m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshStandardMaterial;
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
