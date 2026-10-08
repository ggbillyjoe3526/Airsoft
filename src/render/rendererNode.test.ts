import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUALITY, type QualitySettings, TONE_MAPPING } from '../config/render';
import { Renderer } from './renderer';
import { toneMappingOf } from './rendererParts';
import type { NodeBackend } from './webgpu/nodeBackend';

/**
 * The Renderer on the node path (WebGPU overhaul W1): handed a node renderer by Game.create, it draws the same scene
 * through it with no GLSL pass (post stack, retro filter), no prefiltered sky, its own GPU timer and its own device-lost
 * recovery. The node renderer is stood in for (render/webgpu/nodeBackend.test.ts covers the real one): what matters
 * here is what the Renderer asks of it.
 */

/** A node back end as the Renderer sees it, logging what it is asked. */
function fakeNode(name: string, log: string[]) {
  const canvas = {
    className: '',
    replaceWith: (next: { name: string }) => void log.push(`${name} canvas replaced by ${next.name}`),
    remove: () => void log.push(`${name} canvas removed`),
    removeEventListener: () => undefined,
    name,
  };
  let lostListener: () => void = () => undefined;
  const renderer = {
    isWebGPURenderer: true,
    domElement: canvas,
    info: { autoReset: true, reset: () => undefined, render: { calls: 99, drawCalls: 7, triangles: 1234 }, memory: { programs: 3, geometries: 4, textures: 5 } },
    shadowMap: { enabled: false, type: 0 },
    autoClear: true,
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: '',
    samples: 4,
    getPixelRatio: () => 1,
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    setRenderTarget: (t: unknown) => void log.push(`${name} target ${t === null ? 'canvas' : 'other'}`),
    clearDepth: () => void log.push(`${name} clearDepth`),
    render: (scene: THREE.Scene) => void log.push(`${name} render ${scene.name}`),
    initTexture: () => undefined,
  };
  const node = {
    kind: 'webgpu' as const,
    renderer,
    lost: false,
    gpuMs: 2.5,
    antialiased: true,
    maxAnisotropy: 16,
    timestamps: true,
    timing: [] as boolean[],
    frames: 0,
    next: null as unknown,
    onLost: (listener: () => void) => void (lostListener = listener),
    setTiming: (on: boolean) => void node.timing.push(on),
    frameDone: () => void node.frames++,
    compile: (scene: THREE.Scene, _camera: THREE.Camera, overlay?: { scene: THREE.Scene }) => void log.push(`${name} compile ${scene.name}${overlay ? ` and ${overlay.scene.name}` : ''}`),
    replacement: () => Promise.resolve(node.next),
    dispose: () => void log.push(`${name} disposed`),
    loseDevice: () => {
      node.lost = true;
      lostListener();
    },
  };
  return node;
}

function nodeRenderer(quality: QualitySettings = QUALITY.high) {
  vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 });
  const log: string[] = [];
  const node = fakeNode('first', log);
  const makeWebGL = vi.spyOn(Renderer.prototype as unknown as { makeWebGL: () => unknown }, 'makeWebGL');
  const r = new Renderer({ appendChild: () => undefined, clientWidth: 1280, clientHeight: 720 } as unknown as HTMLElement, quality, node as unknown as NodeBackend);
  r.scene.name = 'world';
  return { r, node, log, makeWebGL };
}

describe('the Renderer on the node path (W1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('draws with the node renderer it was handed, dressed with the game’s output settings, and makes no WebGL renderer', () => {
    const { r, node, makeWebGL } = nodeRenderer();
    expect(makeWebGL).not.toHaveBeenCalled();
    expect(r.backend).toBe('webgpu');
    expect(r.renderer).toBe(node.renderer);
    const { mapping, exposure } = toneMappingOf(TONE_MAPPING.default);
    expect(node.renderer).toMatchObject({ outputColorSpace: THREE.SRGBColorSpace, toneMapping: mapping, toneMappingExposure: exposure, shadowMap: { enabled: true, type: THREE.PCFShadowMap } });
    expect(node.renderer.domElement.className).toBe('game-canvas');
    expect(r.antialiased).toBe(true);
    expect(r.samples).toBe(4);
    expect(r.maxAnisotropy).toBe(16);
  });

  it('draws the world then the held replica straight to the canvas: no post stack or retro filter, even on Ultra', () => {
    const { r, log } = nodeRenderer(QUALITY.ultra);
    r.setRetro({ pixelSize: 4, levels: 6 });
    expect(r.retroPixelAngle).toBe(0);
    const overlay = { scene: Object.assign(new THREE.Scene(), { name: 'replica' }), camera: new THREE.PerspectiveCamera() };
    r.render(overlay);
    expect(log).toEqual(['first render world', 'first clearDepth', 'first render replica']);
    expect(r.postPasses).toEqual([]);
  });

  it('has no prefiltered sky yet: no environment map and no replica sheen', () => {
    const { r } = nodeRenderer(QUALITY.ultra);
    r.render();
    expect(r.scene.environment).toBeNull();
    expect(r.replicaSheen).toBeNull();
  });

  it('reads the draw counts and GPU time the same way the debug overlay reads WebGL’s', () => {
    const { r, node } = nodeRenderer();
    expect({ ...r.stats }).toEqual({ calls: 7, triangles: 1234, programs: 3, geometries: 4, textures: 5 });
    expect(r.gpuMs).toBe(2.5);
    r.gpuTiming = true;
    r.render();
    r.gpuTiming = false;
    r.render();
    expect(node.timing).toEqual([true, false]);
    expect(node.frames).toBe(2);
  });

  it('compiles ahead through the node renderer at a match’s build', () => {
    const { r, log } = nodeRenderer();
    r.warmShaders({ scene: Object.assign(new THREE.Scene(), { name: 'replica' }), camera: new THREE.PerspectiveCamera() });
    expect(log).toEqual(['first compile world and replica']);
  });

  it('leaves an antialiasing change to the next load', () => {
    const { r, log } = nodeRenderer(QUALITY.low);
    expect(r.setQuality({ ...QUALITY.low, antialias: !QUALITY.low.antialias })).toBe(false);
    expect(r.antialiasPending).toBe(true);
    expect(log).toEqual([]);
  });

  it('recovers a lost device: paused, nothing drawn, then a new renderer takes the old one’s place and play can go on', async () => {
    const { r, node, log } = nodeRenderer();
    const told: boolean[] = [];
    r.onContextChange((lost) => told.push(lost));
    const next = fakeNode('second', log);
    node.next = next;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    r.scene.add(mesh);
    const freed = vi.fn();
    mesh.geometry.addEventListener('dispose', freed);
    node.loseDevice();
    expect(told).toEqual([true]);
    r.render();
    expect(log).toEqual([]);
    await new Promise((done) => setTimeout(done, 0));
    // What the old renderer drew lets go of it (it is uploaded again by the new one), and the new canvas takes the old one's place.
    expect(freed).toHaveBeenCalled();
    expect(log).toEqual(['first canvas replaced by second', 'first disposed']);
    expect(told).toEqual([true, false]);
    expect(r.renderer).toBe(next.renderer);
    expect(next.renderer.domElement.className).toBe('game-canvas');
    r.render();
    expect(log.slice(2)).toEqual(['second render world']);
    // The new renderer's loss is heard too.
    next.next = null;
    next.loseDevice();
    await new Promise((done) => setTimeout(done, 0));
    expect(told).toEqual([true, false, true]);
    expect(r.renderer).toBe(next.renderer);
  });

  it('falls back to WebGL when no new device can be made: a WebGL renderer takes the old canvas’s place and play goes on', async () => {
    const { r, node, log, makeWebGL } = nodeRenderer();
    const told: boolean[] = [];
    r.onContextChange((lost) => told.push(lost));
    const listened: string[] = [];
    const glCanvas = { className: '', name: 'webgl', addEventListener: (type: string) => void listened.push(type), removeEventListener: () => undefined };
    const gl = {
      domElement: glCanvas,
      info: { autoReset: true, reset: () => undefined, render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 }, programs: [] },
      shadowMap: { enabled: false, type: 0 },
      getPixelRatio: () => 1,
      setPixelRatio: () => undefined,
      setSize: () => undefined,
      capabilities: { getMaxAnisotropy: () => 8 },
      getContext: () => ({ getParameter: () => 0, SAMPLES: 0 }),
    };
    makeWebGL.mockImplementation(() => gl);
    node.next = null;
    node.loseDevice();
    await new Promise((done) => setTimeout(done, 0));
    expect(makeWebGL).toHaveBeenCalledWith(QUALITY.high.antialias);
    expect(log).toEqual(['first canvas replaced by webgl', 'first disposed']);
    expect(r.backend).toBe('webgl');
    expect(r.renderer).toBe(gl);
    expect(listened).toEqual(['webglcontextlost', 'webglcontextrestored']);
    expect(told).toEqual([true, false]);
  });

  it('frees the node renderer with itself, and a recovery still on its way does nothing after', async () => {
    const { r, node, log } = nodeRenderer();
    node.next = fakeNode('late', log);
    node.loseDevice();
    r.dispose();
    await new Promise((done) => setTimeout(done, 0));
    expect(log).toEqual(['first disposed', 'first canvas removed', 'late disposed']);
  });
});
