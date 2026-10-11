import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ProceduralTexture } from './proceduralTextures';
import { setReliefMaps } from './surfaceMaterials';

describe('setReliefMaps (F4)', () => {
  const texture = new THREE.Texture();
  const normal = new THREE.Texture();
  const surface = { texture, normal, worldSize: 2 } as unknown as ProceduralTexture;

  it('sets a normal map, a bump map or neither, and rebuilds the shader only when that changes', () => {
    const mat = new THREE.MeshLambertMaterial({ map: texture });
    setReliefMaps(mat, surface, true, true);
    expect(mat.normalMap).toBe(normal);
    expect(mat.bumpMap).toBeNull();
    const version = mat.version;
    setReliefMaps(mat, surface, true, true);
    expect(mat.version).toBe(version);
    setReliefMaps(mat, surface, true, false);
    expect(mat.bumpMap).toBe(texture);
    expect(mat.normalMap).toBeNull();
    expect(mat.version).toBeGreaterThan(version);
    setReliefMaps(mat, surface, false, true);
    expect(mat.bumpMap).toBeNull();
    expect(mat.normalMap).toBeNull();
    mat.dispose();
  });
});
