import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GPU_FOREST } from '../../../config/gpuDressing';
import { QUALITY, type QualitySettings, resolveQuality } from '../../../config/render';
import { DEPOT } from '../../../map/depot';
import { WOODLAND } from '../../../map/woodland';
import { createRng, rngNext } from '../../../sim/rng';
import { placeForest } from './forestLayout';
import { fakeCanvas, mapSceneOf, objectsAllocatedByGame } from '../../testSupport';
import { GpuDressing } from './gpuDressing';
import { grassLevels } from './grassLayout';

/**
 * W5 QA: the map's grass and tree stand-ins (acceptance 2 and 5) on a real `WebGPURenderer` (no GPU: its draws, compute
 * and buffer store stood in for): the caps per preset, what Low and "Map detail off" draw, what is freed when, what the
 * cull is given each frame, and that a frame allocates nothing.
 */

interface Inner {
  grass: GrassInner | null;
  forest: ForestInner | null;
}
interface GrassInner {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.Material>;
  planes: { array: THREE.Vector4[] };
  eye: { value: THREE.Vector3 };
  time: { value: number };
  sway: { value: number };
  buffers: THREE.BufferAttribute[];
  ground: THREE.Texture;
  maskTex: THREE.Texture;
}
interface ForestInner {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.Material>;
  planes: { array: THREE.Vector4[] };
  eye: { value: THREE.Vector3 };
  buffers: THREE.BufferAttribute[];
  atlas: { targets: object[] };
}
const inner = (d: GpuDressing): Inner => d as unknown as Inner;
/** Three's textures, geometries, materials and render targets all tell their free. */
interface Disposable {
  addEventListener(type: 'dispose', listener: () => void): void;
}

beforeEach(() => {
  vi.stubGlobal('document', { createElementNS: () => fakeCanvas(), createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A dressing on a node renderer that counts its passes and pictures and the GPU buffers it is told to free. */
function setup(webgpu = false) {
  const renderer = new WebGPURenderer({ forceWebGL: true, canvas: fakeCanvas() });
  const calls = { compute: 0, render: 0 };
  const freed: unknown[] = [];
  Object.assign(renderer, {
    compute: () => void calls.compute++,
    render: () => void calls.render++,
    clear: () => undefined,
    setRenderTarget: () => undefined,
    _attributes: { delete: (a: unknown) => void freed.push(a) },
  });
  return { dressing: new GpuDressing(renderer, webgpu), calls, freed };
}

const sceneOf = mapSceneOf;

const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 250);
const named = (scene: THREE.Scene, name: string): THREE.Object3D | undefined => scene.getObjectByName(name);

describe('the caps per preset (acceptance 2)', () => {
  const caps: [Exclude<keyof typeof QUALITY, 'low'>, number, number][] = [
    ['medium', 41_952, 900],
    ['high', 93_696, 1_400],
    ['ultra', 159_892, 2_000],
  ];

  for (const [preset, blades, standIns] of caps) {
    it(`draws Woodland ${preset} ${blades.toLocaleString('en')} blades and ${standIns.toLocaleString('en')} stand-ins, as long as the map's wood`, () => {
      const { dressing } = setup();
      const { scene } = sceneOf(WOODLAND);
      dressing.frame(scene, camera, QUALITY[preset]);
      expect(dressing.counts).toEqual({ grass: blades, forest: standIns });
      expect(grassLevels(preset).count).toBe(blades);
      // A slot per blade in each of the pass's three buffers, a vec4 apiece.
      const grass = inner(dressing).grass!;
      for (const b of grass.buffers.slice(0, 3)) expect(b.count).toBe(blades);
      expect(grass.mesh.geometry.instanceCount).toBe(blades);
      expect(inner(dressing).forest!.mesh.geometry.instanceCount).toBe(standIns);
      expect(standIns).toBe(Math.round(WOODLAND.dressing!.forest!.trees * GPU_FOREST.share[preset]));
    });
  }

  it('draws Low nothing: no object in the scene, no pass, no picture, whatever the map', () => {
    const { dressing, calls, freed } = setup();
    for (const map of [WOODLAND, DEPOT]) {
      const { scene } = sceneOf(map);
      dressing.rescan();
      dressing.frame(scene, camera, QUALITY.low);
      dressing.frame(scene, camera, QUALITY.low);
      expect(dressing.counts).toEqual({ grass: 0, forest: 0 });
      expect(scene.children).toHaveLength(1);
      expect(named(scene, 'grass-gpu')).toBeUndefined();
      expect(named(scene, 'forest-gpu')).toBeUndefined();
    }
    // Before the Renderer knows its quality (null) it is the same.
    const { scene } = sceneOf(WOODLAND);
    dressing.rescan();
    dressing.frame(scene, camera, null);
    expect(scene.children).toHaveLength(1);
    expect(calls).toEqual({ compute: 0, render: 0 });
    expect(freed).toEqual([]);
  });

  it('draws a map whose dressing asks for none (Depot) nothing on every preset', () => {
    for (const preset of ['medium', 'high', 'ultra'] as const) {
      const { dressing, calls } = setup();
      const { scene } = sceneOf(DEPOT);
      dressing.frame(scene, camera, QUALITY[preset]);
      expect(dressing.counts).toEqual({ grass: 0, forest: 0 });
      expect(calls).toEqual({ compute: 0, render: 0 });
    }
  });
});

describe('Map detail (acceptance 2: High\'s counts for a Custom preset with it on, none with it off)', () => {
  const custom = (mapDetail: boolean): QualitySettings => resolveQuality('custom', { mapDetail });

  it('frees both when Map detail goes off, and makes them again when it comes on', () => {
    const { dressing, freed } = setup();
    const { scene } = sceneOf(WOODLAND);
    dressing.frame(scene, camera, custom(true));
    expect(dressing.counts).toEqual({ grass: grassLevels('high').count, forest: 1_400 });
    dressing.rescan();
    dressing.frame(scene, camera, custom(false));
    expect(dressing.counts).toEqual({ grass: 0, forest: 0 });
    expect(named(scene, 'grass-gpu')).toBeUndefined();
    expect(named(scene, 'forest-gpu')).toBeUndefined();
    // The grass's three slot buffers and the stand-ins' four.
    expect(freed).toHaveLength(7);
    dressing.rescan();
    dressing.frame(scene, camera, custom(true));
    expect(dressing.counts.forest).toBe(1_400);
    expect(named(scene, 'grass-gpu')).toBeDefined();
  });
});

describe('what is freed, and when (acceptance 5)', () => {
  /** Every GPU buffer, texture, geometry and material the dressing holds, listening for its free. */
  function watch(dressing: GpuDressing) {
    const { grass, forest } = inner(dressing);
    const events: string[] = [];
    const on = (what: string, target: object): void => (target as Disposable).addEventListener('dispose', () => events.push(what));
    on('grass geometry', grass!.mesh.geometry);
    on('grass material', grass!.mesh.material);
    on('ground texture', grass!.ground);
    on('mask texture', grass!.maskTex);
    on('stand-in geometry', forest!.mesh.geometry);
    on('stand-in material', forest!.mesh.material);
    forest!.atlas.targets.forEach((t, k) => on(`atlas ${k}`, t));
    return events;
  }
  const ALL = ['grass geometry', 'grass material', 'ground texture', 'mask texture', 'stand-in geometry', 'stand-in material', 'atlas 0', 'atlas 1'];

  it('frees every buffer, texture, picture, geometry and material once on a preset change to Low', () => {
    const { dressing, freed } = setup();
    const { scene } = sceneOf(WOODLAND);
    dressing.frame(scene, camera, QUALITY.ultra);
    const owned = [...inner(dressing).grass!.buffers, ...inner(dressing).forest!.buffers];
    const events = watch(dressing);
    dressing.rescan();
    dressing.frame(scene, camera, QUALITY.low);
    expect([...events].sort()).toEqual([...ALL].sort());
    // Exactly the buffers it made, none twice.
    expect(freed).toHaveLength(owned.length);
    expect(new Set(freed)).toEqual(new Set(owned));
    expect(named(scene, 'grass-gpu')).toBeUndefined();
    expect(named(scene, 'forest-gpu')).toBeUndefined();
    expect(dressing.counts).toEqual({ grass: 0, forest: 0 });
  });

  it('frees the indirect draw\'s counter too on WebGPU (nine buffers, not seven)', () => {
    const { dressing, freed } = setup(true);
    const { scene } = sceneOf(WOODLAND);
    dressing.frame(scene, camera, QUALITY.high);
    const owned = [...inner(dressing).grass!.buffers, ...inner(dressing).forest!.buffers];
    expect(owned).toHaveLength(9);
    expect(owned.filter((b) => b instanceof THREE.BufferAttribute && b.array instanceof Uint32Array)).toHaveLength(2);
    dressing.dispose();
    expect(new Set(freed)).toEqual(new Set(owned));
    expect(freed).toHaveLength(9);
  });

  it('frees them when the map changes under the same scene (Woodland to Depot), and makes nothing for a map that wants none', () => {
    const { dressing, freed } = setup();
    const { scene, group } = sceneOf(WOODLAND);
    dressing.frame(scene, camera, QUALITY.high);
    const events = watch(dressing);
    scene.remove(group);
    const next = sceneOf(DEPOT);
    scene.add(next.group);
    dressing.frame(scene, camera, QUALITY.high);
    dressing.frame(scene, camera, QUALITY.high);
    expect([...events].sort()).toEqual([...ALL].sort());
    expect(freed).toHaveLength(7);
    expect(dressing.counts).toEqual({ grass: 0, forest: 0 });
    expect(named(scene, 'grass-gpu')).toBeUndefined();
  });

  it('frees them when the device goes (dispose), once, however often it is asked', () => {
    const { dressing, freed } = setup();
    const { scene } = sceneOf(WOODLAND);
    dressing.frame(scene, camera, QUALITY.medium);
    const events = watch(dressing);
    dressing.dispose();
    dressing.dispose();
    expect([...events].sort()).toEqual([...ALL].sort());
    expect(freed).toHaveLength(7);
    expect(scene.children.map((c) => c.name)).toEqual(['map']);
    // A frame after the loss draws and dispatches nothing (the Renderer stops calling, but a late call must not make them anew).
    dressing.frame(scene, camera, QUALITY.medium);
    expect(dressing.counts).toEqual({ grass: 0, forest: 0 });
  });

  it('is not made again or freed by a resize: nothing here is sized to the screen', () => {
    const { dressing, freed, calls } = setup();
    const { scene } = sceneOf(WOODLAND);
    const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 250);
    dressing.frame(scene, cam, QUALITY.high);
    const pictures = calls.render;
    const grass = inner(dressing).grass;
    for (const aspect of [4 / 3, 21 / 9, 1]) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
      dressing.frame(scene, cam, QUALITY.high);
    }
    expect(inner(dressing).grass).toBe(grass);
    expect(freed).toEqual([]);
    // The stand-ins' pictures are taken once, at a fixed size.
    expect(calls.render).toBe(pictures);
    expect(dressing.counts.grass).toBe(grassLevels('high').count);
  });
});

describe('what the GPU cull is given each frame', () => {
  const poses: [number[], number[]][] = [
    [[10, 2, 5], [0, 1, 0]],
    [[-30, 6, 22], [4, 1, -40]],
    [[0, 30, 0], [0, 0, 1]],
  ];

  for (const webgpu of [false, true]) {
    it(`gives the grass and the stand-ins the camera's six frustum planes and eye as it moves${webgpu ? ' (WebGPU)' : ''}`, () => {
      const { dressing } = setup(webgpu);
      const { scene } = sceneOf(WOODLAND);
      const cam = new THREE.PerspectiveCamera(65, 16 / 9, 0.05, 250);
      const rng = createRng(5);
      for (const [from, to] of poses) {
        cam.position.set(from[0]!, from[1]!, from[2]!);
        cam.lookAt(to[0]!, to[1]!, to[2]!);
        dressing.frame(scene, cam, QUALITY.ultra);
        cam.updateMatrixWorld();
        const reference = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        const { grass, forest } = inner(dressing);
        for (const cull of [grass!, forest!]) {
          expect(cull.eye.value.distanceTo(cam.position)).toBeLessThan(1e-9);
          expect(cull.planes.array).toHaveLength(6);
          // The shader keeps a sphere when plane.xyz · centre + plane.w > −radius for all six: Three's own test says the same.
          let kept = 0;
          for (let s = 0; s < 400; s++) {
            const centre = new THREE.Vector3((rngNext(rng) * 2 - 1) * 120, rngNext(rng) * 20, (rngNext(rng) * 2 - 1) * 120);
            const radius = rngNext(rng) * 6;
            const shader = cull.planes.array.every((p) => p.x * centre.x + p.y * centre.y + p.z * centre.z + p.w > -radius);
            expect(shader).toBe(reference.intersectsSphere(new THREE.Sphere(centre, radius)));
            if (shader) kept++;
          }
          // The test sees both outcomes: some spheres in view, some out.
          expect(kept).toBeGreaterThan(5);
          expect(kept).toBeLessThan(395);
        }
      }
    });
  }

  for (const webgpu of [false, true]) {
    it(`dispatches the grass's passes and the stand-ins' once each in a frame${webgpu ? ' (WebGPU)' : ''}`, () => {
      const { dressing, calls } = setup(webgpu);
      const { scene } = sceneOf(WOODLAND);
      dressing.frame(scene, camera, QUALITY.high);
      expect(calls.compute).toBe(2);
      dressing.frame(scene, camera, QUALITY.high);
      dressing.frame(scene, camera, QUALITY.high);
      expect(calls.compute).toBe(6);
    });
  }
});

describe('the grass under Reduced motion (the tip sways, never under Reduced motion)', () => {
  it('moves its wind on the frame clock while the frame is given motion, and holds it still (sway 0) while not', () => {
    const { dressing } = setup();
    const { scene } = sceneOf(WOODLAND);
    // The match's MotionScale reaches the dressing as the frame's last argument (the Renderer passes it down).
    const wind = (motion: boolean): { time: number; sway: number } => {
      const key = { ...QUALITY.medium };
      dressing.frame(scene, camera, key, motion);
      const { grass } = inner(dressing);
      const before = grass!.time.value;
      dressing.frame(scene, camera, key, motion);
      return { time: grass!.time.value - before, sway: grass!.sway.value };
    };
    expect(wind(true).sway).toBe(1);
    const held = wind(false);
    expect(held.sway).toBe(0);
    expect(held.time).toBe(0);
    // And it carries on when motion comes back.
    expect(wind(true).sway).toBe(1);
  });
});

describe('no allocation per frame (acceptance 5)', () => {
  const FRAMES = 1_000;
  // A frame that made one vector, array or closure would read 1,000; the sampler's own noise (a JIT tier-up) is a hundred or so.
  const NOISE = 400;

  for (const webgpu of [false, true]) {
    it(`makes no object in a frame of the grass and stand-ins' cull${webgpu ? ' (WebGPU)' : ' (WebGL2 back end)'}`, async () => {
      const { dressing } = setup(webgpu);
      const { scene } = sceneOf(WOODLAND);
      const cam = new THREE.PerspectiveCamera(65, 16 / 9, 0.05, 250);
      cam.position.set(3, 1.7, 4);
      for (let f = 0; f < 50; f++) dressing.frame(scene, cam, QUALITY.ultra);
      const objects = await objectsAllocatedByGame(() => {
        for (let f = 0; f < FRAMES; f++) {
          cam.position.x = 3 + (f % 50) * 0.1;
          dressing.frame(scene, cam, QUALITY.ultra);
        }
      });
      expect(objects).toBeLessThan(NOISE);
    }, 60_000);
  }

  it('reads game code that allocates as allocating (the sampler is not blind)', async () => {
    const keep: unknown[] = [];
    const field = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
    // placeForest makes a list of stand-ins and a grid of lists each call.
    const objects = await objectsAllocatedByGame(() => {
      for (let f = 0; f < 100; f++) keep[f % 4] = placeForest(20, field, []);
    });
    expect(objects).toBeGreaterThan(NOISE);
  }, 60_000);
});
