import { afterEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_WRITE_DELAY_MS } from '../config/menus';
import { QUALITY, resolveQuality } from '../config/render';
import { loadCustomQuality, loadSavedQuality } from '../ui/menus/savedChoices';
import { flushSettings, loadSetting, numberIn, oneOf, saveSetting, saveSettingSoon, SETTINGS_KEY, SETTINGS_VERSION } from './storage';

/** A Storage backed by a Map (only the calls the settings use); `writes` and `parses` count the work done. */
function memoryStorage(initial: Record<string, string> = {}): Storage & { writes: number } {
  const m = new Map(Object.entries(initial));
  return {
    writes: 0,
    getItem: (k: string) => m.get(k) ?? null,
    setItem(k: string, v: string) {
      this.writes++;
      m.set(k, String(v));
    },
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

  it('keeps the Custom rows through the store\'s one migrate path, and drops them with a newer build\'s object', () => {
    const s = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ version: 1, quality: 'custom', 'graphics.renderScale': 60 }), 'airsoft.mode': 'attackDefend' });
    saveSetting('graphics.shadows', 'off', s);
    expect(JSON.parse(s.getItem(SETTINGS_KEY)!)).toEqual({ version: 1, quality: 'custom', 'graphics.renderScale': 60, 'graphics.shadows': 'off', mode: 'attackDefend' });
    expect(loadCustomQuality(s)).toEqual({ renderScale: 0.6, shadows: false });
    const newer = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ version: SETTINGS_VERSION + 1, quality: 'custom', 'graphics.renderScale': 60 }) });
    expect(loadSavedQuality(newer)).toBeNull();
    expect(loadCustomQuality(newer)).toEqual({});
  });
});

describe('settings store: migration, newer builds, one parse (audit UI-25)', () => {
  it('carries the old per-setting keys ("version 0") into the object, and drops them all with the next save', () => {
    const s = memoryStorage({ 'airsoft.sensitivity': '2.5', 'airsoft.mode': 'attackDefend' });
    saveSetting('crouch', 'hold', s);
    expect(JSON.parse(s.getItem(SETTINGS_KEY)!)).toEqual({ version: 1, sensitivity: '2.5', mode: 'attackDefend', crouch: 'hold' });
    expect(s.getItem('airsoft.sensitivity')).toBeNull();
    expect(s.getItem('airsoft.mode')).toBeNull();
    expect(loadSetting('sensitivity', sens, 1, s)).toBe(2.5);
  });

  it('never overwrites settings saved by a newer build (KNOWN_ISSUES row 99): changes last for the session', () => {
    const newer = JSON.stringify({ version: 2, crouch: { mode: 'hold' } });
    const s = memoryStorage({ [SETTINGS_KEY]: newer });
    expect(loadSetting('crouch', crouch, 'toggle', s)).toBe('toggle');
    saveSetting('crouch', 'hold', s);
    expect(s.getItem(SETTINGS_KEY)).toBe(newer);
  });

  it('parses the stored object once for many reads, and again only when its text changes', () => {
    const s = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ version: 1, crouch: 'hold' }) });
    const parse = vi.spyOn(JSON, 'parse');
    for (let i = 0; i < 20; i++) loadSetting('crouch', crouch, 'toggle', s);
    expect(parse).toHaveBeenCalledTimes(1);
    s.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, crouch: 'toggle' }));
    expect(loadSetting('crouch', crouch, 'hold', s)).toBe('toggle');
    expect(parse).toHaveBeenCalledTimes(2);
    parse.mockRestore();
  });
});

describe('settings written once a slider settles (audit UI-11 / CORE-12)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds a run of slider steps and writes once, while reads see each step at once', () => {
    vi.useFakeTimers();
    const s = memoryStorage();
    for (let i = 1; i <= 10; i++) {
      saveSettingSoon('sensitivity', 1 + i / 10, s);
      vi.advanceTimersByTime(SETTINGS_WRITE_DELAY_MS / 4);
    }
    expect(s.writes).toBe(0);
    expect(loadSetting('sensitivity', sens, 1, s)).toBe(2);
    vi.advanceTimersByTime(SETTINGS_WRITE_DELAY_MS);
    expect(s.writes).toBe(1);
    expect(JSON.parse(s.getItem(SETTINGS_KEY)!)).toEqual({ version: 1, sensitivity: 2 });
  });

  it('writes what is waiting at once when flushed (the page hidden or closed), and a direct save takes it along', () => {
    vi.useFakeTimers();
    const s = memoryStorage();
    saveSettingSoon('fov', 90, s);
    flushSettings(s);
    expect(s.writes).toBe(1);
    expect(JSON.parse(s.getItem(SETTINGS_KEY)!).fov).toBe(90);
    saveSettingSoon('fov', 95, s);
    saveSetting('crouch', 'hold', s);
    expect(JSON.parse(s.getItem(SETTINGS_KEY)!)).toEqual({ version: 1, fov: 95, crouch: 'hold' });
    vi.advanceTimersByTime(SETTINGS_WRITE_DELAY_MS * 2);
    expect(s.writes).toBe(2); // nothing left waiting
  });
});
