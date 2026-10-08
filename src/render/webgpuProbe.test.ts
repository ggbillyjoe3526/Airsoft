import { afterEach, describe, expect, it, vi } from 'vitest';
import { noWebGpu, probeWebGpu } from './webgpuProbe';

/** An adapter as the browser gives it, with what the probe reads. */
function adapter(features: string[], info: Record<string, unknown> = {}) {
  return { features: new Set(features), info };
}

// WebGPU overhaul W1: the adapter probe says "unavailable" quietly whenever the browser can't give an adapter.
describe('the WebGPU adapter probe (W1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('is unavailable with no navigator, no navigator.gpu or no requestAdapter, without a word on the console', async () => {
    const error = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');
    for (const nav of [undefined, {}, { gpu: undefined }, { gpu: {} }]) {
      expect(await probeWebGpu(nav as Parameters<typeof probeWebGpu>[0]), JSON.stringify(nav)).toEqual(noWebGpu());
    }
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('is unavailable when the adapter comes back null (no usable GPU), or asking throws or rejects', async () => {
    const error = vi.spyOn(console, 'error');
    expect(await probeWebGpu({ gpu: { requestAdapter: () => Promise.resolve(null) } })).toEqual(noWebGpu());
    expect(await probeWebGpu({ gpu: { requestAdapter: () => Promise.reject(new Error('blocked')) } })).toEqual(noWebGpu());
    expect(
      await probeWebGpu({
        gpu: {
          requestAdapter: () => {
            throw new Error('no');
          },
        },
      }),
    ).toEqual(noWebGpu());
    expect(error).not.toHaveBeenCalled();
  });

  it('gives up after its timeout on a browser that never answers', async () => {
    vi.useFakeTimers();
    const asked = probeWebGpu({ gpu: { requestAdapter: () => new Promise(() => undefined) } }, 3000);
    await vi.advanceTimersByTimeAsync(2999);
    let settled = false;
    void asked.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await asked).toEqual(noWebGpu());
  });

  it('reads an adapter: its name, whether it offers timestamp queries, whether it is the software one', async () => {
    const asked: unknown[] = [];
    const gpu = {
      requestAdapter: (options?: unknown) => {
        asked.push(options);
        return Promise.resolve(adapter(['timestamp-query', 'shader-f16'], { vendor: 'nvidia', architecture: 'ada', description: '' }));
      },
    };
    expect(await probeWebGpu({ gpu })).toEqual({ available: true, name: 'nvidia ada', timestamps: true, software: false });
    expect(asked).toEqual([{ powerPreference: 'high-performance' }]);
    const plain = { requestAdapter: () => Promise.resolve(adapter([], { isFallbackAdapter: true })) };
    expect(await probeWebGpu({ gpu: plain })).toEqual({ available: true, name: '', timestamps: false, software: true });
    // An older browser's adapter without `info`.
    const old = { requestAdapter: () => Promise.resolve({ features: new Set<string>() }) };
    expect(await probeWebGpu({ gpu: old })).toEqual({ available: true, name: '', timestamps: false, software: false });
  });
});
