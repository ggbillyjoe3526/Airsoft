import { describe, expect, it } from 'vitest';
import { QUALITY, resolveQuality } from '../../config/render';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../../settings/storage';
import { effectiveReducedMotion, loadCustomQuality, loadReducedMotion, motionClass } from './savedChoices';

function storageWith(fields: Record<string, unknown>): Storage {
  const data = new Map<string, string>([[SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...fields })]]);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    length: data.size,
  };
}

// Reduced motion is tri-state (audit UI-07): the saved pick, or null while the player has not picked, so the system's
// "reduce motion" setting can decide live. The stored value is the same 'on' | 'off' as before.
describe('reduced motion (audit UI-07)', () => {
  it('reads a saved On or Off, and null when nothing (valid) is saved', () => {
    expect(loadReducedMotion(storageWith({ reducedMotion: 'on' }))).toBe(true);
    expect(loadReducedMotion(storageWith({ reducedMotion: 'off' }))).toBe(false);
    expect(loadReducedMotion(storageWith({}))).toBeNull();
    expect(loadReducedMotion(storageWith({ reducedMotion: 'sideways' }))).toBeNull();
    expect(loadReducedMotion(null)).toBeNull();
  });

  it('follows the system until the player picks, then the pick whatever the system says', () => {
    expect(effectiveReducedMotion(null, true)).toBe(true);
    expect(effectiveReducedMotion(null, false)).toBe(false);
    expect(effectiveReducedMotion(false, true)).toBe(false);
    expect(effectiveReducedMotion(true, false)).toBe(true);
  });

  it('sets a class on #app only once picked, so the stylesheet\'s media query can follow the system', () => {
    expect(motionClass(null)).toBeNull();
    expect(motionClass(true)).toBe('reduced-motion');
    expect(motionClass(false)).toBe('full-motion');
  });

  it('reads only the saved words as a pick: a boolean, a number or another case is no pick (the stored field stays on / off)', () => {
    for (const bad of [true, false, 1, 0, 'ON', 'Off', '', null]) {
      expect(loadReducedMotion(storageWith({ reducedMotion: bad })), String(bad)).toBeNull();
    }
  });
});

// G6: two new Custom rows, Baked light and Weathering (graphics.bakedLight, graphics.weathering).
describe('the baked light and weathering rows (G6)', () => {
  it('reads a save from before them as their default (High’s), and reads them back once saved', () => {
    const older = storageWith({ 'graphics.shadows': 'off' });
    const custom = loadCustomQuality(older);
    expect(custom.bakedLight).toBeUndefined();
    expect(custom.weathering).toBeUndefined();
    const q = resolveQuality('custom', custom);
    expect(q.bakedLight).toBe(QUALITY.high.bakedLight);
    expect(q.weathering).toBe(QUALITY.high.weathering);
    expect(q.shadows).toBe(false);
    const saved = loadCustomQuality(storageWith({ 'graphics.bakedLight': 'vertex', 'graphics.weathering': 'off' }));
    expect(saved.bakedLight).toBe('vertex');
    expect(saved.weathering).toBe(false);
    // Nonsense is ignored.
    expect(loadCustomQuality(storageWith({ 'graphics.bakedLight': 'sideways' })).bakedLight).toBeUndefined();
  });
});
