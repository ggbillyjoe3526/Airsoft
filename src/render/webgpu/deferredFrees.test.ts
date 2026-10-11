import type { WebGPURenderer } from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { deferUniformFrees } from './deferredFrees';

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
