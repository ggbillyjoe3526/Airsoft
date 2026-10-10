import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { generatePdSamplePointInitializer } from 'three/examples/jsm/shaders/PoissonDenoiseShader.js';
import type { NodeMaterial } from 'three/webgpu';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../../config/post';
import { QUALITY, type QualityPreset } from '../../../config/render';
import { ADDITIVE, MULTIPLY } from '../../post/postPass';
import { PostStack } from '../../post/postStack';
import { RetroFilter } from '../../retroFilterWebGL';
import { denoiseDisk } from './nodeAmbientOcclusion';
import { bloomKernel, bloomMipSizes } from './nodeBloom';
import { CompileGate, type NodeRenderer } from './nodeKit';
import { DirectOutput } from './nodeOutput';
import { NodePostStack } from './nodePostStack';
import { NodeRetroFilter } from './nodeRetro';

/**
 * The node renderer's post stack and retro filter (W4) against WebGL's: the same plan, passes, targets, blends and
 * draws, pass for pass, each drawn on a stand-in renderer that logs where every draw goes.
 */

/** Every object of `kind` reachable from `root` through own properties, arrays and maps. */
function reachable<T>(root: unknown, kind: abstract new (...a: never[]) => T): Set<T> {
  const found = new Set<T>();
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): void => {
    if (!v || typeof v !== 'object' || seen.has(v) || depth > 7 || v instanceof THREE.Object3D) return;
    seen.add(v);
    if (v instanceof kind) found.add(v as T);
    const children = Array.isArray(v) ? v : v instanceof Map ? [...v.values()] : Object.values(v);
    for (const child of children) walk(child, depth + 1);
  };
  walk(root, 0);
  return found;
}

interface Draw {
  what: 'scene' | 'quad';
  /** 'screen', or the target's size and type. */
  into: string;
  blending: number;
  material: unknown;
}

/** A stand-in renderer (WebGL's or the node renderer: the stack calls the same methods on either). */
function stubRenderer() {
  let target: THREE.RenderTarget | null = null;
  const draws: Draw[] = [];
  const gl = {
    autoClear: true,
    toneMapping: THREE.NeutralToneMapping as THREE.ToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace as string,
    coordinateSystem: THREE.WebGLCoordinateSystem,
    samples: 4,
    contextNode: { context: () => ({}) },
    setRenderTarget: (t: THREE.RenderTarget | null) => void (target = t),
    getRenderTarget: () => target,
    getClearColor: (c: THREE.Color) => c,
    getClearAlpha: () => 1,
    setClearColor: () => undefined,
    clear: () => undefined,
    clearDepth: () => undefined,
    toneMappingDuring: [] as THREE.ToneMapping[],
    render(o: THREE.Object3D) {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      // A normal blend on an opaque material draws as none (WebGL's state and the node renderer's alike).
      const blending = m ? (m.blending === THREE.NormalBlending && !m.transparent ? THREE.NoBlending : m.blending) : -1;
      draws.push({ what: o instanceof THREE.Scene ? 'scene' : 'quad', into: target ? `${target.width}x${target.height}:${target.texture.type}` : 'screen', blending, material: m });
      this.toneMappingDuring.push(this.toneMapping);
    },
  };
  return { gl, draws };
}

const setup = (preset: QualityPreset) => ({ quality: QUALITY[preset], halfFloat: true });
const webgl = (preset: QualityPreset, w = 64, h = 36) => new PostStack(setup(preset), w, h);
const node = (preset: QualityPreset, w = 64, h = 36) => new NodePostStack(setup(preset), w, h, new DirectOutput());

/** A camera looking at the sun, so the light shafts draw. */
function sunlit(stack: { setLight(sun: THREE.Vector3, night: boolean): void }): THREE.PerspectiveCamera {
  stack.setLight(new THREE.Vector3(0, 0.1, -1), false);
  return new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
}

describe('the node post stack matches WebGL’s, pass for pass (W4)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('makes the same plan, with the same passes in place or out, and the same scene target', () => {
    for (const preset of ['medium', 'high', 'ultra'] as const) {
      const a = webgl(preset);
      const b = node(preset);
      expect(b.plan, preset).toEqual(a.plan);
      const passes = (s: unknown) => (s as { passes: { id: string; inPlace: boolean }[] }).passes.map((p) => `${p.id}:${p.inPlace}`);
      expect(passes(b), preset).toEqual(passes(a));
      expect(b.sceneTarget.samples, preset).toBe(a.sceneTarget.samples);
      expect(b.sceneTarget.texture.type, preset).toBe(a.sceneTarget.texture.type);
      expect(b.sceneTarget.depthTexture === null, preset).toBe(a.sceneTarget.depthTexture === null);
      a.dispose();
      b.dispose();
    }
  });

  it('draws the same draws into targets of the same sizes and types, with the same blends, on every preset', () => {
    for (const preset of ['medium', 'high', 'ultra'] as const) {
      const a = webgl(preset);
      const b = node(preset);
      const wa = stubRenderer();
      const wb = stubRenderer();
      for (let frame = 0; frame < 2; frame++) {
        a.render(wa.gl as unknown as THREE.WebGLRenderer, new THREE.Scene(), sunlit(a));
        b.draw(wb.gl as unknown as NodeRenderer, new THREE.Scene(), sunlit(b));
      }
      const shape = (d: Draw[]) => d.map((x) => `${x.what} ${x.into} ${x.blending}`);
      expect(shape(wb.draws), preset).toEqual(shape(wa.draws));
      expect(wb.draws.filter((d) => d.into === 'screen'), preset).toHaveLength(2);
      a.dispose();
      b.dispose();
    }
  });

  it('draws the whole chain with the renderer’s tone mapping off (the output pass does it), and puts it back', () => {
    const b = node('high');
    const { gl } = stubRenderer();
    b.draw(gl as unknown as NodeRenderer, new THREE.Scene(), sunlit(b));
    expect(new Set(gl.toneMappingDuring)).toEqual(new Set([THREE.NoToneMapping]));
    expect(gl.toneMapping).toBe(THREE.NeutralToneMapping);
    expect(gl.outputColorSpace).toBe(THREE.SRGBColorSpace);
    b.dispose();
  });

  it('holds targets of the same sizes and types as WebGL’s, and resizes them alike', () => {
    for (const preset of ['medium', 'high', 'ultra'] as const) {
      const a = webgl(preset);
      const b = node(preset);
      const wa = stubRenderer();
      const wb = stubRenderer();
      a.render(wa.gl as unknown as THREE.WebGLRenderer, new THREE.Scene(), sunlit(a));
      b.draw(wb.gl as unknown as NodeRenderer, new THREE.Scene(), sunlit(b));
      const sizes = (s: unknown) => [...reachable(s, THREE.RenderTarget)].map((t) => `${t.width}x${t.height}:${t.texture.type}`).sort();
      // Bloom's targets are Three's own on WebGL: reached through its pass, as on the node path.
      expect(sizes(b), preset).toEqual(sizes(a));
      a.setSize(201, 99);
      b.setSize(201, 99);
      expect(sizes(b), preset).toEqual(sizes(a));
      a.dispose();
      b.dispose();
    }
  });

  it('frees every target and material it made, the held replica’s target too', () => {
    for (const preset of ['medium', 'high', 'ultra'] as const) {
      const b = node(preset);
      const { gl } = stubRenderer();
      const overlay = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() };
      b.draw(gl as unknown as NodeRenderer, new THREE.Scene(), sunlit(b), overlay);
      expect(b.overlayBuffer, preset).toBeInstanceOf(THREE.RenderTarget);
      const targets = reachable(b, THREE.RenderTarget);
      const materials = reachable(b, THREE.Material);
      const freed = new Set<unknown>();
      vi.spyOn(THREE.RenderTarget.prototype, 'dispose').mockImplementation(function (this: unknown) {
        freed.add(this);
      });
      vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(function (this: unknown) {
        freed.add(this);
      });
      b.dispose();
      for (const t of targets) expect(freed.has(t), `${preset}: a target left`).toBe(true);
      for (const m of materials) expect(freed.has(m), `${preset}: a material left`).toBe(true);
      expect(materials.size, preset).toBeGreaterThan(2);
      vi.restoreAllMocks();
    }
  });

  it('draws the held replica into a multisampled target of its own, one draw, laid on by the last pass', () => {
    for (const preset of ['medium', 'ultra'] as const) {
      const b = node(preset);
      const { gl, draws } = stubRenderer();
      const overlay = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() };
      b.draw(gl as unknown as NodeRenderer, new THREE.Scene(), sunlit(b), overlay);
      const held = b.overlayBuffer!;
      expect(held.samples).toBe(gl.samples);
      expect(held.texture.type).toBe(THREE.UnsignedByteType);
      expect(draws.filter((d) => d.what === 'scene')).toHaveLength(2);
      const last = b.passList.at(-1) as unknown as { finishing: { overlay: unknown } | null };
      expect(last.finishing?.overlay).toBe(held);
      // Without a replica this frame, the last pass lays nothing on.
      b.draw(gl as unknown as NodeRenderer, new THREE.Scene(), sunlit(b));
      expect(last.finishing?.overlay).toBeNull();
      b.dispose();
    }
  });
});

describe('each node pass against its WebGL counterpart (W4)', () => {
  it('blurs bloom with UnrealBloomPass’s kernels at its mip sizes', () => {
    const three = new UnrealBloomPass(new THREE.Vector2(201, 99), 1, 0.5, 1);
    const kernels = [6, 10, 14, 18, 22];
    three.separableBlurMaterials.forEach((m, i) => {
      const k = bloomKernel(kernels[i]!);
      expect(k.centre).toBeCloseTo(m.uniforms.centerWeight!.value as number, 12);
      expect(k.offsets).toEqual(m.uniforms.gaussianOffsets!.value);
      expect(k.weights).toEqual(m.uniforms.gaussianWeights!.value);
    });
    expect(bloomMipSizes(201, 99)).toEqual(three.renderTargetsHorizontal.map((t) => ({ width: t.width, height: t.height })));
    three.dispose();
  });

  it('adds bloom back as UnrealBloomPass does (premultiplied additive), the shafts additively and the shade by multiplying', () => {
    const b = node('ultra');
    const pass = (id: string) => b.passList.find((p) => p.id === id) as unknown as Record<string, NodeMaterial>;
    expect(pass('bloom').blend!.blending).toBe(THREE.AdditiveBlending);
    expect(pass('bloom').blend!.premultipliedAlpha).toBe(true);
    expect(pass('lightShafts').addMaterial!.blending).toBe(ADDITIVE.blending);
    const shade = pass('ao').blend!;
    for (const [k, v] of Object.entries(MULTIPLY)) expect(shade[k as keyof NodeMaterial], k).toBe(v);
    b.dispose();
  });

  it('denoises the shade with PoissonDenoiseShader’s own sample disk', () => {
    const d = POST.ao.denoise;
    const disk = denoiseDisk(d.samples, d.rings, d.radiusExponent);
    expect(disk).toHaveLength(d.samples);
    const glsl = generatePdSamplePointInitializer(d.samples, d.rings, d.radiusExponent);
    expect(glsl).toContain(`vec3(${disk[0]!.x}, ${disk[0]!.y}, ${disk[0]!.z})`);
  });
});

describe('the node retro filter matches WebGL’s (W4)', () => {
  it('draws into a target sized, typed and filtered as WebGL’s, the world and the replica then one present', () => {
    const look = { pixelSize: 4, levels: 6 };
    const a = new RetroFilter(look, true);
    const b = new NodeRetroFilter(look);
    a.resize(1280, 720, 1.5);
    b.resize(1280, 720, 1.5);
    for (const k of ['width', 'height', 'depthBuffer'] as const) expect(b.renderTarget[k]).toBe(a.renderTarget[k]);
    for (const k of ['type', 'minFilter', 'magFilter', 'generateMipmaps'] as const) expect(b.renderTarget.texture[k]).toBe(a.renderTarget.texture[k]);
    const { gl, draws } = stubRenderer();
    b.draw(gl as unknown as NodeRenderer, new THREE.Scene(), new THREE.PerspectiveCamera(), { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() });
    expect(draws.map((d) => `${d.what} ${d.into}`)).toEqual([`scene ${b.renderTarget.width}x${b.renderTarget.height}:${THREE.HalfFloatType}`, `scene ${b.renderTarget.width}x${b.renderTarget.height}:${THREE.HalfFloatType}`, 'quad screen']);
    expect(gl.toneMappingDuring).toEqual([THREE.NeutralToneMapping, THREE.NeutralToneMapping, THREE.NoToneMapping]);
    expect(gl.toneMapping).toBe(THREE.NeutralToneMapping);
    const freed = vi.spyOn(THREE.RenderTarget.prototype, 'dispose');
    b.dispose();
    expect(freed).toHaveBeenCalled();
    a.dispose();
    vi.restoreAllMocks();
  });
});

describe('a warm-up compile still under way when the stack or the retro filter is dropped (W4)', () => {
  afterEach(() => vi.restoreAllMocks());

  /** A stand-in renderer whose compiles finish when `finish` is called (Three makes the pipelines then). */
  function compiling() {
    const r = stubRenderer();
    let finish = (): void => undefined;
    const pending = new Promise<void>((resolve) => (finish = resolve));
    return { ...r, gl: Object.assign(r.gl, { compileAsync: () => pending }), finish: () => finish() };
  }

  /** Counts the targets and materials freed from here on. */
  function freeing(): Set<unknown> {
    const freed = new Set<unknown>();
    const note = function (this: unknown): void {
      freed.add(this);
    };
    vi.spyOn(THREE.RenderTarget.prototype, 'dispose').mockImplementation(note);
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(note);
    return freed;
  }

  const overlay = () => ({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() });

  it('the stack frees its targets once the compile has finished, not before (a freed target leaves no depth format)', async () => {
    const b = node('high');
    const { gl, finish } = compiling();
    const done = b.compile(gl as unknown as NodeRenderer, new THREE.Scene(), sunlit(b), overlay());
    const targets = reachable(b, THREE.RenderTarget);
    const freed = freeing();
    b.dispose();
    await Promise.resolve();
    expect(freed.size).toBe(0);
    finish();
    await done;
    await new Promise((r) => setTimeout(r, 0));
    for (const t of targets) expect(freed.has(t), 'a target left').toBe(true);
  });

  it('the stack frees at once when its compile has finished, and when it never compiled', async () => {
    const b = node('medium');
    const { gl, finish } = compiling();
    finish();
    await b.compile(gl as unknown as NodeRenderer, new THREE.Scene(), sunlit(b));
    await new Promise((r) => setTimeout(r, 0));
    let freed = freeing();
    b.dispose();
    expect(freed.has(b.sceneTarget)).toBe(true);
    vi.restoreAllMocks();
    const c = node('medium');
    freed = freeing();
    c.dispose();
    expect(freed.has(c.sceneTarget)).toBe(true);
  });

  it('a stack or retro filter of the same renderer waits too: Three shares a render context among targets of a kind', async () => {
    const gate = new CompileGate();
    const warming = new NodePostStack(setup('high'), 64, 36, new DirectOutput(), gate);
    const { gl, finish } = compiling();
    const done = warming.compile(gl as unknown as NodeRenderer, new THREE.Scene(), sunlit(warming));
    const next = new NodePostStack(setup('high'), 64, 36, new DirectOutput(), gate);
    const retro = new NodeRetroFilter({ pixelSize: 4, levels: 6 }, gate);
    const freed = freeing();
    next.dispose();
    retro.dispose();
    await Promise.resolve();
    expect(gate.busy).toBe(true);
    expect(freed.has(next.sceneTarget) || freed.has(retro.renderTarget)).toBe(false);
    finish();
    await done;
    await new Promise((r) => setTimeout(r, 0));
    expect(gate.busy).toBe(false);
    expect(freed.has(next.sceneTarget) && freed.has(retro.renderTarget)).toBe(true);
  });

  it('the retro filter waits for its compile the same way', async () => {
    const b = new NodeRetroFilter({ pixelSize: 4, levels: 6 });
    b.resize(1280, 720, 1);
    const { gl, finish } = compiling();
    const done = b.compile(gl as unknown as NodeRenderer, new THREE.Scene(), new THREE.PerspectiveCamera(), overlay());
    const freed = freeing();
    b.dispose();
    await Promise.resolve();
    expect(freed.has(b.renderTarget)).toBe(false);
    finish();
    await done;
    await new Promise((r) => setTimeout(r, 0));
    expect(freed.has(b.renderTarget)).toBe(true);
  });
});

describe('Low’s frame straight onto the canvas (W4)', () => {
  it('draws the world then the replica onto the screen, two draws as WebGL’s, the renderer’s state put back', () => {
    const out = new DirectOutput();
    const { gl, draws } = stubRenderer();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0.2, 0.4, 0.6);
    scene.fog = new THREE.Fog(0x1d2b46, 10, 100);
    const background = scene.background;
    let fogNode: unknown = null;
    const render = gl.render.bind(gl);
    gl.render = function (o: THREE.Object3D) {
      if (o === scene) fogNode = (scene as unknown as { fogNode: unknown }).fogNode;
      render(o);
    };
    out.drawScreen(gl as unknown as NodeRenderer, scene, new THREE.PerspectiveCamera(), { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() });
    expect(draws.map((d) => `${d.what} ${d.into}`)).toEqual(['scene screen', 'scene screen']);
    expect(gl.toneMappingDuring).toEqual([THREE.NoToneMapping, THREE.NoToneMapping]);
    draws.length = 0;
    // The haze goes on after the tone mapping (its node is the late one while drawing), and the scene is as it was.
    expect((fogNode as { lateFog?: boolean } | null)?.lateFog).toBe(true);
    // Its colour encoded for the screen, as WebGL hands an unlit colour drawn straight to the canvas.
    type Late = { colour: { value: THREE.Color }; near: { value: number }; far: { value: number } };
    const late = fogNode as Late;
    expect(late.colour.value.getHex(THREE.LinearSRGBColorSpace)).toBe(0x1d2b46);
    expect([late.near.value, late.far.value]).toEqual([10, 100]);
    // The Renderer changes its fog in place for each map's light: the next frame draws with the new one.
    (scene.fog as THREE.Fog).near = 20;
    (scene.fog as THREE.Fog).far = 140;
    (scene.fog as THREE.Fog).color.setHex(0x808080);
    out.drawScreen(gl as unknown as NodeRenderer, scene, new THREE.PerspectiveCamera());
    expect(fogNode).toBe(late);
    expect([late.near.value, late.far.value, late.colour.value.getHex(THREE.LinearSRGBColorSpace)]).toEqual([20, 140, 0x808080]);
    expect((scene as unknown as { fogNode: unknown }).fogNode).toBeNull();
    expect(scene.background).toBe(background);
    expect(gl.toneMapping).toBe(THREE.NeutralToneMapping);
    expect(gl.outputColorSpace).toBe(THREE.SRGBColorSpace);
  });
});

describe('the node path’s TSL stays in its own chunk (W4)', () => {
  it('takes TSL by named imports: a namespace used as a value shares a bundler helper chunk the physics import then preloads', () => {
    const sources = import.meta.glob<string>(['/src/render/webgpu/**/*.ts', '!/src/render/webgpu/**/*.test.ts'], { query: '?raw', import: 'default', eager: true });
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    for (const [file, text] of Object.entries(sources)) expect(text, file).not.toMatch(/import \* as \w+ from 'three\/(tsl|webgpu)'/);
  });
});
