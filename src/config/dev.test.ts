import { describe, expect, it } from 'vitest';
import { loadDevEnabled, loadDevSettings } from '../settings/dev';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { activeDev, DEV_DEFAULTS, DEV_ENTRIES, devCheating, devIntro } from './dev';

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

  it('keeps Access maps in development off by default and apart from the cheats: the map keeps the match out of the records, not the switch (M33d)', () => {
    expect(DEV_DEFAULTS.mapsInDevelopment).toBe(false);
    expect(DEV_ENTRIES.find((e) => e.id === 'mapsInDevelopment')).toMatchObject({ kind: 'switch', label: 'Access maps in development', cheat: false });
    expect(devCheating({ ...DEV_DEFAULTS, mapsInDevelopment: true })).toBe(false);
    expect(loadDevSettings(saved({ 'dev.mapsInDevelopment': 'on' })).mapsInDevelopment).toBe(true);
    expect(loadDevSettings(saved({})).mapsInDevelopment).toBe(false);
    // Like every Dev setting it applies only while the Dev tab is shown.
    expect(activeDev(false, { ...DEV_DEFAULTS, mapsInDevelopment: true }).mapsInDevelopment).toBe(false);
    expect(activeDev(true, { ...DEV_DEFAULTS, mapsInDevelopment: true }).mapsInDevelopment).toBe(true);
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
