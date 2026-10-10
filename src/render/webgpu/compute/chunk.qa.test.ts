import { describe, expect, it } from 'vitest';
import { GPU_FOREST, GPU_GRASS } from '../../../config/gpuDressing';
import { grassLevels } from './grassLayout';

/**
 * W5 QA: nothing compute-side in the main chunk (acceptance 3), and the caps the perf budget was set from
 * (acceptance 4). The imports are read as text, as webgpuFoundation.qa.test.ts does for
 * the node renderer: Vite's raw glob over the game's own sources.
 */

const SOURCES = import.meta.glob<string>(['/src/**/*.ts', '!/src/**/*.test.ts', '!/src/**/*.d.ts', '!/src/**/testSupport.ts'], { query: '?raw', import: 'default', eager: true });
const files = Object.entries(SOURCES).map(([path, text]) => ({ rel: path.replace(/^\/src\//, ''), text }));
const statements = (text: string): string[] => text.split(/^(?=import |export )/m);
/** The statements of `text` that import `module` (a path fragment) as a value (a type-only import is erased from the chunk). */
const valueImports = (text: string, module: RegExp): string[] => statements(text).filter((s) => /^(import|export)\s+(?!type\b)/.test(s) && module.test(s.split('\n').slice(0, 40).join('\n')));

describe('what the main chunk holds of the compute passes (acceptance 3)', () => {
  it('scans the game\'s sources, and its pattern catches a value import and spares a type import', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(valueImports("import { X } from './webgpu/compute/gpuDressing';\n", /from\s+['"][^'"]*\/compute\//)).toHaveLength(1);
    expect(valueImports("import type { X } from './webgpu/compute/gpuDressing';\n", /from\s+['"][^'"]*\/compute\//)).toHaveLength(0);
  });

  it('has the compute modules and the dressing\'s numbers imported as values only from inside render/webgpu/', () => {
    const outside = files.filter((f) => !f.rel.startsWith('render/webgpu/'));
    const reaching = outside.filter((f) => valueImports(f.text, /from\s+['"][^'"]*(\/compute\/|config\/gpuDressing|\/gpuDressing['"])/).length > 0);
    expect(reaching.map((f) => f.rel)).toEqual([]);
    // They do exist to be found: the node back end imports them.
    const backend = files.find((f) => f.rel === 'render/webgpu/nodeBackend.ts')!;
    expect(valueImports(backend.text, /compute\/gpuDressing/)).toHaveLength(1);
    expect(valueImports(backend.text, /compute\/particleTwins/)).toHaveLength(1);
  });

  it('has the CPU pools (main chunk) knowing the GPU path only as a type and a hook, never importing a node module or TSL', () => {
    for (const rel of ['render/dustMotes.ts', 'render/fireflies.ts', 'render/smokePlumes.ts', 'render/impactPuffs.ts', 'render/impactGrit.ts', 'render/mapMeshes.ts', 'render/atmosphere.ts', 'render/dressingEffects.ts', 'render/renderer.ts']) {
      const file = files.find((f) => f.rel === rel);
      expect(file, rel).toBeDefined();
      expect(valueImports(file!.text, /from\s+['"](three\/(webgpu|tsl)|[^'"]*\/webgpu\/)/), rel).toEqual([]);
    }
  });
});

describe('the dressing\'s caps are the ones the budget was set from (acceptance 4)', () => {
  it('keeps the caps where they were set (Ultra 160,000 blades at most, 2,000 stand-ins)', () => {
    expect(grassLevels('ultra').count).toBeLessThanOrEqual(160_000);
    expect(Math.round(2_000 * GPU_FOREST.share.ultra)).toBe(2_000);
    expect(GPU_GRASS.tiers.ultra.levels).toBe(4);
  });
});
