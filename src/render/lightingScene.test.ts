import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LIGHTING, LIGHTING_PRESETS, POOL_LIGHTS, QUALITY, type QualitySettings } from '../config/render';
import { DEPOT } from '../map/depot';
import { RANGE_MAP } from '../map/range';
import { TEST_YARD } from '../map/testYard';
import { WOODLAND } from '../map/woodland';
import { addLighting, mapBoundingBox, shadowTexel } from './lighting';
import { resolveLighting } from './lightingPreset';

/**
 * M33f QA: the lighting preset and the light pools as addLighting puts them in a scene (the pieces are tested one by one
 * in lightingPreset.test.ts, lightPools.test.ts and renderer.test.ts).
 */

const QUALITIES: readonly [string, QualitySettings][] = [['low', QUALITY.low], ['medium', QUALITY.medium], ['high', QUALITY.high]];
const night = resolveLighting(WOODLAND);
const day = LIGHTING_PRESETS.day;

const pointLights = (scene: THREE.Scene): THREE.PointLight[] => scene.children.filter((o): o is THREE.PointLight => o instanceof THREE.PointLight);
const sunOf = (scene: THREE.Scene): THREE.DirectionalLight => scene.children.find((o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight)!;
const triangles = (m: THREE.Mesh): number => (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
const eyeAt = (x: number, z: number): THREE.PerspectiveCamera => {
  const c = new THREE.PerspectiveCamera();
  c.position.set(x, 1.6, z);
  c.updateMatrixWorld(true);
  return c;
};

describe('addLighting lights the scene from the preset it is given (M33f, acceptances 1 and 2)', () => {
  it('lights Depot by day with the constants it always had: sun, hemisphere and position', () => {
    const scene = new THREE.Scene();
    addLighting(scene, DEPOT, QUALITY.medium, resolveLighting(DEPOT));
    const sun = sunOf(scene);
    const hemi = scene.children.find((o): o is THREE.HemisphereLight => o instanceof THREE.HemisphereLight)!;
    const centre = mapBoundingBox(DEPOT).getCenter(new THREE.Vector3());
    expect(sun.color.getHex()).toBe(LIGHTING.sunColor);
    expect(sun.intensity).toBe(LIGHTING.sunIntensity);
    expect(sun.position.toArray()).toEqual([centre.x + LIGHTING.sunOffset.x, LIGHTING.sunOffset.y, centre.z + LIGHTING.sunOffset.z]);
    expect(hemi.color.getHex()).toBe(LIGHTING.hemiSky);
    expect(hemi.groundColor.getHex()).toBe(LIGHTING.hemiGround);
    expect(hemi.intensity).toBe(LIGHTING.hemiIntensity);
  });

  it('lights Woodland by night: a dim cool moon, a dim fill, the moon low over the Knoll', () => {
    const scene = new THREE.Scene();
    addLighting(scene, WOODLAND, QUALITY.medium, night);
    const sun = sunOf(scene);
    const hemi = scene.children.find((o): o is THREE.HemisphereLight => o instanceof THREE.HemisphereLight)!;
    expect(sun.color.getHex()).toBe(night.key.colour);
    expect(sun.intensity).toBe(night.key.intensity);
    expect(sun.intensity).toBeLessThan(day.key.intensity);
    expect(hemi.intensity).toBe(night.hemi.intensity);
    expect(hemi.color.getHex()).toBe(night.hemi.sky);
    const toMoon = sun.position.clone().sub(sun.target.position).normalize();
    const elevation = (Math.asin(toMoon.y) * 180) / Math.PI;
    expect(elevation).toBeGreaterThan(12);
    expect(elevation).toBeLessThan(25);
    // Towards the Knoll: the moon stands on the Knoll's side of the field's centre.
    const knoll = WOODLAND.lighting!.moonOver!;
    const centre = mapBoundingBox(WOODLAND).getCenter(new THREE.Vector3());
    expect(toMoon.x * (knoll.x - centre.x) + toMoon.z * (knoll.z - centre.z)).toBeGreaterThan(0);
  });

  it('keeps the same shadow settings at night as by day, on every quality', () => {
    for (const [name, q] of QUALITIES) {
      const [a, b] = [day, night].map((preset) => {
        const scene = new THREE.Scene();
        addLighting(scene, WOODLAND, q, preset);
        return sunOf(scene);
      }) as [THREE.DirectionalLight, THREE.DirectionalLight];
      expect(b.castShadow, name).toBe(a.castShadow);
      expect(b.castShadow, name).toBe(q.shadows);
      expect(b.shadow.mapSize.toArray(), name).toEqual(a.shadow.mapSize.toArray());
      expect(b.shadow.radius, name).toBe(a.shadow.radius);
      expect(b.shadow.bias, name).toBe(a.shadow.bias);
      // The normal bias is a fixed number of texels of the fitted shadow camera, which is the moon's, not the sun's.
      expect(b.shadow.normalBias, name).toBeCloseTo(LIGHTING.shadowNormalBiasTexels * shadowTexel(b.shadow.camera, b.shadow.mapSize.x), 9);
      expect(a.shadow.normalBias, name).toBeCloseTo(LIGHTING.shadowNormalBiasTexels * shadowTexel(a.shadow.camera, a.shadow.mapSize.x), 9);
    }
  });
});

describe('the light pools in the scene addLighting builds (M33f, acceptance 3)', () => {
  it('glows every pool of Woodland by night, as one glow mesh and one ground mesh, and none by day (M34e: lamps off)', () => {
    const pools = WOODLAND.lights!;
    expect(pools.length).toBeGreaterThan(1);
    const reach = POOL_LIGHTS.core * Math.max(...POOL_LIGHTS.halos.map((h) => h.size), 1);
    for (const preset of [night]) {
      const scene = new THREE.Scene();
      addLighting(scene, WOODLAND, QUALITY.low, preset);
      const glow = scene.getObjectByName('pool-glow') as THREE.Mesh;
      const ground = scene.getObjectByName('pool-ground') as THREE.Mesh;
      expect(scene.children.filter((o) => o.name === 'pool-glow')).toHaveLength(1);
      expect(scene.children.filter((o) => o.name === 'pool-ground')).toHaveLength(1);
      const pos = glow.geometry.getAttribute('position');
      const groundPos = ground.geometry.getAttribute('position');
      for (const [i, p] of pools.entries()) {
        const near = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, r: number): boolean => {
          for (let v = 0; v < a.count; v++) if (Math.hypot(a.getX(v) - p.position.x, a.getY(v) - p.position.y, a.getZ(v) - p.position.z) <= r * 1.001) return true;
          return false;
        };
        expect(near(pos, reach * p.radius), `glow of pool ${i}`).toBe(true);
        // The ground mesh has vertices all the way out to the pool's edge (horizontally).
        let widest = 0;
        for (let v = 0; v < groundPos.count; v++) widest = Math.max(widest, Math.hypot(groundPos.getX(v) - p.position.x, groundPos.getZ(v) - p.position.z) <= p.radius * 1.001 ? Math.hypot(groundPos.getX(v) - p.position.x, groundPos.getZ(v) - p.position.z) : 0);
        expect(widest, `ground of pool ${i}`).toBeGreaterThan(p.radius * 0.95);
      }
    }
    for (const [name, q] of QUALITIES) {
      const byDay = new THREE.Scene();
      addLighting(byDay, WOODLAND, q, day);
      expect(byDay.children.filter((o) => o.name.startsWith('pool-')), name).toHaveLength(0);
      expect(pointLights(byDay), name).toHaveLength(0);
    }
  });

  it('gives Woodland no real lights on Low, and a fixed 2 and 4 (no shadows) on Medium and High, however the eye moves', () => {
    for (const [name, q, count] of [['low', QUALITY.low, 0], ['medium', QUALITY.medium, 2], ['high', QUALITY.high, 4]] as const) {
      const scene = new THREE.Scene();
      const daylight = addLighting(scene, WOODLAND, q, night);
      const lights = pointLights(scene);
      expect(lights, name).toHaveLength(count);
      for (let i = 0; i < 400; i++) {
        daylight.follow(eyeAt(-50 + (i * 100) / 400 + Math.sin(i) * 3, Math.cos(i * 0.07) * 30), 1 / 60);
        expect(pointLights(scene), name).toEqual(lights);
      }
      for (const l of lights) expect(l.castShadow, name).toBe(false);
      // The real lights are the only point lights, and they went to pools of the map.
      for (const l of lights.filter((x) => x.intensity > 0)) expect(WOODLAND.lights!.some((p) => p.position.x === l.position.x && p.position.z === l.position.z), name).toBe(true);
    }
  });

  it('puts the real lights on the pools nearest the eye, through Daylight.follow', () => {
    const scene = new THREE.Scene();
    const daylight = addLighting(scene, WOODLAND, QUALITY.medium, night);
    const pools = WOODLAND.lights!;
    const target = pools[0]!;
    for (let i = 0; i < 60; i++) daylight.follow(eyeAt(target.position.x, target.position.z), 1 / 30);
    const lit = pointLights(scene).filter((l) => l.intensity > 0);
    expect(lit).toHaveLength(2);
    expect(lit.some((l) => l.position.x === target.position.x && l.position.z === target.position.z)).toBe(true);
  });

  it('follows the Night lights setting through Daylight.setQuality', () => {
    const scene = new THREE.Scene();
    const daylight = addLighting(scene, WOODLAND, QUALITY.high, night);
    expect(pointLights(scene)).toHaveLength(4);
    daylight.setQuality(QUALITY.medium);
    expect(pointLights(scene)).toHaveLength(2);
    daylight.setQuality({ ...QUALITY.high, poolLights: 0 });
    expect(pointLights(scene)).toHaveLength(0);
    expect(scene.getObjectByName('pool-ground')).toBeDefined();
    expect(scene.getObjectByName('pool-glow')).toBeDefined();
  });

  it('adds no pool, and no point light, on the maps without light pools, whatever the quality', () => {
    for (const map of [DEPOT, RANGE_MAP, TEST_YARD]) {
      for (const [name, q] of QUALITIES) {
        const scene = new THREE.Scene();
        addLighting(scene, map, q, resolveLighting(map));
        expect(scene.getObjectByName('pool-glow'), `${map.name} ${name}`).toBeUndefined();
        expect(scene.getObjectByName('pool-ground'), `${map.name} ${name}`).toBeUndefined();
        expect(pointLights(scene), `${map.name} ${name}`).toHaveLength(0);
      }
    }
  });
});

describe('leaving a night field leaves nothing of it in the scene (M33f, acceptance 4)', () => {
  it('removes the moon, the fill, the pools and the real lights on dispose, and a day map after it lights as before', () => {
    const scene = new THREE.Scene();
    const first = addLighting(scene, WOODLAND, QUALITY.high, night);
    first.follow(eyeAt(0, 0), 1 / 60);
    first.dispose();
    expect(scene.children).toHaveLength(0);
    addLighting(scene, DEPOT, QUALITY.high, resolveLighting(DEPOT));
    expect(pointLights(scene)).toHaveLength(0);
    expect(scene.getObjectByName('pool-glow')).toBeUndefined();
    expect(sunOf(scene).color.getHex()).toBe(LIGHTING.sunColor);
    expect(sunOf(scene).intensity).toBe(LIGHTING.sunIntensity);
  });
});

describe('Low on Woodland’s pools stays cheap (M33f, acceptance 5)', () => {
  it('adds two draw calls and a few hundred triangles and no real light; Depot adds none', () => {
    const scene = new THREE.Scene();
    addLighting(scene, WOODLAND, QUALITY.low, night);
    const pool = scene.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh && o.name.startsWith('pool-'));
    expect(pool).toHaveLength(2);
    const total = pool.reduce((n, m) => n + triangles(m), 0);
    // About 180 triangles of ground and a few hundred of glow for each of the 5 pools.
    expect(total).toBeLessThan(WOODLAND.lights!.length * 1200);
    expect(pointLights(scene)).toHaveLength(0);
    const depot = new THREE.Scene();
    addLighting(depot, DEPOT, QUALITY.low, resolveLighting(DEPOT));
    expect(depot.children.filter((o) => o.name.startsWith('pool-'))).toHaveLength(0);
  });
});
