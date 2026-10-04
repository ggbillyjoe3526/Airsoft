import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultTeammateDifficulty } from './bots';
import { hasSavedTeammateDifficulty, loadDifficulty, loadMatchRules, loadTeammateDifficulty } from '../ui/menus/savedChoices';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { HITS, ROUNDS } from './hits';
import { countsForRecords, DEFAULT_MATCH_RULES, formatRoundTime, SKIRMISH_SWITCHES, TEAM_SIZE_CHOICES, standardMatchText, hitRulesFor, matchRulesSummary, roundRulesFor } from './matchRules';

/** A browser store holding `fields` in the settings object. */
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

describe('custom match rules (M20)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('default to the match the game always had: 3v3, first to 5, 2:30 rounds, friendly fire on, ricochets not counting', () => {
    expect(DEFAULT_MATCH_RULES).toEqual({ winsNeeded: 5, roundTime: 150, teamSize: 3, friendlyFire: true, ricochetsCount: false, ...SKIRMISH_SWITCHES });
    const rounds = roundRulesFor(DEFAULT_MATCH_RULES);
    expect(rounds).toMatchObject({ winsNeeded: ROUNDS.winsNeeded, roundTime: ROUNDS.roundTime, halfTimeAfter: ROUNDS.halfTimeAfter, teamSize: ROUNDS.teamSize });
    expect(hitRulesFor(DEFAULT_MATCH_RULES)).toEqual(HITS);
  });

  it('describe the standard match in full, once, for New game\'s note and the summary', () => {
    expect(standardMatchText()).toBe("3v3 · first to 5, 2:30 rounds. Friendly fire on; ricochets don't count. Your teammates at the opponents' level, or Normal against Easy.");
  });

  it('count for the records only as the standard match with teammates at the opponents\' level or their default', () => {
    expect(countsForRecords(DEFAULT_MATCH_RULES, 'hard', 'hard')).toBe(true);
    expect(countsForRecords(DEFAULT_MATCH_RULES, 'hard', 'normal')).toBe(false);
    expect(countsForRecords(DEFAULT_MATCH_RULES, 'easy', 'easy')).toBe(true);
    // The game's own default against Easy (Normal teammates, audit AI-03) is the standard match, not custom (FA4).
    expect(countsForRecords(DEFAULT_MATCH_RULES, 'easy', 'normal')).toBe(true);
    expect(countsForRecords(DEFAULT_MATCH_RULES, 'easy', 'hard')).toBe(false);
    expect(countsForRecords(DEFAULT_MATCH_RULES, 'normal', 'easy')).toBe(false);
    expect(countsForRecords({ ...DEFAULT_MATCH_RULES, teamSize: 2 }, 'easy', 'normal')).toBe(false);
    expect(countsForRecords({ ...DEFAULT_MATCH_RULES, teamSize: 1 }, 'normal', 'normal')).toBe(false);
    expect(countsForRecords({ ...DEFAULT_MATCH_RULES, winsNeeded: 3 }, 'normal', 'normal')).toBe(false);
    expect(countsForRecords({ ...DEFAULT_MATCH_RULES, roundTime: 180 }, 'normal', 'normal')).toBe(false);
    expect(countsForRecords({ ...DEFAULT_MATCH_RULES, friendlyFire: false }, 'normal', 'normal')).toBe(false);
    expect(countsForRecords({ ...DEFAULT_MATCH_RULES, ricochetsCount: true }, 'normal', 'normal')).toBe(false);
  });

  it('count Pro opponents with Pro teammates (its default pair) and no other pairing (M36)', () => {
    expect(defaultTeammateDifficulty('pro')).toBe('pro');
    expect(countsForRecords(DEFAULT_MATCH_RULES, 'pro', 'pro')).toBe(true);
    expect(countsForRecords(DEFAULT_MATCH_RULES, 'pro', 'hard')).toBe(false);
    expect(countsForRecords(DEFAULT_MATCH_RULES, 'hard', 'pro')).toBe(false);
    expect(countsForRecords(DEFAULT_MATCH_RULES, 'pro', 'easy')).toBe(false);
    expect(countsForRecords({ ...DEFAULT_MATCH_RULES, teamSize: 2 }, 'pro', 'pro')).toBe(false);
    expect(countsForRecords({ ...DEFAULT_MATCH_RULES, friendlyFire: false }, 'pro', 'pro')).toBe(false);
  });

  it('read a saved Pro difficulty back as Pro, teammates following it until their own is saved (M36)', () => {
    vi.stubGlobal('localStorage', storageWith({ difficulty: 'pro' }));
    expect(loadDifficulty()).toBe('pro');
    expect(loadTeammateDifficulty()).toBe('pro');
    expect(hasSavedTeammateDifficulty()).toBe(false);
    expect(countsForRecords(DEFAULT_MATCH_RULES, loadDifficulty(), loadTeammateDifficulty())).toBe(true);
    vi.stubGlobal('localStorage', storageWith({ difficulty: 'hard', teammateDifficulty: 'pro' }));
    expect(loadTeammateDifficulty()).toBe('pro');
    expect(hasSavedTeammateDifficulty()).toBe(true);
    vi.stubGlobal('localStorage', storageWith({ difficulty: 'pro', teammateDifficulty: 'easy' }));
    expect(loadTeammateDifficulty()).toBe('easy');
    // an id this build doesn't know (a newer build's level) still falls back to the defaults
    vi.stubGlobal('localStorage', storageWith({ difficulty: 'legend', teammateDifficulty: 'legend' }));
    expect(loadDifficulty()).toBe('normal');
    expect(loadTeammateDifficulty()).toBe('normal');
    vi.stubGlobal('localStorage', storageWith({ difficulty: 'pro', teammateDifficulty: 'legend' }));
    expect(loadTeammateDifficulty()).toBe('pro');
    expect(hasSavedTeammateDifficulty()).toBe(false);
  });

  it('swap ends one round before a team could first win: the decider is always in the second half', () => {
    for (const w of [3, 5, 7, 10]) {
      const r = roundRulesFor({ ...DEFAULT_MATCH_RULES, winsNeeded: w });
      expect(r.halfTimeAfter).toBe(w - 1);
      // The longest match is 2w - 1 decided rounds; the second half holds w of them.
      expect(2 * w - 1 - r.halfTimeAfter).toBe(w);
    }
  });

  it('carry friendly fire and ricochets into the hit rules, and team size, rounds and time into the round rules', () => {
    const m = { ...DEFAULT_MATCH_RULES, winsNeeded: 3, roundTime: 90, teamSize: 1, friendlyFire: false, ricochetsCount: true };
    expect(hitRulesFor(m)).toMatchObject({ friendlyFire: false, ricochetsCount: true, bodyRadius: HITS.bodyRadius });
    expect(roundRulesFor(m)).toMatchObject({ winsNeeded: 3, roundTime: 90, teamSize: 1, resetDelay: ROUNDS.resetDelay });
  });

  it('offer team sizes up to 5v5 and load a saved 4v4 or 5v5 (M33d); a size nobody offers falls back to 3v3', () => {
    expect(TEAM_SIZE_CHOICES.map((c) => c.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(TEAM_SIZE_CHOICES.map((c) => c.label)).toEqual(['1v1', '2v2', '3v3', '4v4', '5v5']);
    for (const size of [4, 5]) {
      vi.stubGlobal('localStorage', storageWith({ teamSize: String(size) }));
      expect(loadMatchRules().teamSize).toBe(size);
      expect(roundRulesFor({ ...DEFAULT_MATCH_RULES, teamSize: size }).teamSize).toBe(size);
      // A 4v4 or 5v5 is not the standard match the records count.
      expect(countsForRecords({ ...DEFAULT_MATCH_RULES, teamSize: size }, 'normal', 'normal')).toBe(false);
    }
    vi.stubGlobal('localStorage', storageWith({ teamSize: '6' }));
    expect(loadMatchRules().teamSize).toBe(3);
  });

  it('sum the rules up for New game', () => {
    expect(formatRoundTime(90)).toBe('1:30');
    expect(formatRoundTime(300)).toBe('5:00');
    expect(matchRulesSummary(DEFAULT_MATCH_RULES)).toEqual({ value: '3v3 · first to 5', detail: "2:30 rounds. Friendly fire on; ricochets don't count." });
  });

  it('read back what was saved, and the default for anything missing or off the menu', () => {
    vi.stubGlobal('localStorage', storageWith({ winsNeeded: '7', roundTime: 210, teamSize: '2', friendlyFire: 'off', ricochets: 'on' }));
    expect(loadMatchRules()).toEqual({ winsNeeded: 7, roundTime: 210, teamSize: 2, friendlyFire: false, ricochetsCount: true, ...SKIRMISH_SWITCHES });
    vi.stubGlobal('localStorage', storageWith({ winsNeeded: '4', roundTime: 200, teamSize: '6', friendlyFire: 'maybe' }));
    expect(loadMatchRules()).toEqual(DEFAULT_MATCH_RULES);
  });

  it('give teammates the saved opponents\' level until one of their own is saved (a save from before M20)', () => {
    vi.stubGlobal('localStorage', storageWith({ difficulty: 'hard' }));
    expect(loadTeammateDifficulty()).toBe('hard');
    expect(hasSavedTeammateDifficulty()).toBe(false); // so New game keeps them following the opponents' picks
    expect(countsForRecords(DEFAULT_MATCH_RULES, 'hard', loadTeammateDifficulty())).toBe(true);
    vi.stubGlobal('localStorage', storageWith({ difficulty: 'hard', teammateDifficulty: 'easy' }));
    expect(loadTeammateDifficulty()).toBe('easy');
    expect(hasSavedTeammateDifficulty()).toBe(true);
    vi.stubGlobal('localStorage', storageWith({}));
    expect(loadTeammateDifficulty()).toBe('normal');
  });

  it('give Normal teammates, not Easy ones, against Easy opponents until a teammate level is saved (audit AI-03)', () => {
    vi.stubGlobal('localStorage', storageWith({ difficulty: 'easy' }));
    expect(loadTeammateDifficulty()).toBe('normal');
    expect(hasSavedTeammateDifficulty()).toBe(false);
    // and that default match still counts for the records, filed under Easy (the opponents' level)
    expect(countsForRecords(DEFAULT_MATCH_RULES, 'easy', loadTeammateDifficulty())).toBe(true);
    vi.stubGlobal('localStorage', storageWith({ difficulty: 'easy', teammateDifficulty: 'easy' }));
    expect(loadTeammateDifficulty()).toBe('easy'); // a level the player picked stands
  });
});
