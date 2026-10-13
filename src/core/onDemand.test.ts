import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnDemand } from './onDemand';

// The spy on the fake setTimeout goes first, so the real one comes back: files share globals (isolate: false), and a
// fake left behind hangs the next file's timers.
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('OnDemand load and get', () => {
  it('returns null from get until the fetch arrives, then the value', async () => {
    const od = new OnDemand(() => Promise.resolve(7));
    expect(od.get()).toBeNull();
    const p = od.load();
    expect(od.get()).toBeNull();
    expect(await p).toBe(7);
    expect(od.get()).toBe(7);
  });

  it('shares one fetch between concurrent and later loads', async () => {
    const fetch = vi.fn(() => Promise.resolve('x'));
    const od = new OnDemand(fetch);
    const [a, b] = await Promise.all([od.load(), od.load()]);
    await od.load();
    expect(a).toBe('x');
    expect(b).toBe('x');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a failed fetch and fetches again on the next load', async () => {
    const fetch = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(3);
    const od = new OnDemand(fetch);
    await expect(od.load()).rejects.toThrow('net');
    expect(od.get()).toBeNull();
    expect(await od.load()).toBe(3);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('OnDemand preloadWhenIdle', () => {
  it('uses requestIdleCallback with the timeout when present', async () => {
    let cb: (() => void) | null = null;
    const ric = vi.fn((fn: () => void, _o: { timeout: number }) => {
      cb = fn;
      return 5;
    });
    vi.stubGlobal('requestIdleCallback', ric);
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    const fetch = vi.fn(() => Promise.resolve(1));
    const od = new OnDemand(fetch);
    od.preloadWhenIdle(1234);
    expect(ric).toHaveBeenCalledTimes(1);
    expect(ric.mock.calls[0]?.[1]).toEqual({ timeout: 1234 });
    expect(fetch).not.toHaveBeenCalled();
    cb!();
    expect(fetch).toHaveBeenCalledTimes(1);
    await od.load();
    expect(od.get()).toBe(1);
  });

  it('falls back to setTimeout when there is no requestIdleCallback', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const fetch = vi.fn(() => Promise.resolve(1));
    const od = new OnDemand(fetch);
    od.preloadWhenIdle(500);
    vi.advanceTimersByTime(499);
    expect(fetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('swallows a failed preload and lets the next load fetch again', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const fetch = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(2);
    const od = new OnDemand(fetch);
    od.preloadWhenIdle(10);
    await vi.advanceTimersByTimeAsync(10);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await od.load()).toBe(2);
  });

  it('does nothing once loaded, while pending, or when already scheduled', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const od = new OnDemand(() => Promise.resolve(1));
    od.preloadWhenIdle(10);
    od.preloadWhenIdle(10);
    expect(spy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10);
    await od.load();
    od.preloadWhenIdle(10);
    expect(spy).toHaveBeenCalledTimes(1);

    const pend = new OnDemand(() => new Promise<number>(() => undefined));
    void pend.load();
    pend.preloadWhenIdle(10);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('cancelPreload stops a scheduled preload (idle callback and timer)', () => {
    const cancel = vi.fn();
    vi.stubGlobal('requestIdleCallback', vi.fn(() => 9));
    vi.stubGlobal('cancelIdleCallback', cancel);
    const od = new OnDemand(() => Promise.resolve(1));
    od.preloadWhenIdle(10);
    od.cancelPreload();
    expect(cancel).toHaveBeenCalledWith(9);

    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const fetch = vi.fn(() => Promise.resolve(1));
    const od2 = new OnDemand(fetch);
    od2.preloadWhenIdle(10);
    od2.cancelPreload();
    vi.advanceTimersByTime(100);
    expect(fetch).not.toHaveBeenCalled();
    od2.preloadWhenIdle(10); // can be scheduled again
    vi.advanceTimersByTime(10);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
