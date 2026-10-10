import type { WebGPURenderer } from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { followSwappedBuffers } from './computeKit';

/**
 * W5: on the WebGL2 back end a draw reading a compute pass's output (two GPU buffers Three swaps after each pass) looks
 * its vertex array up afresh every time, so it reads the buffer the pass wrote last; other draws keep their cached one.
 */

function backend(webgl: boolean) {
  const store = new Map<object, Record<string, unknown>>();
  const get = (key: object) => {
    if (!store.has(key)) store.set(key, {});
    return store.get(key)!;
  };
  const drawn: unknown[] = [];
  const b = { isWebGLBackend: webgl, get, draw: vi.fn((o: { getAttributes(): object[] }, _info: unknown) => void drawn.push(get(o.getAttributes()).vaoGPU)) };
  return { b, get, drawn, renderer: { backend: b } as unknown as WebGPURenderer };
}

describe('followSwappedBuffers', () => {
  it('drops the cached vertex array of a draw reading a swapped buffer, and only of such a draw', () => {
    const { b, get, drawn, renderer } = backend(true);
    const original = b.draw;
    followSwappedBuffers(renderer);
    const swapped = {};
    get(swapped).switchBuffers = () => undefined;
    const plain = {};
    const computed = [plain, swapped];
    const still = [plain];
    get(computed).vaoGPU = 'first';
    get(still).vaoGPU = 'kept';
    b.draw({ getAttributes: () => computed }, null);
    b.draw({ getAttributes: () => still }, null);
    expect(original).toHaveBeenCalledTimes(2);
    expect(drawn).toEqual([undefined, 'kept']);
  });

  it('leaves the WebGPU back end alone', () => {
    const { b, renderer } = backend(false);
    const original = b.draw;
    followSwappedBuffers(renderer);
    expect(b.draw).toBe(original);
  });
});
