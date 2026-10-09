import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLUSTERED_LIGHTS } from '../../config/renderLighting';
import { LIGHTING_PRESETS, POOL_LIGHTS, QUALITY } from '../../config/render';
import type { MapData } from '../../map/mapTypes';
import { NEON_HEIGHTS } from '../../map/neonHeights';
import { WOODLAND } from '../../map/woodland';
import { addLighting } from '../lighting';
import { addLightPools, poolLightIntensity } from '../lightPools';
import { Renderer } from '../renderer';
import { NightLighting, NightLightsNode } from './nightLights';
import { NodeBackend } from './nodeBackend';

/**
 * W3 QA: the clustered night's edges. Which lamps get a light of their own (within POOL_LIGHTS.own.near of the eye, to
 * the pool's edge, fading over the last `fade`), that the WebGL path and the node renderer's WebGL2 back end build no
 * extra light, that every light fits the clusters' capacity, the light data in depth order for random lights, the empty
 * and overflowing cases, and which back end holds the clustered lighting.
 */

const ownLights = (root: THREE.Object3D): THREE.PointLight[] => {
  const out: THREE.PointLight[] = [];
  root.traverse((o) => {
    if (o.name === 'pool-light-own') out.push(o as THREE.PointLight);
  });
  return out;
};
const allLights = (root: THREE.Object3D): THREE.Light[] => {
  const out: THREE.Light[] = [];
  root.traverse((o) => {
    if ((o as THREE.Light).isLight) out.push(o as THREE.Light);
  });
  return out;
};
/** What a light is to the picture: kind, name, colour, intensity, position, reach. */
const look = (l: THREE.Light) => [l.type, l.name, l.color.getHex(), l.intensity, l.position.toArray(), (l as THREE.PointLight).distance ?? 0];

describe('the lamps that get a light of their own (W3 criterion 2: within 16 m of the eye)', () => {
  /** One pool, no kind (no flicker), on Neon Heights' ground: the eye `edge` metres from the pool's edge. */
  const pool = { position: { x: 5, y: 2.5, z: -3 }, radius: 2, colour: 0xffb060 };
  const map: MapData = { ...NEON_HEIGHTS, lights: [pool] };
  /** Own light intensity with the eye `edge` metres from the pool's edge (the torch reserves the fixed lights: none shines on it). */
  const shining = (edge: number): number => {
    const scene = new THREE.Scene();
    const p = addLightPools(scene, map, { poolLights: 2 }, 2, true);
    p.follow(new THREE.Vector3(pool.position.x + pool.radius + edge, 1.6, pool.position.z), 1 / 60);
    const [own] = ownLights(scene);
    const value = own!.intensity;
    p.dispose();
    return value;
  };
  const full = poolLightIntensity(pool);

  it('shines in full up to 10 m from the pool’s edge, fades linearly over the next 6 m, and is out from 16 m', () => {
    const { near, fade } = POOL_LIGHTS.own;
    expect([near, fade]).toEqual([16, 6]);
    expect(shining(0)).toBeCloseTo(full, 6);
    expect(shining(near - fade)).toBeCloseTo(full, 6);
    expect(shining(near - fade / 2)).toBeCloseTo(full / 2, 6);
    expect(shining(near - fade / 6)).toBeCloseTo(full / 6, 6);
    expect(shining(near)).toBe(0);
    expect(shining(near + 0.01)).toBe(0);
    expect(shining(60)).toBe(0);
    expect(full).toBeGreaterThan(0);
  });

  it('measures from the pool’s edge, not its middle: standing inside the pool is full light', () => {
    const scene = new THREE.Scene();
    const p = addLightPools(scene, map, { poolLights: 2 }, 2, true);
    p.follow(new THREE.Vector3(pool.position.x + 1, 1.6, pool.position.z), 1 / 60);
    expect(ownLights(scene)[0]!.intensity).toBeCloseTo(full, 6);
    p.dispose();
  });

  it('follows the eye each frame: out of reach, then back in reach, the light comes back', () => {
    const scene = new THREE.Scene();
    const p = addLightPools(scene, map, { poolLights: 2 }, 2, true);
    const eye = new THREE.Vector3(pool.position.x + pool.radius + 40, 1.6, pool.position.z);
    p.follow(eye, 1 / 60);
    const [own] = ownLights(scene);
    expect(own!.intensity).toBe(0);
    eye.x = pool.position.x;
    p.follow(eye, 1 / 60);
    expect(own!.intensity).toBeCloseTo(full, 6);
    eye.x = pool.position.x + pool.radius + 40;
    p.follow(eye, 1 / 60);
    expect(own!.intensity).toBe(0);
    p.dispose();
  });

  it('puts the light at the pool, in its colour and reach, one per pool, and keeps it dark (not removed) when far', () => {
    const scene = new THREE.Scene();
    const p = addLightPools(scene, NEON_HEIGHTS, QUALITY.high, 1, true);
    p.follow(new THREE.Vector3(1000, 1.6, 1000), 1 / 60);
    const own = ownLights(scene);
    expect(own).toHaveLength(NEON_HEIGHTS.lights!.length);
    for (const l of own) expect(l.intensity).toBe(0);
    own.forEach((l, i) => {
      expect(l.position.toArray()).toEqual([NEON_HEIGHTS.lights![i]!.position.x, NEON_HEIGHTS.lights![i]!.position.y, NEON_HEIGHTS.lights![i]!.position.z]);
      expect(l.castShadow).toBe(false);
      expect(l.distance).toBeGreaterThan(0);
    });
    p.dispose();
  });

  it('is switched with Night lights while playing: a Low quality takes the own lights away, a higher one brings them back, dispose frees all', () => {
    const scene = new THREE.Scene();
    const p = addLightPools(scene, NEON_HEIGHTS, QUALITY.high, 0, true);
    const count = NEON_HEIGHTS.lights!.length;
    expect(ownLights(scene)).toHaveLength(count);
    p.setQuality(QUALITY.low);
    expect(ownLights(scene)).toHaveLength(0);
    p.setQuality(QUALITY.medium);
    expect(ownLights(scene)).toHaveLength(count);
    // Reserving the torch's light takes a fixed light, never an own one.
    p.setQuality(QUALITY.medium, 1);
    expect(ownLights(scene)).toHaveLength(count);
    const before = allLights(scene).filter((l) => l.name === 'pool-light').length;
    expect(before).toBe(Math.max(0, QUALITY.medium.poolLights - 1));
    p.dispose();
    expect(allLights(scene)).toHaveLength(0);
  });
});

describe('WebGL builds no extra light (W3 criterion 3)', () => {
  const night = LIGHTING_PRESETS.night;
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['Neon Heights', NEON_HEIGHTS],
    ['Woodland', WOODLAND],
  ])('%s at night on every preset: the lights are the same with the argument absent or false, and clustered adds only the own pool lights', (_name, map) => {
    for (const [id, q] of Object.entries(QUALITY)) {
      const make = (clustered?: boolean) => {
        const scene = new THREE.Scene();
        const d = clustered === undefined ? addLighting(scene, map, q, night) : addLighting(scene, map, q, night, clustered);
        const eye = new THREE.PerspectiveCamera();
        eye.position.set(0, 1.6, 0);
        d.follow(eye, 1 / 60);
        return { scene, d };
      };
      const plain = make();
      const webgl = make(false);
      const node = make(true);
      expect(ownLights(plain.scene), id).toHaveLength(0);
      expect(ownLights(webgl.scene), id).toHaveLength(0);
      expect(allLights(webgl.scene).map(look), id).toEqual(allLights(plain.scene).map(look));
      const rest = allLights(node.scene).filter((l) => l.name !== 'pool-light-own');
      expect(rest.map(look), id).toEqual(allLights(plain.scene).map(look));
      // Low (Night lights off) gets none even clustered; every other preset one per pool.
      expect(ownLights(node.scene), id).toHaveLength(q.poolLights > 0 ? map.lights!.length : 0);
      for (const x of [plain, webgl, node]) x.d.dispose();
    }
  });

  it('a Day map has no pools, clustered or not', () => {
    const scene = new THREE.Scene();
    const d = addLighting(scene, NEON_HEIGHTS, QUALITY.high, LIGHTING_PRESETS.day, true);
    expect(ownLights(scene)).toHaveLength(0);
    expect(allLights(scene).filter((l) => l.name.startsWith('pool'))).toHaveLength(0);
    d.dispose();
  });

  it('the Renderer on WebGL says the night is not clustered (and so does one with the WebGL2 back end)', () => {
    vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 });
    const gl = { domElement: new EventTarget(), info: { autoReset: true, reset: () => undefined }, shadowMap: { enabled: false }, autoClear: true, toneMapping: THREE.NoToneMapping, toneMappingExposure: 1, getContext: () => ({ getExtension: () => null }), getPixelRatio: () => 1, setPixelRatio: () => undefined, setSize: () => undefined, outputColorSpace: '' };
    vi.spyOn(Renderer.prototype as unknown as { makeWebGL: () => unknown }, 'makeWebGL').mockReturnValue(gl);
    const r = new Renderer({ appendChild: () => undefined, clientWidth: 1280, clientHeight: 720 } as unknown as HTMLElement, QUALITY.high);
    expect(r.backend).toBe('webgl');
    expect(r.clusteredLights).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('every light fits the clusters (W3: capacity)', () => {
  it('the biggest night map’s pools, plus its sun, fill, torch and the nearest fixed lights, stay within CLUSTERED_LIGHTS.maxLights', () => {
    for (const map of [NEON_HEIGHTS, WOODLAND]) {
      const scene = new THREE.Scene();
      const d = addLighting(scene, map, QUALITY.ultra, LIGHTING_PRESETS.night, true);
      const clusterable = allLights(scene).filter((l) => (l as THREE.PointLight).isPointLight || (l as THREE.SpotLight).isSpotLight);
      // Plus the torch's spot, which takes one of them.
      expect(clusterable.length + 1).toBeLessThanOrEqual(CLUSTERED_LIGHTS.maxLights);
      d.dispose();
    }
  });
});

describe('the clusters’ light data (W3)', () => {
  const internals = (n: NightLightsNode) => n as unknown as { _lightsTexture: THREE.DataTexture; _lightsCount: { value: number }; _zSliceRangesData: Float32Array };

  it('with no lights, counts none and lists none in any depth slice', () => {
    const node = new NightLightsNode(4);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.updateMatrixWorld();
    node.setLights([]);
    internals(node)._zSliceRangesData.fill(7);
    node.updateLightsTexture(camera);
    expect(internals(node)._lightsCount.value).toBe(0);
    const ranges = internals(node)._zSliceRangesData;
    for (let z = 0; z < CLUSTERED_LIGHTS.zSlices; z++) expect([ranges[z * 4], ranges[z * 4 + 1]], `slice ${z}`).toEqual([0, 0]);
    node.dispose();
  });

  it('a lamp behind the eye, out of the view’s depth, is listed in no slice; one with no reach (0) is listed in every slice', () => {
    const node = new NightLightsNode(4);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.updateMatrixWorld();
    const behind = new THREE.PointLight(0xffffff, 1, 5, 2);
    behind.position.set(0, 0, 50);
    behind.updateMatrixWorld();
    node.setLights([behind]);
    node.updateLightsTexture(camera);
    const ranges = internals(node)._zSliceRangesData;
    for (let z = 0; z < CLUSTERED_LIGHTS.zSlices; z++) expect([ranges[z * 4], ranges[z * 4 + 1]], `slice ${z}`).toEqual([0, 0]);
    const endless = new THREE.PointLight(0xffffff, 1, 0, 2);
    endless.position.set(0, 0, -30);
    endless.updateMatrixWorld();
    node.setLights([endless]);
    node.updateLightsTexture(camera);
    for (let z = 0; z < CLUSTERED_LIGHTS.zSlices; z++) expect([ranges[z * 4], ranges[z * 4 + 1]], `slice ${z}`).toEqual([0, 1]);
    node.dispose();
  });

  it('sorts random lights by view depth, farthest first, whatever the order they come in (insertion sort checked against Array.sort)', () => {
    let seed = 12345;
    const random = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    camera.position.set(3, 1.6, 4);
    camera.rotation.y = 0.7;
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const node = new NightLightsNode(CLUSTERED_LIGHTS.maxLights);
    const many = Array.from({ length: 40 }, () => {
      const l = new THREE.PointLight(0xffffff, 1 + random(), 3 + random() * 6, 2);
      l.position.set(random() * 80 - 40, random() * 4, random() * 80 - 40);
      l.updateMatrixWorld();
      return l;
    });
    node.setLights(many);
    node.updateLightsTexture(camera);
    const data = internals(node)._lightsTexture.image.data as Float32Array;
    const viewZ = (l: THREE.Light) => new THREE.Vector3().setFromMatrixPosition(l.matrixWorld).applyMatrix4(camera.matrixWorldInverse).z;
    const expected = [...many].sort((a, b) => viewZ(a) - viewZ(b));
    const got = Array.from({ length: many.length }, (_, k) => [data[k * 4], data[k * 4 + 1], data[k * 4 + 2]]);
    expect(got).toEqual(expected.map((l) => [Math.fround(l.position.x), Math.fround(l.position.y), Math.fround(l.position.z)]));
    expect(internals(node)._lightsCount.value).toBe(40);
    node.dispose();
  });

  it('holds at most its capacity: the lights over it stay Three’s own, and a shorter list later drops the old ones', () => {
    const node = new NightLightsNode(3);
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld();
    const six = Array.from({ length: 6 }, (_, i) => {
      const l = new THREE.PointLight(0xffffff, 1, 5, 2);
      l.position.set(i, 0, -1 - i);
      l.updateMatrixWorld();
      return l;
    });
    node.setLights(six);
    node.updateLightsTexture(camera);
    expect(internals(node)._lightsCount.value).toBe(3);
    expect(node.clusteredLights).toHaveLength(3);
    expect(node.materialLights).toHaveLength(3);
    node.setLights(six.slice(0, 2));
    node.updateLightsTexture(camera);
    expect(internals(node)._lightsCount.value).toBe(2);
    expect(node.clusteredLights).toEqual(six.slice(0, 2));
    expect(node.materialLights).toEqual([]);
    node.setLights([]);
    expect(node.clusteredLights).toEqual([]);
    node.dispose();
  });

  it('a spot with a shadow stays Three’s own, as the sun does; the node keeps the whole list for Three', () => {
    const node = new NightLightsNode(4);
    const shadowed = new THREE.SpotLight();
    shadowed.castShadow = true;
    const plain = new THREE.SpotLight();
    node.setLights([shadowed, plain]);
    expect(node.clusteredLights).toEqual([plain]);
    expect(node.materialLights).toEqual([shadowed]);
    node.dispose();
  });
});

describe('which back end holds the clustered lights (W3 criterion 3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const canvas = () => ({ style: {}, width: 300, height: 150, addEventListener: () => undefined, removeEventListener: () => undefined, getContext: () => null }) as unknown as HTMLCanvasElement;
  const stub = (backend?: object) => {
    vi.stubGlobal('document', { createElementNS: () => canvas() });
    vi.spyOn(WebGPURenderer.prototype, 'init').mockImplementation(async function (this: WebGPURenderer) {
      if (backend) (this as unknown as { backend: object }).backend = backend;
      return this;
    });
    vi.spyOn(WebGPURenderer.prototype, 'hasFeature').mockReturnValue(false);
    vi.spyOn(WebGPURenderer.prototype, 'dispose').mockResolvedValue(undefined);
  };

  it('a WebGPU device lights with the clustered node (the world scene given at prepare), the WebGL2 back end with Three’s own', async () => {
    stub();
    const gpu = await NodeBackend.make({ antialias: false, forceWebGL: false });
    expect(gpu.kind).toBe('webgpu');
    expect(gpu.clustered).toBe(true);
    expect(gpu.renderer.lighting).toBeInstanceOf(NightLighting);
    const world = new THREE.Scene();
    gpu.prepare(world);
    expect((gpu.renderer.lighting as NightLighting).world).toBe(world);
    expect(gpu.renderer.lighting.getNode(world)).toBeInstanceOf(NightLightsNode);
    expect(gpu.renderer.lighting.getNode(new THREE.Scene())).not.toBeInstanceOf(NightLightsNode);
    const freed = vi.spyOn(NightLighting.prototype, 'dispose');
    gpu.dispose();
    expect(freed).toHaveBeenCalledOnce();

    stub({ isWebGLBackend: true });
    const forced = await NodeBackend.make({ antialias: false, forceWebGL: true });
    expect(forced.kind).toBe('webgpu-webgl2');
    expect(forced.clustered).toBe(false);
    expect(forced.renderer.lighting).not.toBeInstanceOf(NightLighting);
    forced.prepare(world);
    const node = forced.renderer.lighting.getNode(world);
    expect(node).not.toBeInstanceOf(NightLightsNode);
    forced.dispose();
  });

  it('checks the device for the Chromium differences before the first frame (the fit runs inside make)', async () => {
    const created: string[] = [];
    const device = {
      createTexture: (d: { dimension?: string }) => (created.push(d.dimension ?? '2d'), { createView: () => ({}), destroy: () => undefined }),
      queue: { writeTexture: () => undefined },
      pushErrorScope: () => undefined,
      popErrorScope: async () => null,
    };
    stub({ device });
    await NodeBackend.make({ antialias: false, forceWebGL: false });
    expect(created).toEqual(['2d', '3d']);
  });
});

describe('the clustered night allocates nothing per frame (W3 criterion 5)', () => {
  const loadNode = (name: string): Promise<unknown> => import(/* @vite-ignore */ `node:${name}`);
  /** Bytes the young generation grew by over a batch of `frames` calls of `step` (a scavenge in the batch shows as a drop and is dropped). */
  async function growthPerBatch(step: () => void, batches: number, frames: number): Promise<number[]> {
    const v8 = (await loadNode('v8')) as unknown as { getHeapSpaceStatistics(): { space_name: string; space_used_size: number }[] };
    const young = (): number => v8.getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')!.space_used_size;
    for (let i = 0; i < 5000; i++) step();
    const out: number[] = [];
    for (let b = 0; b < batches; b++) {
      const before = young();
      for (let i = 0; i < frames; i++) step();
      out.push(young() - before);
    }
    return out.filter((d) => d >= 0).sort((a, b) => a - b);
  }
  /** A few small objects a frame is 128 bytes. */
  const BUDGET = 128_000;

  it('control: the probe sees four small objects allocated per frame', async () => {
    const ring: THREE.Vector3[] = new Array<THREE.Vector3>(64);
    let n = 0;
    const grown = await growthPerBatch(() => {
      for (let k = 0; k < 4; k++) ring[n++ % 64] = new THREE.Vector3(n, k, 0.5);
    }, 20, 1000);
    expect(grown[grown.length - 1]!).toBeGreaterThan(BUDGET);
  });

  it('the light data, depth order and slice ranges of a full night (point lights and a spot) are written without allocating', async () => {
    const node = new NightLightsNode(CLUSTERED_LIGHTS.maxLights);
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 300);
    camera.position.set(2, 1.6, 3);
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const lamps: THREE.Light[] = Array.from({ length: 48 }, (_, i) => {
      const l = new THREE.PointLight(0xffaa66, 1, 8, 2);
      l.position.set((i % 8) * 6 - 20, 2.5, Math.floor(i / 8) * -7);
      l.updateMatrixWorld();
      return l;
    });
    const spot = new THREE.SpotLight(0xffffff, 4, 18, 0.4, 0.3, 2);
    spot.position.set(2, 1.5, 3);
    spot.target.position.set(2, 1.5, -5);
    spot.updateMatrixWorld();
    spot.target.updateMatrixWorld();
    lamps.push(spot);
    const grown = await growthPerBatch(() => {
      node.setLights(lamps);
      node.updateLightsTexture(camera);
    }, 40, 1000);
    expect(grown.length).toBeGreaterThan(3);
    expect(grown[Math.floor(grown.length * 0.5)]!).toBeLessThan(BUDGET);
    node.dispose();
  });
});
