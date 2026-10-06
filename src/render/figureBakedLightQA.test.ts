import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HITS } from '../config/hits';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import type { CharacterRenderer as CharacterRendererClass } from './characterRenderer';
import type { ProbeGrid } from './probeGrid';

/**
 * QA for the figures' baked light (G6): reading the probes as the figures walk makes no Three.js math object a frame.
 * (A heap measurement was tried and dropped: whether V8 boxes a double a frame depends on when its compiler gets to the
 * code, on a loaded machine it varies from 16 to 100 bytes a figure; the constructors counted below do not.)
 *
 * The tests run with module isolation off (vite.config.ts), so the counting copy of Three.js is loaded into a registry of
 * its own (`vi.resetModules` before and after), never into the one other test files share.
 */

const made = { count: 0 };

/** The figure renderer built on a Three.js whose math classes count the objects made through them. */
async function countingRenderer(): Promise<typeof CharacterRendererClass> {
  vi.resetModules();
  vi.doMock('three', async (importOriginal) => {
    const three = await importOriginal<Record<string, unknown>>();
    const counted: Record<string, unknown> = {};
    for (const name of ['Color', 'Vector2', 'Vector3', 'Vector4', 'Quaternion', 'Euler', 'Matrix3', 'Matrix4', 'Box3', 'Sphere']) {
      const Base = three[name] as new (...args: unknown[]) => object;
      counted[name] = class extends Base {
        constructor(...args: unknown[]) {
          super(...args);
          made.count++;
        }
      };
    }
    return { ...three, ...counted };
  });
  return (await import('./characterRenderer')).CharacterRenderer;
}

/** Dark where x < 0, open and orange where x >= 0, so a walking figure changes its tint every frame. */
function grid(): ProbeGrid {
  const nx = 20;
  const ny = 4;
  const nz = 4;
  const data = new Uint8Array(nx * ny * nz * 4);
  for (let i = 0; i < nx * ny * nz; i++) data.set(i % nx < 10 ? [0, 0, 0, 0] : [255, 128, 32, 255], i * 4);
  return { version: 1, preset: 'day', hash: 0, nx, ny, nz, origin: [-9.5, 0, -1.5], spacing: 1, scale: 1, data };
}

describe('figures under the baked light allocate nothing per frame (G6 QA)', () => {
  beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
  afterAll(() => vi.unstubAllGlobals());
  afterEach(() => {
    vi.doUnmock('three');
    vi.resetModules();
  });

  /** The math objects made over `frames` frames of `update`, the figures walking from the dark to the open and back. */
  function madeOver(CharacterRenderer: typeof CharacterRendererClass, frames: number, probes: boolean): number {
    const characters = [createCharacter(0, vec3(-6, 0, 0), 0), createCharacter(1, vec3(6, 0, 0), 1)];
    const r = new CharacterRenderer(characters, [0x3d8bff, 0xff8a2a], HITS);
    if (probes) r.setBakedLight(grid());
    r.setTorchLift(new Float32Array([0.5, 0.25]), 0xffffff);
    const frame = (i: number): void => {
      characters[0]!.position.x = -9 + (i % 18);
      characters[1]!.position.x = 9 - (i % 18);
      r.update(1, 0.016, -1);
    };
    frame(0);
    const before = made.count;
    for (let i = 1; i <= frames; i++) frame(i);
    const used = made.count - before;
    r.dispose();
    return used;
  }

  it('makes no colour, vector or matrix as it reads the probes, frame after frame', async () => {
    const CharacterRenderer = await countingRenderer();
    const baseline = madeOver(CharacterRenderer, 200, false);
    expect(madeOver(CharacterRenderer, 200, true)).toBe(baseline);
  });

  it('counts what it counts (the guard works: a figure built makes colours)', async () => {
    const CharacterRenderer = await countingRenderer();
    const before = made.count;
    const r = new CharacterRenderer([createCharacter(0, vec3(0, 0, 0), 0)], [0x3d8bff], HITS);
    r.dispose();
    expect(made.count).toBeGreaterThan(before);
  });
});
