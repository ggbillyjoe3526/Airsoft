import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { BAKED_LIGHT } from '../config/bake';
import { QUALITY, SURFACES } from '../config/render';
import { DEPOT } from '../map/depot';
import { mapUnderLighting } from '../map/lightingChoice';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { bakedLightFor, bakedLightMode, probeUniforms, registerBakedLight, tintVertices } from './bakedLight';
import { emptyBuffers } from './cuboidMesh';
import { buildMapMeshes, disposeMapMeshes, type MapLook, mapLookOf, mapNeedsRebuild } from './mapMeshes';
import { MapMeshCache } from './mapMeshCache';
import type { ProbeGrid } from './probeGrid';
import { CORE_SURFACES, type SurfaceTextures } from './proceduralTextures';

/**
 * The baked bounce light in the game (G6): which maps have it, how each preset draws it, and Low's cost unchanged.
 */

/** A grid over Depot: dark (sky hidden) under 1 m, open and orange above. */
function stubGrid(): ProbeGrid {
  const nx = 40;
  const ny = 6;
  const nz = 60;
  const data = new Uint8Array(nx * ny * nz * 4);
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) data.set(y < 2 ? [0, 0, 0, 40] : [200, 120, 40, 255], (x + nx * (y + ny * z)) * 4);
  return { version: BAKED_LIGHT.bake.version, preset: 'day', hash: 0, nx, ny, nz, origin: [-40, 0, -60], spacing: 2, scale: 1, data };
}

const textures = (): SurfaceTextures =>
  Object.fromEntries(CORE_SURFACES.map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }), worldSize: SURFACES.worldSize[id] }])) as unknown as SurfaceTextures;
/** The preset's look for Depot with `grid`, relief off (the stand-in textures have no pixels to make normal maps from). */
const look = (q: keyof typeof QUALITY, grid: ProbeGrid | null): MapLook => ({ ...mapLookOf(QUALITY[q], grid), relief: false });
const meshes = (g: THREE.Group): THREE.Mesh[] => g.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
const triangles = (g: THREE.Group): number => meshes(g).reduce((n, m) => n + Math.min(m.geometry.index!.count, m.geometry.drawRange.count) / 3, 0);
const programKeys = (g: THREE.Group): string[] => meshes(g).map((m) => (m.material as THREE.Material).customProgramCacheKey());

afterEach(() => registerBakedLight('depot', null));

describe('which maps draw baked light (G6)', () => {
  it('Depot once its file is loaded; never a map that opts out, nor a map played under other light than its bake', () => {
    expect(bakedLightFor(DEPOT)).toBeNull();
    const grid = stubGrid();
    registerBakedLight('depot', grid);
    expect(bakedLightFor(DEPOT)).toBe(grid);
    expect(bakedLightFor(mapUnderLighting(NEON_HEIGHTS, 'day'))).toBeNull();
    // A Depot played at night (were it offered) would not take its day bake.
    expect(bakedLightFor({ ...DEPOT, lighting: { presets: ['night'] } })).toBeNull();
  });

  it('draws it off without probes, else as the quality says', () => {
    expect(bakedLightMode('pixel', null)).toBe('off');
    expect(bakedLightMode('vertex', stubGrid())).toBe('vertex');
    expect(QUALITY.low.bakedLight).toBe('vertex');
    expect(QUALITY.medium.bakedLight).toBe('pixel');
    expect(QUALITY.high.bakedLight).toBe('pixel');
  });

  it('builds the map again when the mode, the weathering or the map’s probes change', () => {
    const grid = stubGrid();
    expect(mapNeedsRebuild(mapLookOf(QUALITY.high, grid), mapLookOf(QUALITY.high, grid))).toBe(false);
    expect(mapNeedsRebuild(mapLookOf(QUALITY.high, grid), mapLookOf({ ...QUALITY.high, bakedLight: 'off' }, grid))).toBe(true);
    expect(mapNeedsRebuild(mapLookOf(QUALITY.high, grid), mapLookOf({ ...QUALITY.high, weathering: false }, grid))).toBe(true);
    expect(mapNeedsRebuild(mapLookOf(QUALITY.high, grid), mapLookOf(QUALITY.high, stubGrid()))).toBe(true);
    // No probes: the mode makes no difference.
    expect(mapNeedsRebuild(mapLookOf(QUALITY.high), mapLookOf({ ...QUALITY.high, bakedLight: 'off' }))).toBe(false);
  });

  it('keeps the kept map when the quality changes nothing it draws (the cache compares its own probes)', () => {
    const grid = stubGrid();
    const cache = new MapMeshCache(null);
    const group = cache.take(DEPOT, textures(), look('high', grid));
    cache.release();
    cache.trim({ ...mapLookOf(QUALITY.high), relief: false });
    expect(cache.take(DEPOT, textures(), look('high', grid))).toBe(group);
    cache.clear();
  });
});

describe('Low: the baked light in the vertex colours, at no per-pixel cost (G6)', () => {
  const off = buildMapMeshes(DEPOT, textures(), look('low', null), null);
  const lit = buildMapMeshes(DEPOT, textures(), look('low', stubGrid()), null);

  it('adds no draw call, no texture and no shader: every surface is Low’s Lambert without the environment', () => {
    expect(meshes(lit).length).toBe(meshes(off).length);
    expect(meshes(lit).map((m) => m.name)).toEqual(meshes(off).map((m) => m.name));
    for (const m of meshes(lit)) {
      const mat = m.material as THREE.MeshLambertMaterial;
      expect(mat).toBeInstanceOf(THREE.MeshLambertMaterial);
      expect(mat.customProgramCacheKey()).toBe('without-environment');
    }
    expect(lit.userData.probes).toBeUndefined();
  });

  it('cuts big faces into tiles for the light to land on, within about a thousand triangles (Low’s budget)', () => {
    const added = triangles(lit) - triangles(off);
    expect(added).toBeGreaterThan(0);
    expect(added).toBeLessThan(1500);
  });

  it('darkens what stands where the sky is hidden and tints what is open with the bounce', () => {
    const concrete = lit.getObjectByName('map-concrete') as THREE.Mesh;
    const pos = concrete.geometry.getAttribute('position');
    const col = concrete.geometry.getAttribute('color');
    const plain = (off.getObjectByName('map-concrete') as THREE.Mesh).geometry.getAttribute('color');
    // The ground's top (y 0) reads the dark probes under 1 m: darker than without, by the vertex share.
    const groundOf = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): number => {
      for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i)) < 1e-6) return i;
      return -1;
    };
    const ground = groundOf(pos);
    const plainGround = groundOf((off.getObjectByName('map-concrete') as THREE.Mesh).geometry.getAttribute('position'));
    expect(ground).toBeGreaterThanOrEqual(0);
    const k = 1 - BAKED_LIGHT.look.vertex.indirectShare * (1 - 40 / 255);
    expect(col.getY(ground)).toBeCloseTo(plain.getY(plainGround) * k, 4);
  });

  it('scales each vertex colour by its tint (tintVertices)', () => {
    const buf = emptyBuffers();
    buf.positions.push(0, 5, 0, 0, 0.2, 0);
    buf.normals.push(0, 1, 0, 0, 1, 0);
    buf.colors.push(1, 1, 1, 1, 1, 1);
    tintVertices(buf, stubGrid());
    // Up high: open, orange bounce (red lifted most); low down: the sky hidden.
    expect(buf.colors[0]!).toBeGreaterThan(buf.colors[2]!);
    expect(buf.colors[0]!).toBeGreaterThan(1);
    expect(buf.colors[4]!).toBeLessThan(1);
  });
});

describe('Medium and High: the baked light per pixel, from a 3D texture (G6)', () => {
  it('gives every surface the probes’ uniforms, sharing one texture, freed with the map', () => {
    const grid = stubGrid();
    const group = buildMapMeshes(DEPOT, textures(), look('high', grid), null);
    const u = group.userData.probes;
    expect(u.bakeTex.value).toBeInstanceOf(THREE.Data3DTexture);
    expect(programKeys(group).every((k) => k.includes(':probes'))).toBe(true);
    // No extra draw call over the map without baked light.
    const without = buildMapMeshes(DEPOT, textures(), look('high', null), null);
    expect(meshes(group).length).toBe(meshes(without).length);
    const tex = u.bakeTex.value as THREE.Data3DTexture;
    let freed = 0;
    tex.addEventListener('dispose', () => freed++);
    disposeMapMeshes(group);
    disposeMapMeshes(without);
    expect(freed).toBe(1);
  });

  it('puts the texture’s texel centres on the probes (its box half a spacing past the outer ones)', () => {
    const grid = stubGrid();
    const u = probeUniforms(grid);
    expect(u.bakeMin.value.toArray()).toEqual([-41, -1, -61]);
    expect(u.bakeSize.value.toArray()).toEqual([80, 12, 120]);
    expect(u.bakeScale.value).toBe(grid.scale);
    const tex = u.bakeTex.value as THREE.Data3DTexture;
    expect([tex.image.width, tex.image.height, tex.image.depth]).toEqual([40, 6, 60]);
    expect(tex.magFilter).toBe(THREE.LinearFilter);
    expect(tex.wrapR).toBe(THREE.ClampToEdgeWrapping);
    tex.dispose();
  });
});
