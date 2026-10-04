import { describe, expect, it, vi } from 'vitest';
import { type LockChannel, type SaveLocks, TabLock } from './tabLock';

/** Channels on one in-memory bus, delivering to every other channel as BroadcastChannel does (synchronously here). */
function bus() {
  const channels = new Set<LockChannel>();
  return () => {
    const ch: LockChannel = {
      onmessage: null,
      postMessage(data) {
        for (const other of channels) if (other !== ch) other.onmessage?.({ data: structuredClone(data) });
      },
      close: () => void channels.delete(ch),
    };
    channels.add(ch);
    return ch;
  };
}

const instant = () => Promise.resolve();

/** One exclusive Web Lock, as navigator.locks grants it: held until the holder's promise settles. */
function webLocks(): SaveLocks & { held: () => boolean } {
  let held = false;
  return {
    held: () => held,
    async request(_name, _options, callback) {
      if (held) return callback(null);
      held = true;
      try {
        await callback({});
      } finally {
        held = false;
      }
      return undefined;
    },
  };
}

/** A channel on which nothing is ever heard: a playing tab too busy to answer in time. */
const silent = (): LockChannel => ({ onmessage: null, postMessage: () => undefined, close: () => undefined });

describe('tab lock (M31)', () => {
  it('the first tab plays; a second waits', async () => {
    const channel = bus();
    const a = new TabLock({ channel, onLost: vi.fn(), id: 'a', wait: instant });
    expect(await a.claim()).toBe(true);
    const b = new TabLock({ channel, onLost: vi.fn(), id: 'b', wait: instant });
    expect(await b.claim()).toBe(false);
    expect(a.owns).toBe(true);
    expect(b.owns).toBe(false);
  });

  it('Play here: the playing tab lets go (writes and stops saving), and the new tab can then claim', async () => {
    const channel = bus();
    const lostA = vi.fn();
    const a = new TabLock({ channel, onLost: lostA, id: 'a', wait: instant });
    await a.claim();
    const b = new TabLock({ channel, onLost: vi.fn(), id: 'b', wait: instant });
    expect(await b.claim()).toBe(false);
    await b.take();
    expect(lostA).toHaveBeenCalledTimes(1);
    expect(a.owns).toBe(false);
    // After its reload the tab asks again: nobody is playing now.
    const b2 = new TabLock({ channel, onLost: vi.fn(), id: 'b2', wait: instant });
    expect(await b2.claim()).toBe(true);
  });

  it('two tabs starting together: only one plays, and two that both did settle on the lower id', async () => {
    const channel = bus();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const a = new TabLock({ channel, onLost: vi.fn(), id: 'a', wait: () => gate });
    const b = new TabLock({ channel, onLost: vi.fn(), id: 'b', wait: () => gate });
    const claims = Promise.all([a.claim(), b.claim()]);
    release();
    expect(await claims).toEqual([true, false]);

    // Both playing (each missed the other's question): the one that hears a lower id lets go.
    const lone = (): LockChannel => ({ onmessage: null, postMessage: () => undefined, close: () => undefined });
    const lostX = vi.fn();
    const lostY = vi.fn();
    const chX = lone();
    const chY = lone();
    const x = new TabLock({ channel: () => chX, onLost: lostX, id: 'x', wait: instant });
    const y = new TabLock({ channel: () => chY, onLost: lostY, id: 'y', wait: instant });
    await Promise.all([x.claim(), y.claim()]);
    chX.onmessage?.({ data: { t: 'here', id: 'y' } });
    chY.onmessage?.({ data: { t: 'here', id: 'x' } });
    expect([x.owns, y.owns]).toEqual([true, false]);
    expect(lostY).toHaveBeenCalledTimes(1);
    expect(lostX).not.toHaveBeenCalled();
  });

  it('with Web Locks, a second tab waits even when the playing tab is too busy to answer (the CI smoke race)', async () => {
    const locks = webLocks();
    const a = new TabLock({ channel: silent, locks, onLost: vi.fn(), id: 'b', wait: instant });
    expect(await a.claim()).toBe(true);
    // The second tab hears nobody on the channel, and its id is lower: without the lock it would have played.
    const b = new TabLock({ channel: silent, locks, onLost: vi.fn(), id: 'a', wait: instant });
    expect(await b.claim()).toBe(false);
    expect([a.owns, b.owns]).toEqual([true, false]);
  });

  it('with Web Locks, Play here makes the playing tab let go of the lock, so the reloaded tab plays', async () => {
    const channel = bus();
    const locks = webLocks();
    const lostA = vi.fn();
    const a = new TabLock({ channel, locks, onLost: lostA, id: 'a', wait: instant });
    expect(await a.claim()).toBe(true);
    const b = new TabLock({ channel, locks, onLost: vi.fn(), id: 'b', wait: instant });
    expect(await b.claim()).toBe(false);
    await b.take();
    await Promise.resolve(); // the lock goes once the holder's promise settles
    expect(lostA).toHaveBeenCalledTimes(1);
    expect(a.owns).toBe(false);
    expect(locks.held()).toBe(false);
    const b2 = new TabLock({ channel, locks, onLost: vi.fn(), id: 'b2', wait: instant });
    expect(await b2.claim()).toBe(true);
  });

  it('plays alone where the browser has no BroadcastChannel', async () => {
    const lock = new TabLock({ channel: null, onLost: vi.fn() });
    expect(await lock.claim()).toBe(true);
    await expect(lock.take()).resolves.toBeUndefined();
  });
});
