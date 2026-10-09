import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RENDER_BACKEND, type RendererChoice, rendererNote, type RenderBackend, wantsWebGpu } from '../config/renderBackend';
import { QUALITY } from '../config/render';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { parseSaveText, SAVE_FORMAT, saveFileText } from '../save/saveFile';
import { loadRendererChoice } from '../ui/menus/savedChoices';
import { Renderer } from './renderer';
import { startingRenderer } from './rendererStart';
import { NodeBackend, type NodeStart } from './webgpu/nodeBackend';
import { noWebGpu, probeWebGpu } from './webgpuProbe';

/**
 * W1 QA: the adversarial pass over the WebGPU foundation. Each `it.fails` names a bug found in the change (it must be
 * flipped to `it` by the worker who fixes it); everything else here pins a guarantee the acceptance criteria rest on.
 */

/** Every non-test source file of the game, as text (Vite's raw import: the app's tsconfig has no Node types). */
const SOURCES = import.meta.glob(['../**/*.ts', '!../**/*.test.ts', '!../**/*.d.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const NODE_BACKEND = 'render/webgpu/nodeBackend.ts';

/** Each import/export statement of a file, one string apiece (a multi-line named import stays whole). */
const statements = (text: string): string[] => text.split(/^(?=import |export )/m);

describe('three/webgpu stays out of the main chunk and out of an Auto visit with no adapter (criterion 3)', () => {
  const files = Object.entries(SOURCES).map(([path, text]) => ({ rel: path.startsWith('./') ? `render/${path.slice(2)}` : path.replace(/^\.\.\//, ''), text }));

  it('scans the whole game, and its pattern does catch a static value import (a control for the checks below)', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.find((f) => f.rel === NODE_BACKEND)?.text).toMatch(/from 'three\/webgpu'/);
    const offending = "import * as THREE from 'three';\nimport {\n  WebGPURenderer,\n} from 'three/webgpu';\n";
    expect(statements(offending).some((s) => /^(import|export)\s+(?!type\b)[\s\S]*from\s+['"]three\/(webgpu|tsl)['"]/.test(s))).toBe(true);
    expect(statements("import type { WebGPURenderer } from 'three/webgpu';\n").some((s) => /^(import|export)\s+(?!type\b)[\s\S]*from\s+['"]three\/(webgpu|tsl)['"]/.test(s))).toBe(false);
  });

  it('is imported as a value only inside render/webgpu/ (types elsewhere), never by a static import of the game', () => {
    // W2: the world materials' node twins sit beside the node back end, in its chunk (render/webgpu/worldTwins.ts …).
    const offenders = files.filter(({ rel, text }) => !rel.startsWith('render/webgpu/') && statements(text).some((s) => /^(import|export)\s+(?!type\b)[\s\S]*from\s+['"]three\/(webgpu|tsl)['"]/.test(s)));
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });

  it('has render/webgpu/ imported as a value only from inside it, so only the back end\'s dynamic import reaches it (W2)', () => {
    const offenders = files.filter(({ rel, text }) => !rel.startsWith('render/webgpu/') && statements(text).some((s) => /^(import|export)\s+(?!type\b)[\s\S]*from\s+['"][^'"]*\/webgpu\/[^'"]+['"]/.test(s)));
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });

  it('has the node back end loaded only by the dynamic import in rendererStart.ts', () => {
    const offenders = files.filter(({ text }) => statements(text).some((s) => /^(import|export)\s+(?!type\b)[\s\S]*from\s+['"][^'"]*webgpu\/nodeBackend['"]/.test(s)));
    expect(offenders.map((f) => f.rel)).toEqual([]);
    const loaders = files.filter(({ text }) => /import\(\s*['"][^'"]*webgpu\/nodeBackend['"]\s*\)/.test(text));
    expect(loaders.map((f) => f.rel)).toEqual(['render/rendererStart.ts']);
  });

  it('asks the browser for an adapter only in the probe, and runs the probe only from the start (so a WebGL pick can never reach navigator.gpu)', () => {
    const touchesGpu = files.filter(({ text }) => /\bnavigator\.gpu\b|\.requestAdapter\(|\bnav\??\.gpu\b/.test(text)).map((f) => f.rel);
    expect(touchesGpu).toEqual(['render/webgpuProbe.ts']);
    const probes = files.filter(({ rel, text }) => rel !== 'render/webgpuProbe.ts' && /\bprobeWebGpu\b/.test(text)).map((f) => f.rel);
    expect(probes).toEqual(['render/rendererStart.ts']);
  });
});

describe('an explicit WebGL pick never probes or loads, whatever else is asked (criterion 2)', () => {
  it('ignores ?forceWebGL on the WebGL pick: no probe, no chunk, WebGL', async () => {
    const probe = vi.fn(() => Promise.resolve({ ...noWebGpu(), available: true }));
    const load = vi.fn(() => Promise.resolve((() => Promise.reject(new Error('never'))) as NodeStart));
    for (const force of [false, true]) {
      expect(await startingRenderer('webgl', force, true, probe, load)).toEqual({ backend: 'webgl', node: null, adapterName: '' });
    }
    expect(probe).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('on WebGPU or Auto, an adapter that is found but whose node renderer throws (a device lost at boot) falls back to WebGL quietly, keeping the adapter’s name', async () => {
    const error = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');
    for (const choice of ['auto', 'webgpu'] as const) {
      const start = await startingRenderer(choice, false, false, () => Promise.resolve({ ...noWebGpu(), available: true, name: 'qa gpu' }), () => Promise.resolve((() => Promise.reject(new Error('device lost'))) as NodeStart));
      expect(start).toEqual({ backend: 'webgl', node: null, adapterName: 'qa gpu' });
    }
    // A chunk that fails to download (offline mid-boot) is no different.
    expect((await startingRenderer('auto', false, false, () => Promise.resolve({ ...noWebGpu(), available: true }), () => Promise.reject(new Error('chunk 404')))).backend).toBe('webgl');
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('the adapter probe on the failure modes a browser really has', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('leaves no unhandled rejection when the adapter request fails after the probe gave up', async () => {
    vi.useFakeTimers();
    const unhandled = vi.fn();
    const nodeProcess = (globalThis as unknown as { process: { on(e: string, f: () => void): void; off(e: string, f: () => void): void } }).process;
    nodeProcess.on('unhandledRejection', unhandled);
    let fail: (e: Error) => void = () => undefined;
    const asked = probeWebGpu({ gpu: { requestAdapter: () => new Promise((_, reject) => (fail = reject)) } }, 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(await asked).toEqual(noWebGpu());
    fail(new Error('late'));
    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();
    nodeProcess.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('is unavailable, quietly, when the adapter is a stub with nothing the probe reads (no features, a throwing info)', async () => {
    const error = vi.spyOn(console, 'error');
    expect(await probeWebGpu({ gpu: { requestAdapter: () => Promise.resolve({} as never) } })).toEqual(noWebGpu());
    const hostile = { features: new Set<string>(), get info(): never { throw new Error('hidden'); } };
    expect(await probeWebGpu({ gpu: { requestAdapter: () => Promise.resolve(hostile) } })).toEqual(noWebGpu());
    expect(error).not.toHaveBeenCalled();
  });

  // Was a bug (low, fixed): `nav?.gpu` and the `typeof gpu.requestAdapter` check sat outside the probe's try, so a navigator
  // whose `gpu` getter throws (a locked-down embedder, a Permissions-Policy that throws instead of hiding the member)
  // rejected the probe, and with it Game.create: the game did not boot at all instead of falling back to WebGL.
  it('is unavailable, not a rejection, when reading navigator.gpu itself throws', async () => {
    const nav = {
      get gpu(): never {
        throw new Error('SecurityError');
      },
    };
    await expect(probeWebGpu(nav as never)).resolves.toEqual(noWebGpu());
  });
});

describe('the Renderer row’s note, over every combination (criterion 2)', () => {
  const picks: RendererChoice[] = ['auto', 'webgpu', 'webgl'];
  const backends: RenderBackend[] = ['webgl', 'webgpu', 'webgpu-webgl2'];

  it('says the fallback line only when WebGPU was picked, this visit loaded wanting it, and WebGL draws', () => {
    for (const picked of picks) {
      for (const started of [false, true]) {
        for (const backend of backends) {
          const note = rendererNote(picked, started, backend);
          const expectFallback = picked === 'webgpu' && started && backend === 'webgl';
          expect(note === RENDER_BACKEND.text.fallback, `${picked} started=${started} ${backend}`).toBe(expectFallback);
          // The only other thing it ever says is that the pick applies from the next load, and only when the pick changes what draws.
          if (!expectFallback) expect([ '', RENDER_BACKEND.text.pending ]).toContain(note);
        }
      }
    }
  });

  it('says nothing for the picks that need no explanation: Auto without an adapter, WebGL on WebGL, the node renderer picked and running', () => {
    expect(rendererNote('auto', true, 'webgl')).toBe('');
    expect(rendererNote('webgl', false, 'webgl')).toBe('');
    expect(rendererNote('webgpu', true, 'webgpu')).toBe('');
    expect(rendererNote('webgpu', true, 'webgpu-webgl2')).toBe('');
    expect(rendererNote('auto', true, 'webgpu')).toBe('');
  });

  it('says a mid-session change applies from the next load: the visit never swaps live (WebGL picked while the node renderer runs, and the other way)', () => {
    expect(rendererNote('webgl', true, 'webgpu')).toBe(RENDER_BACKEND.text.pending);
    expect(rendererNote('webgl', true, 'webgpu-webgl2')).toBe(RENDER_BACKEND.text.pending);
    expect(rendererNote('webgpu', false, 'webgl')).toBe(RENDER_BACKEND.text.pending);
    expect(rendererNote('auto', false, 'webgl')).toBe(RENDER_BACKEND.text.pending);
    // Put back to what the visit started with, the line goes.
    expect(rendererNote('auto', true, 'webgpu')).toBe('');
    expect(wantsWebGpu('auto')).toBe(true);
  });
});

describe('the saved key `renderer` through a save file (criterion 1)', () => {
  it('survives a save file round trip (export, parse, load) for every pick, and a file written without it loads as Auto', () => {
    const load = (settings: Record<string, unknown>): RendererChoice => {
      const file = saveFileText({ format: SAVE_FORMAT, build: 'qa', savedAt: '2026-10-08T12:00:00.000Z', stores: { settings: { version: SETTINGS_VERSION, ...settings } } });
      const parsed = parseSaveText(file);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return 'auto';
      const items = new Map([[SETTINGS_KEY, JSON.stringify(parsed.save.stores.settings)]]);
      return loadRendererChoice({ getItem: (k: string) => items.get(k) ?? null } as unknown as Storage);
    };
    for (const id of ['auto', 'webgpu', 'webgl'] as const) expect(load({ renderer: id })).toBe(id);
    expect(load({ quality: 'high' })).toBe('auto');
  });
});

/** A canvas as much as the node renderer's constructor touches. */
function fakeCanvas(): HTMLCanvasElement {
  return { style: {}, width: 300, height: 150, className: '', addEventListener: () => undefined, removeEventListener: () => undefined, replaceWith: () => undefined, remove: () => undefined, getContext: () => null } as unknown as HTMLCanvasElement;
}

/** A node back end as the Renderer sees it (render/rendererNode.test.ts has the same stand-in). */
function fakeNode(name: string, log: string[]) {
  const canvas = {
    className: '',
    replaceWith: (next: { name: string }) => void log.push(`${name} canvas replaced by ${next.name}`),
    remove: () => void log.push(`${name} canvas removed`),
    removeEventListener: () => undefined,
    name,
  };
  let listener: (() => void) | null = null;
  const renderer = {
    isWebGPURenderer: true,
    domElement: canvas,
    info: { autoReset: true, reset: () => undefined, render: { calls: 0, drawCalls: 0, triangles: 0 }, memory: { programs: 0, geometries: 0, textures: 0 } },
    shadowMap: { enabled: false, type: 0 },
    autoClear: true,
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: '',
    samples: 4,
    getPixelRatio: () => 1,
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    setRenderTarget: () => undefined,
    clearDepth: () => undefined,
    render: (scene: THREE.Scene) => void log.push(`${name} render ${scene.name}`),
    initTexture: () => undefined,
  };
  const node = {
    kind: 'webgpu' as const,
    renderer,
    lost: false,
    gpuMs: Number.NaN,
    antialiased: true,
    maxAnisotropy: 16,
    timestamps: false,
    next: null as unknown,
    onLost: (l: () => void) => {
      listener = l;
    },
    setTiming: () => undefined,
    frameDone: () => undefined,
    compile: () => undefined,
    replacement: () => Promise.resolve(node.next),
    dispose: () => void log.push(`${name} disposed`),
    loseDevice: () => {
      node.lost = true;
      listener?.();
    },
  };
  return node;
}

function renderer(first: ReturnType<typeof fakeNode>): Renderer {
  vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 });
  const r = new Renderer({ appendChild: () => undefined, clientWidth: 1280, clientHeight: 720 } as unknown as HTMLElement, QUALITY.low, first as unknown as NodeBackend);
  r.scene.name = 'world';
  return r;
}

describe('device-lost recovery on the node path (criterion 4)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Was a bug (medium, fixed: Renderer.hear checks `node.lost` once the node is adopted): a device lost between
  // NodeBackend.make() resolving and the Renderer being built was never recovered.
  // Game.create awaits `startingRenderer` inside a Promise.all with Rapier's 4 MB wasm, the figure model and the baked
  // light, so the node renderer can sit made-but-unused for seconds. NodeBackend sets `lost = true` and calls its (still
  // empty) listener; Renderer's constructor then hands `adoptNode` -> `node.onLost(nodeLost)` a node that is already
  // lost: nothing tells it, `recoverNode` would find no `this.node` yet (the DrawingDevice is not built inside the
  // constructor) and returns, and `render()` returns early on `node.lost` for ever: a black canvas, no graphics notice, no
  // fallback to WebGL. The Renderer must notice a node that arrives lost and recover. Real NodeBackend, Three's own
  // WebGPURenderer with only `init` and `dispose` (which reach the GPU) stood in for.
  /** Real NodeBackends (Three's own WebGPURenderer, with only `init` and `dispose`, which reach the GPU, stood in for). */
  async function realNode() {
    vi.useFakeTimers();
    vi.stubGlobal('document', { createElementNS: () => fakeCanvas() });
    vi.spyOn(WebGPURenderer.prototype, 'init').mockImplementation(async function (this: WebGPURenderer) {
      return this;
    });
    vi.spyOn(WebGPURenderer.prototype, 'hasFeature').mockReturnValue(false);
    vi.spyOn(WebGPURenderer.prototype, 'dispose').mockResolvedValue(undefined);
    return NodeBackend.make({ antialias: false, forceWebGL: true });
  }
  const lose = (node: NodeBackend): void => node.renderer.onDeviceLost({ api: 'WebGPU', message: 'gone', reason: 'unknown', originalEvent: null });

  it('recovers a real node back end lost after the Renderer was built (the control for the next test): a new renderer takes over and the pause is told', async () => {
    const first = await realNode();
    const r = renderer(first as unknown as ReturnType<typeof fakeNode>);
    const told: boolean[] = [];
    r.onContextChange((l) => told.push(l));
    lose(first);
    expect(told).toEqual([true]);
    await vi.advanceTimersByTimeAsync(RENDER_BACKEND.recoverDelayMs + 10);
    expect(r.renderer === first.renderer).toBe(false);
    expect(told).toEqual([true, false]);
  });

  it('recovers a real node back end whose device was lost before the Renderer was built: a new one takes over, and the pause is told', async () => {
    const first = await realNode();
    // The loss comes while the game is still waiting for physics: Three calls the renderer's own hook.
    lose(first);
    expect(first.lost).toBe(true);
    const r = renderer(first as unknown as ReturnType<typeof fakeNode>);
    const told: boolean[] = [];
    r.onContextChange((l) => told.push(l));
    await vi.advanceTimersByTimeAsync(RENDER_BACKEND.recoverDelayMs + 10);
    expect(r.renderer === first.renderer).toBe(false);
    expect(told.at(-1)).toBe(false);
  });

  it('frees every node renderer exactly once across swaps: the lost one at hand-over, the replacement with the Renderer, the canvases off the page', async () => {
    const log: string[] = [];
    const first = fakeNode('first', log);
    const second = fakeNode('second', log);
    const third = fakeNode('third', log);
    first.next = second;
    second.next = third;
    const r = renderer(first);
    first.loseDevice();
    await new Promise((done) => setTimeout(done, 0));
    second.loseDevice();
    await new Promise((done) => setTimeout(done, 0));
    expect(r.renderer).toBe(third.renderer);
    r.dispose();
    const disposed = log.filter((l) => l.endsWith('disposed'));
    expect(disposed.sort()).toEqual(['first disposed', 'second disposed', 'third disposed']);
    expect(log.filter((l) => l.endsWith('canvas removed'))).toEqual(['third canvas removed']);
  });

  it('draws nothing for a lost device and does not read GPU time from it', () => {
    const log: string[] = [];
    const first = fakeNode('first', log);
    const frames = vi.spyOn(first, 'frameDone');
    const r = renderer(first);
    first.loseDevice();
    r.gpuTiming = true;
    r.render();
    r.render();
    expect(log).toEqual([]);
    expect(frames).not.toHaveBeenCalled();
  });
});
