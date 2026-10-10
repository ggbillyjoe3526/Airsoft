import * as THREE from 'three';
import { WebGPURenderer, WGSLNodeBuilder } from 'three/webgpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRESSING } from '../../../config/dressing';
import { DUST_MOTES, IMPACT_PUFFS, QUALITY } from '../../../config/render';
import { buildTerrain } from '../../../map/terrain';
import { WOODLAND } from '../../../map/woodland';
import { DustMotes } from '../../dustMotes';
import { Fireflies } from '../../fireflies';
import { ImpactGrit } from '../../impactGrit';
import { ImpactPuffs } from '../../impactPuffs';
import { SmokePlumes } from '../../smokePlumes';
import { fakeCanvas, mapSceneOf } from '../../testSupport';
import { GpuDressing } from './gpuDressing';
import { ParticleTwins } from './particleTwins';

/**
 * W5 QA: every compute pass, built into the shader Three would hand the GPU, with no GPU. The unit tests run the
 * kernels' maths on numbers; this builds the passes themselves (the TSL around them: the buffers, the atomics, the
 * culls) through Three's own node builder, for the WebGL2 back end (GLSL, transform feedback) and for WebGPU (WGSL), so
 * a pass Three cannot build, or that no longer fits the WebGL2 back end's transform feedback, fails here and not in a
 * player's browser.
 */

beforeEach(() => {
  vi.stubGlobal('document', { createElementNS: () => fakeCanvas(), createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** What a node builder needs of the renderer's back end, and a stand-in WebGPU one for the WGSL builder. */
interface Builder {
  compute: unknown;
  build(): void;
  computeShader: string;
  transforms: unknown[];
}
type MakeBuilder = (pass: unknown) => Builder;

function renderer(): WebGPURenderer {
  const r = new WebGPURenderer({ forceWebGL: true, canvas: fakeCanvas() });
  Object.assign(r, { compute: () => undefined, render: () => undefined, clear: () => undefined, setRenderTarget: () => undefined, _attributes: { delete: () => undefined } });
  return r;
}

/** GLSL: the WebGL2 back end's own node builder (what `renderer.compute` builds a pass with there). */
function glslBuilder(r: WebGPURenderer): MakeBuilder {
  const backend = r.backend as unknown as { createNodeBuilder(object: null, renderer: WebGPURenderer): Builder };
  return (pass) => {
    const b = backend.createNodeBuilder(null, r);
    b.compute = pass;
    b.build();
    return b;
  };
}

/** WGSL: the WebGPU back end's node builder, on a renderer that stands in for the parts a device would answer. */
function wgslBuilder(r: WebGPURenderer): MakeBuilder {
  const shim = Object.create(r) as WebGPURenderer;
  Object.assign(shim, { backend: { utils: { getTextureSampleData: () => ({ primarySamples: 1 }) } }, hasFeature: () => false });
  return (pass) => {
    const b = new (WGSLNodeBuilder as unknown as new (object: null, renderer: WebGPURenderer) => Builder)(null, shim);
    b.compute = pass;
    b.build();
    return b;
  };
}

/** The passes of a dressing's grass and stand-ins, by name. */
function dressingPasses(webgpu: boolean, r: WebGPURenderer): { grass: unknown[]; forest: unknown[] } {
  const dressing = new GpuDressing(r, webgpu);
  const { scene } = mapSceneOf(WOODLAND);
  dressing.frame(scene, new THREE.PerspectiveCamera(), QUALITY.high);
  const inner = dressing as unknown as { grass: { passes: unknown[] }; forest: { passes: unknown[] } };
  return { grass: inner.grass.passes, forest: inner.forest.passes };
}

/** The passes of one driver for each kind of particle pool. */
function particlePasses(r: WebGPURenderer): Record<string, unknown> {
  const twins = new ParticleTwins(r);
  const scene = new THREE.Scene();
  const motes = new DustMotes(DUST_MOTES.max);
  motes.setCount(10);
  const flies = new Fireflies(8, buildTerrain(-10, -10, 1, 20, 20, () => 0), [], new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 2, 10)));
  const plumes = new SmokePlumes([{ x: 0, y: 5, z: 0, radius: 0.5 }], DRESSING.smoke);
  const puffs = new ImpactPuffs(IMPACT_PUFFS);
  const grit = new ImpactGrit();
  grit.setEnabled(true);
  scene.add(motes.object, flies.object, plumes.object, puffs.object, grit.object);
  twins.scan(scene);
  const pass = (owner: { gpu?: unknown }): unknown => (owner.gpu as { pass: unknown }).pass;
  return { motes: pass(motes), fireflies: pass(flies), plumes: pass(plumes), puffs: pass(puffs), grit: pass(grit) };
}

describe('the particle passes build as GLSL (transform feedback) and as WGSL', () => {
  it('builds every driver\'s pass for both back ends', () => {
    const r = renderer();
    const passes = particlePasses(r);
    expect(Object.keys(passes)).toEqual(['motes', 'fireflies', 'plumes', 'puffs', 'grit']);
    for (const [name, pass] of Object.entries(passes)) {
      const gl = glslBuilder(r)(pass);
      expect(gl.computeShader, name).toContain('#version 300 es');
      expect(gl.computeShader, name).toContain('void main');
      const gpu = wgslBuilder(r)(pass);
      expect(gpu.computeShader, name).toContain('@compute');
      expect(gpu.computeShader, name).toContain('instanceIndex');
    }
  });

  it('writes at most four buffers in a pass on the WebGL2 back end (the most transform feedback is promised to write)', () => {
    const r = renderer();
    const build = glslBuilder(r);
    for (const [name, pass] of Object.entries(particlePasses(r))) {
      const written = build(pass).transforms.length;
      expect(written, name).toBeGreaterThan(0);
      expect(written, name).toBeLessThanOrEqual(4);
    }
    const { grass, forest } = dressingPasses(false, r);
    for (const pass of [...grass, ...forest]) expect(build(pass).transforms.length).toBeLessThanOrEqual(4);
  });
});

describe('the grass\'s and stand-ins\' passes (acceptance 2)', () => {
  it('builds for the WebGL2 back end with no atomics: every slot written in place, a culled one sized to nothing', () => {
    const r = renderer();
    const { grass, forest } = dressingPasses(false, r);
    // One pass each: no counter to reset on a back end that has none.
    expect(grass).toHaveLength(1);
    expect(forest).toHaveLength(1);
    const build = glslBuilder(r);
    for (const pass of [...grass, ...forest]) {
      const code = build(pass).computeShader;
      expect(code).toContain('#version 300 es');
      expect(code).not.toMatch(/atomic/i);
    }
  });

  it('builds for WebGPU as a reset and a cull with an atomic counter that packs the kept ones', () => {
    const r = renderer();
    const { grass, forest } = dressingPasses(true, r);
    expect(grass).toHaveLength(2);
    expect(forest).toHaveLength(2);
    const build = wgslBuilder(r);
    for (const [reset, cull] of [grass, forest] as [unknown, unknown][]) {
      const resetCode = build(reset).computeShader;
      expect(resetCode).toContain('atomicStore');
      const cullCode = build(cull).computeShader;
      expect(cullCode).toContain('atomicAdd');
      // The six frustum planes the cull is given each frame.
      expect(cullCode).toMatch(/array< vec4<f32>, 6 >/);
    }
  });
});
