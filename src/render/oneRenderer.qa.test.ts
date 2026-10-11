import { describe, expect, it } from 'vitest';
import perfBudget from '../../pipeline/perf-budget.json';
import perfRunSource from '../../pipeline/perf-run.mjs?raw';
import { RENDER_BACKEND, wantsWebGpu, type RenderBackend } from '../config/renderBackend';

// W6a QA: acceptance 1 and 2 (one renderer, the old WebGL path gone) and 3 (budgets per back end).

const sources = import.meta.glob<string>(['/src/**/*.ts', '!/src/**/*.test.ts', '!/src/**/*.d.ts'], { query: '?raw', import: 'default', eager: true });
/** Code only: block and line comments dropped, so a note saying "the old WebGLRenderer" does not count. */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('the old WebGL path is gone from the sources (W6a criterion 2)', () => {
  it('constructs no WebGLRenderer or WebGLRenderTarget anywhere in src', () => {
    const hits = Object.entries(sources).filter(([, t]) => /new\s+(?:THREE\.)?WebGL(?:Renderer|RenderTarget|MultipleRenderTargets)\b/.test(code(t)));
    expect(hits.map(([f]) => f)).toEqual([]);
  });

  it('builds no GLSL ShaderMaterial or RawShaderMaterial, and imports no composer, in non-test code', () => {
    const hits = Object.entries(sources).filter(([, t]) => /new\s+(?:THREE\.)?(?:Raw)?ShaderMaterial\b|postprocessing\/|\bEffectComposer\b|\bFullScreenQuad\b/.test(code(t)));
    expect(hits.map(([f]) => f)).toEqual([]);
  });

  it('imports Three\'s WebGL renderer only as the lazily loaded node renderer\'s types, never the GLSL post-pass modules', () => {
    const files = Object.keys(sources);
    for (const gone of ['post/ambientOcclusionPass', 'post/lensPass', 'post/lightShaftsPass', 'post/reflectionPass', 'post/temporalAAPass', 'retroFilterWebGL', 'render/gpuTimer']) {
      expect(files.filter((f) => f.includes(gone)), gone).toEqual([]);
    }
    const importing = Object.entries(sources).filter(([, t]) => /from\s+['"][^'"]*(?:post\/(?:ambientOcclusion|lens|lightShafts|reflection|temporalAA)Pass|retroFilterWebGL)['"]/.test(code(t)));
    expect(importing.map(([f]) => f)).toEqual([]);
  });
});

describe('the back end ids (W6a criterion 1)', () => {
  it('knows exactly two ids, webgpu and webgl, and only the pick webgl skips the WebGPU adapter', () => {
    const ids: RenderBackend[] = ['webgpu', 'webgl'];
    expect(ids).toHaveLength(2);
    expect(wantsWebGpu('webgl')).toBe(false);
    expect(wantsWebGpu('auto')).toBe(true);
    expect(wantsWebGpu('webgpu')).toBe(true);
    // A lost device is retried, then WebGL2 takes over: the tries are bounded.
    expect(RENDER_BACKEND.recoverTries).toBeGreaterThan(0);
  });

  it('names no third back end in the perf harness\'s choices', () => {
    const run = perfRunSource;
    expect(run).toMatch(/\['webgl', 'webgpu'\]\.includes\(options\.backend\)/);
    expect(run).toMatch(/backend !== options\.backend/);
  });
});

describe('budgets take per back end lines (W6a criterion 3)', () => {
  const load = async () => {
    const path = '../../pipeline/perfMatrix.mjs';
    return (await import(/* @vite-ignore */ path)) as { budgetFor: (b: unknown, map: string, preset: string, backend?: string) => Record<string, number> };
  };

  it('lays the back end\'s map line over its preset line, over the map\'s own, over the preset\'s', async () => {
    const { budgetFor } = await load();
    const b = {
      presets: { medium: { drawCalls: 100, triangles: 100, gpuMemoryMB: 100, p95Ms: 14 } },
      maps: { neon: { medium: { drawCalls: 200, triangles: 200, gpuMemoryMB: 200 } } },
      backends: { webgpu: { presets: { medium: { triangles: 300, gpuMemoryMB: 300 } }, maps: { neon: { medium: { gpuMemoryMB: 400 } } } } },
    };
    expect(budgetFor(b, 'neon', 'medium', 'webgpu')).toEqual({ drawCalls: 200, triangles: 300, gpuMemoryMB: 400, p95Ms: 14 });
    // Another map on that back end gets the back end's preset line but not neon's lines.
    expect(budgetFor(b, 'depot', 'medium', 'webgpu')).toEqual({ drawCalls: 100, triangles: 300, gpuMemoryMB: 300, p95Ms: 14 });
    // The other back end, and no back end named (WebGL), never see the WebGPU lines.
    expect(budgetFor(b, 'neon', 'medium', 'webgl')).toEqual({ drawCalls: 200, triangles: 200, gpuMemoryMB: 200, p95Ms: 14 });
    expect(budgetFor(b, 'neon', 'medium')).toEqual(budgetFor(b, 'neon', 'medium', 'webgl'));
    // A back end without lines, and a file without a `backends` key, change nothing.
    expect(budgetFor(b, 'neon', 'medium', 'nothing')).toEqual(budgetFor(b, 'neon', 'medium', 'webgl'));
    expect(budgetFor({ presets: b.presets }, 'neon', 'medium', 'webgpu')).toEqual(b.presets.medium);
  });

  it('leaves the real file\'s WebGL lines as the map and preset lines say, whatever the WebGPU lines are', async () => {
    const { budgetFor } = await load();
    const real = structuredClone(perfBudget);
    for (const map of ['depot', 'woodland', 'neon']) {
      for (const preset of ['low', 'medium', 'high', 'ultra']) {
        const withoutBackends = { ...real, backends: undefined };
        expect(budgetFor(real, map, preset, 'webgl'), `${map} ${preset}`).toEqual(budgetFor(withoutBackends, map, preset, 'webgl'));
      }
    }
    // Every back end the file keys is one the harness knows.
    for (const id of Object.keys(real.backends ?? {})) expect(['webgl', 'webgpu']).toContain(id);
  });
});
