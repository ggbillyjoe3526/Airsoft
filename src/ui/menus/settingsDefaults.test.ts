import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadVolumes } from '../../audio/audioMix';
import { MENU_TEXT, SETTINGS_LATER, SETTINGS_TABS } from '../../config/menus';
import { MemoryStorage } from '../../pool/testStorage';
import { saveSetting } from '../../settings/storage';
import { loadAimMode, loadCrouchMode, loadScoreboardSize, loadSoundCueColour } from './savedChoices';

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
