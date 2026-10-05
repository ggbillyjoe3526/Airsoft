import { describe, expect, it } from 'vitest';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../../settings/storage';
import { QUALITY, resolveQuality } from '../../config/render';
import { effectiveReducedMotion, loadCustomQuality, loadFrameRateCap, loadReducedMotion, motionClass } from './savedChoices';

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

// G5: the frame-rate row gains 240 and Unlimited (the old Off, same id) under the same key, `frameRateCap`.
describe('the frame-rate choice (G5)', () => {
  it('is Unlimited (0) when nothing is saved, or nothing usable', () => {
    expect(loadFrameRateCap(storageWith({}))).toBe(0);
    expect(loadFrameRateCap(storageWith({ frameRateCap: 'fast' }))).toBe(0);
    expect(loadFrameRateCap(storageWith({ frameRateCap: true }))).toBe(0);
    expect(loadFrameRateCap(null)).toBe(0);
  });

  it('reads every value an earlier build saved as itself (FA2 saved off, 30, 60, 120 and 144 by id)', () => {
    for (const [saved, cap] of [['off', 0], ['30', 30], ['60', 60], ['120', 120], ['144', 144]] as const) {
      expect(loadFrameRateCap(storageWith({ frameRateCap: saved })), saved).toBe(cap);
    }
    expect(loadFrameRateCap(storageWith({ frameRateCap: '240' }))).toBe(240);
  });

  it('reads any other number of frames as the nearest choice', () => {
    expect(loadFrameRateCap(storageWith({ frameRateCap: '75' }))).toBe(60);
    expect(loadFrameRateCap(storageWith({ frameRateCap: 165 }))).toBe(144);
    expect(loadFrameRateCap(storageWith({ frameRateCap: 360 }))).toBe(240);
    expect(loadFrameRateCap(storageWith({ frameRateCap: 0 }))).toBe(0);
  });
});

// G5: six new Custom rows. A Custom mix saved before them has none of their keys and takes High's values for them.
describe('a Custom mix saved before the post rows (G5)', () => {
  it('keeps its own rows and takes the new fields from High', () => {
    const custom = loadCustomQuality(storageWith({ 'graphics.shadows': 'off', 'graphics.poolLights': '2' }));
    expect(custom).toEqual({ shadows: false, poolLights: 2 });
    const q = resolveQuality('custom', custom);
    expect(q.shadows).toBe(false);
    for (const f of ['ambientOcclusion', 'bloom', 'temporalAA', 'lightShafts', 'reflections', 'lensFinish'] as const) expect(q[f], f).toBe(QUALITY.high[f]);
  });

  it('reads the new rows when saved', () => {
    const custom = loadCustomQuality(storageWith({ 'graphics.ambientOcclusion': 'full', 'graphics.reflections': 'on', 'graphics.poolLights': '8' }));
    expect(custom).toEqual({ ambientOcclusion: 1, reflections: true, poolLights: 8 });
  });
});
