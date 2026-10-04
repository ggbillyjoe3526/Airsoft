import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DIFFICULTY } from './config/bots';
import { DEFAULT_MATCH_RULES, recordsKeyOf, roundRulesFor, standardRulesOf } from './config/matchRules';
import { DEFAULT_MODE } from './config/modes';
import { DEFAULT_MAP } from './map/maps';
import { type NewGamePicks, playedPicks } from './newGamePicks';
import { SETTINGS_KEY, SETTINGS_VERSION } from './settings/storage';
import { loadDifficulty, loadMatchRules, loadRuleset } from './ui/menus/savedChoices';

/** M39 QA: a Tournament pick saved on an earlier visit plays as Skirmish while Dev content is off (M35), and as Tournament with it on. */
function storageWith(fields: Record<string, unknown>): Storage {
  const data = new Map<string, string>([[SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...fields })]]);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    length: data.size,
  };
}

/** What Game builds from its saved settings (game.ts playedPicks). */
function savedPicks(): NewGamePicks {
  return { map: DEFAULT_MAP, mode: DEFAULT_MODE, difficulty: loadDifficulty(), teammateDifficulty: DEFAULT_DIFFICULTY, ruleset: loadRuleset(), rules: loadMatchRules() };
}

describe('a saved ruleset pick (M39 criterion 1, M35)', () => {
  afterEach(() => vi.unstubAllGlobals());

  for (const saved of ['tournament', 'proCqb'] as const) {
    it(`keeps a saved ${saved} pick but plays Skirmish with Dev content off, and ${saved} with it on`, () => {
      vi.stubGlobal('localStorage', storageWith({ ruleset: saved, winsNeeded: '3', teamSize: '2' }));
      const picks = savedPicks();
      expect(picks.ruleset).toBe(saved); // the pick is kept, so it comes back with Dev content
      const off = playedPicks(picks, false);
      expect(off.ruleset).toBe('skirmish');
      expect(recordsKeyOf(off.ruleset)).toBe('');
      // Skirmish's own rules, with the Match pop-up's picks as saved: no Tournament numbers, no new switches.
      expect(off.rules).toEqual({ ...DEFAULT_MATCH_RULES, winsNeeded: 3, teamSize: 2 });
      expect(roundRulesFor(off.rules)).toMatchObject({ winsNeeded: 3, winBy: 1, timeOutToMorePlayers: false, roundTime: 150 });
      const on = playedPicks(picks, true);
      expect(on.ruleset).toBe(saved);
      expect(on.rules).toEqual({ ...standardRulesOf(saved), teamSize: 2 });
    });
  }

  it('plays a saved Custom pick as Custom either way, and a pick never saved as Skirmish', () => {
    vi.stubGlobal('localStorage', storageWith({ ruleset: 'custom', overtime: 'on', fireModes: 'semi' }));
    for (const dev of [false, true]) {
      const p = playedPicks(savedPicks(), dev);
      expect(p.ruleset).toBe('custom');
      expect(p.rules).toMatchObject({ winByTwo: true, semiAutoOnly: true });
    }
    vi.stubGlobal('localStorage', storageWith({}));
    expect(playedPicks(savedPicks(), true).ruleset).toBe('skirmish');
  });
});
