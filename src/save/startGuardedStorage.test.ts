import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../pool/testStorage';

/**
 * startGuardedStorage keeps a module singleton, so each test loads fresh copies of the modules (vi.resetModules) and
 * stubs the browser's localStorage.
 */
async function modules() {
  vi.resetModules();
  const guarded = await import('./guardedStorage');
  const settings = await import('../settings/storage');
  return { guarded, settings };
}

describe('the visit\'s guarded storage (M31)', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());
  // Test files share a worker's modules (isolate: false, CORE-15): the copies this file started must not reach the next.
  afterAll(() => vi.resetModules());

  it('browserStorage is plain localStorage before the save system starts, the guarded storage after', async () => {
    const local = new MemoryStorage();
    vi.stubGlobal('localStorage', local);
    const { guarded, settings } = await modules();
    expect(guarded.guardedStorage()).toBeNull();
    expect(settings.browserStorage()).toBe(local);
    const g = guarded.startGuardedStorage();
    expect(guarded.guardedStorage()).toBe(g);
    expect(settings.browserStorage()).toBe(g);
    // One per visit.
    expect(guarded.startGuardedStorage()).toBe(g);
    // What the stores write through browserStorage lands in localStorage and is noticed; the probe key is gone.
    const heard: string[] = [];
    g.onWrite((k) => heard.push(k));
    settings.browserStorage()!.setItem('airsoft.collection', '{}');
    expect(local.getItem('airsoft.collection')).toBe('{}');
    expect(heard).toEqual(['airsoft.collection']);
    expect(local.getItem('airsoft.probe')).toBeNull();
    expect(g.keeping).toBe(true);
  });

  it('with localStorage blocked outright, it starts over memory: still a storage, marked blocked', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      const { guarded, settings } = await modules();
      const g = guarded.startGuardedStorage();
      expect(g.blocked).toBe(true);
      expect(g.keeping).toBe(false);
      const store = settings.browserStorage()!;
      expect(store).toBe(g);
      store.setItem('airsoft.records', 'r');
      expect(store.getItem('airsoft.records')).toBe('r');
    } finally {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('a localStorage that reads but refuses writes is found at start-up and kept in memory', async () => {
    const local = new MemoryStorage();
    local.setItem('airsoft.settings', 'saved');
    local.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    vi.stubGlobal('localStorage', local);
    const { guarded } = await modules();
    const g = guarded.startGuardedStorage();
    expect(g.blocked).toBe(true);
    expect(g.keeping).toBe(false);
    expect(g.getItem('airsoft.settings')).toBe('saved');
    g.setItem('airsoft.settings', 'newer');
    expect(g.getItem('airsoft.settings')).toBe('newer');
    expect(local.getItem('airsoft.settings')).toBe('saved');
  });
});
