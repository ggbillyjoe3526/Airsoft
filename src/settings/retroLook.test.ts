import { describe, expect, it } from 'vitest';
import { DEFAULT_RETRO, retroLookOf } from '../config/look';
import { MemoryStorage } from '../pool/testStorage';
import { carryOverDevRetro, loadRetroSettings } from './retroLook';
import { SETTINGS_KEY, SETTINGS_VERSION } from './storage';

/** A store holding one saved settings object. */
function saved(fields: Record<string, unknown>): MemoryStorage {
  const s = new MemoryStorage();
  s.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...fields }));
  return s;
}
const stored = (s: Storage): Record<string, unknown> => JSON.parse(s.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;

describe('the Retro look as saved (M96)', () => {
  it('is off at 4 px and 216 colours on a clean save', () => {
    expect(DEFAULT_RETRO).toEqual({ on: false, pixelSize: 4, colours: 6 });
    expect(loadRetroSettings(new MemoryStorage())).toEqual(DEFAULT_RETRO);
    expect(loadRetroSettings(null)).toEqual(DEFAULT_RETRO);
  });

  it('reads its own keys, and junk or values off the sliders as the defaults', () => {
    expect(loadRetroSettings(saved({ retroLook: 'on', retroPixelSize: 8, retroColours: 3 }))).toEqual({ on: true, pixelSize: 8, colours: 3 });
    for (const bad of [1, 9, -4, 'big', null]) expect(loadRetroSettings(saved({ retroPixelSize: bad })).pixelSize, String(bad)).toBe(4);
    for (const bad of [2, 9, 0, 'many', null]) expect(loadRetroSettings(saved({ retroColours: bad })).colours, String(bad)).toBe(6);
    expect(loadRetroSettings(saved({ retroLook: 'maybe' })).on).toBe(false);
  });

  it('carries over a Dev choice saved before M96: on as it was in force (the Dev box ticked), the sliders as set', () => {
    expect(loadRetroSettings(saved({ 'dev.enabled': true, 'dev.retroPixels': 'on', 'dev.retroPixelSize': 6, 'dev.retroColours': 4 }))).toEqual({ on: true, pixelSize: 6, colours: 4 });
    // The box unticked: the filter never showed, so it stays off; the sliders still come across.
    expect(loadRetroSettings(saved({ 'dev.enabled': false, 'dev.retroPixels': 'on', 'dev.retroPixelSize': 6 }))).toEqual({ on: false, pixelSize: 6, colours: 6 });
    expect(loadRetroSettings(saved({ 'dev.retroPixels': 'on' })).on).toBe(false);
    expect(loadRetroSettings(saved({ 'dev.enabled': true, 'dev.retroPixels': 'off' })).on).toBe(false);
  });

  it('lets the public keys win over the old Dev ones', () => {
    const s = saved({ 'dev.enabled': true, 'dev.retroPixels': 'on', 'dev.retroPixelSize': 6, retroLook: 'off', retroPixelSize: 3 });
    expect(loadRetroSettings(s)).toEqual({ on: false, pixelSize: 3, colours: 6 });
  });

  it('writes the carried-over choice under the public keys once, so unticking the Dev box later keeps it', () => {
    const s = saved({ 'dev.enabled': true, 'dev.retroPixels': 'on', 'dev.retroPixelSize': 5 });
    carryOverDevRetro(s);
    expect(stored(s)).toMatchObject({ retroLook: 'on', retroPixelSize: 5, retroColours: 6, 'dev.retroPixels': 'on' });
    s.setItem(SETTINGS_KEY, JSON.stringify({ ...stored(s), 'dev.enabled': false }));
    expect(loadRetroSettings(s)).toEqual({ on: true, pixelSize: 5, colours: 6 });
    // Once written, a later carry-over changes nothing (the player's own pick stays).
    s.setItem(SETTINGS_KEY, JSON.stringify({ ...stored(s), retroLook: 'off' }));
    carryOverDevRetro(s);
    expect(stored(s).retroLook).toBe('off');
  });

  it('writes nothing for a save that never had the Dev rows', () => {
    const s = saved({ quality: 'high' });
    carryOverDevRetro(s);
    expect(stored(s)).toEqual({ version: SETTINGS_VERSION, quality: 'high' });
    const empty = new MemoryStorage();
    carryOverDevRetro(empty);
    expect(empty.getItem(SETTINGS_KEY)).toBeNull();
  });

  it('turns the filter on only while on, with the Dev tab shown (Dev 6 playtest), and not scripted (the perf harness)', () => {
    expect(retroLookOf(DEFAULT_RETRO, false, true)).toBeNull();
    expect(retroLookOf({ ...DEFAULT_RETRO, pixelSize: 8 }, false, true)).toBeNull();
    expect(retroLookOf({ on: true, pixelSize: 6, colours: 4 }, false, true)).toEqual({ pixelSize: 6, levels: 4 });
    expect(retroLookOf({ on: true, pixelSize: 6, colours: 4 }, true, true)).toBeNull();
    expect(retroLookOf({ on: true, pixelSize: 6, colours: 4 }, false, false)).toBeNull();
  });
});
