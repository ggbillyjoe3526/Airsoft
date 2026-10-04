import { describe, expect, it } from 'vitest';
import { POWER_LABELS, SETTINGS_LATER, SETTINGS_TABS } from '../../config/menus';
import { FOV_SETTING, QUALITY, QUALITY_CHOICES, RENDER } from '../../config/render';
import { factoryParts } from '../../config/attachments';
import { AEG, GAS_PISTOL } from '../../config/replicas';
import { DEPOT } from '../../map/depot';
import { DEFAULT_MAP, MAPS, mapData } from '../../map/maps';
import { replicaSummary } from './loadoutScreen';
import { backTarget, screenWhenStopped, tabAfterKey } from './menuNav';
import { describeRules, type MatchRulesText } from './rulesText';
import { loadFov, loadMap, loadSavedQuality } from './savedChoices';

describe('menu navigation', () => {
  it('opens the title before the first match, the pause menu during one and the result after it', () => {
    expect(screenWhenStopped(false, false)).toBe('title');
    expect(screenWhenStopped(true, false)).toBe('pause');
    expect(screenWhenStopped(true, true)).toBe('result');
  });

  it('goes Back from New game to the title, and from the Loadout screen to New game', () => {
    expect(backTarget('setup', 'setup')).toBe('title');
    expect(backTarget('loadout', 'setup')).toBe('setup');
  });

  it('returns from the Loadout to the practice range\'s pause menu when it was opened there (M21)', () => {
    expect(backTarget('loadout', 'setup', 'pause')).toBe('pause');
    expect(backTarget('loadout', 'pause', 'setup')).toBe('setup');
  });

  it('returns from Settings to whichever screen opened it', () => {
    expect(backTarget('settings', 'setup')).toBe('setup');
    expect(backTarget('settings', 'pause')).toBe('pause');
  });

  it('has no Back on the title, pause and result screens (they have their own buttons)', () => {
    expect(backTarget('title', 'setup')).toBeNull();
    expect(backTarget('pause', 'pause')).toBeNull();
    expect(backTarget('result', 'setup')).toBeNull();
  });
});

describe('settings tabs', () => {
  it('moves between tabs with the arrows (wrapping round), Home and End, and ignores other keys (audit L-31)', () => {
    expect(tabAfterKey('ArrowDown', 0, 6)).toBe(1);
    expect(tabAfterKey('ArrowDown', 5, 6)).toBe(0);
    expect(tabAfterKey('ArrowUp', 0, 6)).toBe(5);
    expect(tabAfterKey('ArrowUp', 3, 6)).toBe(2);
    expect(tabAfterKey('Home', 4, 6)).toBe(0);
    expect(tabAfterKey('End', 1, 6)).toBe(5);
    expect(tabAfterKey('Tab', 1, 6)).toBeNull();
    expect(tabAfterKey('ArrowRight', 1, 6)).toBeNull();
  });
});

describe('menu data', () => {
  it('lists placeholders for every settings tab, and only "later" tabs have nothing built', () => {
    for (const tab of SETTINGS_TABS) {
      expect(SETTINGS_LATER[tab.id]).toBeDefined();
      if (tab.later) expect(SETTINGS_LATER[tab.id].length).toBeGreaterThan(0);
    }
  });

  it('offers every quality preset on the Quality picker (M14), and has no Brightness setting', () => {
    expect(QUALITY_CHOICES.map((c) => c.id).sort()).toEqual(Object.keys(QUALITY).sort());
    expect(SETTINGS_LATER.graphics.some((s) => s.label === 'Brightness' || s.label === 'Field of view' || s.label === 'Quality')).toBe(false);
    // No browser storage in the tests: nothing saved (the game then picks one for the visit, config/render.ts).
    expect(loadSavedQuality()).toBeNull();
  });

  it('has the field of view slider around the default view', () => {
    expect(FOV_SETTING.min).toBeLessThan(RENDER.horizontalFov16x9);
    expect(FOV_SETTING.max).toBeGreaterThan(RENDER.horizontalFov16x9);
    // No browser storage in the tests: nothing saved, so the default view.
    expect(loadFov()).toBe(RENDER.horizontalFov16x9);
  });

  it('offers Depot as the default map', () => {
    expect(DEFAULT_MAP).toBe('depot');
    expect(MAPS.map((m) => m.id)).toContain(DEFAULT_MAP);
    expect(loadMap()).toBe(DEFAULT_MAP);
    expect(mapData('depot')).toBe(DEPOT);
  });

  it('sums up each replica under its name on the Loadout screen', () => {
    expect(replicaSummary(AEG, factoryParts(AEG))).toBe(`Electric · ${AEG.fireModes.join(', ')} · ${AEG.magSize} BBs a magazine`);
    expect(replicaSummary(GAS_PISTOL, factoryParts(GAS_PISTOL))).toBe(`Gas · semi · ${GAS_PISTOL.magSize} BBs a magazine`);
    // The fitted magazine, not the factory one (M17b).
    expect(replicaSummary(AEG, { ...factoryParts(AEG), magazine: 'hiCap' })).toMatch(new RegExp(`· ${AEG.magSize * 2} BBs a magazine$`));
    expect(POWER_LABELS[GAS_PISTOL.power].row).toBe('Gas type');
  });
});

describe('the rules shown on New game', () => {
  const rules: MatchRulesText = {
    teamSize: 3,
    winsNeeded: 5,
    roundTime: 150,
    playerTeam: 'Blue',
    enemyTeam: 'Orange',
    raiseTime: 5,
    halfTimeAfter: 4,
    attackFirst: true,
    friendlyFire: true,
    ricochetsCount: false,
  };

  it('explain elimination: teams, the clock, the swap of ends and the win condition', () => {
    const text = describeRules(rules, 'elimination');
    expect(text).toContain('3v3 with bots: you and 2 bot teammates (Blue) against Orange.');
    expect(text).toContain('2:30 on the clock');
    expect(text).toContain('Teams swap ends after round 4.');
    expect(text).toContain('First to 5 rounds wins');
  });

  it('explain attack and defend: raising the flag, and which side your team starts on', () => {
    const text = describeRules(rules, 'attackDefend');
    expect(text).toContain('stand by it for 5 s to raise your flag');
    expect(text).toContain('Your team attacks first; sides swap after round 4.');
    expect(describeRules({ ...rules, attackFirst: false }, 'attackDefend')).toContain('Your team defends first');
  });

  it('follow the Match pop-up: team size, rounds, the clock, friendly fire and ricochets (M20)', () => {
    const duel = describeRules({ ...rules, teamSize: 1, winsNeeded: 3, roundTime: 90, halfTimeAfter: 2 }, 'elimination');
    expect(duel).toContain('1v1: you (Blue) against one Orange bot.');
    expect(duel).toContain('1:30 on the clock');
    expect(duel).toContain('Teams swap ends after round 2.');
    expect(duel).toContain('First to 3 rounds');
    expect(duel).not.toContain('Friendly fire'); // nobody to hit in a 1v1
    expect(describeRules({ ...rules, teamSize: 2 }, 'elimination')).toContain('you and 1 bot teammate (Blue)');
    expect(describeRules(rules, 'elimination')).toContain("Friendly fire counts. Ricochets don't count.");
    expect(describeRules({ ...rules, friendlyFire: false, ricochetsCount: true }, 'elimination')).toContain('Friendly fire is off. Ricochets count.');
  });
});

describe('match info menus (M19)', () => {
  it('has no Back on the summary (Continue leads on to the result)', () => {
    expect(backTarget('summary', 'setup')).toBeNull();
  });

  it('has a Crosshair tab with nothing held back on it', () => {
    expect(SETTINGS_TABS.find((t) => t.id === 'crosshair')).toMatchObject({ later: false });
    expect(SETTINGS_LATER.crosshair).toEqual([]);
  });
});
