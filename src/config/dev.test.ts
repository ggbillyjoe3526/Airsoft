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

  it('keeps a match out of the records only for settings that change play', () => {
    expect(devCheating(DEV_DEFAULTS)).toBe(false);
    expect(devCheating({ ...DEV_DEFAULTS, showDebug: true, showBbPaths: true, disableArmory: true })).toBe(false);
    expect(devCheating({ ...DEV_DEFAULTS, unlockAllGear: true })).toBe(true);
    expect(devCheating({ ...DEV_DEFAULTS, ghost: true })).toBe(true);
    expect(devCheating({ ...DEV_DEFAULTS, bottomlessMags: true })).toBe(true);
    expect(devCheating({ ...DEV_DEFAULTS, gameSpeed: 0.5 })).toBe(true);
    expect(devIntro()).toBe("For trying things out. With Unlock all gear, Game speed, Bottomless magazines or Ghost changed, matches don't go into your records.");
  });

  describe('Dev content (M35)', () => {
    it('is a switch row, off by default, and not a cheat', () => {
      expect(DEV_ENTRIES.find((e) => e.id === 'devContent')).toMatchObject({ kind: 'switch', label: 'Dev content', cheat: false });
      expect(DEV_DEFAULTS.devContent).toBe(false);
      expect(loadDevSettings(saved({})).devContent).toBe(false);
    });

    it('does not count as cheating with it on, on its own or with the other harmless switches', () => {
      expect(devCheating({ ...DEV_DEFAULTS, devContent: true })).toBe(false);
      expect(devCheating({ ...DEV_DEFAULTS, devContent: true, showDebug: true, disableArmory: true })).toBe(false);
      expect(devCheating({ ...DEV_DEFAULTS, devContent: true, ghost: true })).toBe(true);
    });

    it('applies only while the tab is shown', () => {
      const picked = { ...DEV_DEFAULTS, devContent: true };
      expect(activeDev(true, picked).devContent).toBe(true);
      expect(activeDev(false, picked).devContent).toBe(false);
    });

    it('reads dev.devContent as saved, and junk as off', () => {
      expect(loadDevSettings(saved({ 'dev.devContent': 'on' })).devContent).toBe(true);
      expect(loadDevSettings(saved({ 'dev.devContent': 'off' })).devContent).toBe(false);
      expect(loadDevSettings(saved({ 'dev.devContent': 'yes' })).devContent).toBe(false);
      expect(loadDevSettings(saved({ 'dev.devContent': 'on', 'dev.ghost': 'on' }))).toEqual({ ...DEV_DEFAULTS, devContent: true, ghost: true });
    });

    it("carries over a save holding the Woodland thread's dev.mapsInDevelopment while nothing is saved under dev.devContent", () => {
      expect(loadDevSettings(saved({ 'dev.mapsInDevelopment': 'on' })).devContent).toBe(true);
      expect(loadDevSettings(saved({ 'dev.mapsInDevelopment': 'off' })).devContent).toBe(false);
      expect(loadDevSettings(saved({ 'dev.mapsInDevelopment': 'on' }))).toEqual({ ...DEV_DEFAULTS, devContent: true });
    });

    it('lets a saved dev.devContent win over dev.mapsInDevelopment', () => {
      expect(loadDevSettings(saved({ 'dev.devContent': 'off', 'dev.mapsInDevelopment': 'on' })).devContent).toBe(false);
      expect(loadDevSettings(saved({ 'dev.devContent': 'on', 'dev.mapsInDevelopment': 'off' })).devContent).toBe(true);
    });

    it('does not read dev.mapsInDevelopment into any other switch', () => {
      const d = loadDevSettings(saved({ 'dev.mapsInDevelopment': 'on' }));
      expect({ ...d, devContent: false }).toEqual(DEV_DEFAULTS);
    });
  });
});
