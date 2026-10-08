import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RENDER_BACKEND } from '../../config/renderBackend';
import { FRAME_TIMING, LIGHTING_PRESETS, QUALITY, SURFACES, type SurfaceTextureId } from '../../config/render';
import { DEPOT } from '../../map/depot';
import { addAtmosphere } from '../atmosphere';
import { addLighting } from '../lighting';
import { buildMapMeshes, disposeMapMeshes, mapLookOf } from '../mapMeshes';
import type { SurfaceTextures } from '../proceduralTextures';
import { NodeBackend, type NodeBackendOptions, startNode } from './nodeBackend';

/**
 * The node renderer's back end (WebGPU overhaul W1) on a real `WebGPURenderer` from `three/webgpu`, with
 * `forceWebGL: true` as the container's smoke test runs it. Node has no WebGL, so the renderer's `init` (which asks the
 * browser for a context or device) and the calls that reach the GPU are stood in for; everything else is Three's own.
 */

/** A canvas as much as the renderer's constructor touches. */
function fakeCanvas(): HTMLCanvasElement {
  return { style: {}, width: 300, height: 150, addEventListener: () => undefined, removeEventListener: () => undefined, getContext: () => null } as unknown as HTMLCanvasElement;
}

const WEBGL2: NodeBackendOptions = { antialias: false, forceWebGL: true };

/** `init` without a GPU: resolves, and leaves the back end Three chose (or the one `fallBack` swaps in). */
function stubInit(timestamps = false, fallBack = false): void {
  vi.spyOn(WebGPURenderer.prototype, 'init').mockImplementation(async function (this: WebGPURenderer) {
    if (fallBack) (this as unknown as { backend: object }).backend = { isWebGLBackend: true };
    return this;
  });
  vi.spyOn(WebGPURenderer.prototype, 'hasFeature').mockImplementation((name: string) => timestamps && name === 'timestamp-query');
  // Three's dispose reaches parts init makes: stood in for (a test of dispose itself stubs it again).
  vi.spyOn(WebGPURenderer.prototype, 'dispose').mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.stubGlobal('document', { createElementNS: () => fakeCanvas() });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('making the node renderer (W1)', () => {
  it('makes WebGPURenderer on its WebGL2 back end when forced, and on WebGPU otherwise', async () => {
    stubInit();
    const gl2 = await NodeBackend.make(WEBGL2);
    expect(gl2.renderer).toBeInstanceOf(WebGPURenderer);
    expect(gl2.kind).toBe('webgpu-webgl2');
    expect(gl2.renderer.samples).toBe(0);
    const gpu = await NodeBackend.make({ antialias: true, forceWebGL: false });
    expect(gpu.kind).toBe('webgpu');
    expect(gpu.antialiased).toBe(true);
    expect(gpu.timestamps).toBe(false);
  });

  it('refuses a WebGPU renderer Three fell back to WebGL2 with, unasked, and one whose device could not be made', async () => {
    stubInit(false, true);
    const disposed = vi.mocked(WebGPURenderer.prototype.dispose);
    await expect(NodeBackend.make({ antialias: false, forceWebGL: false })).rejects.toThrow(/WebGPU device unavailable/);
    expect(disposed).toHaveBeenCalledTimes(1);
    // A renderer whose init failed isn't disposed (Three's dispose would ask for init again, unhandled): vitest fails
    // the run on any unhandled rejection.
    vi.mocked(WebGPURenderer.prototype.init).mockRejectedValue(new Error('no device'));
    await expect(NodeBackend.make(WEBGL2)).rejects.toThrow('no device');
    expect(disposed).toHaveBeenCalledTimes(1);
  });
});

describe('a lost device (W1)', () => {
  it('is told to the game once, never logged as an error, and stops compiling', async () => {
    stubInit();
    const node = await NodeBackend.make(WEBGL2);
    const error = vi.spyOn(console, 'error');
    const told = vi.fn();
    node.onLost(told);
    const compile = vi.spyOn(node.renderer, 'compileAsync').mockResolvedValue(undefined as never);
    node.renderer.onDeviceLost({ api: 'WebGL', message: 'context lost', reason: null, originalEvent: null } as never);
    node.renderer.onDeviceLost({ api: 'WebGL', message: 'again', reason: null, originalEvent: null } as never);
    expect(node.lost).toBe(true);
    expect(told).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    node.compile(new THREE.Scene(), new THREE.PerspectiveCamera());
    expect(compile).not.toHaveBeenCalled();
  });

  it('asks for a replacement a few times, a moment apart, and lets a late one go when the game no longer wants it', async () => {
    vi.useFakeTimers();
    stubInit();
    const node = await NodeBackend.make(WEBGL2);
    const made = await NodeBackend.make(WEBGL2);
    const make = vi.fn<(o: NodeBackendOptions) => Promise<NodeBackend>>().mockRejectedValueOnce(new Error('not yet')).mockResolvedValueOnce(made);
    const asked = node.replacement(() => false, make);
    await vi.advanceTimersByTimeAsync(RENDER_BACKEND.recoverDelayMs * 2);
    expect(await asked).toBe(made);
    expect(make).toHaveBeenCalledTimes(2);
    expect(make).toHaveBeenLastCalledWith(WEBGL2);

    const none = node.replacement(() => false, () => Promise.reject(new Error('never')));
    await vi.advanceTimersByTimeAsync(RENDER_BACKEND.recoverDelayMs * RENDER_BACKEND.recoverTries);
    expect(await none).toBeNull();

    let wanted = true;
    const late = await NodeBackend.make(WEBGL2);
    const dispose = vi.spyOn(late, 'dispose');
    const cancelled = node.replacement(
      () => !wanted,
      () => {
        wanted = false; // the game was closed while the device was being made
        return Promise.resolve(late);
      },
    );
    await vi.advanceTimersByTimeAsync(RENDER_BACKEND.recoverDelayMs * RENDER_BACKEND.recoverTries);
    expect(await cancelled).toBeNull();
    expect(dispose).toHaveBeenCalled();
  });
});

describe('the GPU timer from timestamp queries (W1)', () => {
  it('writes timestamps only while timing, reads one back every few frames, one at a time, and smooths it', async () => {
    stubInit(true);
    const node = await NodeBackend.make(WEBGL2);
    const backend = node.renderer.backend as unknown as { trackTimestamp: boolean };
    expect(node.timestamps).toBe(true);
    expect(backend.trackTimestamp).toBe(false);
    let answer: (ms: number) => void = () => undefined;
    const resolve = vi.spyOn(node.renderer, 'resolveTimestampsAsync').mockImplementation(() => new Promise((done) => (answer = done)));
    node.frameDone();
    expect(resolve).not.toHaveBeenCalled();
    node.setTiming(true);
    expect(backend.trackTimestamp).toBe(true);
    for (let i = 1; i < RENDER_BACKEND.timestampEvery; i++) node.frameDone();
    expect(resolve).not.toHaveBeenCalled();
    node.frameDone();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith('render');
    // One read on its way at a time.
    for (let i = 0; i < RENDER_BACKEND.timestampEvery * 2; i++) node.frameDone();
    expect(resolve).toHaveBeenCalledTimes(1);
    answer(4);
    await Promise.resolve();
    expect(node.gpuMs).toBe(4);
    for (let i = 0; i < RENDER_BACKEND.timestampEvery; i++) node.frameDone();
    expect(resolve).toHaveBeenCalledTimes(2);
    answer(8);
    await Promise.resolve();
    expect(node.gpuMs).toBeCloseTo(4 + 4 * FRAME_TIMING.smoothing);
    node.setTiming(false);
    expect(backend.trackTimestamp).toBe(false);
    expect(node.gpuMs).toBeNaN();
  });

  it('never switches timestamps on where the adapter offers none', async () => {
    stubInit(false);
    const node = await NodeBackend.make(WEBGL2);
    const resolve = vi.spyOn(node.renderer, 'resolveTimestampsAsync');
    node.setTiming(true);
    expect((node.renderer.backend as unknown as { trackTimestamp: boolean }).trackTimestamp).toBe(false);
    for (let i = 0; i < RENDER_BACKEND.timestampEvery * 3; i++) node.frameDone();
    expect(resolve).not.toHaveBeenCalled();
    expect(node.gpuMs).toBeNaN();
  });
});

describe('compiling ahead and letting go (W1)', () => {
  it('compiles the world, then the held replica, ahead of the first frame, without waiting', async () => {
    stubInit();
    const node = await NodeBackend.make(WEBGL2);
    const compiled: string[] = [];
    vi.spyOn(node.renderer, 'compileAsync').mockImplementation(async (scene) => void compiled.push(scene.name));
    const world = Object.assign(new THREE.Scene(), { name: 'world' });
    const held = Object.assign(new THREE.Scene(), { name: 'held' });
    node.compile(world, new THREE.PerspectiveCamera(), { scene: held, camera: new THREE.PerspectiveCamera() });
    expect(compiled).toEqual(['world']);
    await new Promise((done) => setTimeout(done, 0));
    expect(compiled).toEqual(['world', 'held']);
  });

  it('frees the renderer on dispose, with no unhandled rejection if Three refuses', async () => {
    stubInit();
    const node = await NodeBackend.make(WEBGL2);
    const dispose = vi.mocked(WebGPURenderer.prototype.dispose).mockRejectedValue(new Error('already gone'));
    node.dispose();
    await new Promise((done) => setTimeout(done, 0));
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe('the node renderer’s start (W1)', () => {
  it('makes the node renderer with the visit’s options: on ?forceWebGL, its WebGL2 back end', async () => {
    stubInit();
    const node = await startNode(WEBGL2);
    expect(node.kind).toBe('webgpu-webgl2');
    expect(node.renderer).toBeInstanceOf(WebGPURenderer);
    node.dispose();
  });
});

describe('the node library draws every material the field is built with (W1)', () => {
  /** Stand-in surface textures (canvases need a browser), as render/disposal.test.ts. */
  const textures = Object.fromEntries(
    (Object.keys(SURFACES.worldSize) as SurfaceTextureId[]).map((id) => [id, { texture: new THREE.Texture() as THREE.CanvasTexture, worldSize: SURFACES.worldSize[id] }]),
  ) as SurfaceTextures;

  it('has a node material for each, an onBeforeCompile patch left out, and none for a GLSL ShaderMaterial', () => {
    vi.stubGlobal('document', { createElementNS: () => fakeCanvas(), createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const renderer = new WebGPURenderer({ forceWebGL: true, canvas: fakeCanvas() });
    for (const quality of [QUALITY.low, QUALITY.ultra]) {
      const scene = new THREE.Scene();
      const meshes = buildMapMeshes(DEPOT, textures, { ...mapLookOf(quality), normalMaps: false }, () => new THREE.Texture());
      scene.add(meshes);
      const daylight = addLighting(scene, DEPOT, quality, LIGHTING_PRESETS.day);
      const atmosphere = addAtmosphere(scene, new THREE.Vector3(), new THREE.Vector3(0, 1, 0), quality, new THREE.Box3(new THREE.Vector3(-20, 0, -10), new THREE.Vector3(20, 3, 10)));
      const materials = new Set<THREE.Material>();
      scene.traverse((o) => {
        const m = (o as Partial<THREE.Mesh>).material;
        if (m) for (const one of Array.isArray(m) ? m : [m]) materials.add(one);
      });
      expect(materials.size).toBeGreaterThan(3);
      // Some are patched through onBeforeCompile on WebGL (surfaces, relief, the sky): the node path draws them plain.
      expect([...materials].some((m) => m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile)).toBe(true);
      for (const m of materials) {
        const node = renderer.library.fromMaterial(m);
        expect(node, `${m.type} ${m.name}`).not.toBeNull();
        expect((node as unknown as { isNodeMaterial: boolean }).isNodeMaterial, m.type).toBe(true);
      }
      disposeMapMeshes(meshes);
      daylight.dispose();
      atmosphere.dispose();
    }
    expect(renderer.library.fromMaterial(new THREE.ShaderMaterial())).toBeNull();
  });
});
