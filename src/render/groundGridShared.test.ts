import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QUALITY, SURFACES } from '../config/render';
import { buildGroundGrid, groundGridOf } from '../map/groundSurfaces';
import { WOODLAND } from '../map/woodland';
import { buildMapMeshes, disposeMapMeshes, mapLookOf, texturesFor } from './mapMeshes';
import type { SurfaceTextures } from './proceduralTextures';

/**
 * BP5: Woodland's ground grid (30-50 ms to build) was built again for the terrain's look, after the physics and the
 * footsteps had built it (groundGridOf, NP1). The map's meshes now read that shared grid and never build their own.
 */
vi.mock('../map/groundSurfaces', async (orig) => {
  const real = await orig<typeof import('../map/groundSurfaces')>();
  return { ...real, buildGroundGrid: vi.fn(real.buildGroundGrid) };
});

const textures = (): SurfaceTextures =>
  Object.fromEntries(texturesFor(WOODLAND).map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }), worldSize: SURFACES.worldSize[id], mean: 1 }])) as unknown as SurfaceTextures;

describe('the ground grid, built once a map (BP5)', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  it("builds Woodland's terrain on the shared grid, not one of its own, at every quality", () => {
    const shared = groundGridOf(WOODLAND);
    expect(shared).not.toBeNull();
    for (const q of [QUALITY.low, QUALITY.medium, QUALITY.high]) {
      const group = buildMapMeshes(WOODLAND, textures(), { ...mapLookOf(q, null), relief: false }, () => new THREE.Texture());
      expect(group.getObjectByName('map-terrain')).toBeDefined();
      disposeMapMeshes(group);
    }
    expect(vi.mocked(buildGroundGrid)).not.toHaveBeenCalled();
    expect(groundGridOf(WOODLAND)).toBe(shared);
  });
});
