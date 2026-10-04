import { describe, expect, it } from 'vitest';
import { loadDevEnabled, loadDevSettings } from '../settings/dev';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { activeDev, DEV_DEFAULTS, DEV_ENTRIES, devCheating, devIntro, retroLookOf } from './dev';

/** A Storage holding one saved settings object. */
function saved(fields: Record<string, unknown>): Storage {
  const text = JSON.stringify({ version: SETTINGS_VERSION, ...fields });
  return { getItem: (k: string) => (k === SETTINGS_KEY ? text : null) } as unknown as Storage;
}

describe('Dev settings (M24)', () => {
  it('has a row for every setting, and Unlock all gear (not Disable Armory) counting as Dev help', () => {
    expect(DEV_ENTRIES.map((e) => e.id).sort()).toEqual(Object.keys(DEV_DEFAULTS).sort());
    expect(DEV_ENTRIES.find((e) => e.id === 'disableArmory')).toMatchObject({ kind: 'switch', cheat: false });
    // Free Legendary gear changes play (M26d): such a match pays no Field Credits and stays out of the records.
    expect(DEV_ENTRIES.find((e) => e.id === 'unlockAllGear')).toMatchObject({ kind: 'switch', cheat: true });
    for (const e of DEV_ENTRIES) if (e.kind === 'range') expect(DEV_DEFAULTS[e.id]).toBeGreaterThanOrEqual(e.min);
  });

  it('reads what was saved, and falls back to the defaults for anything missing or junk', () => {
    expect(loadDevSettings(saved({}))).toEqual(DEV_DEFAULTS);
    expect(loadDevEnabled(saved({}))).toBe(false);
    const d = loadDevSettings(saved({ 'dev.ghost': 'on', 'dev.gameSpeed': 0.5, 'dev.bottomlessMags': 'yes', 'dev.unlockAllGear': 'on' }));
    expect(d).toEqual({ ...DEV_DEFAULTS, ghost: true, gameSpeed: 0.5, unlockAllGear: true });
    expect(loadDevSettings(saved({ 'dev.gameSpeed': 9 })).gameSpeed).toBe(1);
    expect(loadDevEnabled(saved({ 'dev.enabled': true }))).toBe(true);
  });

  it('applies only while the tab is shown: unticking the box puts everything back to normal', () => {
    const picked = { ...DEV_DEFAULTS, ghost: true, showDebug: true };
    expect(activeDev(true, picked)).toEqual(picked);
    // A copy, so a later change to the picked values shows up as a change against it.
    expect(activeDev(true, picked)).not.toBe(picked);
    expect(activeDev(false, picked)).toEqual(DEV_DEFAULTS);
  });

  it('keeps a match out of the records only for settings that change play', () => {
    expect(devCheating(DEV_DEFAULTS)).toBe(false);
    expect(devCheating({ ...DEV_DEFAULTS, showDebug: true, showBbPaths: true, disableArmory: true })).toBe(false);
    expect(devCheating({ ...DEV_DEFAULTS, unlockAllGear: true })).toBe(true);
    expect(devCheating({ ...DEV_DEFAULTS, ghost: true })).toBe(true);
    expect(devCheating({ ...DEV_DEFAULTS, bottomlessMags: true })).toBe(true);
    expect(devCheating({ ...DEV_DEFAULTS, gameSpeed: 0.5 })).toBe(true);
    expect(devIntro()).toBe("For trying things out. With Unlock all gear, Game speed, Bottomless magazines or Ghost changed, matches don't go into your records.");
  });
});

describe('Retro pixel filter rows (M42)', () => {
  const row = (id: string) => DEV_ENTRIES.find((e) => e.id === id)!;

  it('has the switch and the two sliders, off and at 4 px and 6 levels, none of them a cheat', () => {
    expect(row('retroPixels')).toMatchObject({ kind: 'switch', label: 'Retro pixels', cheat: false });
    expect(row('retroPixelSize')).toMatchObject({ kind: 'range', label: 'Pixel size', cheat: false });
    expect(row('retroColours')).toMatchObject({ kind: 'range', label: 'Colours', cheat: false });
    expect(DEV_DEFAULTS).toMatchObject({ retroPixels: false, retroPixelSize: 4, retroColours: 6 });
    const order = DEV_ENTRIES.map((e) => e.id);
    expect(order.indexOf('retroPixelSize')).toBe(order.indexOf('retroPixels') + 1); // the sliders sit beside the switch
    expect(order.indexOf('retroColours')).toBe(order.indexOf('retroPixels') + 2);
    // Looks only: a match with it on still goes into the records, and the intro doesn't list it.
    expect(devCheating({ ...DEV_DEFAULTS, retroPixels: true, retroPixelSize: 8, retroColours: 3 })).toBe(false);
    expect(devIntro()).not.toMatch(/retro|pixel|colours/i);
  });

  it('shows the sliders as "4 px" and "216" (a range without a format stays a percentage)', () => {
    const size = row('retroPixelSize');
    const colours = row('retroColours');
    if (size.kind !== 'range' || colours.kind !== 'range') throw new Error('expected ranges');
    expect(size.format?.(DEV_DEFAULTS.retroPixelSize)).toBe('4 px');
    expect(size.format?.(8)).toBe('8 px');
    expect(colours.format?.(DEV_DEFAULTS.retroColours)).toBe('216');
    expect(colours.format?.(3)).toBe('27');
    expect(colours.format?.(8)).toBe('512');
    expect((row('gameSpeed') as { format?: unknown }).format).toBeUndefined();
  });

  it('turns the look on only when the switch is on and the run is not scripted (the perf harness)', () => {
    expect(retroLookOf(DEV_DEFAULTS, false)).toBeNull();
    expect(retroLookOf({ ...DEV_DEFAULTS, retroPixelSize: 8 }, false)).toBeNull(); // sliders alone do nothing
    const on = { ...DEV_DEFAULTS, retroPixels: true, retroPixelSize: 6, retroColours: 4 };
    expect(retroLookOf(on, false)).toEqual({ pixelSize: 6, levels: 4 });
    expect(retroLookOf(on, true)).toBeNull();
    // With the Dev tab hidden everything is back to its default, so the smoke tests never see it.
    expect(retroLookOf(activeDev(false, on), false)).toBeNull();
    expect(retroLookOf(activeDev(true, on), false)).toEqual({ pixelSize: 6, levels: 4 });
  });

  it('reads what was saved, and ignores values outside the sliders', () => {
    const d = loadDevSettings(saved({ 'dev.retroPixels': 'on', 'dev.retroPixelSize': 8, 'dev.retroColours': 3 }));
    expect(d).toEqual({ ...DEV_DEFAULTS, retroPixels: true, retroPixelSize: 8, retroColours: 3 });
    for (const bad of [1, 9, -4, 'big', null]) {
      expect(loadDevSettings(saved({ 'dev.retroPixelSize': bad })).retroPixelSize, `size ${String(bad)}`).toBe(4);
    }
    for (const bad of [2, 9, 0, 'many', null]) {
      expect(loadDevSettings(saved({ 'dev.retroColours': bad })).retroColours, `colours ${String(bad)}`).toBe(6);
    }
    expect(loadDevSettings(saved({ 'dev.retroPixels': 'maybe' })).retroPixels).toBe(false);
  });
});
