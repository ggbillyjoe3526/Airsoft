import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { followSwappedBuffers, forgetSaid, freeBuffer } from './computeKit';

/**
 * W5: the two places the compute passes lean on Three's private API. `freeBuffer` frees a storage buffer through the
 * renderer's buffer store; on the WebGL2 back end a draw reading a compute pass's output (two GPU buffers Three swaps
 * after each pass) looks its vertex array up afresh every time, so it reads the buffer the pass wrote last. Both say so
 * once, loudly, when a Three upgrade has renamed what they use.
 */

afterEach(() => {
  forgetSaid();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fakeCanvas(): HTMLCanvasElement {
  return { style: {}, width: 300, height: 150, addEventListener: () => undefined, removeEventListener: () => undefined, getContext: () => null } as unknown as HTMLCanvasElement;
}

describe('freeBuffer', () => {
  it("frees through the buffer store a real WebGPURenderer has (Three 0.186's private `_attributes`)", () => {
    vi.stubGlobal('document', { createElementNS: () => fakeCanvas(), createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const renderer = new WebGPURenderer({ forceWebGL: true, canvas: fakeCanvas() });
    // The pin: a Three upgrade that renames the store fails here, not in a player's GPU memory.
    expect('_attributes' in renderer).toBe(true);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Not started yet: nothing uploaded, nothing to free, nothing said.
    freeBuffer(renderer, new THREE.BufferAttribute(new Float32Array(4), 4));
    const freed: unknown[] = [];
    (renderer as unknown as { _attributes: unknown })._attributes = { delete: (a: unknown) => freed.push(a) };
    const a = new THREE.BufferAttribute(new Float32Array(4), 4);
    freeBuffer(renderer, a);
    expect(freed).toEqual([a]);
    expect(error).not.toHaveBeenCalled();
  });

  it('says once, loudly, when the store is gone', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const renderer = {} as WebGPURenderer;
    freeBuffer(renderer, new THREE.BufferAttribute(new Float32Array(4), 4));
    freeBuffer(renderer, new THREE.BufferAttribute(new Float32Array(4), 4));
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toMatch(/_attributes is missing/);
  });
});

function backend(webgl: boolean, members: { vaoCache?: boolean; dual?: boolean; keepsVao?: boolean } = {}) {
  const { vaoCache = true, dual = true, keepsVao = true } = members;
  const store = new Map<object, Record<string, unknown>>();
  const get = (key: object) => {
    if (!store.has(key)) store.set(key, {});
    return store.get(key)!;
  };
  const drawn: unknown[] = [];
  const b: Record<string, unknown> = {
    isWebGLBackend: webgl,
    get,
    // Three's draw reads and keeps its attributes' `vaoGPU` (the hook checks its source says so).
    // Plain functions, not mocks: the hook reads the draw's own source.
    draw: keepsVao
      ? (o: { getAttributes(): object[] }, _info: unknown) => {
          const data = get(o.getAttributes());
          drawn.push(data.vaoGPU);
          if (data.vaoGPU === undefined) data.vaoGPU = 'made';
        }
      : (o: { getAttributes(): object[] }, _info: unknown) => void drawn.push(get(o.getAttributes()).vertexArray),
  };
  if (vaoCache) b.vaoCache = {};
  const storage = { isStorageInstancedBufferAttribute: true };
  get(storage).bufferGPU = 'buffer';
  if (dual) get(storage).switchBuffers = () => undefined;
  return { b, get, drawn, storage, renderer: { backend: b } as unknown as WebGPURenderer };
}

describe('followSwappedBuffers', () => {
  it('drops the cached vertex array of a draw reading a swapped buffer, and only of such a draw', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { b, get, drawn, storage, renderer } = backend(true);
    followSwappedBuffers(renderer);
    const plain = {};
    const computed = [plain, storage];
    const still = [plain];
    get(computed).vaoGPU = 'first';
    get(still).vaoGPU = 'kept';
    const draw = b.draw as (o: { getAttributes(): object[] }, info: unknown) => void;
    draw({ getAttributes: () => computed }, null);
    draw({ getAttributes: () => still }, null);
    draw({ getAttributes: () => computed }, null);
    // Three's draw ran each time, the swapped one's array dropped first.
    expect(drawn).toEqual([undefined, 'kept', undefined]);
    expect(error).not.toHaveBeenCalled();
  });

  it('leaves the WebGPU back end alone', () => {
    const { b, renderer } = backend(false);
    const original = b.draw;
    followSwappedBuffers(renderer);
    expect(b.draw).toBe(original);
  });

  it("says once when a private member it uses is gone: the back end's vaoCache, a buffer's switchBuffers, its draw's vaoGPU", () => {
    for (const [members, said] of [
      [{ vaoCache: false }, /draw, get or vaoCache/],
      [{ dual: false }, /switchBuffers/],
      [{ keepsVao: false }, /draw's vaoGPU/],
    ] as const) {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { b, storage, renderer } = backend(true, members);
      followSwappedBuffers(renderer);
      const draw = b.draw as (o: { getAttributes(): object[] }, info: unknown) => void;
      const attributes = [{}, storage];
      draw({ getAttributes: () => attributes }, null);
      draw({ getAttributes: () => attributes }, null);
      expect(error.mock.calls.filter((c) => said.test(String(c[0])))).toHaveLength(1);
      vi.restoreAllMocks();
    }
  });
});
