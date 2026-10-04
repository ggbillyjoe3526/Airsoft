import { describe, expect, it, vi } from 'vitest';
import { SAVE_KEYS } from '../config/save';
import { MemoryStorage } from '../pool/testStorage';
import { GuardedStorage } from './guardedStorage';
import { SAVE_FORMAT, type SaveData, saveFileText, saveObject } from './saveFile';
import { SaveManager } from './saveManager';

const COLLECTION = 'airsoft.collection';
const collection = (fc: number) => JSON.stringify({ version: 1, owned: { '000001@common': 1 }, fc, tokens: 0, seed: 7 });
const fcOf = (s: SaveData) => (s.stores.collection as { fc: number }).fc;

/** A browser store that refuses a write once a key's value is longer than its limit, or for a key it won't hold. */
class LimitedStorage extends MemoryStorage {
  limits = new Map<string, number>();
  refused = new Set<string>();
  override setItem(k: string, v: string): void {
    if (this.refused.has(k) || v.length > (this.limits.get(k) ?? Infinity)) throw new DOMException('full', 'QuotaExceededError');
    super.setItem(k, v);
  }
}

function setup(backing: Storage | null, start = new Date(2026, 9, 1, 9, 0)) {
  const storage = new GuardedStorage(backing);
  let now = start;
  const reload = vi.fn();
  const manager = new SaveManager({ storage, build: 'v0.1-test', reload, now: () => now });
  return { storage, manager, reload, setNow: (d: Date) => (now = d) };
}

/** Acceptance 5: restore points and Undo, when the disk is full. */
describe('restore points and Undo on a full disk (M31)', () => {
  it('drops the oldest restore point when a new one does not fit, and keeps the newest', () => {
    const backing = new LimitedStorage();
    const { storage, manager, setNow } = setup(backing);
    // Room for two restore points, not three.
    storage.setItem(COLLECTION, collection(10));
    manager.keepRestorePoint();
    const one = backing.getItem(SAVE_KEYS.restorePoints)!.length;
    backing.limits.set(SAVE_KEYS.restorePoints, Math.floor(one * 2.5));
    for (const day of [2, 3, 4]) {
      setNow(new Date(2026, 9, day, 9, 0));
      storage.setItem(COLLECTION, collection(day * 10));
      manager.keepRestorePoint();
    }
    expect(manager.restorePoints().map(fcOf)).toEqual([40, 30]);
    expect(manager.keeping).toBe(true); // a full restore list is not a saving problem
  });

  it('keeps no restore point, and raises no warning, when not even one fits', () => {
    const backing = new LimitedStorage();
    backing.refused.add(SAVE_KEYS.restorePoints);
    const { storage, manager } = setup(backing);
    storage.setItem(COLLECTION, collection(10));
    expect(() => manager.keepRestorePoint()).not.toThrow();
    expect(manager.restorePoints()).toEqual([]);
    expect(manager.blocked).toBe(false);
  });

  it('keeps no restore point when saving is blocked, and holds nothing in memory for it', () => {
    const { storage, manager } = setup(null);
    storage.setItem(COLLECTION, collection(10));
    manager.keepRestorePoint();
    expect(manager.restorePoints()).toEqual([]);
    expect(storage.getItem(SAVE_KEYS.restorePoints)).toBeNull();
  });

  it('refuses a load or delete with no room for the Undo copy, and keeps the restore points', () => {
    const backing = new LimitedStorage();
    const { storage, manager, reload } = setup(backing);
    storage.setItem(COLLECTION, collection(10));
    manager.keepRestorePoint();
    backing.refused.add(SAVE_KEYS.undo);
    const incoming: SaveData = { format: SAVE_FORMAT, build: 'b', savedAt: '', stores: { collection: JSON.parse(collection(500)) } };
    expect(manager.replace(incoming, 'load')).toBe(false);
    expect(manager.deleteSave()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(JSON.parse(backing.getItem(COLLECTION)!).fc).toBe(10);
    expect(manager.restorePoints()).toHaveLength(1);
    expect(manager.canReplace).toBe(true);
  });

  it('puts the old save back when the browser refuses one of the new stores (never half one save, half another)', () => {
    const backing = new LimitedStorage();
    const { storage, manager, reload } = setup(backing);
    storage.setItem(COLLECTION, collection(10));
    storage.setItem('airsoft.settings', JSON.stringify({ version: 1, fov: 80 }));
    // The settings go in first; the collection is refused.
    backing.limits.set(COLLECTION, collection(10).length);
    const incoming: SaveData = { format: SAVE_FORMAT, build: 'b', savedAt: '', stores: { settings: { version: 1, fov: 100 }, collection: JSON.parse(collection(1_000_000)) } };
    expect(manager.replace(incoming, 'load')).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(JSON.parse(backing.getItem('airsoft.settings')!).fov).toBe(80);
    expect(JSON.parse(backing.getItem(COLLECTION)!).fc).toBe(10);
    // Saving still works for the rest of the visit.
    expect(manager.keeping).toBe(true);
  });
});

describe('what can be replaced (M31)', () => {
  const incoming: SaveData = { format: SAVE_FORMAT, build: 'b', savedAt: '', stores: { collection: JSON.parse(collection(500)) } };

  it('with storage blocked, load, restore, Undo and delete do nothing (the loaded save would be gone after the reload)', () => {
    const { storage, manager, reload } = setup(null);
    storage.setItem(COLLECTION, collection(10));
    expect(manager.canReplace).toBe(false);
    manager.replace(incoming, 'load');
    manager.deleteSave();
    manager.undo();
    expect(reload).not.toHaveBeenCalled();
    expect(JSON.parse(storage.getItem(COLLECTION)!).fc).toBe(10);
    expect(manager.undoable()).toBeNull();
  });

  it('with another tab holding the save, nothing is replaced either', () => {
    const backing = new MemoryStorage();
    const { storage, manager, reload } = setup(backing);
    storage.setItem(COLLECTION, collection(10));
    storage.freeze('otherTab');
    expect(manager.otherTab).toBe(true);
    expect(manager.canReplace).toBe(false);
    manager.replace(incoming, 'load');
    manager.deleteSave();
    expect(reload).not.toHaveBeenCalled();
    expect(JSON.parse(backing.getItem(COLLECTION)!).fc).toBe(10);
  });

  it('once a load is under way a second one is ignored', () => {
    const { storage, manager, reload } = setup(new MemoryStorage());
    storage.setItem(COLLECTION, collection(10));
    manager.replace(incoming, 'load');
    manager.deleteSave();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('the save with storage blocked (M31 acceptance 2)', () => {
  it('current() holds the visit\'s data, and the file written from it reads back', () => {
    const { storage, manager } = setup(null);
    storage.setItem(COLLECTION, collection(321));
    storage.setItem('airsoft.settings', JSON.stringify({ version: 1, fov: 77 }));
    const save = manager.current();
    expect(save.stores.collection).toMatchObject({ fc: 321 });
    expect(save.stores.settings).toMatchObject({ fov: 77 });
    const file = JSON.parse(saveFileText(save));
    expect(file.summary.fc).toBe(321);
    expect(manager.blocked).toBe(true);
    // The download is still noted.
    manager.downloaded();
    expect(manager.lastDownloaded).not.toBeNull();
  });
});

describe('Undo and restore points read from damaged storage (M31)', () => {
  it('undoable is null for junk, an unknown action, a missing save or a save from a newer format', () => {
    const backing = new MemoryStorage();
    const { manager } = setup(backing);
    const save = saveObject({ format: SAVE_FORMAT, build: 'b', savedAt: '', stores: { collection: JSON.parse(collection(1)) } });
    for (const raw of ['not json', 'null', '5', JSON.stringify({ what: 'explode', save }), JSON.stringify({ what: 'load' }), JSON.stringify({ what: 'load', save: { ...save, format: SAVE_FORMAT + 1 } })]) {
      backing.setItem(SAVE_KEYS.undo, raw);
      expect(manager.undoable()).toBeNull();
    }
    backing.setItem(SAVE_KEYS.undo, JSON.stringify({ what: 'restore', save }));
    expect(manager.undoable()?.what).toBe('restore');
  });

  it('undo with nothing to undo does nothing', () => {
    const { manager, reload } = setup(new MemoryStorage());
    manager.undo();
    expect(reload).not.toHaveBeenCalled();
  });

  it('restorePoints skips entries that are not saves, and reads junk as none', () => {
    const backing = new MemoryStorage();
    const { manager } = setup(backing);
    const good = saveObject({ format: SAVE_FORMAT, build: 'b', savedAt: '2026-10-01T10:00:00.000Z', stores: { collection: JSON.parse(collection(4)) } });
    backing.setItem(SAVE_KEYS.restorePoints, JSON.stringify([{ hello: 1 }, good, 'x']));
    expect(manager.restorePoints().map(fcOf)).toEqual([4]);
    for (const raw of ['junk', '{"a":1}', 'null']) {
      backing.setItem(SAVE_KEYS.restorePoints, raw);
      expect(manager.restorePoints()).toEqual([]);
    }
  });

  it('a delete can be undone with every store, unknown fields included', () => {
    const backing = new MemoryStorage();
    backing.setItem(COLLECTION, JSON.stringify({ version: 1, owned: {}, fc: 9, tokens: 0, seed: 1, futureField: 'kept' }));
    const first = setup(backing);
    first.manager.deleteSave();
    expect(backing.getItem(COLLECTION)).toBeNull();
    const next = setup(backing);
    expect(next.manager.undoable()?.what).toBe('delete');
    next.manager.undo();
    expect(JSON.parse(backing.getItem(COLLECTION)!)).toMatchObject({ fc: 9, futureField: 'kept' });
  });
});

describe('persistent storage request (M31 acceptance 8)', () => {
  it('a refusal or a throwing browser is reported, not raised', async () => {
    const refusing = { persisted: async () => false, persist: async () => false };
    const throwing = { persisted: async () => { throw new Error('no'); }, persist: async () => { throw new Error('no'); } };
    const make = (persist: typeof refusing) => new SaveManager({ storage: new GuardedStorage(new MemoryStorage()), build: 'b', reload: () => undefined, persist });
    expect(await make(refusing).protect()).toBe(false);
    expect(await make(throwing).protect()).toBe(false);
    expect(await make(throwing).protectedNow()).toBeNull();
  });
});

describe('a newer build\'s save, downloaded by an older build (M31)', () => {
  it('is labelled with its own format and build, so the newer build migrates it from the right place', () => {
    const backing = new MemoryStorage();
    backing.setItem(SAVE_KEYS.meta, JSON.stringify({ format: SAVE_FORMAT + 1, build: 'v0.3', savedAt: null, downloadedAt: null }));
    backing.setItem(COLLECTION, collection(70));
    const { manager } = setup(backing);
    const save = manager.current();
    expect(save.format).toBe(SAVE_FORMAT + 1);
    expect(save.build).toBe('v0.3');
    // This build refuses its own download of it, as any newer save.
    expect(JSON.parse(saveFileText(save)).format).toBe(SAVE_FORMAT + 1);
  });
});

describe('saving again after a refused write (M31)', () => {
  it('writes what was held in memory once the browser takes writes again, and stops warning', () => {
    const backing = new LimitedStorage();
    const { storage, manager } = setup(backing);
    backing.refused.add(COLLECTION);
    storage.setItem(COLLECTION, collection(10));
    expect(manager.blocked).toBe(true);
    backing.refused.clear();
    storage.setItem('airsoft.settings', JSON.stringify({ version: 1, fov: 90 }));
    expect(manager.blocked).toBe(false);
    expect(JSON.parse(backing.getItem(COLLECTION)!).fc).toBe(10);
  });
});
