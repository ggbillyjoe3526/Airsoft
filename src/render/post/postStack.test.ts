import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../config/post';
import { QUALITY, type QualityPreset } from '../../config/render';
import { sunOnScreen } from './lightShaftsPass';
import { planNeedsDepth, postPlan, sceneSamples } from './postPlan';
import { brightestChannelBloom, PostStack } from './postStack';
import { findReflective, reflectivity } from './reflectionPass';
import { halton, jitterProjection, jitterSequence } from './temporalAAPass';

describe('the post plan per preset (G5)', () => {
  it('builds no pass on Low, bloom on Medium, shade, shafts and TAA on High, everything on Ultra', () => {
    expect(postPlan(QUALITY.low)).toEqual([]);
    expect(postPlan(QUALITY.medium)).toEqual(['bloom', 'output']);
    expect(postPlan(QUALITY.high)).toEqual(['ao', 'lightShafts', 'taa', 'bloom', 'output']);
    expect(postPlan(QUALITY.ultra)).toEqual(['ao', 'reflections', 'lightShafts', 'taa', 'bloom', 'output', 'lens']);
  });

  it('puts the lens finish after the tone mapping, and output last otherwise', () => {
    expect(postPlan({ ...QUALITY.low, lensFinish: true })).toEqual(['output', 'lens']);
    expect(postPlan({ ...QUALITY.low, temporalAA: true })).toEqual(['taa', 'output']);
  });

  it('reads the depth only for the passes that need it, and multisamples only without TAA', () => {
    expect(planNeedsDepth(postPlan(QUALITY.medium))).toBe(false);
    expect(planNeedsDepth(postPlan(QUALITY.high))).toBe(true);
    expect(sceneSamples(QUALITY.medium)).toBe(4);
    expect(sceneSamples(QUALITY.high)).toBe(0);
    expect(sceneSamples({ ...QUALITY.medium, antialias: false })).toBe(0);
  });
});

/** Every object of `kind` reachable from `root` through own properties and arrays (the stack's targets and materials). */
function reachable<T>(root: unknown, kind: abstract new (...a: never[]) => T): Set<T> {
  const found = new Set<T>();
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): void => {
    if (!v || typeof v !== 'object' || seen.has(v) || depth > 6 || v instanceof THREE.Object3D) return;
    seen.add(v);
    if (v instanceof kind) found.add(v as T);
    for (const child of Array.isArray(v) ? v : Object.values(v)) walk(child, depth + 1);
  };
  walk(root, 0);
  return found;
}

/** A stand-in WebGLRenderer: logs where each draw goes and what the camera's projection was for the scene. */
function stubGl() {
  let target: THREE.WebGLRenderTarget | null = null;
  const draws: { what: 'scene' | 'quad'; into: THREE.WebGLRenderTarget | null; projection: number[] }[] = [];
  const gl = {
    autoClear: true,
    toneMapping: THREE.NeutralToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace,
    setRenderTarget: (t: THREE.WebGLRenderTarget | null) => void (target = t),
    getRenderTarget: () => target,
    getClearColor: (c: THREE.Color) => c,
    getClearAlpha: () => 1,
    setClearColor: () => undefined,
    clear: () => undefined,
    render: (o: THREE.Object3D, camera: THREE.Camera) =>
      void draws.push({ what: o instanceof THREE.Scene ? 'scene' : 'quad', into: target, projection: [...camera.projectionMatrix.elements] }),
  };
  return { gl: gl as unknown as THREE.WebGLRenderer, draws };
}

const stackFor = (preset: QualityPreset, w = 64, h = 36) => new PostStack({ quality: QUALITY[preset], halfFloat: true }, w, h);

describe('the post stack (G5)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('makes the plan’s passes, with a depth texture only when one reads it', () => {
    const medium = stackFor('medium');
    expect(medium.plan).toEqual(['bloom', 'output']);
    expect(medium.sceneTarget.depthTexture).toBeNull();
    expect(medium.sceneTarget.samples).toBe(4);
    const ultra = stackFor('ultra');
    expect(ultra.sceneTarget.depthTexture).toBeInstanceOf(THREE.DepthTexture);
    expect(ultra.sceneTarget.samples).toBe(0);
    expect(ultra.sceneTarget.texture.type).toBe(THREE.HalfFloatType);
    expect(new PostStack({ quality: QUALITY.high, halfFloat: false }, 8, 8).sceneTarget.texture.type).toBe(THREE.UnsignedByteType);
    medium.dispose();
    ultra.dispose();
  });

  it('disposes every render target, texture and material it made', () => {
    for (const preset of ['medium', 'high', 'ultra'] as const) {
      const stack = stackFor(preset);
      const { gl } = stubGl();
      stack.render(gl, new THREE.Scene(), new THREE.PerspectiveCamera()); // the ping-pong targets are made on first use
      const targets = reachable(stack, THREE.WebGLRenderTarget);
      const materials = reachable(stack, THREE.Material);
      // The noise textures and the depth texture (a render target's own texture goes with the target).
      const textures = [...reachable(stack, THREE.DataTexture), ...reachable(stack, THREE.DepthTexture)];
      const freedTextures = new Set<unknown>();
      vi.spyOn(THREE.Texture.prototype, 'dispose').mockImplementation(function (this: unknown) {
        freedTextures.add(this);
      });
      expect(targets.size, preset).toBeGreaterThan(1);
      const freed = new Set<unknown>();
      vi.spyOn(THREE.WebGLRenderTarget.prototype, 'dispose').mockImplementation(function (this: unknown) {
        freed.add(this);
      });
      const freedMaterials = new Set<unknown>();
      vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(function (this: unknown) {
        freedMaterials.add(this);
      });
      stack.dispose();
      for (const t of targets) expect(freed.has(t), `${preset}: a target left`).toBe(true);
      for (const m of materials) expect(freedMaterials.has(m), `${preset}: ${(m as THREE.Material).type} left`).toBe(true);
      for (const t of textures) expect(freedTextures.has(t), `${preset}: a texture left`).toBe(true);
      if (preset !== 'medium') expect(textures.length, preset).toBeGreaterThan(0);
      vi.restoreAllMocks();
    }
  });

  it('resizes its targets with the drawing buffer, and the shade and shafts at their share of it', () => {
    const stack = stackFor('high', 64, 36);
    const { gl } = stubGl();
    stack.render(gl, new THREE.Scene(), new THREE.PerspectiveCamera());
    stack.setSize(200, 100);
    expect([stack.sceneTarget.width, stack.sceneTarget.height]).toEqual([200, 100]);
    const sizes = [...reachable(stack, THREE.WebGLRenderTarget)].map((t) => `${t.width}x${t.height}`);
    expect(sizes).toContain('200x100');
    // High's ambient occlusion at half resolution; the light shafts at POST.lightShafts.resolution.
    expect(sizes).toContain('100x50');
    expect(sizes).toContain(`${200 * POST.lightShafts.resolution}x${100 * POST.lightShafts.resolution}`);
    expect(sizes).not.toContain('64x36');
    stack.dispose();
  });

  it('draws the scene into its own target, the passes off screen, and only the last onto the screen', () => {
    for (const preset of ['medium', 'high', 'ultra'] as const) {
      const stack = stackFor(preset);
      const { gl, draws } = stubGl();
      stack.render(gl, new THREE.Scene(), new THREE.PerspectiveCamera());
      expect(draws[0]!.what, preset).toBe('scene');
      expect(draws[0]!.into, preset).toBe(stack.sceneTarget);
      expect(draws.at(-1)!.into, preset).toBeNull();
      expect(draws.filter((d) => d.into === null), preset).toHaveLength(1);
      expect(gl.autoClear, preset).toBe(true);
      stack.dispose();
    }
  });

  it('jitters the projection for the scene with TAA on, and gives the plain projection back', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 250);
    const plain = [...camera.projectionMatrix.elements];
    const high = stackFor('high');
    const { gl, draws } = stubGl();
    high.render(gl, new THREE.Scene(), camera);
    high.render(gl, new THREE.Scene(), camera);
    const scenes = draws.filter((d) => d.what === 'scene');
    expect(scenes[0]!.projection).not.toEqual(plain);
    expect(scenes[1]!.projection).not.toEqual(scenes[0]!.projection);
    expect([...camera.projectionMatrix.elements]).toEqual(plain);
    // The frame tells the passes the shift in UV the jitter gave the picture, so the blend reprojects without it.
    const p = new THREE.Vector3(1, 0.5, -10);
    const uvOf = (projection: number[]) => {
      const c = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(new THREE.Matrix4().fromArray(projection));
      return new THREE.Vector2(c.x / c.w, c.y / c.w).multiplyScalar(0.5);
    };
    const shift = uvOf(scenes[1]!.projection).sub(uvOf(plain));
    const jitter = (high as unknown as { frame: { jitter: THREE.Vector2 } }).frame.jitter;
    expect(jitter.length()).toBeGreaterThan(0);
    expect(shift.x).toBeCloseTo(jitter.x, 9);
    expect(shift.y).toBeCloseTo(jitter.y, 9);
    // Medium has no TAA: no jitter.
    const medium = stackFor('medium');
    const m = stubGl();
    medium.render(m.gl, new THREE.Scene(), camera);
    expect(m.draws[0]!.projection).toEqual(plain);
    high.dispose();
    medium.dispose();
  });

  it('bright-passes bloom on the brightest channel, softened, so a saturated neon glows and the sunlit scene does not', () => {
    const pass = brightestChannelBloom(64, 36);
    expect(pass.materialHighPassFilter.fragmentShader).toContain('max( texel.r, max( texel.g, texel.b ) )');
    expect(pass.materialHighPassFilter.fragmentShader).not.toContain('luminance( texel.xyz )');
    expect((pass.highPassUniforms as Record<string, THREE.IUniform>).smoothWidth!.value).toBe(POST.bloom.softness);
    expect(pass.threshold).toBe(POST.bloom.threshold);
    pass.dispose();
  });
});

describe('the temporal blend’s jitter (G5)', () => {
  it('walks the Halton (2, 3) sequence in sub-pixel steps', () => {
    expect([halton(1, 2), halton(2, 2), halton(3, 2)]).toEqual([0.5, 0.25, 0.75]);
    expect(halton(1, 3)).toBeCloseTo(1 / 3, 12);
    const seq = jitterSequence(POST.taa.jitterSamples);
    expect(seq).toHaveLength(POST.taa.jitterSamples * 2);
    for (const v of seq) expect(Math.abs(v)).toBeLessThanOrEqual(0.5);
    expect(new Set(seq).size).toBeGreaterThan(POST.taa.jitterSamples);
  });

  it('moves a point on screen by the offset in pixels', () => {
    const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
    camera.updateMatrixWorld();
    const p = new THREE.Vector3(1, 0.5, -10);
    const before = p.clone().project(camera);
    jitterProjection(camera, 0.5, -0.25, 200, 100);
    const after = p.clone().project(camera);
    // NDC spans 2 over 200 × 100 pixels: half a pixel right, a quarter down.
    expect((after.x - before.x) * 100).toBeCloseTo(0.5, 6);
    expect((after.y - before.y) * 50).toBeCloseTo(-0.25, 6);
    // The inverse follows the jittered projection.
    const identity = camera.projectionMatrixInverse.clone().multiply(camera.projectionMatrix);
    identity.elements.forEach((v, i) => expect(v).toBeCloseTo(i % 5 === 0 ? 1 : 0, 9));
  });
});

describe('light shafts: the sun on screen (G5)', () => {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 250);
  camera.updateMatrixWorld();
  const scratch = new THREE.Vector3();
  const out = { u: 0, v: 0, fade: 0 };

  it('finds the sun ahead in the middle, fully faded in', () => {
    expect(sunOnScreen(camera, new THREE.Vector3(0, 0, -1), scratch, out)).toEqual({ u: 0.5, v: 0.5, fade: 1 });
  });

  it('skips the pass with the sun behind, or well off the edge, and fades it towards the margin', () => {
    expect(sunOnScreen(camera, new THREE.Vector3(0, 0, 1), scratch, out)).toBeNull();
    expect(sunOnScreen(camera, new THREE.Vector3(0, 1, -0.05).normalize(), scratch, out)).toBeNull();
    const edge = sunOnScreen(camera, new THREE.Vector3(0, 0.7, -1).normalize(), scratch, out);
    expect(edge).not.toBeNull();
    expect(edge!.v).toBeGreaterThan(1);
    expect(edge!.fade).toBeGreaterThan(0);
    expect(edge!.fade).toBeLessThan(1);
  });
});

describe('reflections only on reflective surfaces (G5)', () => {
  it('finds the map’s glass by name and a mesh flagged reflective, and nothing else', () => {
    const geo = new THREE.BoxGeometry();
    const glass = Object.assign(new THREE.Mesh(geo), { name: 'map-glass' });
    const flatGlass = Object.assign(new THREE.Mesh(geo), { name: 'map-glass-flat' });
    const puddle = new THREE.Mesh(geo);
    puddle.userData.reflective = 0.7;
    const concrete = Object.assign(new THREE.Mesh(geo), { name: 'map-concrete' });
    const off = Object.assign(new THREE.Mesh(geo), { name: 'map-glass' });
    off.userData.reflective = 0;
    const scene = new THREE.Scene().add(glass, flatGlass, puddle, concrete, off, Object.assign(new THREE.Group(), { name: 'map-glass' }));
    const found: { mesh: THREE.Mesh; strength: number }[] = [];
    findReflective(scene, found);
    expect(found.map((f) => [f.mesh, f.strength])).toEqual([
      [glass, POST.reflections.glass],
      [flatGlass, POST.reflections.glass],
      [puddle, 0.7],
    ]);
    expect(reflectivity(concrete)).toBe(0);
  });

  it('holds no mask and draws nothing while no reflective mesh is in the scene', () => {
    const stack = stackFor('ultra');
    const { gl, draws } = stubGl();
    stack.setReflectiveSurfaces([]);
    stack.render(gl, new THREE.Scene(), new THREE.PerspectiveCamera());
    const mask = () => (stack as unknown as { reflection: { mask: THREE.WebGLRenderTarget | null } }).reflection.mask;
    expect(mask()).toBeNull();
    // The reflections pass drew nothing: the same draws as the same stack without the pass.
    const noRefl = new PostStack({ quality: { ...QUALITY.ultra, reflections: false }, halfFloat: true }, 64, 36);
    const other = stubGl();
    noRefl.render(other.gl, new THREE.Scene(), new THREE.PerspectiveCamera());
    expect(draws.length).toBe(other.draws.length);
    // With a puddle, a mask and its draws.
    const puddle = new THREE.Mesh(new THREE.PlaneGeometry());
    puddle.userData.reflective = 0.8;
    stack.setReflectiveSurfaces([{ mesh: puddle, strength: 0.8 }]);
    expect(mask()).toBeInstanceOf(THREE.WebGLRenderTarget);
    const again = stubGl();
    stack.render(again.gl, new THREE.Scene(), new THREE.PerspectiveCamera());
    expect(again.draws.length).toBe(other.draws.length + 2);
    stack.setReflectiveSurfaces([]);
    expect(mask()).toBeNull();
    stack.dispose();
    noRefl.dispose();
  });
});

/** The reflection pass of a stack, and what it holds (private: the QA reaches in for the objects it must free). */
const reflectionOf = (stack: PostStack) => (stack as unknown as { reflection: { mask: THREE.WebGLRenderTarget | null; proxies: { mesh: THREE.Mesh }[] } }).reflection;
const taaOf = (stack: PostStack) =>
  (stack as unknown as { passes: { id: string; valid?: boolean; resolve?: THREE.ShaderMaterial }[] }).passes.find((p) => p.id === 'taa')!;

describe('the reflection pass frees what it allocates (G5 QA)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('frees the mask and every stand-in material each time the surfaces change, so repeated toggles leak nothing, and all on dispose', () => {
    const freedTargets = new Set<unknown>();
    const freedMaterials = new Set<unknown>();
    vi.spyOn(THREE.WebGLRenderTarget.prototype, 'dispose').mockImplementation(function (this: unknown) {
      freedTargets.add(this);
    });
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(function (this: unknown) {
      freedMaterials.add(this);
    });
    const stack = stackFor('ultra');
    const geo = new THREE.PlaneGeometry();
    const puddle = (strength: number) => Object.assign(new THREE.Mesh(geo), { userData: { reflective: strength } });
    const madeMasks = new Set<THREE.WebGLRenderTarget>();
    const madeMaterials = new Set<THREE.Material>();
    const take = () => {
      const r = reflectionOf(stack);
      if (r.mask) madeMasks.add(r.mask);
      for (const p of r.proxies) madeMaterials.add(p.mesh.material as THREE.Material);
    };
    for (let i = 0; i < 6; i++) {
      stack.setReflectiveSurfaces([{ mesh: puddle(0.5), strength: 0.5 }, { mesh: puddle(0.7), strength: 0.7 }]);
      take();
      // One more surface: the old stand-ins go, new ones come.
      stack.setReflectiveSurfaces([{ mesh: puddle(0.5), strength: 0.5 }]);
      take();
      stack.setReflectiveSurfaces([]);
      expect(reflectionOf(stack).mask).toBeNull();
      expect(reflectionOf(stack).proxies).toHaveLength(0);
      // Everything made so far is already freed, before the stack's own disposal.
      for (const t of madeMasks) expect(freedTargets.has(t), `round ${i}: a mask left`).toBe(true);
      for (const m of madeMaterials) expect(freedMaterials.has(m), `round ${i}: a stand-in material left`).toBe(true);
    }
    expect(madeMasks.size).toBe(6);
    expect(madeMaterials.size).toBe(18);
    // A mask held at disposal goes too.
    stack.setReflectiveSurfaces([{ mesh: puddle(0.9), strength: 0.9 }]);
    const last = reflectionOf(stack).mask!;
    const lastMaterial = reflectionOf(stack).proxies[0]!.mesh.material;
    expect(freedTargets.has(last)).toBe(false);
    stack.dispose();
    expect(freedTargets.has(last)).toBe(true);
    expect(freedMaterials.has(lastMaterial)).toBe(true);
  });
});

describe('the stack at awkward sizes (G5 QA)', () => {
  it('keeps every target a whole number of pixels, at least one, from a 1 × 1 buffer to an odd one, each at its own share', () => {
    const puddle = new THREE.Mesh(new THREE.PlaneGeometry());
    puddle.userData.reflective = 0.6;
    for (const [w, h] of [[1, 1], [3, 2], [201, 101], [1, 1]] as const) {
      for (const preset of ['high', 'ultra'] as const) {
        const stack = stackFor(preset, 64, 36);
        stack.setReflectiveSurfaces([{ mesh: puddle, strength: 0.6 }]);
        const { gl } = stubGl();
        stack.render(gl, new THREE.Scene(), new THREE.PerspectiveCamera());
        stack.setSize(w, h);
        const sizes = [...reachable(stack, THREE.WebGLRenderTarget)].map((t) => [t.width, t.height] as const);
        for (const [tw, th] of sizes) {
          expect(Number.isInteger(tw) && Number.isInteger(th), `${preset} ${w}x${h}: ${tw}x${th}`).toBe(true);
          expect(tw, `${preset} ${w}x${h}`).toBeGreaterThanOrEqual(1);
          expect(th, `${preset} ${w}x${h}`).toBeGreaterThanOrEqual(1);
        }
        const names = new Set(sizes.map(([tw, th]) => `${tw}x${th}`));
        expect(names, `${preset} ${w}x${h}: the scene's own size`).toContain(`${w}x${h}`);
        const share = (s: number) => `${Math.max(1, Math.round(w * s))}x${Math.max(1, Math.round(h * s))}`;
        expect(names, `${preset} ${w}x${h}: the light shafts`).toContain(share(POST.lightShafts.resolution));
        // Half-resolution shade on High, full on Ultra (so Ultra has no half-size shade target but the shafts').
        expect(names, `${preset} ${w}x${h}: the shade`).toContain(share(QUALITY[preset].ambientOcclusion));
        stack.dispose();
      }
    }
  });

  it('resizes the temporal history, the reflection mask and every ping-pong target with the buffer, and leaves none at the old size', () => {
    const stack = stackFor('ultra', 64, 36);
    const puddle = new THREE.Mesh(new THREE.PlaneGeometry());
    stack.setReflectiveSurfaces([{ mesh: puddle, strength: 0.6 }]);
    const { gl } = stubGl();
    stack.render(gl, new THREE.Scene(), new THREE.PerspectiveCamera()); // makes the ping-pong targets
    stack.setSize(320, 180);
    const targets = [...reachable(stack, THREE.WebGLRenderTarget)];
    expect(targets.length).toBeGreaterThan(6);
    // The reflection mask follows (the window's size, not a share of it).
    expect([reflectionOf(stack).mask!.width, reflectionOf(stack).mask!.height]).toEqual([320, 180]);
    for (const t of targets) expect([t.width, t.height], 'a target left at the old size').not.toEqual([64, 36]);
    // Full-size ones: the scene's, two ping-pong, two history, the shade pair, the mask.
    expect(targets.filter((t) => t.width === 320 && t.height === 180).length).toBeGreaterThanOrEqual(8);
    stack.dispose();
  });

  it('does nothing for a size it already has (no target is made again)', () => {
    const stack = stackFor('ultra', 64, 36);
    const resized = vi.spyOn(THREE.WebGLRenderTarget.prototype, 'setSize');
    stack.setSize(64, 36);
    expect(resized).not.toHaveBeenCalled();
    resized.mockRestore();
    stack.dispose();
  });
});

describe('the temporal blend across frames, a resize and a cut (G5 QA)', () => {
  it('has no history on its first frame, uses it on the next, and starts over after a resize or a reset', () => {
    const stack = stackFor('high');
    const { gl } = stubGl();
    const camera = new THREE.PerspectiveCamera();
    const has = () => taaOf(stack).resolve!.uniforms.hasHistory!.value;
    stack.render(gl, new THREE.Scene(), camera);
    expect(has()).toBe(0);
    stack.render(gl, new THREE.Scene(), camera);
    expect(has()).toBe(1);
    stack.setSize(80, 45);
    stack.render(gl, new THREE.Scene(), camera);
    expect(has(), 'a history of the old size is never read').toBe(0);
    stack.render(gl, new THREE.Scene(), camera);
    expect(has()).toBe(1);
    stack.reset();
    stack.render(gl, new THREE.Scene(), camera);
    expect(has(), 'after a cut or a restored context').toBe(0);
    stack.dispose();
  });

  it('walks eight jitter steps and repeats them, each within half a pixel, and puts the inverse projection back too', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 250);
    const plain = [...camera.projectionMatrix.elements];
    const plainInverse = [...camera.projectionMatrixInverse.elements];
    const stack = stackFor('high', 64, 36);
    const { gl, draws } = stubGl();
    for (let i = 0; i < POST.taa.jitterSamples * 2; i++) {
      stack.render(gl, new THREE.Scene(), camera);
      expect([...camera.projectionMatrix.elements], `frame ${i}: projection`).toEqual(plain);
      expect([...camera.projectionMatrixInverse.elements], `frame ${i}: inverse`).toEqual(plainInverse);
    }
    const scenes = draws.filter((d) => d.what === 'scene').map((d) => d.projection);
    const n = POST.taa.jitterSamples;
    expect(new Set(scenes.slice(0, n).map((p) => p.join()))).toHaveProperty('size', n);
    for (let i = 0; i < n; i++) expect(scenes[i + n], `step ${i} comes round again`).toEqual(scenes[i]);
    for (const p of scenes) {
      // A step moves the picture by at most half a pixel: 1 / width in NDC.
      expect(Math.abs(p[8]! - plain[8]!)).toBeLessThanOrEqual(1 / 64 + 1e-9);
      expect(Math.abs(p[9]! - plain[9]!)).toBeLessThanOrEqual(1 / 36 + 1e-9);
    }
    stack.dispose();
  });
});
