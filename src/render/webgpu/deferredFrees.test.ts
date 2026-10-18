import { WebGPURenderer } from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { forgetSaid } from './compute/computeKit';
import { deferUniformFrees, dropFreedVertexArrays } from './deferredFrees';

/** A stand-in for Three's WebGPU back end: its per-object store and its uniform buffer free. */
function fakeBackend(webgpu = true) {
  const store = new Map<object, { buffer?: { destroy: ReturnType<typeof vi.fn> } }>();
  const original = vi.fn();
  const backend = {
    isWebGPUBackend: webgpu,
    get: (key: object) => {
      if (!store.has(key)) store.set(key, {});
      return store.get(key)!;
    },
    delete: (key: object) => void store.delete(key),
    destroyUniformBuffer: original,
  };
  return { renderer: { backend } as unknown as WebGPURenderer, backend, store, original };
}

describe('uniform buffers freed mid-frame wait for the frame’s submit (W6a)', () => {
  it('lets the binding go at once but destroys its GPU buffer only at the flush', () => {
    const { renderer, backend, store, original } = fakeBackend();
    const frees = deferUniformFrees(renderer);
    const binding = {};
    const buffer = { destroy: vi.fn() };
    store.set(binding, { buffer });
    backend.destroyUniformBuffer(binding);
    expect(original).not.toHaveBeenCalled();
    expect(store.has(binding)).toBe(false); // made again meanwhile, it gets a buffer of its own
    expect(buffer.destroy).not.toHaveBeenCalled();
    const again = { destroy: vi.fn() };
    backend.get(binding).buffer = again;
    frees.flush();
    expect(buffer.destroy).toHaveBeenCalledTimes(1);
    expect(again.destroy).not.toHaveBeenCalled();
    frees.flush();
    expect(buffer.destroy).toHaveBeenCalledTimes(1);
  });

  it('leaves the WebGL2 back end as it is', () => {
    const { renderer, backend, original } = fakeBackend(false);
    deferUniformFrees(renderer).flush();
    expect(backend.destroyUniformBuffer).toBe(original);
  });

  it('says once, and changes nothing, when a private member it needs is gone', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { renderer, backend } = fakeBackend();
    (backend as { delete?: unknown }).delete = undefined;
    const before = backend.destroyUniformBuffer;
    deferUniformFrees(renderer);
    deferUniformFrees(renderer);
    expect(backend.destroyUniformBuffer).toBe(before);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});

/** A stand-in for Three's WebGL2 back end: its per-object store (with each uploaded attribute's id), its vertex arrays and
 * its attribute free. */
function fakeWebGL(webgl = true) {
  const store = new Map<object, { id?: number }>();
  const destroyed: object[] = [];
  const backend = {
    isWebGLBackend: webgl,
    vaoCache: {} as Record<string, unknown>,
    get: (key: object) => {
      if (!store.has(key)) store.set(key, {});
      return store.get(key)!;
    },
    destroyAttribute: (a: object) => {
      destroyed.push(a);
      store.delete(a);
    },
  };
  return { renderer: { backend } as unknown as WebGPURenderer, backend, store, destroyed };
}

describe('vertex arrays let go with their attributes on WebGL2 (BP6c)', () => {
  it('drops every cached array made with a freed attribute, once the batch is in, and keeps the rest', async () => {
    const { renderer, backend, store, destroyed } = fakeWebGL();
    const original = backend.destroyAttribute;
    dropFreedVertexArrays(renderer);
    const [a, b, c] = [{}, {}, {}];
    store.set(a, { id: 1 });
    store.set(b, { id: 2 });
    store.set(c, { id: 12 });
    backend.vaoCache = { ':1:2': 'ab', ':2': 'b', ':12': 'c', ':12:21': 'cx' };
    backend.destroyAttribute(a);
    backend.destroyAttribute(b);
    // Three's own free still runs, at once.
    expect(destroyed).toEqual([a, b]);
    expect(Object.keys(backend.vaoCache)).toHaveLength(4);
    await Promise.resolve();
    // Ids match whole: freeing 1 and 2 leaves 12's arrays.
    expect(backend.vaoCache).toEqual({ ':12': 'c', ':12:21': 'cx' });
    // A never-uploaded attribute has no id and drops nothing.
    backend.destroyAttribute({});
    await Promise.resolve();
    expect(Object.keys(backend.vaoCache)).toHaveLength(2);
    expect(original).not.toBe(backend.destroyAttribute);
  });

  it('leaves the WebGPU back end as it is', () => {
    const { renderer, backend } = fakeWebGL(false);
    const before = backend.destroyAttribute;
    dropFreedVertexArrays(renderer);
    expect(backend.destroyAttribute).toBe(before);
  });

  it("pins the members a real renderer's WebGL2 back end has (Three 0.186's private `vaoCache`)", () => {
    const canvas = { style: {}, width: 300, height: 150, addEventListener: () => undefined, removeEventListener: () => undefined, getContext: () => null };
    vi.stubGlobal('document', { createElementNS: () => canvas, createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    try {
      const renderer = new WebGPURenderer({ forceWebGL: true, canvas: canvas as unknown as HTMLCanvasElement });
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      forgetSaid();
      dropFreedVertexArrays(renderer);
      expect(error).not.toHaveBeenCalled();
      error.mockRestore();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('says once, and changes nothing, when a private member it needs is gone', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    forgetSaid();
    const { renderer, backend } = fakeWebGL();
    (backend as { vaoCache?: unknown }).vaoCache = undefined;
    const before = backend.destroyAttribute;
    dropFreedVertexArrays(renderer);
    dropFreedVertexArrays(renderer);
    expect(backend.destroyAttribute).toBe(before);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
