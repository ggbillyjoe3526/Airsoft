import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUALITY, SURFACES, type SurfaceTextureId } from '../config/render';
import { DEPOT } from '../map/depot';
import { RANGE_MAP } from '../map/range';
import { MapMeshCache } from './mapMeshCache';
import { type MapLook, mapLookOf } from './mapMeshes';
import type { SurfaceTextures } from './proceduralTextures';

/** Stand-in surface textures (named as the real ones, so a built map can be pointed at another set). */
function textures(): SurfaceTextures {
  return Object.fromEntries(
    (Object.keys(SURFACES.worldSize) as SurfaceTextureId[]).map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }) as THREE.CanvasTexture, worldSize: SURFACES.worldSize[id] }]),
  ) as SurfaceTextures;
}

const atlas = () => new THREE.Texture();
/** Low's look; a detailed one (map detail, the steel's sheen) without relief; the same with bump relief (no image to read). */
const low = mapLookOf(QUALITY.low);
const medium: MapLook = { ...mapLookOf(QUALITY.medium), relief: false };
const high: MapLook = { ...medium, relief: true, normalMaps: false };

/** Counts the map geometries freed from now on. */
function watchDisposal(): () => number {
  const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
  return () => dispose.mock.calls.length;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the kept map meshes (audit CORE-33)', () => {
  it('hands the same meshes back for the same map after a session released them, freeing nothing', () => {
    const cache = new MapMeshCache(atlas);
    const set = textures();
    const scene = new THREE.Scene();
    const first = cache.take(DEPOT, set, low);
    expect(cache.reused).toBe(false);
    scene.add(first);
    const freed = watchDisposal();
    cache.release();
    expect(first.parent).toBeNull();
    const second = cache.take(DEPOT, set, low);
    expect(second).toBe(first);
    expect(cache.reused).toBe(true);
    expect(freed()).toBe(0);
    cache.release();
    cache.clear();
    expect(freed()).toBeGreaterThan(0);
  });

  it('restyles kept meshes in place for a look that keeps their geometry (relief), and builds again for one that does not (map detail)', () => {
    const cache = new MapMeshCache(atlas);
    const set = textures();
    const atMedium = cache.take(DEPOT, set, medium);
    cache.release();
    const freed = watchDisposal();
    expect(cache.take(DEPOT, set, high)).toBe(atMedium);
    expect(cache.reused).toBe(true);
    expect(freed()).toBe(0);
    cache.release();
    // Low has no map detail: other geometry, so the kept meshes go and new ones are built.
    const atLow = cache.take(DEPOT, set, low);
    expect(atLow).not.toBe(atMedium);
    expect(cache.reused).toBe(false);
    expect(freed()).toBeGreaterThan(0);
    cache.clear();
  });

  it('frees the kept meshes when another map is taken, and keeps one map at a time', () => {
    const cache = new MapMeshCache(atlas);
    const set = textures();
    const depot = cache.take(DEPOT, set, low);
    cache.release();
    const freed = watchDisposal();
    const range = cache.take(RANGE_MAP, set, low);
    expect(range).not.toBe(depot);
    expect(freed()).toBeGreaterThan(0);
    cache.release();
    expect(cache.take(DEPOT, set, low)).not.toBe(depot);
    cache.release();
    cache.clear();
  });

  it('follows the holding session’s settings (the group it returns is the one drawn)', () => {
    const cache = new MapMeshCache(atlas);
    const set = textures();
    const scene = new THREE.Scene();
    const atLow = cache.take(DEPOT, set, low);
    scene.add(atLow);
    const atMedium = cache.restyle(set, medium);
    expect(atMedium).not.toBe(atLow);
    expect(atMedium.parent).toBe(scene);
    expect(cache.restyle(set, high)).toBe(atMedium);
    cache.release();
    expect(scene.children).toHaveLength(0);
    expect(cache.take(DEPOT, set, high)).toBe(atMedium);
    cache.release();
    cache.clear();
  });

  it('frees meshes no session holds on a quality change that would build them again, and on a context swap', () => {
    const cache = new MapMeshCache(atlas);
    const set = textures();
    cache.take(DEPOT, set, medium);
    // Held: a quality change or a context swap leaves them to the session (they are in its scene).
    let freed = watchDisposal();
    cache.trim(low);
    cache.contextReplaced();
    expect(freed()).toBe(0);
    cache.release();
    // Released: relief or texture size alone keeps them; map detail off frees them.
    cache.trim(high);
    expect(freed()).toBe(0);
    cache.trim(low);
    expect(freed()).toBeGreaterThan(0);
    vi.restoreAllMocks();
    // A context swap frees released ones.
    const kept = cache.take(DEPOT, set, low);
    cache.release();
    freed = watchDisposal();
    cache.contextReplaced();
    expect(freed()).toBeGreaterThan(0);
    expect(cache.take(DEPOT, set, low)).not.toBe(kept);
    cache.release();
    cache.clear();
  });
});
