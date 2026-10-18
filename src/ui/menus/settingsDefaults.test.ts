import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadVolumes } from '../../audio/audioMix';
import { MENU_TEXT, SETTINGS_LATER, SETTINGS_TABS } from '../../config/menus';
import { MemoryStorage } from '../../pool/testStorage';
import { retroLookOf } from '../../config/look';
import { loadDevEnabled } from '../../settings/dev';
import { loadRetroSettings } from '../../settings/retroLook';
import { SETTINGS_KEY, SETTINGS_VERSION, saveSetting } from '../../settings/storage';
import { loadAimMode, loadCrouchMode, loadLook } from '../../settings/savedChoices';
import { loadScoreboardSize, loadSoundCueColour } from '../../settings/hudPrefs';

// ST1 (William's Dev 6 playtest, 2026-10-16, items 4-8, 18, 20 and 34): the new defaults, read from an empty save, and a
// save that picked otherwise keeping its pick.
describe('ST1: the Settings defaults William asked for', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('starts the sound cues red, the scoreboard at 100%, aim on Toggle and crouch on Hold', () => {
    expect(loadSoundCueColour()).toBe('red');
    expect(loadScoreboardSize()).toBe(1);
    expect(loadAimMode()).toBe('toggle');
    expect(loadCrouchMode()).toBe('hold');
  });

  it('starts the volumes at master 100%, effects 80%, power source 100%, ambience 60% and interface 50%', () => {
    expect(loadVolumes()).toEqual({ master: 1, effects: 0.8, power: 1, ambience: 0.6, interface: 0.5 });
  });

  it('keeps what a player already saved', () => {
    saveSetting('soundCueColour', 'white');
    saveSetting('scoreboardSize', 1.3);
    saveSetting('aimMode', 'hold');
    saveSetting('crouch', 'toggle');
    saveSetting('volume.ambience', 1);
    expect([loadSoundCueColour(), loadScoreboardSize(), loadAimMode(), loadCrouchMode(), loadVolumes().ambience]).toEqual(['white', 1.3, 'hold', 'toggle', 1]);
  });

  it('lists no Voices (hit calls) row, and nothing greyed out anywhere', () => {
    for (const tab of SETTINGS_TABS) expect(SETTINGS_LATER[tab.id], tab.id).toEqual([]);
  });

  it('opens on Display, the first group, and reads the level as LVL', () => {
    expect(SETTINGS_TABS[0]!.id).toBe('display');
    expect(MENU_TEXT.level(7)).toBe('LVL 7');
  });
});

// ST1 acceptance 7: a save from before the change loads, and what it holds still counts (or, for the Retro look, is held
// back until the Dev box is ticked).
describe('ST1: a save holding the old values still loads', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());
  const old = {
    version: SETTINGS_VERSION,
    retroLook: 'on',
    retroPixelSize: 8,
    retroColours: 3,
    realisticColours: 'on',
    soundCueColour: 'white',
    scoreboardSize: 1.3,
    aimMode: 'hold',
    crouch: 'toggle',
    'volume.master': 0.5,
    'volume.effects': 1,
    'volume.power': 0.7,
    'volume.ambience': 0.3,
    'volume.interface': 1,
    hitCalls: 'on',
  };

  it('keeps the old picks and volumes rather than the new defaults, and ignores the removed Voices key', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(old));
    expect([loadSoundCueColour(), loadScoreboardSize(), loadAimMode(), loadCrouchMode()]).toEqual(['white', 1.3, 'hold', 'toggle']);
    expect(loadVolumes()).toEqual({ master: 0.5, effects: 1, power: 0.7, ambience: 0.3, interface: 1 });
    expect(loadLook().realisticColours).toBe(true);
  });

  it('loads a saved Retro look "on" but draws no filter while the Dev settings box is unticked, and draws it once ticked', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...old, 'dev.enabled': false }));
    const retro = loadRetroSettings();
    expect(retro).toEqual({ on: true, pixelSize: 8, colours: 3 });
    expect(loadDevEnabled()).toBe(false);
    expect(retroLookOf(retro, false, loadDevEnabled())).toBeNull();
    expect(retroLookOf(retro, false, true)).toEqual({ pixelSize: 8, levels: 3 });
  });
});
