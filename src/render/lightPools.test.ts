import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { POOL_LIGHTS, QUALITY } from '../config/render';
import { DEPOT } from '../map/depot';
import type { MapData } from '../map/mapTypes';
import type { MapLight } from '../map/nightSight';
import { terrainHeightAt, terrainMaxX, terrainMaxZ } from '../map/terrain';
import { TEST_YARD } from '../map/testYard';
import { WOODLAND } from '../map/woodland';
import { vec3 } from '../sim/vec';
import {
  addLightPools,
  buildPoolDecal,
  createPoolLightState,
  groundUnder,
  poolFalloff,
  poolLightIntensity,
  poolLightReach,
  stepPoolLights,
} from './lightPools';

/** Three pools along x: at 0, 20 and 40 m, radius 5, on TEST_YARD's floor. */
const POOLS: readonly MapLight[] = [0, 20, 40].map((x) => ({ position: vec3(x - 20, 1, 0), radius: 5, colour: 0xff9a4a }));
const LIT_YARD: MapData = { ...TEST_YARD, lights: POOLS };

const pointLights = (scene: THREE.Scene): THREE.PointLight[] => scene.children.filter((o): o is THREE.PointLight => o instanceof THREE.PointLight);

describe('the real lights follow the nearest pools (M33f, acceptance 3)', () => {
  it('takes the nearest pools by distance to their edge', () => {
    const s = createPoolLightState(2, POOLS.length);
    stepPoolLights(s, POOLS, -20, 0, 1);
    expect([...s.want].sort()).toEqual([0, 1]);
    stepPoolLights(s, POOLS, 20, 0, 1);
    expect([...s.want].sort()).toEqual([1, 2]);
  });

  it('moves a light only to a pool `hysteresis` metres nearer than the farthest one it has', () => {
    const s = createPoolLightState(1, 2);
    const two = POOLS.slice(0, 2);
    stepPoolLights(s, two, -20, 0, 1); // at pool 0
    expect(s.want[0]).toBe(0);
    // Halfway between, then a little past the middle: not enough to move.
    stepPoolLights(s, two, -10 + POOL_LIGHTS.hysteresis / 2 - 0.1, 0, 1);
    expect(s.want[0]).toBe(0);
    stepPoolLights(s, two, -10 + POOL_LIGHTS.hysteresis / 2 + 0.1, 0, 1);
    expect(s.want[0]).toBe(1);
  });

  it('fades a light out before it moves and in after, over fadeSeconds', () => {
    const s = createPoolLightState(1, 2);
    const two = POOLS.slice(0, 2);
    const dt = POOL_LIGHTS.fadeSeconds / 3;
    stepPoolLights(s, two, -20, 0, dt);
    expect(s.current[0]).toBe(0);
    for (let i = 0; i < 3; i++) stepPoolLights(s, two, -20, 0, dt);
    expect(s.level[0]).toBeCloseTo(1);
    stepPoolLights(s, two, 0, 0, dt);
    expect(s.current[0]).toBe(0); // still on the old pool, dimming
    expect(s.level[0]).toBeCloseTo(2 / 3);
    stepPoolLights(s, two, 0, 0, dt);
    expect(s.current[0]).toBe(0);
    stepPoolLights(s, two, 0, 0, dt);
    expect(s.current[0]).toBe(1);
    expect(s.level[0]).toBe(0);
    stepPoolLights(s, two, 0, 0, dt);
    expect(s.level[0]).toBeCloseTo(1 / 3);
  });

  it('leaves spare lights dark when there are fewer pools than lights', () => {
    const s = createPoolLightState(4, 1);
    stepPoolLights(s, POOLS.slice(0, 1), 0, 0, 1);
    expect([...s.current]).toEqual([0, -1, -1, -1]);
  });

  it('still lights a pool’s edge and stops a little past it (physical falloff)', () => {
    const pool = POOLS[0]!;
    const reach = poolLightReach(pool);
    // Three.js's punctual light falloff (r186 getDistanceAttenuation).
    const falloff = (d: number): number => (Math.max(0, 1 - (d / reach) ** 4) ** 2) / Math.max(d ** POOL_LIGHTS.decay, 0.01);
    expect(reach).toBeGreaterThan(pool.radius);
    expect(poolLightIntensity(pool) * falloff(pool.radius)).toBeGreaterThan(0.1);
    expect(falloff(reach)).toBe(0);
    expect(poolFalloff(0)).toBe(1);
    expect(poolFalloff(1)).toBe(0);
  });
});

describe('light pools in the scene (M33f, acceptance 3)', () => {
  it('glows on every preset and lights the ground with one mesh and no lights on Low', () => {
    const scene = new THREE.Scene();
    addLightPools(scene, LIT_YARD, QUALITY.low);
    const meshes = scene.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
    expect(meshes.map((m) => m.name).sort()).toEqual(['pool-glow', 'pool-ground']);
    expect(pointLights(scene)).toHaveLength(0);
    for (const m of meshes) {
      const mat = m.material as THREE.MeshBasicMaterial;
      expect(mat.blending).toBe(THREE.AdditiveBlending);
      expect(mat.depthWrite).toBe(false);
      // Off the environment map, as the rest of the map (render/surfaceMaterials.ts).
      expect(mat.customProgramCacheKey()).toBe('without-environment');
    }
  });

  it('keeps exactly poolLights point lights, without shadows, however the eye moves', () => {
    for (const q of [QUALITY.medium, QUALITY.high]) {
      const scene = new THREE.Scene();
      const pools = addLightPools(scene, LIT_YARD, q);
      const lights = pointLights(scene);
      expect(lights).toHaveLength(q.poolLights);
      const eye = new THREE.Vector3();
      for (let i = 0; i < 300; i++) {
        eye.set(Math.sin(i * 0.05) * 30, 1.6, Math.cos(i * 0.03) * 10);
        pools.follow(eye, 1 / 60);
        expect(pointLights(scene)).toEqual(lights);
      }
      for (const l of lights) expect(l.castShadow).toBe(false);
      expect(lights.filter((l) => l.intensity > 0).length).toBeGreaterThan(0);
    }
  });

  it('dims the ground mesh under a pool while a real light shines on it, and only there', () => {
    const scene = new THREE.Scene();
    const pools = addLightPools(scene, LIT_YARD, { poolLights: 2 });
    const ground = scene.getObjectByName('pool-ground') as THREE.Mesh;
    const col = ground.geometry.getAttribute('color');
    const perPool = col.count / POOLS.length;
    const before = col.getX(perPool * 2);
    for (let i = 0; i < 60; i++) pools.follow(new THREE.Vector3(-20, 1.6, 0), 1 / 30);
    expect(col.getX(0)).toBe(0); // pool 0, lit
    expect(col.getX(perPool)).toBe(0); // pool 1, lit
    expect(col.getX(perPool * 2)).toBe(before); // pool 2, ground mesh only
    expect(before).toBeGreaterThan(0);
  });

  it('changes the number of lights only with the setting', () => {
    const scene = new THREE.Scene();
    const pools = addLightPools(scene, LIT_YARD, QUALITY.high);
    pools.setQuality(QUALITY.high);
    expect(pointLights(scene)).toHaveLength(4);
    pools.setQuality(QUALITY.low);
    expect(pointLights(scene)).toHaveLength(0);
  });

  it('adds nothing on a map without light pools (Depot draws as before)', () => {
    for (const q of [QUALITY.low, QUALITY.medium, QUALITY.high]) {
      const scene = new THREE.Scene();
      const pools = addLightPools(scene, DEPOT, q);
      pools.follow(new THREE.Vector3(), 1 / 60);
      expect(scene.children).toHaveLength(0);
    }
  });

  it('leaves the scene empty and frees what it drew when disposed', () => {
    const scene = new THREE.Scene();
    const pools = addLightPools(scene, LIT_YARD, QUALITY.high);
    const meshes = scene.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
    const spies = meshes.flatMap((m) => [vi.spyOn(m.geometry, 'dispose'), vi.spyOn(m.material as THREE.Material, 'dispose')]);
    pools.dispose();
    expect(scene.children).toHaveLength(0);
    for (const s of spies) expect(s).toHaveBeenCalled();
  });
});

describe('the ground under a pool', () => {
  it('follows Woodland’s terrain, and its edge’s height past the fence', () => {
    const lights = WOODLAND.lights!;
    const t = WOODLAND.terrain!;
    const decal = buildPoolDecal(WOODLAND, lights);
    const pos = decal.mesh.geometry.getAttribute('position');
    let outside = 0;
    for (let v = 0; v < pos.count; v++) {
      const [x, z] = [pos.getX(v), pos.getZ(v)];
      const cx = Math.min(terrainMaxX(t), Math.max(t.minX, x));
      const cz = Math.min(terrainMaxZ(t), Math.max(t.minZ, z));
      if (cx !== x || cz !== z) outside++;
      expect(pos.getY(v)).toBeCloseTo(terrainHeightAt(t, cx, cz)! + POOL_LIGHTS.lift, 4);
    }
    expect(outside).toBeGreaterThan(0); // the camp fires stand within a radius of the fence
    expect(decal.mesh.geometry.index!.count / 3 / lights.length).toBeLessThanOrEqual(200);
    decal.mesh.geometry.dispose();
    (decal.mesh.material as THREE.Material).dispose();
  });

  it('stands on the highest floor under the light on a map of floor blocks', () => {
    expect(groundUnder(TEST_YARD, 0, 0, 1)).toBe(groundUnder(TEST_YARD, 0, 0, 10));
    expect(groundUnder(TEST_YARD, 0, 0, 1)).toBeLessThanOrEqual(1);
    expect(groundUnder(TEST_YARD, 1000, 1000, 1)).toBeUndefined();
  });
});

describe('the fixtures in the pools (M33i)', () => {
  it('adds Woodland’s flames, and embers where dust motes are on, switched with the quality', () => {
    const scene = new THREE.Scene();
    const pools = addLightPools(scene, WOODLAND, QUALITY.low);
    const embers = scene.getObjectByName('fire-embers')!;
    expect(scene.getObjectByName('fire-flames')).toBeDefined();
    expect(embers.visible).toBe(QUALITY.low.dustMotes > 0);
    pools.setQuality(QUALITY.medium);
    expect(embers.visible).toBe(QUALITY.medium.dustMotes > 0);
    expect(QUALITY.medium.dustMotes).toBeGreaterThan(0);
    pools.setQuality({ poolLights: QUALITY.medium.poolLights });
    expect(embers.visible).toBe(true);
    pools.dispose();
    expect(scene.getObjectByName('fire-flames')).toBeUndefined();
  });

  it('flickers a real fire light with its flames', () => {
    const scene = new THREE.Scene();
    const pools = addLightPools(scene, WOODLAND, QUALITY.high);
    const lights = (): THREE.PointLight[] => scene.children.filter((o): o is THREE.PointLight => o instanceof THREE.PointLight);
    const fire = WOODLAND.lights!.find((l) => l.kind === 'fire')!;
    const eye = new THREE.Vector3(fire.position.x, fire.position.y + 1.6, fire.position.z);
    // Settle first (a light fades in over POOL_LIGHTS.fadeSeconds), then watch it.
    for (let i = 0; i < 300; i++) pools.follow(eye, 1 / 30);
    const seen = new Set<number>();
    for (let i = 0; i < 12; i++) {
      pools.follow(eye, 0.07);
      const near = lights().reduce((a, b) => (a.position.distanceTo(eye) < b.position.distanceTo(eye) ? a : b));
      seen.add(Math.round(near.intensity * 1e4));
    }
    expect(seen.size).toBeGreaterThan(1);
    pools.dispose();
  });
});
