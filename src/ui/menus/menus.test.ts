import { describe, expect, it } from 'vitest';
import { POWER_LABELS, SETTINGS_LATER, SETTINGS_TABS } from '../../config/menus';
import { FOV_SETTING, QUALITY, QUALITY_LABELS, RENDER } from '../../config/render';
import { AEG, GAS_PISTOL } from '../../config/replicas';
import { DEPOT } from '../../map/depot';
import { DEFAULT_MAP, MAPS, mapData } from '../../map/maps';
import { replicaSummary } from './loadoutScreen';
import { backTarget, screenWhenStopped } from './menuNav';
import { describeRules, type MatchRulesText } from './rulesText';
import { loadFov, loadMap } from './savedChoices';

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

describe('menu data', () => {
  it('lists placeholders for every settings tab, and only "later" tabs have nothing built', () => {
    for (const tab of SETTINGS_TABS) {
      expect(SETTINGS_LATER[tab.id]).toBeDefined();
      if (tab.later) expect(SETTINGS_LATER[tab.id].length).toBeGreaterThan(0);
    }
  });

  it('names every quality preset for the greyed Quality row, and has no Brightness setting', () => {
    expect(Object.keys(QUALITY_LABELS).sort()).toEqual(Object.keys(QUALITY).sort());
    expect(SETTINGS_LATER.graphics.some((s) => s.label === 'Brightness' || s.label === 'Field of view')).toBe(false);
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
    expect(replicaSummary(AEG)).toBe(`Electric · ${AEG.fireModes.join(', ')} · ${AEG.magSize}-round magazine`);
    expect(replicaSummary(GAS_PISTOL)).toBe(`Gas · semi · ${GAS_PISTOL.magSize}-round magazine`);
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
});
