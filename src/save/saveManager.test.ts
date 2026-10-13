import { describe, expect, it, vi } from 'vitest';
import { SAVE_KEYS } from '../config/save';
import { MemoryStorage } from '../pool/testStorage';
import { loadSetting, numberIn, SETTINGS_KEY, saveSettingSoon } from '../settings/storage';
import { GAME_LEVELS } from '../progress/gameLevels';
import { loadProgress, newProgress } from '../progress/progress';
import { GuardedStorage } from './guardedStorage';
import { parseSaveText, SAVE_FORMAT, type SaveData } from './saveFile';
import { SaveManager } from './saveManager';

const PROGRESS = 'airsoft.progress';

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

const progress = (xp: number) => JSON.stringify({ version: 1, xp, unlocked: ['000001'], rev: 0 });

function saveWith(xp: number): SaveData {
  return { format: SAVE_FORMAT, build: 'v0.1-other', savedAt: '2026-10-01T10:00:00.000Z', stores: { settings: { version: 1, fov: 100 }, progress: JSON.parse(progress(xp)) } };
}

describe('save manager (M31)', () => {
  it('notes each save of a store, and the download', () => {
    const { storage, manager, setNow } = setup();
    expect(manager.lastSaved).toBeNull();
    const at = new Date(2026, 9, 4, 12, 5);
    setNow(at);
    storage.setItem(PROGRESS, progress(10));
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
    const { backing, storage, manager, reload } = setup({ [PROGRESS]: progress(50), 'airsoft.keyBindings': '{"fire":["KeyF"]}' });
    manager.replace(saveWith(500), 'load');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(backing.getItem(PROGRESS)!).xp).toBe(500);
    // A store the file doesn't carry goes back to its defaults.
    expect(backing.getItem('airsoft.keyBindings')).toBeNull();
    // Nothing the old visit holds can write over it before the reload.
    storage.setItem(PROGRESS, progress(1));
    expect(JSON.parse(backing.getItem(PROGRESS)!).xp).toBe(500);

    // The next visit, after the reload.
    const after = setup(contents(backing));
    const slot = after.manager.undoable();
    expect(slot?.what).toBe('load');
    expect(slot?.save.stores.progress).toMatchObject({ xp: 50 });
    after.manager.undo();
    expect(JSON.parse(after.backing.getItem(PROGRESS)!).xp).toBe(50);
    expect(after.backing.getItem('airsoft.keyBindings')).toBe('{"fire":["KeyF"]}');
    expect(after.backing.getItem(SAVE_KEYS.undo)).toBeNull();
  });

  it('a format 1 save (the Armory\'s collection) loads at level 0 with its starting kit, its other stores kept (LV1)', () => {
    const { backing, manager } = setup({ [PROGRESS]: progress(900) });
    const old = { settings: { version: 1, fov: 100 }, collection: { version: 1, owned: { '000001@common': 1 }, fc: 5000, tokens: 3, seed: 7 } };
    const parsed = parseSaveText(JSON.stringify({ game: 'Airsoft', format: 1, build: '0.1 Dev 5', stores: old }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    manager.replace(parsed.save, 'load');
    expect(backing.getItem(PROGRESS)).toBeNull();
    expect(backing.getItem('airsoft.collection')).toBeNull();
    const fresh = new GuardedStorage(backing);
    expect(loadProgress(GAME_LEVELS, fresh)).toEqual(newProgress(GAME_LEVELS));
    expect(loadSetting('fov', numberIn(60, 120), 90, fresh)).toBe(100);
  });

  it('delete clears every store (kept for Undo) and reloads', () => {
    const { backing, manager, reload } = setup({ [PROGRESS]: progress(50), [SETTINGS_KEY]: '{"version":1,"fov":99}' });
    manager.deleteSave();
    expect(reload).toHaveBeenCalled();
    expect(backing.getItem(PROGRESS)).toBeNull();
    expect(backing.getItem(SETTINGS_KEY)).toBeNull();
    expect(JSON.parse(backing.getItem(SAVE_KEYS.undo)!).what).toBe('delete');
  });

  it('never writes over a browser save from a newer format: everything lasts for the visit', () => {
    const newer = JSON.stringify({ format: SAVE_FORMAT + 1, build: 'v0.3', savedAt: null, downloadedAt: null });
    const { backing, storage, manager, reload } = setup({ [SAVE_KEYS.meta]: newer, [PROGRESS]: progress(70) });
    expect(manager.newerBuild).toBe('v0.3');
    expect(manager.keeping).toBe(false);
    expect(manager.canReplace).toBe(false);
    storage.setItem(PROGRESS, progress(1));
    expect(JSON.parse(backing.getItem(PROGRESS)!).xp).toBe(70);
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
      storage.setItem(PROGRESS, progress(day * 10));
      manager.keepRestorePoint();
      // A second start the same day keeps nothing new.
      storage.setItem(PROGRESS, progress(day * 10 + 1));
      manager.keepRestorePoint();
    }
    const points = manager.restorePoints();
    expect(points.map((p) => (p.stores.progress as { xp: number }).xp)).toEqual([50, 40, 30]);
    // A later day with the same save as the newest point adds nothing.
    setNow(new Date(2026, 9, 9, 9, 0));
    storage.setItem(PROGRESS, progress(50));
    manager.keepRestorePoint();
    expect(manager.restorePoints()).toHaveLength(3);
    expect((manager.restorePoints()[0]!.stores.progress as { xp: number }).xp).toBe(50);
  });

  it('a restore goes through Undo too', () => {
    const { backing, manager, setNow, storage } = setup({ [PROGRESS]: progress(10) });
    manager.keepRestorePoint();
    setNow(new Date(2026, 9, 5));
    storage.setItem(PROGRESS, progress(99));
    manager.replace(manager.restorePoints()[0]!, 'restore');
    expect(JSON.parse(backing.getItem(PROGRESS)!).xp).toBe(10);
    expect(JSON.parse(backing.getItem(SAVE_KEYS.undo)!).what).toBe('restore');
  });

  it('reads the replaced settings with the settings store after the reload', () => {
    const { backing, manager } = setup({ [SETTINGS_KEY]: '{"version":1,"fov":80}' });
    manager.replace(saveWith(1), 'load');
    const fresh = new GuardedStorage(backing);
    expect(loadSetting('fov', numberIn(60, 120), 90, fresh)).toBe(100);
  });

  it('stops telling a listener once the function onChange returned is called (Game.dispose relies on it, audit CORE-07)', () => {
    const { manager, storage } = setup();
    const heard = vi.fn();
    const stop = manager.onChange(heard);
    storage.setItem('airsoft.settings', '{"version":1}');
    const before = heard.mock.calls.length;
    expect(before).toBeGreaterThan(0);
    stop();
    storage.setItem('airsoft.settings', '{"version":1,"fov":80}');
    expect(heard.mock.calls.length).toBe(before);
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
