import { describe, expect, it } from 'vitest';
import { LOADOUT_SLOTS, POWER_LABELS, SETTINGS_LATER, SETTINGS_TABS } from '../../config/menus';
import { DEFAULT_QUALITY, QUALITY, QUALITY_CHOICES } from '../../config/render';
import { AEG, GAS_PISTOL, LOADOUT } from '../../config/replicas';
import { replicaSummary } from './loadoutScreen';
import { backTarget, screenWhenStopped } from './menuNav';
import { describeRules, type MatchRulesText } from './rulesText';

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
  it('has a loadout slot for every replica in the loadout', () => {
    expect(LOADOUT_SLOTS).toHaveLength(LOADOUT.length);
  });

  it('lists placeholders for every settings tab, and only "later" tabs have nothing built', () => {
    for (const tab of SETTINGS_TABS) {
      expect(SETTINGS_LATER[tab.id]).toBeDefined();
      if (tab.later) expect(SETTINGS_LATER[tab.id].length).toBeGreaterThan(0);
    }
  });

  it('offers every render quality preset in Settings, the default among them', () => {
    expect(QUALITY_CHOICES.map((q) => q.id).sort()).toEqual(Object.keys(QUALITY).sort());
    expect(QUALITY_CHOICES.map((q) => q.id)).toContain(DEFAULT_QUALITY);
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
