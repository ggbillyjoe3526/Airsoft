import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../../config/post';
import { QUALITY, type QualityPreset } from '../../../config/render';
import { PostStack } from '../../post/postStack';
import { RetroFilter } from '../../retroFilterWebGL';
import { CompileGate, type NodeRenderer } from './nodeKit';
import { DirectOutput, directTarget } from './nodeOutput';
import { NodePostStack } from './nodePostStack';
import { NodeRetroFilter } from './nodeRetro';

/**
 * W4 QA: what nodePost.test.ts leaves open. Each node pass against its WebGL pass on every preset (the uniforms they are
 * fed, and the config numbers they read), the compile gate's ordering, the targets freed on a resize, the passes'
 * allocation per frame, the late haze, and the node path's imports.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the passes' fields are private; the tests read them. */

interface Quiet {
  gl: any;
  /** The draws since the last call, as `what into` (only kept when asked: the allocation tests keep none). */
  draws: string[];
}

/** A stand-in renderer that logs nothing unless `keep` (the stack calls the same methods on either renderer). */
function quietRenderer(keep = false): Quiet {
  let target: THREE.RenderTarget | null = null;
  const draws: string[] = [];
  const gl = {
    autoClear: true,
    toneMapping: THREE.NeutralToneMapping as THREE.ToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace as string,
    coordinateSystem: THREE.WebGLCoordinateSystem,
    samples: 4,
    contextNode: { context: (extra: unknown) => ({ extra }) },
    setRenderTarget: (t: THREE.RenderTarget | null) => void (target = t),
    getRenderTarget: () => target,
    getClearColor: (c: THREE.Color) => c,
    getClearAlpha: () => 1,
    setClearColor: () => undefined,
    clear: () => undefined,
    clearDepth: () => undefined,
    render: (o: THREE.Object3D) => {
      if (keep) draws.push(`${o instanceof THREE.Scene ? 'scene' : 'quad'} ${target ? `${target.width}x${target.height}` : 'screen'}`);
    },
  };
  return { gl, draws };
}

const setup = (preset: QualityPreset) => ({ quality: QUALITY[preset], halfFloat: true });

/** A camera with a view of its own (not the identity), looking at the sun used below. */
function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
  c.position.set(2, 1.7, -3);
  c.rotation.y = 0.2;
  return c;
}
/** The same move for both cameras between frames, so the temporal passes have motion to reproject. */
function nudge(c: THREE.PerspectiveCamera, frame: number): void {
  c.position.x += 0.15 * (frame + 1);
  c.rotation.y -= 0.01;
}
const SUN = new THREE.Vector3(0.2, 0.1, -1);

const numbers = (v: unknown): number[] =>
  v instanceof THREE.Matrix4 ? [...v.elements] : v instanceof THREE.Vector2 ? v.toArray() : typeof v === 'number' ? [v] : (() => { throw new Error(`not a uniform value: ${String(v)}`); })();

const passOf = (stack: unknown, id: string): any => (stack as { passes: { id: string }[] }).passes.find((p) => p.id === id);

describe('each node pass is fed what its WebGL pass is, on every preset, frame after frame (W4 criterion 4)', () => {
  for (const preset of ['high', 'ultra'] as const) {
    for (const night of [false, true]) {
      it(`${preset} by ${night ? 'night' : 'day'}: the same matrices, jitter, texel and sun on the same camera`, () => {
        const a = new PostStack(setup(preset), 96, 54);
        const b = new NodePostStack(setup(preset), 96, 54, new DirectOutput());
        a.setLight(SUN, night);
        b.setLight(SUN, night);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
        mesh.updateMatrixWorld();
        if (a.wantsReflective) {
          a.setReflectiveSurfaces([{ mesh, strength: 0.6 }]);
          b.setReflectiveSurfaces([{ mesh, strength: 0.6 }]);
        }
        const ca = camera();
        const cb = camera();
        const wa = quietRenderer();
        const wb = quietRenderer();
        const seen = new Set<string>();
        const same = (what: string, node: unknown, webgl: unknown): void => {
          seen.add(what);
          expect(numbers(node), `${preset} ${what}`).toEqual(numbers(webgl));
        };
        for (let frame = 0; frame < 3; frame++) {
          nudge(ca, frame);
          nudge(cb, frame);
          a.render(wa.gl, new THREE.Scene(), ca);
          b.draw(wb.gl as NodeRenderer, new THREE.Scene(), cb);

          const ao = passOf(b, 'ao');
          const ga = passOf(a, 'ao');
          same('ao projection', ao.u.projection.value, ga.gtao.uniforms.cameraProjectionMatrix.value);
          same('ao inverse projection', ao.u.inverseProjection.value, ga.gtao.uniforms.cameraProjectionMatrixInverse.value);
          same('ao inverse projection (denoise)', ao.u.inverseProjection.value, ga.denoise.uniforms.cameraProjectionMatrixInverse.value);
          same('ao resolution', ao.u.resolution.value, ga.gtao.uniforms.resolution.value);
          same('ao resolution (denoise)', ao.u.resolution.value, ga.denoise.uniforms.resolution.value);

          const taa = passOf(b, 'taa').u;
          const gt = passOf(a, 'taa').resolve.uniforms;
          same('taa inverse view-projection', taa.inverseViewProjection.value, gt.inverseViewProjection.value);
          same('taa previous view-projection', taa.previousViewProjection.value, gt.previousViewProjection.value);
          same('taa jitter', taa.jitter.value, gt.jitter.value);
          same('taa previous jitter', taa.previousJitter.value, gt.previousJitter.value);
          same('taa texel', taa.texel.value, gt.texel.value);
          same('taa has history', taa.hasHistory.value, gt.hasHistory.value);
          expect(taa.hasHistory.value, 'the first frame has no history').toBe(frame === 0 ? 0 : 1);

          const shafts = passOf(b, 'lightShafts').u;
          const gs = passOf(a, 'lightShafts');
          same('shafts sun', shafts.sun.value, gs.maskMaterial.uniforms.sun.value);
          same('shafts aspect', shafts.aspect.value, gs.maskMaterial.uniforms.aspect.value);
          same('shafts near', shafts.near.value, gs.maskMaterial.uniforms.near.value);
          same('shafts far', shafts.far.value, gs.maskMaterial.uniforms.far.value);
          same('shafts strength', shafts.strength.value, gs.addMaterial.uniforms.strength.value);
          // The sun is in view, so the shafts really drew (a pass that skipped would match by leaving its uniforms be).
          expect(shafts.strength.value, 'shafts drawn').toBeGreaterThan(0);

          if (preset === 'ultra') {
            same('lens seed', passOf(b, 'lens').seed.value, passOf(a, 'lens').material.uniforms.seed.value);
            const refl = passOf(b, 'reflections').u;
            const gr = passOf(a, 'reflections').trace.uniforms;
            same('reflections projection', refl.projection.value, gr.projection.value);
            same('reflections inverse projection', refl.inverseProjection.value, gr.inverseProjection.value);
          }
        }
        // The check ran on every quantity it names (a missing pass would throw above; this pins the list's length).
        expect(seen.size).toBe(preset === 'ultra' ? 19 : 16);
        // The night's strength is the moon's, the day's the sun's (POST.lightShafts.strength), times the fade.
        const strength = passOf(b, 'lightShafts').u.strength.value;
        expect(strength).toBeLessThanOrEqual(night ? POST.lightShafts.strength.night : POST.lightShafts.strength.day);
        a.dispose();
        b.dispose();
      });
    }
  }

  it('grains the lens at the same seed as WebGL’s every frame, and wraps at the same cycle', () => {
    const a = new PostStack(setup('ultra'), 64, 36);
    const b = new NodePostStack(setup('ultra'), 64, 36, new DirectOutput());
    const wa = quietRenderer();
    const wb = quietRenderer();
    const ca = camera();
    const cb = camera();
    const seeds: number[] = [];
    for (let frame = 0; frame < POST.lens.grainCycle + 3; frame++) {
      a.render(wa.gl, new THREE.Scene(), ca);
      b.draw(wb.gl as NodeRenderer, new THREE.Scene(), cb);
      const node = passOf(b, 'lens').seed.value as number;
      expect(node, `frame ${frame}`).toBe(passOf(a, 'lens').material.uniforms.seed.value);
      seeds.push(node);
    }
    expect(seeds[1]).toBe(POST.lens.grainStride);
    expect(seeds[POST.lens.grainCycle]).toBe(0);
    a.dispose();
    b.dispose();
  });
});

/** Every number of POST that `fn` reads, as dotted paths: the config's sections are swapped for recording getters meanwhile. */
function readsOf(fn: () => void): Set<string> {
  const reads = new Set<string>();
  const undo: (() => void)[] = [];
  const wrap = (obj: Record<string, unknown>, path: string): void => {
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      const here = path ? `${path}.${key}` : key;
      Object.defineProperty(obj, key, {
        configurable: true,
        enumerable: true,
        get: () => (reads.add(here), value),
      });
      undo.push(() => Object.defineProperty(obj, key, { configurable: true, enumerable: true, writable: true, value }));
      if (value && typeof value === 'object' && !Array.isArray(value)) wrap(value as Record<string, unknown>, here);
    }
  };
  wrap(POST as unknown as Record<string, unknown>, '');
  try {
    fn();
  } finally {
    for (const f of undo.reverse()) f();
  }
  return reads;
}

const NODE_SOURCES = import.meta.glob<string>(['/src/render/webgpu/post/node*.ts', '!/src/render/webgpu/post/*.test.ts'], { query: '?raw', import: 'default', eager: true });

/** The config paths a source names: `POST.lens.fringe`, or through an alias (`const C = POST.ao; … C.radius`, `const d = C.denoise`). */
function namedConfig(text: string): Set<string> {
  const alias = new Map<string, string>([['POST', '']]);
  for (const m of text.matchAll(/const (\w+) = (\w+)((?:\.\w+)+);/g)) {
    const root = alias.get(m[2]!);
    if (root !== undefined) alias.set(m[1]!, `${root}${m[3]}`);
  }
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(\w+)((?:\.\w+)+)/g)) {
    const root = alias.get(m[1]!);
    if (root === undefined) continue;
    const parts = `${root}${m[2]}`.split('.').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('.'));
  }
  return out;
}

describe('the node passes read the config numbers WebGL’s read (W4 criterion 4)', () => {
  it('finds, for every number the WebGL stack takes from POST, the node stack taking it too', () => {
    // Ultra has every pass; a day frame and a night one reach both of the shafts' strengths.
    const drive = (make: () => { setLight(s: THREE.Vector3, n: boolean): void }, draw: (stack: any, c: THREE.PerspectiveCamera) => void): void => {
      const stack = make();
      const c = camera();
      for (const night of [false, true]) {
        stack.setLight(SUN, night);
        draw(stack, c);
        draw(stack, c);
      }
      (stack as unknown as { dispose(): void }).dispose();
    };
    const webgl = readsOf(() => drive(() => new PostStack(setup('ultra'), 64, 36), (s, c) => s.render(quietRenderer().gl, new THREE.Scene(), c)));
    const node = readsOf(() => drive(() => new NodePostStack(setup('ultra'), 64, 36, new DirectOutput()), (s, c) => s.draw(quietRenderer().gl, new THREE.Scene(), c)));
    for (const text of Object.values(NODE_SOURCES)) for (const path of namedConfig(text)) node.add(path);
    const isNumber = (path: string): boolean => typeof path.split('.').reduce((o: any, k) => o?.[k], POST) === 'number';
    const taken = [...webgl].filter(isNumber).sort();
    // A control: the stacks read the numbers the passes are built on, so the comparison below has something to compare.
    expect(taken).toEqual(expect.arrayContaining(['ao.radius', 'ao.denoise.lumaPhi', 'bloom.threshold', 'taa.history', 'taa.sharpen', 'lightShafts.decay', 'lightShafts.strength.night', 'lightShafts.strength.day', 'lens.fringe', 'lens.grain', 'lens.grainStride']));
    expect(taken.length).toBeGreaterThan(30);
    expect(taken.filter((p) => !node.has(p))).toEqual([]);
  });

  it('finds the reflections’ numbers the same way (their pass draws only with a reflective mesh)', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
    const webgl = readsOf(() => {
      const s = new PostStack(setup('ultra'), 64, 36);
      s.setReflectiveSurfaces([{ mesh, strength: 0.6 }]);
      s.render(quietRenderer().gl, new THREE.Scene(), camera());
      s.dispose();
    });
    const named = new Set([...Object.values(NODE_SOURCES)].flatMap((t) => [...namedConfig(t)]));
    const reflective = ['steps', 'maxDistance', 'thickness', 'refine', 'edgeFade', 'fresnelBase'].map((k) => `reflections.${k}`);
    // The WebGL pass takes its ray-walk numbers into its GLSL when it is made, so they are read there.
    expect(reflective.filter((p) => !webgl.has(p))).toEqual([]);
    expect(reflective.filter((p) => !named.has(p))).toEqual([]);
  });

  it('is able to tell: a source that leaves out a number is found', () => {
    expect(namedConfig('const C = POST.ao;\nconst d = C.denoise;\nuse(C.radius, d.lumaPhi, POST.lens.grain);')).toEqual(new Set(['ao', 'ao.radius', 'ao.denoise', 'ao.denoise.lumaPhi', 'lens', 'lens.grain']));
  });
});

describe('the compile gate orders every free after the compiles under way (W4 criterion 4)', () => {
  const later = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  /** A compile that settles when told. */
  function deferred() {
    let done: () => void = () => undefined;
    let fail: (e: Error) => void = () => undefined;
    const promise = new Promise<void>((resolve, reject) => {
      done = resolve;
      fail = reject;
    });
    return { promise, done, fail };
  }

  it('frees at once, in the same call, when no compile is under way', () => {
    const gate = new CompileGate();
    const freed: string[] = [];
    gate.afterCompiles(() => freed.push('a'));
    expect(freed).toEqual(['a']);
    expect(gate.busy).toBe(false);
  });

  it('holds a free until the compile has settled, frees it once, and is idle again', async () => {
    const gate = new CompileGate();
    const compile = deferred();
    gate.track(compile.promise);
    expect(gate.busy).toBe(true);
    const freed: string[] = [];
    gate.afterCompiles(() => freed.push('a'));
    await later();
    expect(freed).toEqual([]);
    compile.done();
    await later();
    expect(freed).toEqual(['a']);
    expect(gate.busy).toBe(false);
    await later();
    expect(freed).toEqual(['a']);
  });

  it('waits for all of several compiles, not the first to settle', async () => {
    const gate = new CompileGate();
    const [one, two] = [deferred(), deferred()];
    gate.track(one.promise);
    gate.track(two.promise);
    const freed: string[] = [];
    gate.afterCompiles(() => freed.push('a'));
    one.done();
    await later();
    expect(freed).toEqual([]);
    two.done();
    await later();
    expect(freed).toEqual(['a']);
  });

  it('waits for a compile that begins while it waits (a map change during a quality change’s warm-up)', async () => {
    const gate = new CompileGate();
    const first = deferred();
    gate.track(first.promise);
    const freed: string[] = [];
    gate.afterCompiles(() => freed.push('a'));
    const second = deferred();
    first.done();
    // The second begins before the first's wake-up runs.
    gate.track(second.promise);
    await later();
    expect(freed).toEqual([]);
    second.done();
    await later();
    expect(freed).toEqual(['a']);
  });

  it('frees in the order asked, and frees a compile that failed (a lost device) without hiding the failure from the caller', async () => {
    const gate = new CompileGate();
    const compile = deferred();
    const seen = gate.track(compile.promise);
    const freed: string[] = [];
    gate.afterCompiles(() => freed.push('stack'));
    gate.afterCompiles(() => freed.push('retro'));
    const failure = new Error('device lost');
    compile.fail(failure);
    await expect(seen).rejects.toBe(failure);
    await later();
    expect(freed).toEqual(['stack', 'retro']);
    expect(gate.busy).toBe(false);
  });

  it('is one gate for the stacks and retro filters of a renderer, and a stack made with none has its own', async () => {
    const compile = deferred();
    const gate = new CompileGate();
    gate.track(compile.promise);
    const shared = new NodePostStack(setup('high'), 64, 36, new DirectOutput(), gate);
    const alone = new NodePostStack(setup('high'), 64, 36, new DirectOutput());
    const freed = new Set<unknown>();
    vi.spyOn(THREE.RenderTarget.prototype, 'dispose').mockImplementation(function (this: unknown) {
      freed.add(this);
    });
    shared.dispose();
    alone.dispose();
    expect(freed.has(shared.sceneTarget)).toBe(false);
    expect(freed.has(alone.sceneTarget)).toBe(true);
    compile.done();
    await later();
    expect(freed.has(shared.sceneTarget)).toBe(true);
    vi.restoreAllMocks();
  });
});

/** A listener on each of `targets`' dispose events, counting. */
function watch(targets: Iterable<THREE.RenderTarget>): Map<THREE.RenderTarget, number> {
  const counts = new Map<THREE.RenderTarget, number>();
  for (const t of targets) {
    counts.set(t, 0);
    t.addEventListener('dispose', () => counts.set(t, counts.get(t)! + 1));
  }
  return counts;
}

/** Every render target held below `root`, found through own properties (the passes' fields are private). */
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

describe('the node targets are freed on a resize (W4 criterion 4)', () => {
  for (const preset of ['medium', 'high', 'ultra'] as const) {
    it(`${preset}: every target of the stack, the held replica’s too, is freed when the buffer changes size, and none when it does not`, () => {
      const b = new NodePostStack(setup(preset), 64, 36, new DirectOutput());
      const { gl } = quietRenderer();
      b.setLight(SUN, false);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
      b.setReflectiveSurfaces([{ mesh, strength: 0.6 }]);
      b.draw(gl as NodeRenderer, new THREE.Scene(), camera(), { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() });
      const all = targetsOf(b);
      // Scene, two ping-pong targets (the copy and the passes' hand-offs), the held replica's and each pass's own.
      expect(all.size).toBeGreaterThan(preset === 'medium' ? 10 : 8);
      const counts = watch(all);
      b.setSize(64, 36);
      expect([...counts.values()].every((n) => n === 0), 'the same size frees nothing').toBe(true);
      b.setSize(201, 99);
      for (const [t, n] of counts) expect(n, `a ${t.width}x${t.height} target left at the old size`).toBeGreaterThan(0);
      b.dispose();
    });
  }

  it('the retro filter’s target is freed when the page changes size or the look changes pixel size, not otherwise', () => {
    const f = new NodeRetroFilter({ pixelSize: 4, levels: 6 });
    f.resize(1280, 720, 1);
    const counts = watch([f.renderTarget]);
    f.resize(1280, 720, 2);
    expect(counts.get(f.renderTarget), 'a new pixel ratio keeps the target (the same retro pixels cover the page)').toBe(0);
    f.resize(1000, 700, 1);
    expect(counts.get(f.renderTarget)).toBe(1);
    f.setLook({ pixelSize: 8, levels: 6 });
    f.resize(1000, 700, 1);
    expect(counts.get(f.renderTarget)).toBe(2);
    expect([f.renderTarget.width, f.renderTarget.height]).toEqual([125, 88]);
    f.dispose();
  });

  it('WebGL’s own retro filter is sized the same way, for the pair to be the same picture', () => {
    const a = new RetroFilter({ pixelSize: 8, levels: 6 }, true);
    const b = new NodeRetroFilter({ pixelSize: 8, levels: 6 });
    a.resize(1000, 700, 1);
    b.resize(1000, 700, 1);
    expect([b.renderTarget.width, b.renderTarget.height]).toEqual([a.renderTarget.width, a.renderTarget.height]);
    a.dispose();
    b.dispose();
  });
});

describe('the node passes allocate nothing per frame (W4 criterion 4)', () => {
  const loadNode = (name: string): Promise<unknown> => import(/* @vite-ignore */ `node:${name}`);
  interface Session {
    connect(): void;
    disconnect(): void;
    post(method: string, params: unknown, done: (error: Error | null, result?: any) => void): void;
  }
  /**
   * Bytes `step` allocates per call: V8's sampling heap profiler counts every allocation, the short-lived ones a scavenge
   * frees too (the heap's size does not show those: an unoptimised frame boxes numbers an optimised one does not, and the
   * size moves with the optimiser). It names the function that allocated only where the optimiser has not inlined it, so
   * this sums everything under `src/` (the step's own lambda included).
   */
  async function allocated(step: () => void, frames = 20_000): Promise<number> {
    const by = await allocatedBy(step, frames);
    return [...by.values()].reduce((a, b) => a + b, 0);
  }
  async function allocatedBy(step: () => void, frames = 20_000): Promise<Map<string, number>> {
    const inspector = (await loadNode('inspector')) as { Session: new () => Session };
    const session = new inspector.Session();
    session.connect();
    const post = (method: string, params?: unknown): Promise<any> => new Promise((resolve, reject) => session.post(method, params, (e, r) => (e ? reject(e) : resolve(r))));
    // Warm up until the optimiser has had its say.
    for (let i = 0; i < 20_000; i++) step();
    await post('HeapProfiler.startSampling', { samplingInterval: 32, includeObjectsCollectedByMinorGC: true, includeObjectsCollectedByMajorGC: true });
    for (let i = 0; i < frames; i++) step();
    const { profile } = await post('HeapProfiler.stopSampling');
    session.disconnect();
    const by = new Map<string, number>();
    const walk = (n: any): void => {
      if (n.callFrame.url.includes('/src/') && n.selfSize > 0) {
        const key = `${n.callFrame.url.split('/').pop()}:${n.callFrame.functionName}:${n.callFrame.lineNumber}`;
        by.set(key, (by.get(key) ?? 0) + n.selfSize / frames);
      }
      for (const c of n.children) walk(c);
    };
    walk(profile.head);
    return by;
  }
  /** Nothing: a pass writes into the same fields and uniforms; allowed a sliver for the profiler's own bookkeeping. */
  const NONE = 8;
  /**
   * A few small objects a frame is 128 bytes (the game's convention): room for the doubles that Three's maths and a
   * uniform's assignments box (about 50 to 100 bytes, as the optimiser has it), none for a new vector, matrix or array.
   */
  const FEW = 128;

  it('control: the profiler sees four small objects allocated per frame', async () => {
    const ring: THREE.Vector3[] = new Array<THREE.Vector3>(64);
    let n = 0;
    const bytes = await allocated(() => {
      for (let k = 0; k < 4; k++) ring[n++ % 64] = new THREE.Vector3(n, k, 0.5);
    });
    expect(bytes).toBeGreaterThan(FEW);
  }, 30_000);

  for (const preset of ['medium', 'high', 'ultra'] as const) {
    it(`${preset}: each pass draws a frame without allocating (the light shafts but for the doubles their uniforms box)`, async () => {
      const b = new NodePostStack(setup(preset), 64, 36, new DirectOutput());
      b.setLight(SUN, false);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
      b.setReflectiveSurfaces([{ mesh, strength: 0.6 }]);
      const gl = quietRenderer().gl;
      // One frame first: the chain fills the frame the passes read (matrices, jitter, the sun), as it does every frame.
      b.draw(gl as NodeRenderer, new THREE.Scene(), camera());
      const chain = b as any;
      const costs: Record<string, number> = {};
      for (const pass of b.passList) {
        costs[pass.id] = await allocated(() => {
          pass.render(gl as NodeRenderer, chain.frame, chain.sceneTarget, chain.target(0));
        });
      }
      for (const [id, bytes] of Object.entries(costs)) expect(bytes, `${preset} ${id}: ${JSON.stringify(costs)}`).toBeLessThan(id === 'lightShafts' ? FEW : NONE);
      b.dispose();
    }, 60_000);

  }

  it('medium: the whole frame, through the chain with the held replica drawn into its target, allocates no new objects', async () => {
    const b = new NodePostStack(setup('medium'), 64, 36, new DirectOutput());
    const gl = quietRenderer().gl;
    const scene = new THREE.Scene();
    const cam = camera();
    const overlay = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() };
    // (High and Ultra jitter the projection and find the sun in code they share with WebGL's stack, which boxes its doubles.)
    expect(await allocated(() => b.draw(gl as NodeRenderer, scene, cam, overlay))).toBeLessThan(FEW);
    b.dispose();
  }, 30_000);

  it('the held replica’s draw into its target, Low’s draw with no haze, and the retro filter’s frame, allocate no new objects', async () => {
    const out = new DirectOutput();
    const retro = new NodeRetroFilter({ pixelSize: 4, levels: 6 });
    retro.resize(1280, 720, 1);
    const gl = quietRenderer().gl;
    const scene = new THREE.Scene();
    const cam = camera();
    const overlay = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() };
    const target = directTarget(new THREE.RenderTarget(8, 8));
    const keep = new THREE.Color();
    expect(await allocated(() => out.drawInto(gl as NodeRenderer, target, overlay, THREE.NeutralToneMapping, keep)), 'drawInto').toBeLessThan(FEW);
    expect(await allocated(() => out.drawScreen(gl as NodeRenderer, scene, cam, overlay)), 'drawScreen').toBeLessThan(FEW);
    expect(await allocated(() => retro.draw(gl as NodeRenderer, scene, cam, overlay)), 'retro').toBeLessThan(FEW);
    retro.dispose();
  }, 30_000);
});

/** Whether `target` is reachable from `root` through own properties and arrays (textures and objects of the scene are not entered). */
function contains(root: unknown, target: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): boolean => {
    if (v === target) return true;
    if (!v || typeof v !== 'object' || seen.has(v) || depth > 60 || v instanceof THREE.Texture || v instanceof THREE.Object3D) return false;
    seen.add(v);
    return (Array.isArray(v) ? v : Object.values(v)).some((c) => walk(c, depth + 1));
  };
  return walk(root, 0);
}

/** The nodes below `root` whose class is `name`. */
function nodesNamed(root: unknown, name: string): unknown[] {
  const found: unknown[] = [];
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): void => {
    if (!v || typeof v !== 'object' || seen.has(v) || depth > 60 || v instanceof THREE.Texture || v instanceof THREE.Object3D) return;
    seen.add(v);
    if (v.constructor.name === name) found.push(v);
    for (const c of Array.isArray(v) ? v : Object.values(v)) walk(c, depth + 1);
  };
  walk(root, 0);
  return found;
}

describe('Low’s late haze (W4 criterion 1)', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Draws one frame of `scene` and hands back the output hook the renderer's context was given, and the frame's fog node. */
  function drawn(scene: THREE.Scene, out = new DirectOutput()) {
    const { gl } = quietRenderer();
    let hook: ((out: any, builder: any) => any) | null = null;
    let fogNode: any = null;
    gl.contextNode = { context: (extra: { getOutput: typeof hook }) => ((hook = extra.getOutput), {}) };
    const render = gl.render;
    gl.render = (o: THREE.Object3D) => {
      if (o === scene) fogNode = (scene as any).fogNode;
      render(o);
    };
    out.drawScreen(gl as NodeRenderer, scene, new THREE.PerspectiveCamera());
    return { hook: hook!, fogNode, out, gl };
  }

  it('updates the haze’s near, far and colour from the scene’s fog every frame, whichever of them changed', () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x1d2b46, 10, 100);
    const { out, gl, fogNode } = drawn(scene);
    const read = (): unknown[] => [fogNode.near.value, fogNode.far.value, fogNode.colour.value.getHex(THREE.LinearSRGBColorSpace)];
    expect(read()).toEqual([10, 100, 0x1d2b46]);
    const fog = scene.fog as THREE.Fog;
    for (const [near, far, colour] of [[10, 140, 0x1d2b46], [30, 140, 0x1d2b46], [30, 140, 0x336699], [5, 60, 0xffeedd]] as const) {
      fog.near = near;
      fog.far = far;
      fog.color.setHex(colour);
      out.drawScreen(gl as NodeRenderer, scene, new THREE.PerspectiveCamera());
      expect(read(), `${near} ${far} ${colour}`).toEqual([near, far, colour]);
    }
  });

  it('keeps the haze’s colour, range and the background in the same objects frame after frame (nothing made to update them)', () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x1d2b46, 10, 100);
    const background = (scene.background = new THREE.Color(0.2, 0.4, 0.6));
    const first = drawn(scene);
    const parts = [first.fogNode, first.fogNode.near, first.fogNode.far, first.fogNode.colour, first.fogNode.colour.value];
    for (let frame = 0; frame < 3; frame++) {
      (scene.fog as THREE.Fog).near += 1;
      let seen: any = null;
      const render = first.gl.render;
      first.gl.render = (o: THREE.Object3D) => {
        if (o === scene) seen = (scene as any).fogNode;
        render(o);
      };
      first.out.drawScreen(first.gl as NodeRenderer, scene, new THREE.PerspectiveCamera());
      expect([seen, seen.near, seen.far, seen.colour, seen.colour.value]).toEqual(parts);
      parts.forEach((p, i) => expect([seen, seen.near, seen.far, seen.colour, seen.colour.value][i]).toBe(p));
      expect(scene.background).toBe(background);
    }
  });

  it('gives each fog its own node, and a scene with no fog (or a fog that is not a range one) none', () => {
    const out = new DirectOutput();
    const a = new THREE.Scene();
    a.fog = new THREE.Fog(0xffffff, 1, 2);
    const b = new THREE.Scene();
    b.fog = new THREE.Fog(0x000000, 5, 50);
    const na = drawn(a, out).fogNode;
    const nb = drawn(b, out).fogNode;
    expect(na).not.toBe(nb);
    expect(na.near.value).toBe(1);
    expect(nb.near.value).toBe(5);
    expect(drawn(new THREE.Scene(), out).fogNode ?? null).toBeNull();
    const exp = new THREE.Scene();
    exp.fog = new THREE.FogExp2(0xffffff, 0.01);
    expect(drawn(exp, out).fogNode ?? null).toBeNull();
    // Nothing is left on a scene after its frame: the next draw (a picture, a probe) sees its own fog.
    expect((a as any).fogNode).toBeNull();
  });

  it('mixes the haze in after the tone mapping, for the materials that take fog and for no other, and leaves off-screen targets alone', async () => {
    const { vec4, vec3 } = await import('three/tsl');
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x1d2b46, 10, 100);
    const { hook, fogNode } = drawn(scene);
    const out = vec4(vec3(0.5, 0.5, 0.5), 1);
    const builderFor = (target: unknown, material: unknown) => ({ renderer: { getRenderTarget: () => target }, material, fogNode });
    const foggy = hook(out, builderFor(null, { fog: true }));
    // The haze colour is in the picture, and the tone-mapped colour (which holds the pixel's own) is under the mix, not over it.
    expect(contains(foggy, fogNode.colour)).toBe(true);
    const plain = hook(out, builderFor(null, { fog: false }));
    expect(contains(plain, fogNode.colour), 'a material without fog gets no haze').toBe(false);
    expect(contains(plain, out), 'but is still tone-mapped from its own output').toBe(true);
    expect(plain).not.toBe(out);
    const shadow = hook(out, builderFor({ isRenderTarget: true }, { fog: true }));
    expect(shadow, 'a shadow map or other off-screen pass is left as it is').toBe(out);
    // After the tone mapping, as WebGL's fog_fragment follows its colorspace_fragment: the pixel's colour goes through the
    // tone mapping, the haze's colour and range do not (mixed in before it, they would be tone-mapped and encoded too).
    const toneMaps = nodesNamed(foggy, 'ToneMappingNode');
    expect(toneMaps.length).toBeGreaterThan(0);
    for (const t of toneMaps) {
      expect(contains(t, out), 'the pixel is tone-mapped').toBe(true);
      expect(contains(t, fogNode.colour), 'the haze colour is not').toBe(false);
      expect(contains(t, fogNode.near), 'nor its range').toBe(false);
    }
    expect(contains(foggy, fogNode.near)).toBe(true);
    // A material that holds back part of the haze (the sky host's plane) is asked for the share it takes.
    const share = vi.fn((s: unknown) => s);
    hook(out, builderFor(null, { fog: true, lateFogShare: share }));
    expect(share).toHaveBeenCalledOnce();
  });
});

describe('the node path takes TSL by named imports only (W4 criterion 2)', () => {
  const sources = import.meta.glob<string>(['/src/render/webgpu/**/*.ts', '!/src/render/webgpu/**/*.test.ts'], { query: '?raw', import: 'default', eager: true });
  /** An import or export statement of Three's TSL or node build that is not a named list or a type: a namespace, a default, or a re-export of everything. */
  const wholesale = (text: string): string[] =>
    text
      .split(/^(?=import |export )/m)
      .filter((s) => /^(import|export)\s+(?!type\b)(\*|\w+\s+from|\w+\s*,|\{\s*default\b)[^;]*['"]three\/(tsl|webgpu)['"]/.test(s))
      .map((s) => s.trim());

  it('has a pattern that finds each wholesale form, in either quote, and passes the named lists the passes use', () => {
    for (const bad of ["import * as T from 'three/tsl';", 'import * as T from "three/webgpu";', "import TSL from 'three/tsl';", "export * from 'three/tsl';", "import TSL, { vec3 } from 'three/tsl';", "import { default as T } from 'three/tsl';"]) {
      expect(wholesale(bad), bad).toHaveLength(1);
    }
    for (const good of ["import { vec3, float } from 'three/tsl';", "import type { NodeMaterial } from 'three/webgpu';", "import { type NodeMaterial, QuadMesh } from 'three/webgpu';", "import * as THREE from 'three';"]) {
      expect(wholesale(good), good).toEqual([]);
    }
  });

  it('has no module of the node path (the post passes among them) taking either wholesale', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    expect(Object.keys(sources).filter((f) => f.includes('/post/')).length).toBeGreaterThan(9);
    const offenders = Object.entries(sources).flatMap(([file, text]) => wholesale(text).map((s) => `${file}: ${s}`));
    expect(offenders).toEqual([]);
  });

  it('reaches the TSL library through the one hub module (tsl.ts) from the post passes, but for the output step’s own named list', () => {
    const direct = Object.entries(sources)
      .filter(([f]) => f.includes('/post/') && /from\s+['"]three\/tsl['"]/.test(sources[f]!))
      .map(([f]) => f.replace('/src/render/webgpu/post/', ''))
      .sort();
    expect(direct).toEqual(['nodeOutput.ts', 'tsl.ts']);
  });

  it('keeps every module of the node path under about 600 lines', () => {
    const long = Object.entries(sources).filter(([, text]) => text.split('\n').length > 600).map(([f]) => f);
    expect(long).toEqual([]);
  });
});
