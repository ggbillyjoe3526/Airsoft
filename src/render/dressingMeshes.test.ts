import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FULL_MOTION } from '../config/accessibility';
import { LIGHTING_PRESETS, QUALITY, type QualitySettings, SURFACES } from '../config/render';
import { LOADOUT } from '../config/replicas';
import { DEPOT } from '../map/depot';
import type { MapData } from '../map/mapTypes';
import { createCharacter } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { vec3 } from '../sim/vec';
import { vi } from 'vitest';
import { addAtmosphere } from './atmosphere';
import { DressingEffects } from './dressingEffects';
import { buildMapMeshes, disposeMapMeshes, type MapLook, mapLookOf } from './mapMeshes';
import type { SurfaceTextures } from './proceduralTextures';
import { CORE_SURFACES } from './proceduralTextures';

/**
 * What the set dressing costs (G8, config/dressing.ts): nothing on Low; on Medium and High at most four more draw
 * calls (junk and strips, puddles, smoke, kicked dust while it flies) and 15 000 more triangles on Depot; and every
 * piece of it is freed with the map or the match.
 */

const BARE: MapData = { ...DEPOT };
delete BARE.dressing;
const textures = (): SurfaceTextures =>
  Object.fromEntries(CORE_SURFACES.map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }), worldSize: SURFACES.worldSize[id] }])) as unknown as SurfaceTextures;
const look = (q: QualitySettings): MapLook => ({ ...mapLookOf(q, null), relief: false });
const atlas = (): THREE.Texture => new THREE.Texture();
const meshes = (g: THREE.Object3D): THREE.Mesh[] => g.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
const tris = (m: THREE.Mesh): number => (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
const triangles = (g: THREE.Object3D): number => meshes(g).reduce((n, m) => n + tris(m), 0);
const programs = (g: THREE.Object3D): string[] => meshes(g).map((m) => `${m.name}:${(m.material as THREE.Material).type}:${(m.material as THREE.Material).customProgramCacheKey()}`);

/** The tree ring's triangles at a Trees setting, with and without Depot's skyline. */
function ringTriangles(q: QualitySettings, map: MapData): number {
  const scene = new THREE.Scene();
  const box = new THREE.Box3(new THREE.Vector3(-25.5, -0.5, -16.5), new THREE.Vector3(25.5, 4, 16.5));
  const a = addAtmosphere(scene, new THREE.Vector3(), new THREE.Vector3(0.4, 0.8, 0.3).normalize(), q, box, LIGHTING_PRESETS.day, map.dressing?.skyline);
  const trees = scene.getObjectByName('trees') as THREE.Mesh | undefined;
  const n = trees ? tris(trees) : 0;
  a.dispose();
  return n;
}

const footstep = (kind: 'sprint' | 'land' | 'run'): GameEvent => ({ type: 'footstep', characterId: 0, kind }) as GameEvent;

describe('set dressing cost and lifetime (G8)', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  it('Low draws exactly what it drew before: the same meshes, triangles, shaders and tree ring, and no effects', () => {
    const low = look(QUALITY.low);
    const dressed = buildMapMeshes(DEPOT, textures(), low, atlas);
    const bare = buildMapMeshes(BARE, textures(), low, atlas);
    expect(programs(dressed)).toEqual(programs(bare));
    expect(triangles(dressed)).toBe(triangles(bare));
    expect(ringTriangles(QUALITY.low, DEPOT)).toBe(ringTriangles(QUALITY.low, BARE));
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, DEPOT.dressing);
    fx.setQuality(QUALITY.low);
    fx.afterTick([footstep('sprint'), footstep('land')], [createCharacter(0, vec3(), 0, LOADOUT, 0)], vec3());
    fx.update(1 / 60, new THREE.PerspectiveCamera(), vec3());
    expect(scene.children.length).toBe(0);
    fx.dispose();
    disposeMapMeshes(dressed);
    disposeMapMeshes(bare);
  });

  for (const preset of ['medium', 'high'] as const) {
    it(`${preset}: at most four more draw calls and 15 000 more triangles on Depot`, () => {
      const q = QUALITY[preset];
      const dressed = buildMapMeshes(DEPOT, textures(), look(q), atlas);
      const bare = buildMapMeshes(BARE, textures(), look(q), atlas);
      const added = meshes(dressed).filter((m) => !bare.getObjectByName(m.name));
      expect(added.map((m) => m.name).sort()).toEqual(['map-junk', 'map-puddles']);
      expect(added.every((m) => !m.castShadow)).toBe(true);
      const scene = new THREE.Scene();
      const fx = new DressingEffects(scene, DEPOT.dressing);
      fx.setQuality(q);
      // Smoke (one instanced draw) and the dust pool, drawn only while some is in the air.
      expect(scene.children.length).toBe(2);
      const camera = new THREE.PerspectiveCamera();
      fx.update(1 / 60, camera, vec3());
      expect(scene.children.filter((o) => o.visible).length).toBe(1);
      fx.afterTick([footstep('sprint')], [createCharacter(0, vec3(1, 0, 1), 0, LOADOUT, 0)], vec3());
      fx.update(1 / 60, camera, vec3());
      expect(scene.children.filter((o) => o.visible).length).toBe(2);
      expect(added.length + scene.children.length).toBeLessThanOrEqual(4);
      const extra = triangles(dressed) - triangles(bare) + ringTriangles(q, DEPOT) - ringTriangles(q, BARE);
      expect(extra).toBeGreaterThan(2000);
      expect(extra).toBeLessThanOrEqual(15000);
      fx.dispose();
      expect(scene.children.length).toBe(0);
      disposeMapMeshes(dressed);
      disposeMapMeshes(bare);
    });
  }

  it('flags the puddles reflective, glossy and over the decals', () => {
    const group = buildMapMeshes(DEPOT, textures(), look(QUALITY.high), atlas);
    const puddles = group.getObjectByName('map-puddles') as THREE.Mesh;
    const decals = group.getObjectByName('map-decals') as THREE.Mesh;
    expect(puddles.userData.reflective).toBeGreaterThan(0);
    const m = puddles.material as THREE.MeshStandardMaterial;
    expect(m.type).toBe('MeshStandardMaterial');
    expect(m.roughness).toBeLessThan(0.2);
    expect(puddles.renderOrder).toBeGreaterThan(decals.renderOrder);
    disposeMapMeshes(group);
  });

  it('frees every new geometry and material with the map, and the effects with the match', () => {
    const group = buildMapMeshes(DEPOT, textures(), look(QUALITY.high), atlas);
    let freed = 0;
    for (const name of ['map-junk', 'map-puddles']) {
      const mesh = group.getObjectByName(name) as THREE.Mesh;
      mesh.geometry.addEventListener('dispose', () => freed++);
      (mesh.material as THREE.Material).addEventListener('dispose', () => freed++);
    }
    disposeMapMeshes(group);
    expect(freed).toBe(4);
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, DEPOT.dressing);
    fx.setQuality(QUALITY.high);
    let fxFreed = 0;
    for (const o of scene.children as THREE.Mesh[]) {
      o.geometry.addEventListener('dispose', () => fxFreed++);
      (o.material as THREE.Material).addEventListener('dispose', () => fxFreed++);
      ((o.material as THREE.MeshBasicMaterial).map as THREE.Texture).addEventListener('dispose', () => fxFreed++);
    }
    fx.dispose();
    expect(fxFreed).toBe(6);
  });

  it('under Reduced motion the smoke stands still and no dust is kicked up', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, DEPOT.dressing);
    fx.setQuality(QUALITY.high);
    fx.setMotion(false);
    const camera = new THREE.PerspectiveCamera();
    const smoke = scene.getObjectByName('smokePlumes') as THREE.InstancedMesh;
    fx.update(0.5, camera, vec3(2, 0, 0));
    const before = Array.from(smoke.instanceMatrix.array);
    fx.update(0.5, camera, vec3(2, 0, 0));
    expect(Array.from(smoke.instanceMatrix.array)).toEqual(before);
    fx.afterTick([footstep('land')], [createCharacter(0, vec3(), 0, LOADOUT, 0)], vec3());
    fx.update(1 / 60, camera, vec3());
    expect(scene.children.filter((o) => o.visible).length).toBe(1);
    // With motion back the smoke moves on.
    fx.setMotion(FULL_MOTION.dust > 0);
    fx.update(0.5, camera, vec3());
    expect(Array.from(smoke.instanceMatrix.array)).not.toEqual(before);
    fx.dispose();
  });
});
