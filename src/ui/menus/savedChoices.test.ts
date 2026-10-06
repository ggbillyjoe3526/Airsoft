import { describe, expect, it } from 'vitest';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../../settings/storage';
import { graphicsKey, GRAPHICS_ROWS, storedValue } from '../../config/graphics';
import { QUALITY, qualityChoiceOf, resolveQuality } from '../../config/render';
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

describe('the frame-rate choice from saves of every shape (G5 QA)', () => {
  const raw = (value: string): Storage => {
    const data = new Map<string, string>([[SETTINGS_KEY, value]]);
    return { getItem: (k: string) => data.get(k) ?? null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 1 };
  };

  it('is Unlimited from a save that is not JSON, from a newer build’s save, and from any value that is not a number of frames', () => {
    expect(loadFrameRateCap(raw('{not json'))).toBe(0);
    expect(loadFrameRateCap(raw(JSON.stringify({ version: SETTINGS_VERSION + 1, frameRateCap: '60' })))).toBe(0);
    expect(loadFrameRateCap(raw(JSON.stringify([60])))).toBe(0);
    for (const junk of [null, [], {}, '', 'Off', 'sixty', false]) expect(loadFrameRateCap(storageWith({ frameRateCap: junk })), JSON.stringify(junk)).toBe(0);
  });

  it('keeps a saved 144 (the old top choice) at 144 and a saved 240 at 240, as text or as a number', () => {
    expect(loadFrameRateCap(storageWith({ frameRateCap: '144' }))).toBe(144);
    expect(loadFrameRateCap(storageWith({ frameRateCap: 144 }))).toBe(144);
    expect(loadFrameRateCap(storageWith({ frameRateCap: 240 }))).toBe(240);
    expect(loadFrameRateCap(storageWith({ frameRateCap: -30 }))).toBe(0);
  });
});

describe('a Custom mix saved before the post rows, in full (G5 QA)', () => {
  /** What a build before G5 saved for Medium's fields as a Custom mix (every graphics row, none of the six new ones). */
  const OLD_ROWS = Object.keys(QUALITY.medium).filter((f) => !['ambientOcclusion', 'bloom', 'temporalAA', 'lightShafts', 'reflections', 'lensFinish'].includes(f));

  it('with every old row at Medium’s value is a Custom mix of Medium and High’s post rows, not Medium, High or Ultra', () => {
    const fields: Record<string, unknown> = { quality: 'custom' };
    for (const row of GRAPHICS_ROWS) {
      if (!OLD_ROWS.includes(row.field)) continue;
      const v = storedValue(row, QUALITY.medium[row.field]);
      if (v !== undefined) fields[graphicsKey(row.field)] = v;
    }
    const custom = loadCustomQuality(storageWith(fields));
    expect(Object.keys(custom).sort()).toEqual([...OLD_ROWS].sort());
    const q = resolveQuality('custom', custom);
    for (const f of OLD_ROWS) expect(q[f as keyof typeof q], f).toEqual(QUALITY.medium[f as keyof typeof q]);
    expect([q.ambientOcclusion, q.bloom, q.temporalAA, q.lightShafts, q.reflections, q.lensFinish]).toEqual([0.5, true, true, true, false, false]);
    expect(qualityChoiceOf(q)).toBe('custom');
  });

  it('with every old row at High’s value reads as High, and never as Ultra', () => {
    const fields: Record<string, unknown> = { quality: 'custom' };
    for (const row of GRAPHICS_ROWS) {
      if (!OLD_ROWS.includes(row.field)) continue;
      const v = storedValue(row, QUALITY.high[row.field]);
      if (v !== undefined) fields[graphicsKey(row.field)] = v;
    }
    expect(qualityChoiceOf(resolveQuality('custom', loadCustomQuality(storageWith(fields))))).toBe('high');
  });

  it('ignores a new row saved with a value it does not offer, and keeps High’s', () => {
    const custom = loadCustomQuality(storageWith({ 'graphics.ambientOcclusion': 'quarter', 'graphics.bloom': 'maybe', 'graphics.reflections': 1, 'graphics.lensFinish': null }));
    expect(custom).toEqual({});
    expect(resolveQuality('custom', custom)).toEqual(QUALITY.high);
  });
});
