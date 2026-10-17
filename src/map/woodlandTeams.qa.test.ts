import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DIFFICULTY } from '../config/bots';
import { DEFAULT_MATCH_RULES, DEFAULT_RULESET, type MatchRules, TEAM_SIZE_CHOICES } from '../config/matchRules';
import { DEFAULT_MODE, type MatchMode } from '../config/modes';
import { type NewGamePicks, playedTeamSize } from '../newGamePicks';
import { MemoryStorage } from '../pool/testStorage';
import { SETTINGS_KEY } from '../settings/storage';
import { PlayPicks, type PlayPicksHooks } from '../ui/menus/playModel';
import { DEFAULT_MAP, mapData, mapEntry, teamSizeOn } from './maps';

/**
 * M88 QA, acceptance 3 (owner's ruling, 2026-10-06): Woodland plays 5v5 by default, allows 6v6, and offers nothing
 * else; an Extraction run there keeps its squad of one to three. What woodland.test.ts, menus.test.ts and chrome.test.ts
 * leave open: picking the map in the Match screen's model sets 5v5, every mode clamps a smaller saved size up to 5, and
 * the map has a spawn and a dead-zone spot for each of six a side.
 */

const picks = (over: Partial<NewGamePicks> = {}, rules: Partial<MatchRules> = {}): NewGamePicks => ({
  map: DEFAULT_MAP,
  mode: DEFAULT_MODE,
  difficulty: DEFAULT_DIFFICULTY,
  teammateDifficulty: DEFAULT_DIFFICULTY,
  ruleset: DEFAULT_RULESET,
  rules: { ...DEFAULT_MATCH_RULES, ...rules },
  ...over,
});

describe('Woodland plays 5v5 or 6v6 in every mode but a run (M88, acceptance 3)', () => {
  const sizes = TEAM_SIZE_CHOICES.map((c) => Number(c.id));

  it.each(['elimination', 'attackDefend'] as MatchMode[])('%s: a saved 1v1 to 4v4 plays as 5v5, 5v5 and 6v6 as picked', (mode) => {
    expect(sizes).toEqual([1, 2, 3, 4, 5, 6]);
    for (const n of sizes) expect(playedTeamSize(picks({ map: 'woodland', mode }, { teamSize: n })), `${mode} ${n}`).toBe(n < 5 ? 5 : n);
    // Depot and Neon Heights keep their smaller sizes (the floor is Woodland's alone).
    expect(playedTeamSize(picks({ map: 'depot', mode }, { teamSize: 1 }))).toBe(1);
    expect(playedTeamSize(picks({ map: 'neonHeights', mode }, { teamSize: 2 }))).toBe(2);
    expect(playedTeamSize(picks({ map: 'neonHeights', mode }, { teamSize: 6 }))).toBe(5);
  });

  it("an Extraction run on Woodland takes the squad picked, one to three, and a saved 6v6 as a trio: the map's 5v5 floor does not raise it", () => {
    expect(mapData('woodland').extraction).toBeDefined();
    expect(sizes.map((n) => playedTeamSize(picks({ map: 'woodland', mode: 'extraction' }, { teamSize: n })))).toEqual([1, 2, 3, 3, 3, 3]);
  });

  it('has a spawn and a dead-zone spot for each of six a side, and nothing offers 7v7 there', () => {
    const wood = mapData('woodland');
    for (const end of [0, 1] as const) {
      expect(wood.spawns[end].length).toBe(mapEntry('woodland').teamSize.max);
      expect(wood.deadZones[end].length).toBeGreaterThanOrEqual(wood.spawns[end].length);
    }
    expect(mapEntry('woodland').teamSize.max).toBe(6);
    expect(teamSizeOn('woodland', 7)).toBe(6);
  });
});

describe('picking Woodland in the Match screen sets 5v5 (M88, acceptance 3)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function model(start: NewGamePicks) {
    const rules: MatchRules[] = [];
    const hooks: PlayPicksHooks = {
      onMap: () => {},
      onLight: () => {},
      onMode: () => {},
      onRuleset: () => {},
      onRules: (r) => void rules.push(r),
      onDifficulty: () => {},
      onTeammates: () => {},
      onTeam: () => {},
      refresh: () => {},
    };
    return { m: new PlayPicks(start, {}, true, hooks), rules };
  }

  it('from Depot 3v3 to Woodland 5v5 (4v4 before M88), saved, and back to 3v3', () => {
    const { m, rules } = model(picks());
    expect(m.picks().rules.teamSize).toBe(3);
    m.setMap('woodland');
    expect(m.picks().rules.teamSize).toBe(5);
    expect(rules.at(-1)?.teamSize).toBe(5);
    expect(playedTeamSize(m.picks())).toBe(5);
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toMatchObject({ teamSize: '5' });
    m.setMap('depot');
    expect(m.picks().rules.teamSize).toBe(3);
  });
});
