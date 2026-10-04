import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ProceduralTexture } from './proceduralTextures';
import { NO_ENVIRONMENT, setReliefMaps, withoutEnvironment } from './surfaceMaterials';

describe('withoutEnvironment (F1)', () => {
  it('compiles a Lambert material as if the scene had no environment map, with its own program key', () => {
    const mat = withoutEnvironment(new THREE.MeshLambertMaterial());
    const shader = { vertexShader: 'void main() {}', fragmentShader: 'void main() {}' } as THREE.WebGLProgramParametersWithUniforms;
    mat.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader.startsWith(NO_ENVIRONMENT)).toBe(true);
    expect(shader.fragmentShader.startsWith(NO_ENVIRONMENT)).toBe(true);
    expect(mat.customProgramCacheKey()).not.toBe(new THREE.MeshLambertMaterial().customProgramCacheKey());
    mat.dispose();
  });
});

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
