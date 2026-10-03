import { describe, expect, it } from 'vitest';
import { loadSetting, numberIn, oneOf, saveSetting, SETTINGS_KEY } from './storage';

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
