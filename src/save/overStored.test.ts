import { describe, expect, it } from 'vitest';
import { COLLECTION_KEY, saveCollection } from '../pool/collection';
import { MemoryStorage } from '../pool/testStorage';
import { KeyBindings } from '../input/keyBindings';
import { SETTINGS_KEY, saveSetting } from '../settings/storage';
import { emptyRecords, saveRecords } from '../stats/records';
import { RECORDS_KEY } from '../config/matchInfo';
import { overStored } from './overStored';
import { GuardedStorage } from './guardedStorage';
import { parseSaveText, saveFileText, SAVE_FORMAT } from './saveFile';
import { SaveManager } from './saveManager';

/** Acceptance 4: what a build doesn't recognise is kept on load and on the next save. */
describe('overStored: unknown fields survive a store\'s next save (M31)', () => {
  it('lays the fresh fields over what is stored, and keeps the rest', () => {
    const s = new MemoryStorage();
    s.setItem('k', JSON.stringify({ a: 1, later: { x: [1, 2] } }));
    expect(overStored(s, 'k', { a: 2, b: 3 })).toEqual({ a: 2, b: 3, later: { x: [1, 2] } });
  });

  it('is just the fresh fields when nothing, junk or a non-object is stored', () => {
    const s = new MemoryStorage();
    expect(overStored(s, 'k', { a: 1 })).toEqual({ a: 1 });
    s.setItem('k', 'not json');
    expect(overStored(s, 'k', { a: 1 })).toEqual({ a: 1 });
    s.setItem('k', '[1,2]');
    expect(overStored(s, 'k', { a: 1 })).toEqual({ a: 1 });
    s.setItem('k', '5');
    expect(overStored(s, 'k', { a: 1 })).toEqual({ a: 1 });
    expect(overStored({ getItem: () => { throw new Error('blocked'); } }, 'k', { a: 1 })).toEqual({ a: 1 });
  });

  it('records keep a field they do not know', () => {
    const s = new MemoryStorage();
    s.setItem(RECORDS_KEY, JSON.stringify({ version: 1, results: {}, bestAccuracy: null, streak: 0, bestStreak: 0, medals: ['gold'] }));
    const r = emptyRecords();
    r.streak = 4;
    saveRecords(r, s);
    expect(JSON.parse(s.getItem(RECORDS_KEY)!)).toMatchObject({ version: 1, streak: 4, medals: ['gold'] });
  });

  it('the collection keeps a field it does not know', () => {
    const s = new MemoryStorage();
    s.setItem(COLLECTION_KEY, JSON.stringify({ version: 1, owned: {}, fc: 1, tokens: 0, seed: 1, cosmetics: { hat: 'red' } }));
    saveCollection({ owned: { '000001@common': 1 }, fc: 50, tokens: 2, seed: 9 }, s);
    expect(JSON.parse(s.getItem(COLLECTION_KEY)!)).toEqual({ version: 1, owned: { '000001@common': 1 }, fc: 50, tokens: 2, seed: 9, cosmetics: { hat: 'red' } });
  });

  it('key bindings keep an action a newer build added', () => {
    const s = new MemoryStorage();
    s.setItem('airsoft.keyBindings', JSON.stringify({ hoverboard: ['KeyH'] }));
    const b = new KeyBindings(s);
    expect(b.rebind('scoreboard', 'KeyX')).toBe(true);
    const saved = JSON.parse(s.getItem('airsoft.keyBindings')!);
    expect(saved.hoverboard).toEqual(['KeyH']);
    expect(saved.scoreboard).toEqual(['KeyX']);
  });

  it('settings keep a field they do not know', () => {
    const s = new MemoryStorage();
    s.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, fov: 80, laterField: 'kept' }));
    saveSetting('fov', 100, s);
    expect(JSON.parse(s.getItem(SETTINGS_KEY)!)).toEqual({ version: 1, fov: 100, laterField: 'kept' });
  });

  it('a field carried in by a save file stays after the loaded save is played and saved again', () => {
    // A file written by a newer build: an unknown field in the collection and in the key bindings.
    const file = saveFileText({
      format: SAVE_FORMAT,
      build: 'v9',
      savedAt: '2026-10-04T10:00:00.000Z',
      stores: { collection: { version: 1, owned: {}, fc: 10, tokens: 0, seed: 1, futureField: 'kept' }, keyBindings: { hoverboard: ['KeyH'] } },
    });
    const parsed = parseSaveText(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Loaded into the browser, then the next visit plays and saves.
    const backing = new MemoryStorage();
    const manager = new SaveManager({ storage: new GuardedStorage(backing), build: 'b', reload: () => undefined });
    manager.replace(parsed.save, 'load');
    const next = new GuardedStorage(backing);
    saveCollection({ owned: {}, fc: 11, tokens: 0, seed: 1 }, next);
    new KeyBindings(next).rebind('scoreboard', 'KeyX');
    expect(JSON.parse(backing.getItem(COLLECTION_KEY)!)).toMatchObject({ fc: 11, futureField: 'kept' });
    expect(JSON.parse(backing.getItem('airsoft.keyBindings')!)).toMatchObject({ hoverboard: ['KeyH'], scoreboard: ['KeyX'] });
  });
});
