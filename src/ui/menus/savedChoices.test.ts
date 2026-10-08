import { describe, expect, it } from 'vitest';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../../settings/storage';
import { graphicsKey, GRAPHICS_ROWS, storedValue } from '../../config/graphics';
import { HUD_OPACITY } from '../../config/matchInfo';
import { QUALITY, qualityChoiceOf, resolveQuality } from '../../config/render';
import { parseSaveText, SAVE_FORMAT, saveFileText } from '../../save/saveFile';
import { RENDER_BACKEND } from '../../config/renderBackend';
import { effectiveReducedMotion, loadCustomQuality, loadFrameRateCap, loadHudOpacity, loadReducedMotion, loadRendererChoice, motionClass } from './savedChoices';

function storageWith(fields: Record<string, unknown>): Storage {
  return storageHolding({ [SETTINGS_KEY]: JSON.stringify({ version: SETTINGS_VERSION, ...fields }) });
}

/** A Storage holding exactly `items` (the settings object, or the keys a build before it used). */
function storageHolding(items: Record<string, string>): Storage {
  const data = new Map<string, string>(Object.entries(items));
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

// G4 (owner, 2026-10-08): Settings → HUD → HUD opacity, a new saved field, `hudOpacity`, 0.5 to 1, 0.9 by default.
describe('HUD opacity, a field new in G4', () => {
  it('is 90 % by default, from 50 % to 100 % in steps of 5', () => {
    expect(HUD_OPACITY).toEqual({ min: 0.5, max: 1, step: 0.05, default: 0.9 });
  });

  it('reads back what was saved, ends included', () => {
    for (const v of [0.5, 0.75, 0.9, 1]) expect(loadHudOpacity(storageWith({ hudOpacity: v }))).toBe(v);
  });

  it('reads junk as the default: out of range, not a number, the wrong type, or nothing at all', () => {
    for (const junk of [0.45, 1.05, -1, 90, Number.NaN, 'solid', '', true, null, {}, [0.8]]) {
      expect(loadHudOpacity(storageWith({ hudOpacity: junk })), JSON.stringify(junk)).toBe(HUD_OPACITY.default);
    }
    expect(loadHudOpacity(storageHolding({ [SETTINGS_KEY]: '{not json' }))).toBe(HUD_OPACITY.default);
    expect(loadHudOpacity(null)).toBe(HUD_OPACITY.default);
  });

  it('migrates: a save from before it (the settings object of G3, without the field) loads with the default, the rest as saved', () => {
    const beforeG4 = storageWith({ hudSize: 1.2, scoreboardSize: 1.5, hitFeed: 'keep', whatGotYou: 'on', fov: 95 });
    expect(loadHudOpacity(beforeG4)).toBe(HUD_OPACITY.default);
    expect(JSON.parse(beforeG4.getItem(SETTINGS_KEY)!)).toMatchObject({ hudSize: 1.2, scoreboardSize: 1.5, hitFeed: 'keep' });
    // Older still: the keys before the settings object ("version 0"), read through the store's own migrate path.
    expect(loadHudOpacity(storageHolding({ 'airsoft.sensitivity': '1.4', 'airsoft.difficulty': 'hard' }))).toBe(HUD_OPACITY.default);
  });

  it('migrates: a save file written before it, loaded, gives the default', () => {
    const file = saveFileText({
      format: SAVE_FORMAT,
      build: '0.1 Dev 4+12 · 0a1b2c3',
      savedAt: '2026-10-01T12:00:00.000Z',
      stores: { settings: { version: 1, hudSize: 1.1, scoreboardSize: 1.3, hitFeed: 'fade' } },
    });
    const parsed = parseSaveText(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const loaded = storageHolding({ [SETTINGS_KEY]: JSON.stringify(parsed.save.stores.settings) });
    expect(loadHudOpacity(loaded)).toBe(HUD_OPACITY.default);
  });
});

// WebGPU overhaul W1: Settings → Graphics → Renderer, a new saved field, `renderer`: 'auto', 'webgpu' or 'webgl', Auto
// by default (WebGPU on a hardware adapter, else WebGL: the owner's ruling, 2026-10-08). The key is permanent.
describe('the Renderer row, a field new in W1', () => {
  it('reads back each pick, and Auto by default', () => {
    expect(RENDER_BACKEND.defaultChoice).toBe('auto');
    for (const id of ['auto', 'webgpu', 'webgl'] as const) expect(loadRendererChoice(storageWith({ renderer: id }))).toBe(id);
  });

  it('reads junk as the default: an unknown pick, the wrong type, an unreadable object or no storage at all', () => {
    for (const junk of ['WebGPU', 'vulkan', '', 1, true, null, {}, ['webgpu']]) {
      expect(loadRendererChoice(storageWith({ renderer: junk })), JSON.stringify(junk)).toBe('auto');
    }
    expect(loadRendererChoice(storageHolding({ [SETTINGS_KEY]: '{not json' }))).toBe('auto');
    expect(loadRendererChoice(null)).toBe('auto');
  });

  it('migrates: a save from before it (the settings object of G9, without the field) loads with Auto, the rest as saved', () => {
    const beforeW1 = storageWith({ quality: 'high', toneMapping: 'agx', 'dev.enabled': true, 'dev.retroPixels': 'on', hudOpacity: 0.8 });
    expect(loadRendererChoice(beforeW1)).toBe('auto');
    expect(JSON.parse(beforeW1.getItem(SETTINGS_KEY)!)).toMatchObject({ quality: 'high', toneMapping: 'agx', hudOpacity: 0.8 });
    // Older still: the keys before the settings object ("version 0"), read through the store's own migrate path.
    expect(loadRendererChoice(storageHolding({ 'airsoft.sensitivity': '1.4', 'airsoft.mode': 'attackDefend' }))).toBe('auto');
  });

  it('migrates: a save file written before it, loaded, gives Auto', () => {
    const file = saveFileText({
      format: SAVE_FORMAT,
      build: '0.1 Dev 4+40 · 0171b77',
      savedAt: '2026-10-08T12:00:00.000Z',
      stores: { settings: { version: 1, quality: 'medium', 'dev.enabled': true } },
    });
    const parsed = parseSaveText(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(loadRendererChoice(storageHolding({ [SETTINGS_KEY]: JSON.stringify(parsed.save.stores.settings) }))).toBe('auto');
  });
});
