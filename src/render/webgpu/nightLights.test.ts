import * as THREE from 'three';
import { LightsNode } from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { CLUSTERED_LIGHTS } from '../../config/renderLighting';
import { HITS } from '../../config/hits';
import { BODY } from '../../config/movement';
import { POOL_LIGHTS, QUALITY } from '../../config/render';
import { LOADOUT } from '../../config/replicas';
import { NEON_HEIGHTS } from '../../map/neonHeights';
import { WOODLAND } from '../../map/woodland';
import { fitParts, type WorldQuery } from '../../sim/armament';
import { createCharacter } from '../../sim/character';
import { vec3 } from '../../sim/vec';
import { resolveLighting } from '../lightingPreset';
import { addLightPools } from '../lightPools';
import { TorchBeams } from '../torchBeams';
import ClusteredLightsNode from 'three/examples/jsm/tsl/lighting/ClusteredLightsNode.js';
import { clusters, NightLighting, NightLightsNode } from './nightLights';

/**
 * W3: the night on WebGPU's clustered lights. Which lights the clusters shade, the light data they read each frame (in
 * depth order, with the spot lights' cones, no allocation), the world taking the clustered node and every other scene
 * Three's own; and what the game lights with them: every lamp near the eye and your torch. WebGL's lights are unchanged (the existing lightPools, lighting and torchBeams
 * tests). The pictures are compared on a WebGPU device (pipeline/webgpu-compare.mjs).
 */

const lights = (root: THREE.Object3D, name?: string): THREE.Light[] => {
  const out: THREE.Light[] = [];
  root.traverse((o) => {
    if ((o instanceof THREE.PointLight || o instanceof THREE.SpotLight) && (!name || o.name === name)) out.push(o);
  });
  return out;
};

describe('the clustered lights node (W3 criterion 2)', () => {
  it('shades point and spot lights without a shadow or a projected map; Three keeps the rest', () => {
    const shadowed = new THREE.PointLight();
    shadowed.castShadow = true;
    const mapped = new THREE.SpotLight();
    mapped.map = new THREE.Texture();
    expect(clusters(new THREE.PointLight())).toBe(true);
    expect(clusters(new THREE.SpotLight())).toBe(true);
    expect(clusters(shadowed)).toBe(false);
    expect(clusters(mapped)).toBe(false);
    expect(clusters(new THREE.DirectionalLight())).toBe(false);
    expect(clusters(new THREE.HemisphereLight())).toBe(false);
    const node = new NightLightsNode(3);
    const sun = new THREE.DirectionalLight();
    const points = [new THREE.PointLight(), new THREE.SpotLight(), new THREE.PointLight(), new THREE.PointLight()];
    node.setLights([sun, shadowed, ...points]);
    // At most its capacity; the one over it is one of Three's own, as is the shadow caster.
    expect(node.clusteredLights).toEqual(points.slice(0, 3));
    expect(node.materialLights).toEqual([sun, shadowed, points[3]]);
    expect(node.getLights()).toHaveLength(6);
    node.dispose();
  });

  it('writes each light’s data in depth order, with the spot’s direction and cone and an open cone for a point', () => {
    const node = new NightLightsNode(4);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.updateMatrixWorld();
    const near = new THREE.PointLight(0xff0000, 2, 5, 2);
    near.position.set(0, 0, -3);
    const far = new THREE.PointLight(0x00ff00, 3, 6, 2);
    far.position.set(1, 0, -20);
    const spot = new THREE.SpotLight(0xffffff, 4, 10, Math.PI / 6, 0.5, 2);
    spot.position.set(0, 2, -10);
    spot.target.position.set(0, 2, -11);
    for (const l of [near, far, spot, spot.target]) l.updateMatrixWorld();
    node.setLights([near, far, spot]);
    node.updateLightsTexture(camera);
    const internals = node as unknown as { _lightsTexture: THREE.DataTexture; _lightsCount: { value: number }; _zSliceRangesData: Float32Array };
    const data = internals._lightsTexture.image.data as Float32Array;
    const line = 4 * 4;
    expect(internals._lightsCount.value).toBe(3);
    // Farthest first (ascending view z): far, spot, near.
    expect([...data.slice(0, 4)]).toEqual([1, 0, -20, 6]);
    expect([...data.slice(4, 8)]).toEqual([0, 2, -10, 10]);
    expect([...data.slice(8, 12)]).toEqual([0, 0, -3, 5]);
    expect(data[line + 8]).toBeCloseTo(2, 6); // red × intensity
    expect(data[line + 11]).toBe(2); // decay
    // The spot: towards the light from its target, cos(angle), cos(angle × (1 − penumbra)).
    expect([...data.slice(2 * line + 4, 2 * line + 7)]).toEqual([0, 0, 1]);
    expect(data[2 * line + 7]).toBeCloseTo(Math.cos(Math.PI / 6), 6);
    expect(data[3 * line + 4]).toBeCloseTo(Math.cos((Math.PI / 6) * 0.5), 6);
    // A point light's cone is open: both cosines below any cosine.
    expect(data[2 * line + 3]).toBeLessThan(-1);
    expect(data[3 * line]).toBeLessThanOrEqual(-1);
    // Each depth slice lists the lights whose reach meets it: the nearest, `near` and the spot (10 m reach), not `far`.
    const ranges = internals._zSliceRangesData;
    expect([ranges[0], ranges[1]]).toEqual([1, 3]);
    node.dispose();
  });

  it('allocates nothing per frame: the same arrays, frame after frame', () => {
    const node = new NightLightsNode(CLUSTERED_LIGHTS.maxLights);
    const camera = new THREE.PerspectiveCamera();
    const many = Array.from({ length: 30 }, (_, i) => {
      const l = new THREE.PointLight(0xffffff, 1, 4, 2);
      l.position.set(i, 0, -i);
      l.updateMatrixWorld();
      return l;
    });
    node.setLights(many);
    const internals = node as unknown as { depth: Float32Array; order: Int32Array; clusteredLights: THREE.Light[] };
    const before = [internals.depth, internals.order, internals.clusteredLights];
    for (let i = 0; i < 5; i++) {
      node.setLights(many);
      node.updateLightsTexture(camera);
    }
    expect([internals.depth, internals.order, internals.clusteredLights]).toEqual(before);
    expect(internals.depth).toBe(before[0]);
    node.dispose();
  });

  it('fills the clusters once while there are none to cluster (Low, by Day), every frame while there are', () => {
    const node = new NightLightsNode(4);
    const filled = vi.spyOn(ClusteredLightsNode.prototype, 'updateBefore').mockImplementation(() => undefined);
    const frame = {} as Parameters<NightLightsNode['updateBefore']>[0];
    node.setLights([]);
    for (let i = 0; i < 3; i++) node.updateBefore(frame);
    expect(filled).toHaveBeenCalledTimes(1);
    node.setLights([new THREE.PointLight()]);
    for (let i = 0; i < 3; i++) node.updateBefore(frame);
    expect(filled).toHaveBeenCalledTimes(4);
    // The last light goes: the clusters are emptied once more, then left.
    node.setLights([]);
    for (let i = 0; i < 3; i++) node.updateBefore(frame);
    expect(filled).toHaveBeenCalledTimes(5);
    filled.mockRestore();
    node.dispose();
  });

  it('gives the clustered node to the world only, Three’s own to any other scene, and frees it', () => {
    const lighting = new NightLighting();
    const world = new THREE.Scene();
    const overlay = new THREE.Scene();
    lighting.world = world;
    const node = lighting.getNode(world);
    expect(node).toBeInstanceOf(NightLightsNode);
    expect(lighting.getNode(world)).toBe(node);
    const other = lighting.getNode(overlay);
    expect(other).toBeInstanceOf(LightsNode);
    expect(other).not.toBeInstanceOf(NightLightsNode);
    let freed = 0;
    (node as NightLightsNode & { _lightsTexture: THREE.Texture })._lightsTexture.addEventListener('dispose', () => freed++);
    lighting.dispose();
    expect(freed).toBe(1);
  });
});

describe('the night lit on clustered lights (W3 criterion 2)', () => {
  const woodland = resolveLighting(WOODLAND);

  it('gives every pool its own light wherever Night lights is on, none on Low or WebGL; the fixed pool and ground mesh stay WebGL’s', () => {
    // Neon Heights' street, where a dozen lamps stand within the clustered reach of its middle.
    const pools = NEON_HEIGHTS.lights!;
    const eye = new THREE.Vector3(0, 1.6, 0);
    for (const [q, want] of [[QUALITY.low, 0], [QUALITY.medium, pools.length], [QUALITY.high, pools.length]] as const) {
      const look = (clustered: boolean) => {
        const scene = new THREE.Scene();
        const p = addLightPools(scene, NEON_HEIGHTS, q, 1, clustered);
        for (let i = 0; i < 4; i++) p.follow(eye, 1);
        const ground = scene.getObjectByName('pool-ground') as THREE.Mesh;
        const seen = {
          fixed: lights(scene, 'pool-light').map((l) => [l.position.toArray(), l.intensity]),
          own: lights(scene, 'pool-light-own') as THREE.PointLight[],
          ground: [...(ground.geometry.getAttribute('color').array as Float32Array)],
        };
        return { scene, p, seen };
      };
      const webgl = look(false);
      const node = look(true);
      // WebGL's fixed lights and ground mesh, the same on clustered lights.
      expect(node.seen.fixed).toEqual(webgl.seen.fixed);
      expect(node.seen.ground).toEqual(webgl.seen.ground);
      expect(webgl.seen.own).toHaveLength(0);
      expect(node.seen.own).toHaveLength(want);
      // A pool a fixed light has taken, or one far from the eye: its own light is dark; every other pool's shines, from
      // the pool, in its colour.
      const taken = new Set(lights(node.scene, 'pool-light').filter((l) => l.intensity > 0).map((l) => `${l.position.x},${l.position.z}`));
      let shining = 0;
      node.seen.own.forEach((l, i) => {
        const pool = pools[i]!;
        const away = Math.hypot(pool.position.x - eye.x, pool.position.z - eye.z) - pool.radius;
        expect(l.position.x).toBe(pool.position.x);
        expect(l.color.getHex()).toBe(pool.colour);
        expect(l.intensity > 0, `pool ${i}`).toBe(!taken.has(`${l.position.x},${l.position.z}`) && away < POOL_LIGHTS.own.near);
        if (l.intensity > 0) shining++;
      });
      if (want > 0) {
        expect(taken.size).toBeGreaterThan(0);
        // More pools are lit than WebGL's fixed pool lights alone: most of the street's lamps.
        expect(shining).toBeGreaterThan(pools.length / 2);
      }
      for (const { scene, p } of [webgl, node]) {
        p.dispose();
        expect(lights(scene)).toHaveLength(0);
      }
    }
  });

  it('shades your torch’s real spot in the clusters (no shadow, no projected map)', () => {
    const c = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
    fitParts(c.armament, c.armament.parts.map((p) => ({ ...p, light: 'weaponTorch' as const })));
    c.torchOn = true;
    const ground: WorldQuery = { raycastStatic: (_o, _d, max) => Math.min(10, max) };
    const b = new TorchBeams([c], woodland, QUALITY.high, ground, BODY, HITS);
    const spot = b.spotLight!;
    expect(spot).toBeInstanceOf(THREE.SpotLight);
    expect(clusters(spot)).toBe(true);
    b.dispose();
  });
});
