import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { BAKED_LIGHT } from '../config/bake';
import { LIGHTING, LIGHTING_PRESETS, QUALITY, SURFACES, type SurfaceTextureId } from '../config/render';
import { DEPOT } from '../map/depot';
import { lightingChoices, mapUnderLighting } from '../map/lightingChoice';
import { MAPS, mapData } from '../map/maps';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND } from '../map/woodland';
import { bakedLightFor, registerBakedLight } from './bakedLight';
import { resolveLighting, withOverride } from './lightingPreset';
import { buildMapMeshes, disposeMapMeshes, type MapLook, mapLookOf, restyleMap } from './mapMeshes';
import { MapMeshCache } from './mapMeshCache';
import type { ProbeGrid } from './probeGrid';
import type { SurfaceTextures } from './proceduralTextures';

/**
 * QA for the baked light's reach and cleanup (G6): which maps take it, that the maps that opt out are built as they were,
 * that the 3D texture goes with the meshes that hold it, and that the night light is the night light it was.
 */

/** A small grid over Depot (the probes' values do not matter here). */
function grid(): ProbeGrid {
  const nx = 40;
  const ny = 6;
  const nz = 60;
  const data = new Uint8Array(nx * ny * nz * 4).fill(200);
  return { version: BAKED_LIGHT.bake.version, preset: 'day', hash: 0, nx, ny, nz, origin: [-40, 0, -60], spacing: 2, scale: 1, data };
}

/** Every surface a map may use, drawn as a stand-in (no pixels; the relief is switched off in `look`). */
const textures = (): SurfaceTextures =>
  Object.fromEntries((Object.keys(SURFACES.worldSize) as SurfaceTextureId[]).map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }), worldSize: SURFACES.worldSize[id] }])) as unknown as SurfaceTextures;
const look = (q: keyof typeof QUALITY, probes: ProbeGrid | null): MapLook => ({ ...mapLookOf(QUALITY[q], probes), relief: false, normalMaps: false });
const meshes = (g: THREE.Group): THREE.Mesh[] => g.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
const keys = (g: THREE.Group): string[] => meshes(g).map((m) => (m.material as THREE.Material).customProgramCacheKey());
/** Counts the times the group's 3D texture is freed. */
function watchTexture(g: THREE.Group): { freed: () => number } {
  const tex = g.userData.probes?.bakeTex.value as THREE.Data3DTexture;
  expect(tex).toBeInstanceOf(THREE.Data3DTexture);
  let n = 0;
  tex.addEventListener('dispose', () => n++);
  return { freed: () => n };
}

afterEach(() => registerBakedLight('depot', null));

describe('which maps and lightings take the baked light (G6 QA)', () => {
  it('only Depot by day, whatever the map, whatever the lighting it is played under, with Depot’s file loaded', () => {
    registerBakedLight('depot', grid());
    const taking: string[] = [];
    for (const entry of MAPS) {
      const map = mapData(entry.id);
      for (const preset of lightingChoices(map)) if (bakedLightFor(mapUnderLighting(map, preset))) taking.push(`${entry.id}:${preset}`);
    }
    expect(taking).toEqual(['depot:day']);
    // The night maps played by day (they offer it) still opt out: nothing was baked for them.
    expect(bakedLightFor(mapUnderLighting(NEON_HEIGHTS, 'day'))).toBeNull();
    expect(bakedLightFor(mapUnderLighting(WOODLAND, 'day'))).toBeNull();
  });
});

describe('a map that opts out is built exactly as it was (G6 QA)', () => {
  for (const [name, map] of [['Woodland', WOODLAND], ['Neon Heights', NEON_HEIGHTS]] as const) {
    it(`${name} on every preset: no 3D texture, no baked-light program, the same meshes and colours as with no probes at all`, () => {
      registerBakedLight('depot', grid());
      expect(bakedLightFor(map)).toBeNull();
      for (const q of ['low', 'medium', 'high'] as const) {
        const got = buildMapMeshes(map, textures(), look(q, bakedLightFor(map)), null);
        const plain = buildMapMeshes(map, textures(), look(q, null), null);
        expect(got.userData.probes, `${name} ${q}`).toBeUndefined();
        expect(keys(got).some((k) => k.includes('probes')), `${name} ${q}`).toBe(false);
        expect(keys(got)).toEqual(keys(plain));
        expect(meshes(got).map((m) => m.name)).toEqual(meshes(plain).map((m) => m.name));
        // Low's vertex colours are the plain ones: nothing was tinted.
        for (const [i, m] of meshes(got).entries()) {
          expect(Array.from(m.geometry.getAttribute('color').array), `${name} ${q} ${m.name}`).toEqual(Array.from(meshes(plain)[i]!.geometry.getAttribute('color').array));
        }
        disposeMapMeshes(got);
        disposeMapMeshes(plain);
      }
    }, 60_000);
  }

  it('Depot’s own Low colours do change with its probes (the guard above would notice a tint)', () => {
    const lit = buildMapMeshes(DEPOT, textures(), look('low', grid()), null);
    const plain = buildMapMeshes(DEPOT, textures(), look('low', null), null);
    const colours = (g: THREE.Group): number[] => Array.from((g.getObjectByName('map-concrete') as THREE.Mesh).geometry.getAttribute('color').array);
    expect(colours(lit)).not.toEqual(colours(plain));
    disposeMapMeshes(lit);
    disposeMapMeshes(plain);
  });
});

describe('Low’s baked light adds no shader, texture or draw call (G6 QA)', { timeout: 60_000 }, () => {
  it('compiles the very same programs as Low without probes: the same shader hook, one program, the same textures, no uniforms', () => {
    const shared = textures();
    const lit = buildMapMeshes(DEPOT, shared, look('low', grid()), null);
    const off = buildMapMeshes(DEPOT, shared, look('low', null), null);
    expect(meshes(lit).length).toBe(meshes(off).length);
    expect(new Set(keys(lit))).toEqual(new Set(keys(off)));
    expect(new Set(keys(lit)).size).toBe(1);
    for (const [i, m] of meshes(lit).entries()) {
      const was = meshes(off)[i]!.material as THREE.MeshLambertMaterial;
      const mat = m.material as THREE.MeshLambertMaterial;
      expect(mat.onBeforeCompile.toString()).toBe(was.onBeforeCompile.toString());
      expect(mat.map).toBe(was.map);
      expect(mat.normalMap).toBeNull();
      expect(mat.type).toBe('MeshLambertMaterial');
    }
    expect(lit.userData.probes).toBeUndefined();
    expect(lit.children.length).toBe(off.children.length);
    disposeMapMeshes(lit);
    disposeMapMeshes(off);
  });
});

describe('the baked light’s 3D texture is freed with its meshes (G6 QA)', { timeout: 60_000 }, () => {
  it('when the map is built again for another quality, the old texture freed once and Low’s new meshes holding none', () => {
    const g = grid();
    const high = buildMapMeshes(DEPOT, textures(), look('high', g), null);
    const watch = watchTexture(high);
    const scene = new THREE.Scene();
    scene.add(high);
    const low = restyleMap(high, DEPOT, textures(), look('high', g), look('low', g), null);
    expect(watch.freed()).toBe(1);
    expect(low).not.toBe(high);
    expect(low.userData.probes).toBeUndefined();
    expect(low.parent).toBe(scene);
    disposeMapMeshes(low);
    // And back up: a new texture, not the freed one.
    const again = buildMapMeshes(DEPOT, textures(), look('medium', g), null);
    const second = watchTexture(again);
    expect(again.userData.probes.bakeTex.value).not.toBeNull();
    disposeMapMeshes(again);
    expect(second.freed()).toBe(1);
  });

  it('when weathering is switched off the map is built again, and the old texture is freed', () => {
    const g = grid();
    const medium = buildMapMeshes(DEPOT, textures(), look('medium', g), null);
    const watch = watchTexture(medium);
    const next = restyleMap(medium, DEPOT, textures(), look('medium', g), { ...look('medium', g), weathering: false }, null);
    expect(watch.freed()).toBe(1);
    expect(next.userData.probes.bakeTex.value).toBeInstanceOf(THREE.Data3DTexture);
    disposeMapMeshes(next);
  });

  it('when only the baked-light mode changes (Per pixel to Vertex, or Off) the map is built again and the texture freed', () => {
    const g = grid();
    for (const bakedLight of ['vertex', 'off'] as const) {
      const high = buildMapMeshes(DEPOT, textures(), look('high', g), null);
      const watch = watchTexture(high);
      const next = restyleMap(high, DEPOT, textures(), look('high', g), { ...look('high', g), bakedLight }, null);
      expect(next, bakedLight).not.toBe(high);
      expect(watch.freed(), bakedLight).toBe(1);
      expect(next.userData.probes, bakedLight).toBeUndefined();
      disposeMapMeshes(next);
    }
  });

  it('is kept, not freed, when a change needs no rebuild (Medium to High)', () => {
    const g = grid();
    const medium = buildMapMeshes(DEPOT, textures(), look('medium', g), null);
    const watch = watchTexture(medium);
    const same = restyleMap(medium, DEPOT, textures(), look('medium', g), look('high', g), null);
    expect(same).toBe(medium);
    expect(watch.freed()).toBe(0);
    disposeMapMeshes(medium);
    expect(watch.freed()).toBe(1);
  });

  it('is freed once however often the meshes are disposed', () => {
    const high = buildMapMeshes(DEPOT, textures(), look('high', grid()), null);
    const watch = watchTexture(high);
    disposeMapMeshes(high);
    disposeMapMeshes(high);
    expect(watch.freed()).toBe(1);
    expect(high.userData.probes.bakeTex.value).toBeNull();
  });

  it('is freed by the kept-meshes cache when it clears, trims for a quality that builds them again, or the context is replaced', () => {
    const g = grid();
    // Clearing (a match ended and the renderer is freed, or another map is taken).
    const a = new MapMeshCache(null);
    const kept = a.take(DEPOT, textures(), look('high', g));
    const watchA = watchTexture(kept);
    a.release();
    expect(watchA.freed()).toBe(0);
    a.clear();
    expect(watchA.freed()).toBe(1);
    // Low chosen in the menus while no match holds the meshes: the kept ones would be built again, so they go.
    const b = new MapMeshCache(null);
    const watchB = watchTexture(b.take(DEPOT, textures(), look('high', g)));
    b.release();
    b.trim({ ...mapLookOf(QUALITY.low), relief: false });
    expect(watchB.freed()).toBe(1);
    // A new GL context while no match holds them.
    const c = new MapMeshCache(null);
    const watchC = watchTexture(c.take(DEPOT, textures(), look('medium', g)));
    c.release();
    c.contextReplaced();
    expect(watchC.freed()).toBe(1);
    // …but meshes a match still holds are left to it.
    const d = new MapMeshCache(null);
    const watchD = watchTexture(d.take(DEPOT, textures(), look('medium', g)));
    d.contextReplaced();
    d.trim({ ...mapLookOf(QUALITY.low), relief: false });
    expect(watchD.freed()).toBe(0);
    d.clear();
    expect(watchD.freed()).toBe(1);
  });
});

describe('the night light is the night light it was (G6 QA)', () => {
  /** The night preset as it stood before G6 (the day's were what moved). */
  const NIGHT = {
    night: true,
    sky: { zenith: 0x0a1224, horizon: 0x1d2b46, below: 0x0e1218, sunGlow: 0x9fb4d6, sunGlowPower: 10, horizonFalloff: 1.6 },
    fog: { colour: 0x1d2b46, near: 20, far: 140 },
    hemi: { sky: 0x3a4c78, ground: 0x2a2620, intensity: 1 },
    keyColour: 0xc8d4ff,
    keyIntensity: 1,
    keyDisc: { colour: 0xe8eeff, size: 0 },
    clouds: { shade: 0x121826, top: 0x3c475e, opacity: 0.5 },
    environment: { ground: 0x1c1f26, intensity: 0.2 },
    exposureScale: 1.3,
    viewmodel: { hemi: { sky: 0x6a7ca8, ground: 0x22242c, intensity: 0.55 }, key: { colour: 0xb8c8ff, intensity: 0.7 }, rim: { colour: 0x8fa6e0, intensity: 0.6 } },
    torch: { beam: 0.16, glare: 1, hitSpot: 0.55, spot: 160, spill: 0.6, spillIntensity: 0.8, figureLift: 0.35 },
    nightSky: { stars: 520, moonSize: 0.05, moonColour: 0xf1f4ff, halo: 4.5, haloAlpha: 0.22 },
  };

  it('keeps every value of the night preset, the moon’s place included (not the day’s lower sun)', () => {
    const n = LIGHTING_PRESETS.night;
    const { keyColour, keyIntensity, keyDisc, ...rest } = NIGHT;
    expect({ ...n, key: undefined }).toEqual({ ...rest, key: undefined });
    expect([n.key.colour, n.key.intensity, n.key.disc]).toEqual([keyColour, keyIntensity, keyDisc]);
    // The moon is where it was: 18° up, 48 m out, due along x (the day sun's new 35° did not touch it).
    const up = (18 * Math.PI) / 180;
    expect([n.key.offset.x, n.key.offset.y, n.key.offset.z]).toEqual([Math.cos(up) * 48, Math.sin(up) * 48, 0]);
  });

  it('lights the night maps with it and no bake: Woodland and Neon Heights resolve to the night preset’s light', () => {
    for (const map of [WOODLAND, NEON_HEIGHTS]) {
      const resolved = resolveLighting(mapUnderLighting(map, 'night'));
      expect(resolved.night).toBe(true);
      // The night preset with only the map's own overrides laid over it: none of the day's constants (LIGHTING, ATMOSPHERE) in it.
      const expected = withOverride(LIGHTING_PRESETS.night, map.lighting?.overrides?.night);
      expect(resolved.hemi).toEqual(expected.hemi);
      expect(resolved.key.colour).toBe(expected.key.colour);
      expect(resolved.key.intensity).toBe(expected.key.intensity);
      expect(resolved.sky).toEqual(expected.sky);
      expect(resolved.key.colour).not.toBe(LIGHTING.sunColor);
      expect(map.bakedLight).toBeUndefined();
    }
  });

  it('bakes Depot under the day preset only', () => {
    expect(BAKED_LIGHT.bake.preset).toBe('day');
    expect(resolveLighting(DEPOT, BAKED_LIGHT.bake.preset).night).toBe(false);
  });
});
