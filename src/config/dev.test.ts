import { describe, expect, it } from 'vitest';
import { loadDevEnabled, loadDevSettings } from '../settings/dev';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { activeDev, DEV_ACTIONS, DEV_DEFAULTS, DEV_ENTRIES, DEV_GIFTS, devCheating, devIntro, modelFilesInUse } from './dev';

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
    expect(devIntro()).toBe(
      "For trying things out. With Unlock all gear, Game speed, Bottomless magazines, Ghost, Bots hold fire, Spectate any bot, Bot intentions or Time of day changed, matches don't go into your records.",
    );
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

describe('Retro pixels left the Dev tab (M96)', () => {
  it('has no retro rows or values any more: the Retro look is on Settings › Look (settings/retroLook.ts)', () => {
    expect(DEV_ENTRIES.map((e) => e.id).filter((id) => /retro/i.test(id))).toEqual([]);
    expect(Object.keys(DEV_DEFAULTS).filter((id) => /retro/i.test(id))).toEqual([]);
    // An old save's dev.retro* fields are left alone here (the Look tab reads them once) and change no Dev value.
    expect(loadDevSettings(saved({ 'dev.retroPixels': 'on', 'dev.retroPixelSize': 8, 'dev.retroColours': 3 }))).toEqual(DEV_DEFAULTS);
  });
});

describe('more Dev settings for playtesting (M90)', () => {
  const row = (id: string) => DEV_ENTRIES.find((e) => e.id === id)!;

  it('adds Bots hold fire, Spectate any bot, Bot intentions and Time of day as cheats, Free case openings not', () => {
    for (const id of ['botsHoldFire', 'spectateBots', 'botIntent', 'timeOfDay']) expect(row(id).cheat, id).toBe(true);
    expect(row('freeShots')).toMatchObject({ kind: 'switch', label: 'Free case openings', cheat: false });
    expect(DEV_DEFAULTS).toMatchObject({ botsHoldFire: false, spectateBots: false, botIntent: false, timeOfDay: 'map', freeShots: false });
    for (const [id, v] of [['botsHoldFire', true], ['spectateBots', true], ['botIntent', true], ['timeOfDay', 'night']] as const) {
      expect(devCheating({ ...DEV_DEFAULTS, [id]: v }), id).toBe(true);
    }
    expect(devCheating({ ...DEV_DEFAULTS, freeShots: true })).toBe(false);
  });

  it("offers Time of day as the map's own, Day or Night, saved as dev.timeOfDay; junk reads as the map's own", () => {
    const t = row('timeOfDay');
    if (t.kind !== 'choice') throw new Error('expected a choice');
    expect(t.choices.map((c) => c.id)).toEqual(['map', 'day', 'night']);
    expect(loadDevSettings(saved({ 'dev.timeOfDay': 'night' })).timeOfDay).toBe('night');
    expect(loadDevSettings(saved({ 'dev.timeOfDay': 'day' })).timeOfDay).toBe('day');
    expect(loadDevSettings(saved({ 'dev.timeOfDay': 'dusk' })).timeOfDay).toBe('map');
    expect(loadDevSettings(saved({ 'dev.botsHoldFire': 'on', 'dev.freeShots': 'on' }))).toEqual({ ...DEV_DEFAULTS, botsHoldFire: true, freeShots: true });
  });

  it('has buttons to give FC and Tokens, end the round now and reset the save (that one asks first), saving nothing', () => {
    expect(DEV_ACTIONS.map((a) => a.id)).toEqual(['giveFc', 'giveTokens', 'endRound', 'resetSave']);
    expect(DEV_GIFTS.fc).toBeGreaterThanOrEqual(1000);
    expect(DEV_GIFTS.tokens).toBeGreaterThanOrEqual(10);
    expect(DEV_ACTIONS.find((a) => a.id === 'giveFc')!.button).toBe('+1,000 FC');
    expect(DEV_ACTIONS.filter((a) => a.confirm).map((a) => a.id)).toEqual(['resetSave']);
    expect(DEV_ACTIONS.find((a) => a.id === 'endRound')!.help).toMatch(/records/);
    for (const a of DEV_ACTIONS) expect(Object.keys(DEV_DEFAULTS), a.id).not.toContain(a.id);
  });
});

describe('Model file switches (RM4)', () => {
  it('are two switch rows, on by default and not cheats', () => {
    for (const id of ['disableFigureModels', 'disableAllModels'] as const) {
      expect(DEV_ENTRIES.find((e) => e.id === id)).toMatchObject({ kind: 'switch', cheat: false });
      expect(DEV_DEFAULTS[id]).toBe(true);
    }
    expect(devCheating({ ...DEV_DEFAULTS, disableFigureModels: false, disableAllModels: false })).toBe(false);
  });

  it('lets in files by the truth table: gear needs all-models off, figures need both off', () => {
    const f = (disableAllModels: boolean, disableFigureModels: boolean) => modelFilesInUse({ disableAllModels, disableFigureModels });
    expect(f(true, true)).toEqual({ gear: false, figures: false });
    expect(f(true, false)).toEqual({ gear: false, figures: false });
    expect(f(false, true)).toEqual({ gear: true, figures: false });
    expect(f(false, false)).toEqual({ gear: true, figures: true });
    expect(modelFilesInUse(DEV_DEFAULTS)).toEqual({ gear: false, figures: false });
  });

  it('lets no file in when the Dev tab is hidden, whatever was picked', () => {
    const picked = { ...DEV_DEFAULTS, disableAllModels: false, disableFigureModels: false };
    expect(modelFilesInUse(activeDev(true, picked))).toEqual({ gear: true, figures: true });
    expect(modelFilesInUse(activeDev(false, picked))).toEqual({ gear: false, figures: false });
  });
});
