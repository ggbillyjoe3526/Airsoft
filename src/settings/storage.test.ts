import { describe, expect, it } from 'vitest';
import { QUALITY, resolveQuality } from '../config/render';
import { loadCustomQuality, loadSavedQuality } from '../ui/menus/savedChoices';
import { loadSetting, migrateSettings, numberIn, oneOf, saveSetting, SETTINGS_KEY, SETTINGS_VERSION } from './storage';

/** A Storage backed by a Map (only the calls the settings use). */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

const crouch = oneOf(['toggle', 'hold'] as const);
const sens = numberIn(0.2, 4);

describe('settings store (audit W-02)', () => {
  it('falls back to the default when nothing (or nothing valid) is saved, or storage is blocked', () => {
    expect(loadSetting('crouch', crouch, 'toggle', memoryStorage())).toBe('toggle');
    expect(loadSetting('crouch', crouch, 'toggle', memoryStorage({ [SETTINGS_KEY]: '{oops' }))).toBe('toggle');
    expect(loadSetting('crouch', crouch, 'toggle', memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ version: 1, crouch: 'sideways' }) }))).toBe('toggle');
    // An object from a future format version is not read as this one.
    expect(loadSetting('crouch', crouch, 'toggle', memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ version: 2, crouch: 'hold' }) }))).toBe('toggle');
    expect(loadSetting('crouch', crouch, 'toggle', null)).toBe('toggle');
    const throwing = { getItem: () => { throw new Error('blocked'); } } as unknown as Storage;
    expect(loadSetting('crouch', crouch, 'toggle', throwing)).toBe('toggle');
    expect(() => saveSetting('crouch', 'hold', throwing)).not.toThrow();
  });

  it('saves into one versioned object and reads it back', () => {
    const s = memoryStorage();
    saveSetting('crouch', 'hold', s);
    saveSetting('sensitivity', 1.25, s);
    expect(JSON.parse(s.getItem(SETTINGS_KEY)!)).toEqual({ version: 1, crouch: 'hold', sensitivity: 1.25 });
    expect(loadSetting('crouch', crouch, 'toggle', s)).toBe('hold');
    expect(loadSetting('sensitivity', sens, 1, s)).toBe(1.25);
  });

  it('reads settings saved by earlier builds under their own keys, and drops the old key once saved anew', () => {
    const s = memoryStorage({ 'airsoft.sensitivity': '2.5', 'airsoft.difficulty': 'hard', 'airsoft.mode': 'attackDefend' });
    expect(loadSetting('sensitivity', sens, 1, s)).toBe(2.5);
    expect(loadSetting('difficulty', oneOf(['easy', 'normal', 'hard']), 'normal', s)).toBe('hard');
    expect(loadSetting('mode', oneOf(['elimination', 'attackDefend']), 'elimination', s)).toBe('attackDefend');
    saveSetting('sensitivity', 3, s);
    expect(s.getItem('airsoft.sensitivity')).toBeNull();
    expect(loadSetting('sensitivity', sens, 1, s)).toBe(3);
    // Fields not saved anew still come from their old keys.
    expect(loadSetting('difficulty', oneOf(['easy', 'normal', 'hard']), 'normal', s)).toBe('hard');
  });

  it('rejects numbers out of range and junk', () => {
    expect(sens(9)).toBeUndefined();
    expect(sens('')).toBeUndefined();
    expect(sens('abc')).toBeUndefined();
    expect(sens(null)).toBeUndefined();
    expect(sens('0.5')).toBe(0.5);
  });
});

describe('settings migration and the Custom graphics fields (final alpha audit section 4)', () => {
  it('reads a version 1 object with a preset back unchanged: the Custom fields are an addition, not a new format', () => {
    expect(SETTINGS_VERSION).toBe(1);
    const s = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ version: 1, quality: 'medium', fov: 95 }) });
    expect(loadSavedQuality(s)).toBe('medium');
    expect(loadCustomQuality(s)).toEqual({});
    expect(loadSetting('fov', numberIn(80, 120), 90, s)).toBe(95);
  });

  it('resolves a saved Custom with no rows saved to High', () => {
    const s = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ version: 1, quality: 'custom' }) });
    expect(loadSavedQuality(s)).toBe('custom');
    expect(resolveQuality('custom', loadCustomQuality(s))).toEqual(QUALITY.high);
  });

  it('reads the saved Custom rows, dropping any a row does not offer', () => {
    const s = memoryStorage();
    saveSetting('quality', 'custom', s);
    saveSetting('graphics.renderScale', 70, s);
    saveSetting('graphics.shadows', 'off', s);
    saveSetting('graphics.textureSize', '256', s);
    saveSetting('graphics.anisotropy', '3', s); // not an option
    saveSetting('graphics.dustMotes', 9999, s); // out of range
    expect(loadCustomQuality(s)).toEqual({ renderScale: 0.7, shadows: false, textureSize: 256 });
    expect(resolveQuality('custom', loadCustomQuality(s))).toEqual({ ...QUALITY.high, renderScale: 0.7, shadows: false, textureSize: 256 });
    // An unknown quality id is nothing saved.
    saveSetting('quality', 'ultra', s);
    expect(loadSavedQuality(s)).toBeNull();
  });

  it('runs an older object through the migrations in order, and refuses one it cannot bring up to date', () => {
    const migrations = {
      1: (o: Record<string, unknown>) => ({ ...o, fieldOfView: undefined, fov: o.fieldOfView }),
      2: (o: Record<string, unknown>) => ({ ...o, quality: o.quality === 'ultra' ? 'high' : o.quality }),
    };
    expect(migrateSettings({ version: 1, fieldOfView: 100, quality: 'ultra' }, migrations, 3)).toEqual({ version: 3, fov: 100, fieldOfView: undefined, quality: 'high' });
    expect(migrateSettings({ version: 3, fov: 90 }, migrations, 3)).toEqual({ version: 3, fov: 90 });
    expect(migrateSettings({ version: 4 }, migrations, 3)).toBeNull(); // from a newer build
    expect(migrateSettings({ version: 0 }, migrations, 3)).toBeNull(); // no step from 0
    expect(migrateSettings({ fov: 90 }, migrations, 3)).toBeNull();
    expect(migrateSettings('junk', migrations, 3)).toBeNull();
  });
});
