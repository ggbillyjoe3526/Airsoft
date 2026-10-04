import { describe, expect, it, vi } from 'vitest';
import { SAVE_KEYS } from '../config/save';
import { MemoryStorage } from '../pool/testStorage';
import { loadSetting, numberIn, SETTINGS_KEY, saveSettingSoon } from '../settings/storage';
import { GuardedStorage } from './guardedStorage';
import { SAVE_FORMAT, type SaveData } from './saveFile';
import { SaveManager } from './saveManager';

const COLLECTION = 'airsoft.collection';

function setup(initial: Record<string, string> = {}, start = new Date(2026, 9, 4, 12, 0)) {
  const backing = new MemoryStorage();
  for (const [k, v] of Object.entries(initial)) backing.setItem(k, v);
  const storage = new GuardedStorage(backing);
  let now = start;
  const reload = vi.fn();
  const manager = new SaveManager({ storage, build: 'v0.1-test', reload, now: () => now });
  return { backing, storage, manager, reload, setNow: (d: Date) => (now = d) };
}

/** Everything a store holds, to start the next visit from. */
function contents(s: Storage): Record<string, string> {
  return Object.fromEntries([...Array(s.length).keys()].map((i) => [s.key(i)!, s.getItem(s.key(i)!)!]));
}

const collection = (fc: number) => JSON.stringify({ version: 1, owned: { '000001@common': 1 }, fc, tokens: 0, seed: 7 });

function saveWith(fc: number): SaveData {
  return { format: SAVE_FORMAT, build: 'v0.1-other', savedAt: '2026-10-01T10:00:00.000Z', stores: { settings: { version: 1, fov: 100 }, collection: JSON.parse(collection(fc)) } };
}

describe('save manager (M31)', () => {
  it('notes each save of a store, and the download', () => {
    const { storage, manager, setNow } = setup();
    expect(manager.lastSaved).toBeNull();
    const at = new Date(2026, 9, 4, 12, 5);
    setNow(at);
    storage.setItem(COLLECTION, collection(10));
    expect(manager.lastSaved?.getTime()).toBe(at.getTime());
    expect(manager.lastDownloaded).toBeNull();
    manager.downloaded();
    expect(manager.lastDownloaded?.getTime()).toBe(at.getTime());
    expect(JSON.parse(storage.getItem(SAVE_KEYS.meta)!)).toMatchObject({ format: SAVE_FORMAT, build: 'v0.1-test' });
  });

  it('takes the current save with pending slider changes in it', () => {
    const { storage, manager } = setup();
    saveSettingSoon('fov', 101, storage);
    expect(manager.current().stores.settings).toMatchObject({ fov: 101 });
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!).fov).toBe(101);
  });

  it('replace writes the loaded save, keeps the old one for Undo and reloads; Undo brings it back', () => {
    const { backing, storage, manager, reload } = setup({ [COLLECTION]: collection(50), 'airsoft.keyBindings': '{"fire":["KeyF"]}' });
    manager.replace(saveWith(500), 'load');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(backing.getItem(COLLECTION)!).fc).toBe(500);
    // A store the file doesn't carry goes back to its defaults.
    expect(backing.getItem('airsoft.keyBindings')).toBeNull();
    // Nothing the old visit holds can write over it before the reload.
    storage.setItem(COLLECTION, collection(1));
    expect(JSON.parse(backing.getItem(COLLECTION)!).fc).toBe(500);

    // The next visit, after the reload.
    const after = setup(contents(backing));
    const slot = after.manager.undoable();
    expect(slot?.what).toBe('load');
    expect(slot?.save.stores.collection).toMatchObject({ fc: 50 });
    after.manager.undo();
    expect(JSON.parse(after.backing.getItem(COLLECTION)!).fc).toBe(50);
    expect(after.backing.getItem('airsoft.keyBindings')).toBe('{"fire":["KeyF"]}');
    expect(after.backing.getItem(SAVE_KEYS.undo)).toBeNull();
  });

  it('delete clears every store (kept for Undo) and reloads', () => {
    const { backing, manager, reload } = setup({ [COLLECTION]: collection(50), [SETTINGS_KEY]: '{"version":1,"fov":99}' });
    manager.deleteSave();
    expect(reload).toHaveBeenCalled();
    expect(backing.getItem(COLLECTION)).toBeNull();
    expect(backing.getItem(SETTINGS_KEY)).toBeNull();
    expect(JSON.parse(backing.getItem(SAVE_KEYS.undo)!).what).toBe('delete');
  });

  it('never writes over a browser save from a newer format: everything lasts for the visit', () => {
    const newer = JSON.stringify({ format: SAVE_FORMAT + 1, build: 'v0.3', savedAt: null, downloadedAt: null });
    const { backing, storage, manager, reload } = setup({ [SAVE_KEYS.meta]: newer, [COLLECTION]: collection(70) });
    expect(manager.newerBuild).toBe('v0.3');
    expect(manager.keeping).toBe(false);
    expect(manager.canReplace).toBe(false);
    storage.setItem(COLLECTION, collection(1));
    expect(JSON.parse(backing.getItem(COLLECTION)!).fc).toBe(70);
    expect(backing.getItem(SAVE_KEYS.meta)).toBe(newer);
    manager.replace(saveWith(5), 'load');
    manager.deleteSave();
    expect(reload).not.toHaveBeenCalled();
  });

  it('keeps one restore point a day, skips an unchanged save, and holds three', () => {
    const { storage, manager, setNow } = setup();
    manager.keepRestorePoint();
    expect(manager.restorePoints()).toHaveLength(0); // nothing saved yet
    for (let day = 1; day <= 5; day++) {
      setNow(new Date(2026, 9, day, 9, 0));
      storage.setItem(COLLECTION, collection(day * 10));
      manager.keepRestorePoint();
      // A second start the same day keeps nothing new.
      storage.setItem(COLLECTION, collection(day * 10 + 1));
      manager.keepRestorePoint();
    }
    const points = manager.restorePoints();
    expect(points.map((p) => (p.stores.collection as { fc: number }).fc)).toEqual([50, 40, 30]);
    // A later day with the same save as the newest point adds nothing.
    setNow(new Date(2026, 9, 9, 9, 0));
    storage.setItem(COLLECTION, collection(50));
    manager.keepRestorePoint();
    expect(manager.restorePoints()).toHaveLength(3);
    expect((manager.restorePoints()[0]!.stores.collection as { fc: number }).fc).toBe(50);
  });

  it('a restore goes through Undo too', () => {
    const { backing, manager, setNow, storage } = setup({ [COLLECTION]: collection(10) });
    manager.keepRestorePoint();
    setNow(new Date(2026, 9, 5));
    storage.setItem(COLLECTION, collection(99));
    manager.replace(manager.restorePoints()[0]!, 'restore');
    expect(JSON.parse(backing.getItem(COLLECTION)!).fc).toBe(10);
    expect(JSON.parse(backing.getItem(SAVE_KEYS.undo)!).what).toBe('restore');
  });

  it('reads the replaced settings with the settings store after the reload', () => {
    const { backing, manager } = setup({ [SETTINGS_KEY]: '{"version":1,"fov":80}' });
    manager.replace(saveWith(1), 'load');
    const fresh = new GuardedStorage(backing);
    expect(loadSetting('fov', numberIn(60, 120), 90, fresh)).toBe(100);
  });

  it('asks the browser for persistent storage only when asked', async () => {
    const persist = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) };
    const manager = new SaveManager({ storage: new GuardedStorage(new MemoryStorage()), build: 'b', reload: () => undefined, persist });
    expect(await manager.protectedNow()).toBe(false);
    expect(persist.persist).not.toHaveBeenCalled();
    expect(await manager.protect()).toBe(true);
    const none = new SaveManager({ storage: new GuardedStorage(new MemoryStorage()), build: 'b', reload: () => undefined, persist: null });
    expect(await none.protect()).toBeNull();
  });
});
