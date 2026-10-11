import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIGHTING_PRESETS, QUALITY, type QualitySettings } from '../config/render';
import { Renderer } from './renderer';
import type { NodeBackend } from './webgpu/nodeBackend';
import { CompileGate } from './webgpu/post/nodeKit';
import { DirectOutput } from './webgpu/post/nodeOutput';
import { NodePostStack } from './webgpu/post/nodePostStack';
import { NodeRetroFilter } from './webgpu/post/nodeRetro';

/**
 * W4 QA, at the Renderer: the node targets freed on a preset change, a map change and a lost device, and what the
 * main chunk holds of the retro filter and the node path.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the Renderer's fields are private; the tests read them. */

const later = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

/** Every render target held below `root` (own properties, arrays and maps). */
function targetsOf(root: unknown): Set<THREE.RenderTarget> {
  const found = new Set<THREE.RenderTarget>();
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): void => {
    if (!v || typeof v !== 'object' || seen.has(v) || depth > 7 || v instanceof THREE.Object3D) return;
    seen.add(v);
    if (v instanceof THREE.RenderTarget) found.add(v);
    for (const c of Array.isArray(v) ? v : v instanceof Map ? [...v.values()] : Object.values(v)) walk(c, depth + 1);
  };
  walk(root, 0);
  return found;
}

/** Counts each target's dispose events (the node renderer frees a target's GPU side on that event). */
function watch(targets: Iterable<THREE.RenderTarget>): Map<THREE.RenderTarget, number> {
  const counts = new Map<THREE.RenderTarget, number>();
  for (const t of targets) {
    counts.set(t, 0);
    t.addEventListener('dispose', () => counts.set(t, counts.get(t)! + 1));
  }
  return counts;
}

const allFreed = (counts: Map<THREE.RenderTarget, number>): boolean => counts.size > 0 && [...counts.values()].every((n) => n > 0);

/** A node back end as the Renderer sees it, making the real stacks and retro filters (the draws are not made). */
function fakeNode(name: string) {
  let lostListener: () => void = () => undefined;
  const canvas = { className: '', replaceWith: () => undefined, remove: () => undefined, removeEventListener: () => undefined, name };
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
    render: () => undefined,
    initTexture: () => undefined,
  };
  const node = {
    kind: 'webgpu' as const,
    renderer,
    lost: false,
    gpuMs: 0,
    antialiased: true,
    maxAnisotropy: 16,
    timestamps: false,
    samples: 4,
    pictureRenderer: { name: `${name} pictures` },
    get stats() {
      return { calls: 0, triangles: 0, dressingTriangles: 0, programs: 0, geometries: 0, textures: 0 };
    },
    next: null as unknown,
    stacks: [] as NodePostStack[],
    retros: [] as NodeRetroFilter[],
    onLost: (listener: () => void) => void (lostListener = listener),
    setTiming: () => undefined,
    frameDone: () => undefined,
    output: new DirectOutput(),
    gate: new CompileGate(),
    postStack: (setup: ConstructorParameters<typeof NodePostStack>[0], width: number, height: number) => {
      const stack = new NodePostStack(setup, width, height, node.output, node.gate);
      node.stacks.push(stack);
      return stack;
    },
    retro: (look: ConstructorParameters<typeof NodeRetroFilter>[0]) => {
      const retro = new NodeRetroFilter(look, node.gate);
      node.retros.push(retro);
      return retro;
    },
    draw: () => undefined,
    compile: () => undefined,
    rescan: () => undefined,
    prepare: () => undefined,
    sky: new THREE.Texture(),
    environment: (on: boolean) => (on ? node.sky : null),
    trimSky: () => undefined,
    clustered: true,
    replacement: () => Promise.resolve(node.next),
    dispose: () => undefined,
    loseDevice: () => {
      node.lost = true;
      lostListener();
    },
  };
  return node;
}

function nodeRenderer(quality: QualitySettings) {
  vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 });
  const node = fakeNode('first');
  const r = new Renderer({ appendChild: () => undefined, clientWidth: 1280, clientHeight: 720 } as unknown as HTMLElement, quality, node as unknown as NodeBackend);
  r.scene.name = 'world';
  return { r, node };
}

describe('the node targets are freed on a preset change, a map change and a lost device (W4 criterion 4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('a preset change frees every target of the stack it leaves, and the next frame makes the new preset’s', () => {
    const { r, node } = nodeRenderer(QUALITY.ultra);
    r.render();
    const [ultra] = node.stacks as [NodePostStack];
    const old = watch(targetsOf(ultra));
    expect(old.size).toBeGreaterThan(8);
    r.setQuality(QUALITY.high);
    expect(allFreed(old), 'Ultra → High').toBe(true);
    r.render();
    expect(node.stacks).toHaveLength(2);
    expect(r.postPasses).toEqual(['ao', 'lightShafts', 'taa', 'bloom', 'output']);
    const high = watch(targetsOf(node.stacks[1]));
    // Low has no stack at all: the High stack's targets go and none is made.
    r.setQuality(QUALITY.low);
    expect(allFreed(high), 'High → Low').toBe(true);
    r.render();
    expect(node.stacks).toHaveLength(2);
    expect(r.postPasses).toEqual([]);
  });

  it('a map change frees the stack’s targets (its history and reflective stand-ins belong to the map)', () => {
    const { r, node } = nodeRenderer(QUALITY.ultra);
    r.render();
    const old = watch(targetsOf(node.stacks[0]));
    r.setLighting(LIGHTING_PRESETS.night);
    expect(allFreed(old)).toBe(true);
    r.render();
    expect(node.stacks).toHaveLength(2);
    expect(node.stacks[1]).not.toBe(node.stacks[0]);
  });

  it('a lost device frees the stack’s targets, and the replacement renderer makes its own stack', async () => {
    const { r, node } = nodeRenderer(QUALITY.ultra);
    r.render();
    const old = watch(targetsOf(node.stacks[0]));
    const dropped = vi.spyOn(node.stacks[0]!, 'dispose');
    const next = fakeNode('second');
    node.next = next;
    node.loseDevice();
    await later();
    expect(dropped).toHaveBeenCalledOnce();
    expect(allFreed(old)).toBe(true);
    r.render();
    expect(next.stacks).toHaveLength(1);
    expect(node.stacks).toHaveLength(1);
  });

  it('a lost device frees the retro filter’s target, and the replacement renderer makes its own, for the look in use', async () => {
    const { r, node } = nodeRenderer(QUALITY.high);
    r.setRetro({ pixelSize: 4, levels: 6 });
    const old = watch(targetsOf(node.retros[0]));
    expect(old.size).toBe(1);
    const next = fakeNode('second');
    node.next = next;
    node.loseDevice();
    await later();
    expect(allFreed(old)).toBe(true);
    expect(next.retros).toHaveLength(1);
    expect(next.retros[0]!.renderTarget.width).toBe(Math.ceil(r.width / 4));
  });

  it('turning the retro filter on frees the stack it replaces, and turning it off frees the filter', () => {
    const { r, node } = nodeRenderer(QUALITY.ultra);
    r.render();
    const stack = watch(targetsOf(node.stacks[0]));
    r.setRetro({ pixelSize: 4, levels: 6 });
    expect(allFreed(stack)).toBe(true);
    const retro = watch(targetsOf(node.retros[0]));
    r.setRetro(null);
    expect(allFreed(retro)).toBe(true);
    r.render();
    expect(node.stacks).toHaveLength(2);
  });

  it('a stack dropped while the renderer still compiles frees its targets once the compile has finished, not before', async () => {
    const { r, node } = nodeRenderer(QUALITY.high);
    r.render();
    const stack = node.stacks[0]!;
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => (finish = resolve));
    node.gate.track(pending);
    const counts = watch(targetsOf(stack));
    r.setQuality(QUALITY.medium);
    await later();
    expect([...counts.values()].some((n) => n > 0), 'nothing is freed under the compile').toBe(false);
    finish();
    await later();
    expect(allFreed(counts)).toBe(true);
  });
});

describe('what the main chunk holds of the retro filter (W4 criterion 2)', () => {
  const sources = import.meta.glob<string>(['/src/**/*.ts', '!/src/**/*.test.ts', '!/src/**/*.d.ts'], { query: '?raw', import: 'default', eager: true });
  const statements = (text: string): string[] => text.split(/^(?=import |export )/m);

  it('keeps the target and the material out of the module the Renderer imports (render/retroFilter.ts is the maths and the type)', () => {
    const main = sources['/src/render/retroFilter.ts']!;
    expect(main).not.toMatch(/from\s+['"]three/);
    expect(main).not.toMatch(/ShaderMaterial|RenderTarget|gl_FragColor|\/\* glsl \*\//);
    // WebGL's own filter went with its renderer (W6a): the node path's (render/webgpu/post/nodeRetro.ts) is the one.
    expect(Object.keys(sources).filter((f) => /retroFilterWebGL/.test(f))).toEqual([]);
  });

  it('has nothing of the node path in the modules the main chunk is made of but the lazy back end’s type', () => {
    const outside = Object.entries(sources).filter(([f]) => !f.startsWith('/src/render/webgpu/'));
    const reaching = outside.filter(([, text]) => statements(text).some((s) => /from\s+['"][^'"]*webgpu\/[^'"]+['"]/.test(s) && !/^import type\b/.test(s)));
    expect(reaching.map(([f]) => f)).toEqual([]);
    // Not even an inline `type` list: `import { type X } from …` may be kept as an import of the module (verbatimModuleSyntax).
    const inline = outside.filter(([, text]) => statements(text).some((s) => /^import\s*\{[^}]*\btype\b[^}]*\}\s*from\s+['"][^'"]*(webgpu\/|three\/(tsl|webgpu))/.test(s)));
    expect(inline.map(([f]) => f)).toEqual([]);
  });
});
