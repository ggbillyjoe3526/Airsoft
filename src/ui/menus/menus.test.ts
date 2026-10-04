import { describe, expect, it } from 'vitest';
import { CROSSHAIR_COLORS, CROSSHAIR_SHAPES, HIT_FEED_MODES, SCOREBOARD_SIZE, scoreboardScale } from '../../config/matchInfo';
import { ARMORY_TEXT, SETTINGS_LATER, SETTINGS_TABS } from '../../config/menus';
import { unpaidLine } from './summaryScreen';
import { FOV_SETTING, QUALITY, QUALITY_CHOICES, RENDER } from '../../config/render';
import { factoryParts } from '../../config/attachments';
import { AEG, GAS_PISTOL } from '../../config/replicas';
import { DEPOT } from '../../map/depot';
import { TEAM_COLOUR_CHOICES } from '../../config/teams';
import { COMING_MAPS, COMING_SOON_TAG, DEFAULT_MAP, MAPS, mapData } from '../../map/maps';
import { replicaSummary } from './loadoutScreen';
import { backTarget, escResumes, moreBelow, screenWhenStopped, tabAfterKey } from './menuNav';
import { describeRules, type MatchRulesText } from './rulesText';
import { loadFov, loadMap, loadSavedQuality } from './savedChoices';

/** Joining words that stay lower case in a title-case label ("Cross and Dot"). */
const SMALL_WORDS = new Set(['and', 'or', 'to', 'of']);

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

describe('Esc on the pause menu (audit UI-09)', () => {
  it('resumes from the pause menu only, not on a held key\'s repeats nor straight after the pause came up', () => {
    expect(escResumes('pause', 1000, false, 400)).toBe(true);
    expect(escResumes('pause', 100, false, 400)).toBe(false); // the Esc that released the mouse
    expect(escResumes('pause', 1000, true, 400)).toBe(false);
    for (const screen of ['title', 'setup', 'settings', 'loadout', 'result', 'summary'] as const) expect(escResumes(screen, 1000, false, 400)).toBe(false);
  });
});

describe('the scroll hint on long pages (audit UI-18)', () => {
  it('says there is more below until the page is scrolled to its end', () => {
    expect(moreBelow(0, 720, 911)).toBe(true); // Controls at 1280 × 720 before the fix measured 191 px more
    expect(moreBelow(191, 720, 911)).toBe(false);
    expect(moreBelow(0, 720, 721)).toBe(false); // a pixel of rounding is not "more"
    expect(moreBelow(0, 720, 600)).toBe(false);
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

  it('offers every quality preset and Custom on the Quality picker (M14, final alpha audit), and has no Brightness setting', () => {
    expect(QUALITY_CHOICES.map((c) => c.id).sort()).toEqual([...Object.keys(QUALITY), 'custom'].sort());
    expect(SETTINGS_LATER.graphics.some((s) => s.label === 'Brightness' || s.label === 'Field of view' || s.label === 'Quality')).toBe(false);
    // No browser storage in the tests: nothing saved (the game then picks one for the visit, config/render.ts).
    expect(loadSavedQuality()).toBeNull();
  });

  it('has the field of view slider around the default view, 90° (owner, 2026-10-04)', () => {
    expect(RENDER.horizontalFov16x9).toBe(90);
    expect(FOV_SETTING.min).toBeLessThan(RENDER.horizontalFov16x9);
    expect(FOV_SETTING.max).toBeGreaterThan(RENDER.horizontalFov16x9);
    // No browser storage in the tests: nothing saved, so the default view.
    expect(loadFov()).toBe(RENDER.horizontalFov16x9);
  });

  it('describes each map in a few words (owner, 2026-10-04)', () => {
    expect(MAPS.find((m) => m.id === 'depot')!.blurb).toBe('An abandoned warehouse yard.');
    for (const m of MAPS) expect(m.blurb.split(' ').length).toBeLessThanOrEqual(8);
  });

  it('lists Woodland as a coming map that is not a MapId, so the Map choice never saves or loads it (M33a)', () => {
    expect(COMING_MAPS.map((m) => m.label)).toContain('Woodland');
    const playable = new Set<string>(MAPS.map((m) => m.id));
    for (const m of COMING_MAPS) {
      expect(playable.has(m.label.toLowerCase()), m.label).toBe(false);
      expect(mapData(m.label.toLowerCase() as never)).toBe(mapData(DEFAULT_MAP)); // an unknown id falls back to Depot
    }
    expect(DEFAULT_MAP).toBe('depot');
  });

  it('describes each coming map in at most eight words, tagged "Coming soon" (M33a)', () => {
    expect(COMING_SOON_TAG).toBe('Coming soon');
    for (const m of COMING_MAPS) {
      expect(m.blurb.trim()).not.toBe('');
      expect(m.blurb.split(' ').length, m.label).toBeLessThanOrEqual(8);
    }
  });

  it('starts every word of a two-word button with a capital (owner, 2026-10-04)', () => {
    const labels = [...CROSSHAIR_SHAPES, ...CROSSHAIR_COLORS, ...TEAM_COLOUR_CHOICES, ...HIT_FEED_MODES, ...QUALITY_CHOICES].map((o) => o.label);
    for (const label of labels) {
      for (const word of label.split(' ')) if (!SMALL_WORDS.has(word)) expect(word[0], label).toBe(word[0]!.toUpperCase());
    }
  });

  it('keeps the Dev tab hidden until its box is ticked, and lists placeholders for it like every tab (M24)', () => {
    expect(SETTINGS_TABS.filter((t) => t.hidden).map((t) => t.id)).toEqual(['dev']);
    expect(SETTINGS_TABS.at(-1)!.id).toBe('dev');
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
    eliminationStartEnd: 1,
    attackDefendStartEnd: 0,
    friendlyFire: true,
    ricochetsCount: false,
  };

  it('explain elimination: teams, the clock, the swap of ends and the win condition', () => {
    const text = describeRules(rules, 'elimination');
    expect(text).toContain('3v3 with bots: you and 2 bot teammates (Blue) against Orange.');
    expect(text).toContain('2:30 on the clock');
    expect(text).toContain('You start at the east end; teams swap ends after round 4.');
    expect(text).toContain('First to 5 rounds wins');
    expect(describeRules({ ...rules, eliminationStartEnd: 0 }, 'elimination')).toContain('You start at the west end');
  });

  it('explain attack and defend: raising the flag, and which side your team starts on', () => {
    const text = describeRules(rules, 'attackDefend');
    expect(text).toContain('stand by it for 5 s to raise your flag');
    expect(text).toContain('Your team attacks first, from the west end; sides swap after round 4.');
    expect(describeRules({ ...rules, attackFirst: false, attackDefendStartEnd: 1 }, 'attackDefend')).toContain('Your team defends first, from the east end');
  });

  it('follow the Match pop-up: team size, rounds, the clock, friendly fire and ricochets (M20)', () => {
    const duel = describeRules({ ...rules, teamSize: 1, winsNeeded: 3, roundTime: 90, halfTimeAfter: 2 }, 'elimination');
    expect(duel).toContain('1v1: you (Blue) against one Orange bot.');
    expect(duel).toContain('1:30 on the clock');
    expect(duel).toContain('teams swap ends after round 2.');
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

describe('HUD settings (M24)', () => {
  it('makes the scoreboard larger by default, as picked on a wide screen', () => {
    expect(SCOREBOARD_SIZE.default).toBeGreaterThan(1);
    expect(scoreboardScale(SCOREBOARD_SIZE.default, 1920)).toBe(SCOREBOARD_SIZE.default);
    expect(scoreboardScale(SCOREBOARD_SIZE.max, 2560)).toBe(SCOREBOARD_SIZE.max);
    expect(scoreboardScale(0.8, 1024)).toBe(0.8);
  });

  it('holds it back in a narrow window so the hit feed keeps its room, never below its old size', () => {
    const at1280 = scoreboardScale(SCOREBOARD_SIZE.max, 1280);
    expect(at1280).toBeLessThan(SCOREBOARD_SIZE.max);
    expect(1280 / 2 - SCOREBOARD_SIZE.halfWidth * at1280).toBeCloseTo(SCOREBOARD_SIZE.feedRoom, 5);
    expect(scoreboardScale(SCOREBOARD_SIZE.max, 800)).toBe(1);
  });
});

describe('the summary when a match paid nothing (audit POOL-22)', () => {
  it('says why: Dev settings changed the match, or the Armory is off; nothing when it paid', () => {
    expect(unpaidLine(null, 'dev')).toBe(ARMORY_TEXT.unpaidDev);
    expect(unpaidLine(null, 'off')).toBe(ARMORY_TEXT.unpaidOff);
    expect(unpaidLine(null, 'devContent')).toBe(ARMORY_TEXT.unpaidDevContent);
    expect(ARMORY_TEXT.unpaidDevContent).not.toBe(ARMORY_TEXT.unpaidDev);
    expect(unpaidLine({ lines: [], multiplier: 1, total: 40 }, 'devContent')).toBe('');
    expect(unpaidLine(null, null)).toBe('');
    expect(unpaidLine({ lines: [], multiplier: 1, total: 40 }, 'dev')).toBe('');
  });
});
