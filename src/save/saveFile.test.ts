import { describe, expect, it } from 'vitest';
import { COLLECTION_VERSION } from '../pool/collection';
import { SETTINGS_VERSION } from '../settings/storage';
import { RECORDS_VERSION } from '../stats/records';
import { canonicalJson, MIGRATIONS, migrateStores, parseSaveText, SAVE_FORMAT, type SaveData, saveFileName, saveFileText, STORES_BY_FORMAT, summarize } from './saveFile';
import { SAVE_STORES } from './stores';

const save: SaveData = {
  format: SAVE_FORMAT,
  build: '0.1 Dev 3+40 · abc1234',
  savedAt: '2026-10-04T16:40:00.000Z',
  stores: {
    settings: { version: 1, fov: 95, 'equip.primary': '000001@common', laterField: 'kept' },
    keyBindings: { fire: ['Mouse0'] },
    records: { version: 1, results: { 'normal.elimination': { wins: 3, losses: 2 }, 'hard.attackDefend': { wins: 1, losses: 0 } }, bestAccuracy: 0.3, streak: 1, bestStreak: 2 },
    collection: { version: 1, owned: { '000001@common': 1, '000002@epic': 2 }, fc: 120, tokens: 1, seed: 42 },
  },
};

describe('save file (M31)', () => {
  it('round-trips: what is written reads back the same, checksum good', () => {
    const parsed = parseSaveText(saveFileText(save));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.checksumOk).toBe(true);
    expect(parsed.save).toEqual(save);
  });

  it('is readable JSON naming the game, format, version, date and a summary', () => {
    const file = JSON.parse(saveFileText(save));
    expect(file).toMatchObject({ game: 'Airsoft', format: SAVE_FORMAT, build: save.build, savedAt: save.savedAt, summary: { fc: 120, tokens: 1, items: 3, matches: 6 } });
    expect(file.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(saveFileText(save)).toContain('\n  "game": "Airsoft"');
  });

  it('keeps a reformatted file valid (keys reordered, spacing changed)', () => {
    const file = JSON.parse(saveFileText(save));
    const reordered = { checksum: file.checksum, stores: { collection: file.stores.collection, records: file.stores.records, keyBindings: file.stores.keyBindings, settings: file.stores.settings }, format: file.format, game: file.game };
    const parsed = parseSaveText(JSON.stringify(reordered));
    expect(parsed.ok && parsed.checksumOk).toBe(true);
  });

  it('flags an edited or damaged file (checksum) but still reads it', () => {
    const file = JSON.parse(saveFileText(save));
    file.stores.collection.fc = 999999;
    const parsed = parseSaveText(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.checksumOk).toBe(false);
      expect(summarize(parsed.save.stores).fc).toBe(999999);
    }
  });

  it('refuses what is not a save, a cut-off file and a newer format', () => {
    expect(parseSaveText('not json')).toEqual({ ok: false, error: 'notJson' });
    expect(parseSaveText(saveFileText(save).slice(0, 200))).toEqual({ ok: false, error: 'notJson' });
    expect(parseSaveText('{"hello": 1}')).toEqual({ ok: false, error: 'notSave' });
    expect(parseSaveText('[1,2]')).toEqual({ ok: false, error: 'notSave' });
    expect(parseSaveText(JSON.stringify({ game: 'Airsoft', format: 'one', stores: {} }))).toEqual({ ok: false, error: 'notSave' });
    expect(parseSaveText(JSON.stringify({ game: 'Airsoft', format: 1 }))).toEqual({ ok: false, error: 'notSave' });
    expect(parseSaveText(JSON.stringify({ game: 'Airsoft', format: SAVE_FORMAT + 1, build: 'v0.3', stores: {} }))).toEqual({ ok: false, error: 'newer', build: 'v0.3' });
  });

  it('reads stores that are missing or not objects as nothing saved (their defaults)', () => {
    const parsed = parseSaveText(JSON.stringify({ game: 'Airsoft', format: 1, stores: { settings: { version: 1 }, records: 'junk', mystery: { a: 1 } } }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.save.stores).toEqual({ settings: { version: 1 }, keyBindings: null, records: null, collection: null });
  });

  it('walks an old format up one step at a time, and refuses a gap', () => {
    const steps = {
      1: (s: Record<string, unknown>) => ({ ...s, settings: { ...(s.settings as object), step1: true } }),
      2: (s: Record<string, unknown>) => ({ ...s, settings: { ...(s.settings as object), step2: true } }),
    };
    const v1 = JSON.stringify({ game: 'Airsoft', format: 1, stores: { settings: { version: 1 } } });
    const parsed = parseSaveText(v1, steps, 3);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.save.format).toBe(3);
      expect(parsed.save.stores.settings).toEqual({ version: 1, step1: true, step2: true });
    }
    expect(migrateStores({}, 1, { 1: steps[1] }, 3)).toBeNull();
    expect(migrateStores({ settings: null }, SAVE_FORMAT)).toEqual({ settings: null });
  });

  it('keeps SAVE_FORMAT honest: a store version change or a new store needs a new format', () => {
    // Fails when a store's own version goes up (or a store is added) without SAVE_FORMAT and STORES_BY_FORMAT following.
    const now = Object.fromEntries(SAVE_STORES.map((s) => [s.id, s.version]));
    expect(STORES_BY_FORMAT[SAVE_FORMAT]).toEqual(now);
    expect(now).toEqual({ settings: SETTINGS_VERSION, keyBindings: 0, records: RECORDS_VERSION, collection: COLLECTION_VERSION });
    // And every format before this one has its migration step.
    for (let f = 1; f < SAVE_FORMAT; f++) {
      expect(STORES_BY_FORMAT[f]).toBeDefined();
      expect(MIGRATIONS[f]).toBeDefined();
    }
  });

  it('writes canonical JSON (sorted keys, no spaces) and names the file by the date', () => {
    expect(canonicalJson({ b: 1, a: [true, null, { d: 'x', c: 2 }], u: undefined })).toBe('{"a":[true,null,{"c":2,"d":"x"}],"b":1}');
    expect(saveFileName(new Date(2026, 9, 4, 23, 59))).toBe('airsoft-save-2026-10-04.json');
    expect(saveFileName(new Date(2027, 0, 9))).toBe('airsoft-save-2027-01-09.json');
  });
});
