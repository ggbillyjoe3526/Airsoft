import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUALITY, type QualitySettings, TONE_MAPPING } from '../config/render';
import { Renderer } from './renderer';
import { toneMappingOf } from './rendererParts';
import { postPlan } from './post/postPlan';
import type { NodeBackend } from './webgpu/nodeBackend';
import { DirectOutput } from './webgpu/post/nodeOutput';
import { NodePostStack } from './webgpu/post/nodePostStack';
import { NodeRetroFilter } from './webgpu/post/nodeRetro';

/**
 * The Renderer on the node path (WebGPU overhaul W1): handed a node renderer by Game.create, it draws the same scene
 * through it, with its own post stack and retro filter (W4), its own prefiltered sky, its own GPU timer and its own
 * device-lost recovery (to WebGL2 when no new WebGPU device is given, W6a). The node renderer is stood in for (render/webgpu/nodeBackend.test.ts covers the real one): what matters
 * here is what the Renderer asks of it.
 */

type PostSetupOf = ConstructorParameters<typeof NodePostStack>[0];
type RetroLookOf = ConstructorParameters<typeof NodeRetroFilter>[0];

/** What a frame or a compile draws, and through what: the post stack, the retro filter or straight (Low). */
const what = (scene: THREE.Scene, overlay: { scene: THREE.Scene } | undefined, drawer: object | null): string =>
  `${scene.name}${overlay ? ` and ${overlay.scene.name}` : ''} ${drawer === null ? 'straight' : drawer instanceof NodeRetroFilter ? 'through retro' : drawer instanceof NodePostStack ? 'through stack' : '?'}`;

/** A node back end as the Renderer sees it, logging what it is asked. */
function fakeNode(name: string, log: string[], kind: 'webgpu' | 'webgl' = 'webgpu') {
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
    kind,
    renderer,
    lost: false,
    gpuMs: 2.5,
    antialiased: true,
    maxAnisotropy: 16,
    timestamps: true,
    samples: 4,
    get stats() {
      const { render, memory } = renderer.info;
      return { calls: render.drawCalls, triangles: render.triangles, programs: memory.programs, geometries: memory.geometries, textures: memory.textures };
    },
    timing: [] as boolean[],
    frames: 0,
    next: null as unknown,
    onLost: (listener: () => void) => void (lostListener = listener),
    setTiming: (on: boolean) => void node.timing.push(on),
    frameDone: () => void node.frames++,
    // W4: the frame through the Renderer's post stack or retro filter (made here), or straight to the canvas (Low).
    output: new DirectOutput(),
    postStack: (setup: PostSetupOf, width: number, height: number) => new NodePostStack(setup, width, height, node.output),
    retro: (look: RetroLookOf) => new NodeRetroFilter(look),
    draw: (scene: THREE.Scene, _camera: THREE.Camera, overlay: { scene: THREE.Scene } | undefined, drawer: object | null) => void log.push(`${name} draw ${what(scene, overlay, drawer)}`),
    compile: (scene: THREE.Scene, _camera: THREE.Camera, overlay: { scene: THREE.Scene } | undefined, drawer: object | null, quality?: unknown) => {
      node.qualities.push(quality);
      log.push(`${name} compile ${what(scene, overlay, drawer)}`);
    },
    // W2: the world twins' scene scan and the environment map, made on this renderer.
    rescans: 0,
    prepared: 0,
    qualities: [] as unknown[],
    sky: Object.assign(new THREE.Texture(), { name: `${name} sky` }),
    environmentAsks: [] as boolean[],
    rescan: () => void node.rescans++,
    prepare: (_scene: THREE.Scene, quality?: unknown) => {
      node.prepared++;
      node.qualities.push(quality);
    },
    environment: (on: boolean) => {
      node.environmentAsks.push(on);
      return on ? node.sky : null;
    },
    // W3: the prefiltered sky is freed when neither the environment map nor the sheen wants it; clustered lights.
    trims: [] as boolean[],
    trimSky: (on: boolean) => void node.trims.push(on),
    clustered: true,
    replacement: () => Promise.resolve(node.next),
    dispose: () => void log.push(`${name} disposed`),
    loseDevice: () => {
      node.lost = true;
      lostListener();
    },
  };
  return node;
}

function nodeRenderer(quality: QualitySettings = QUALITY.high, kind: 'webgpu' | 'webgl' = 'webgpu') {
  vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 });
  const log: string[] = [];
  const node = fakeNode('first', log, kind);
  const r = new Renderer({ appendChild: () => undefined, clientWidth: 1280, clientHeight: 720 } as unknown as HTMLElement, quality, node as unknown as NodeBackend);
  r.scene.name = 'world';
  return { r, node, log };
}

describe('the Renderer on the node path (W1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('draws with the node renderer it was handed, dressed with the game’s output settings', () => {
    const { r, node } = nodeRenderer();
    expect(r.backend).toBe('webgpu');
    expect(r.renderer).toBe(node.renderer);
    const { mapping, exposure } = toneMappingOf(TONE_MAPPING.default);
    expect(node.renderer).toMatchObject({ outputColorSpace: THREE.SRGBColorSpace, toneMapping: mapping, toneMappingExposure: exposure, shadowMap: { enabled: true, type: THREE.PCFShadowMap } });
    expect(node.renderer.domElement.className).toBe('game-canvas');
    expect(r.antialiased).toBe(true);
    expect(r.samples).toBe(4);
    expect(r.maxAnisotropy).toBe(16);
  });

  it('draws Low straight to the canvas, and every other preset through its node post stack (W4)', () => {
    const overlay = { scene: Object.assign(new THREE.Scene(), { name: 'replica' }), camera: new THREE.PerspectiveCamera() };
    const low = nodeRenderer(QUALITY.low);
    low.r.render(overlay);
    expect(low.log).toEqual(['first draw world and replica straight']);
    expect(low.r.postPasses).toEqual([]);
    for (const q of [QUALITY.medium, QUALITY.high, QUALITY.ultra]) {
      const { r, log } = nodeRenderer(q);
      r.render(overlay);
      expect(log).toEqual(['first draw world and replica through stack']);
      expect(r.postPasses).toEqual(postPlan(q));
    }
  });

  it('draws through its node retro filter while it is on, with no stack, and the stack comes back after (W4)', () => {
    const { r, log } = nodeRenderer(QUALITY.ultra);
    r.render();
    const stack = (r as unknown as { post: { current: NodePostStack } }).post.current;
    const freed = vi.spyOn(stack, 'dispose');
    r.setRetro({ pixelSize: 4, levels: 6 });
    expect(r.retroPixelAngle).toBeGreaterThan(0);
    expect(freed).toHaveBeenCalledOnce();
    r.render();
    expect(r.postPasses).toEqual([]);
    r.setRetro(null);
    expect(r.retroPixelAngle).toBe(0);
    r.render();
    expect(log).toEqual(['first draw world through stack', 'first draw world through retro', 'first draw world through stack']);
    expect(r.postPasses).toEqual(postPlan(QUALITY.ultra));
  });

  it('has the scene’s environment map (W2) and the replica sheen (W3) from the node renderer’s one prefiltered sky', () => {
    const { r, node } = nodeRenderer(QUALITY.ultra);
    r.render();
    expect(r.scene.environment).toBe(node.sky);
    expect(r.replicaSheen).toBe(node.sky);
    // Off on Low: none, and the node renderer is told neither wants it (it frees its prefiltered sky).
    r.setQuality(QUALITY.low);
    r.render();
    expect(r.scene.environment).toBeNull();
    expect(r.replicaSheen).toBeNull();
    expect(node.environmentAsks).toEqual([true, true, false, false]);
    expect(node.trims).toEqual([false]);
    // Sheen without the environment map (Custom): the sky is kept for the sheen.
    r.setQuality({ ...QUALITY.high, environment: false });
    expect(node.trims).toEqual([false, true]);
    expect(r.replicaSheen).toBe(node.sky);
  });

  it('says whether the night is lit by clustered lights (W3): the node renderer’s answer, never on WebGL', () => {
    const { r, node } = nodeRenderer();
    expect(r.clusteredLights).toBe(true);
    node.clustered = false;
    expect(r.clusteredLights).toBe(false);
  });

  it('looks for new sized points before each frame, and after a quality change (W2)', () => {
    const { r, node } = nodeRenderer();
    r.render();
    r.render();
    expect(node.prepared).toBe(2);
    expect(node.rescans).toBe(0);
    r.setQuality(QUALITY.medium);
    expect(node.rescans).toBe(1);
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
    expect(log).toEqual(['first compile world and replica through stack']);
  });

  it('leaves an antialiasing change to the next load', () => {
    const { r, log } = nodeRenderer(QUALITY.low);
    r.setQuality({ ...QUALITY.low, antialias: !QUALITY.low.antialias });
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
    expect(log.slice(2)).toEqual(['second draw world through stack']);
    // The new renderer's loss is heard too.
    next.next = null;
    next.loseDevice();
    await new Promise((done) => setTimeout(done, 0));
    expect(told).toEqual([true, false, true]);
    expect(r.renderer).toBe(next.renderer);
  });

  it('falls back to WebGL2 when no new device can be made: the node renderer’s WebGL2 back end takes the old canvas’s place and play goes on', async () => {
    const { r, node, log } = nodeRenderer();
    const told: boolean[] = [];
    r.onContextChange((lost) => told.push(lost));
    r.setRetro({ pixelSize: 4, levels: 6 });
    const firstRetro = (r as unknown as { retro: NodeRetroFilter }).retro;
    const retroFreed = vi.spyOn(firstRetro, 'dispose');
    // NodeBackend.replacement gives the WebGL2 back end when WebGPU gives no new device (nodeBackend.test.ts).
    const next = fakeNode('webgl2', log, 'webgl');
    node.next = next;
    node.loseDevice();
    await new Promise((done) => setTimeout(done, 0));
    expect(log).toEqual(['first canvas replaced by webgl2', 'first disposed']);
    expect(r.backend).toBe('webgl');
    expect(r.renderer).toBe(next.renderer);
    expect(told).toEqual([true, false]);
    // The retro filter goes with its renderer and the new one's takes its place, for the look in use; the row's note
    // says what happened.
    expect(retroFreed).toHaveBeenCalledOnce();
    const retro = (r as unknown as { retro: unknown }).retro;
    expect(retro).toBeInstanceOf(NodeRetroFilter);
    expect(retro).not.toBe(firstRetro);
    expect(r.retroPixelAngle).toBeGreaterThan(0);
    expect(r.lostToWebGL).toBe(true);
    r.render();
    expect(log.at(-1)).toBe('webgl2 draw world through retro');
  });

  it('says nothing of a fallback when a renderer that started on WebGL2 is replaced by another', async () => {
    const { r, node, log } = nodeRenderer(QUALITY.high, 'webgl');
    node.next = fakeNode('second', log, 'webgl');
    node.loseDevice();
    await new Promise((done) => setTimeout(done, 0));
    expect(r.backend).toBe('webgl');
    expect(r.lostToWebGL).toBe(false);
  });

  it('frees the node renderer with itself, and a recovery still on its way does nothing after', async () => {
    const { r, node, log } = nodeRenderer();
    node.next = fakeNode('late', log);
    node.loseDevice();
    r.dispose();
    await new Promise((done) => setTimeout(done, 0));
    expect(log).toEqual(['first disposed', 'first canvas removed', 'late disposed']);
  });

  it('tells the node renderer the quality in force with each frame and each compile, so the grass and stand-ins follow the preset (W5)', () => {
    const { r, node } = nodeRenderer(QUALITY.high);
    r.warmShaders();
    r.render();
    r.setQuality(QUALITY.low);
    r.render();
    r.setQuality(QUALITY.ultra);
    r.warmShaders();
    expect(node.qualities).toEqual([QUALITY.high, QUALITY.high, QUALITY.low, QUALITY.ultra]);
    // The preset change it rescans for (the pools and the dressing are looked for again on the next frame).
    expect(node.rescans).toBe(2);
  });
});
