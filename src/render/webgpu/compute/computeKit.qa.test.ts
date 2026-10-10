import { WebGLBackend, WebGPURenderer } from 'three/webgpu';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeCanvas } from '../../testSupport';

/**
 * W5 QA: `followSwappedBuffers` (computeKit.ts) rides on private parts of Three 0.186's WebGL2 back end. A Three upgrade
 * that renames one must not quietly bring back the half-rate compute output the hook fixes (KNOWN_ISSUES): the hook says
 * so, loudly, and a pin on the Three source fails the upgrade's own test run.
 */

type Follow = (renderer: WebGPURenderer) => void;

/** A fresh copy of the module each time: what it says once, it says once per copy. */
async function freshFollow(): Promise<Follow> {
  vi.resetModules();
  return (await import('./computeKit')).followSwappedBuffers;
}

afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.resetModules());

describe('followSwappedBuffers when Three\'s private API changes shape', () => {
  let said: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.stubGlobal('document', { createElementNS: () => fakeCanvas(), createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Installs the hook on `backend` and runs a draw; whether it was loud about what it found (a throw or an error logged). */
  async function loud(backend: object, attributes: object[] = []): Promise<boolean> {
    const follow = await freshFollow();
    try {
      follow({ backend } as unknown as WebGPURenderer);
      (backend as { draw?: (o: unknown, i: unknown) => void }).draw?.({ getAttributes: () => attributes }, null);
    } catch {
      return true;
    }
    return said.mock.calls.length > 0;
  }

  // At 9c12534 this failed (the hook returned without a word); it is loud since 3f1266b.
  it('is loud when the WebGL2 back end has no draw to wrap (the hook would be doing nothing, and the bug be back)', async () => {
    expect(await loud({ isWebGLBackend: true, get: () => ({}) })).toBe(true);
  });

  it('is loud when the WebGL2 back end has no get to read a buffer\'s data with', async () => {
    expect(await loud({ isWebGLBackend: true, draw: () => undefined }, [{}])).toBe(true);
  });

  it('installs on Three\'s own WebGL2 back end without a word, and leaves WebGPU alone', async () => {
    const renderer = new WebGPURenderer({ forceWebGL: true, canvas: fakeCanvas() });
    const backend = renderer.backend as unknown as { isWebGLBackend: boolean; draw: unknown };
    expect(backend.isWebGLBackend).toBe(true);
    const original = backend.draw;
    const follow = await freshFollow();
    follow(renderer);
    // Wrapped (the hook is in place, not quietly skipped), and nothing said.
    expect(backend.draw).not.toBe(original);
    expect(said).not.toHaveBeenCalled();
    const gpu = { isWebGLBackend: false, draw: original };
    follow({ backend: gpu } as unknown as WebGPURenderer);
    expect(gpu.draw).toBe(original);
  });
});

describe('the parts of Three 0.186\'s WebGL2 back end the hook leans on (a Three upgrade must recheck them)', () => {
  const source = (fn: unknown): string => Function.prototype.toString.call(fn);

  it('has the back end\'s draw and get, with a draw that keeps its vertex array on the attributes\' data as vaoGPU', () => {
    const proto = WebGLBackend.prototype as unknown as Record<string, unknown>;
    expect(typeof proto.draw).toBe('function');
    expect(typeof proto.get).toBe('function');
    expect(source(proto.draw)).toContain('getAttributes()');
    expect(source(proto.draw)).toMatch(/\.vaoGPU/);
    expect(source(proto._createVao)).toContain('createVertexArray');
  });

  it('swaps a pass\'s two transform-feedback buffers after it (switchBuffers), the swap the hook follows', () => {
    const proto = WebGLBackend.prototype as unknown as Record<string, unknown>;
    expect(source(proto.compute)).toContain('switchBuffers');
    expect(source(proto.compute)).toContain('transformBuffer');
  });
});
