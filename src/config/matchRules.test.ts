import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadMatchRules } from '../ui/menus/savedChoices';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { HITS, ROUNDS } from './hits';
import { countsForRecords, DEFAULT_MATCH_RULES, formatRoundTime, hitRulesFor, matchRulesSummary, roundRulesFor } from './matchRules';

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
    expect(DEFAULT_MATCH_RULES).toEqual({ winsNeeded: 5, roundTime: 150, teamSize: 3, friendlyFire: true, ricochetsCount: false });
    const rounds = roundRulesFor(DEFAULT_MATCH_RULES);
    expect(rounds).toMatchObject({ winsNeeded: ROUNDS.winsNeeded, roundTime: ROUNDS.roundTime, halfTimeAfter: ROUNDS.halfTimeAfter, teamSize: ROUNDS.teamSize });
    expect(hitRulesFor(DEFAULT_MATCH_RULES)).toEqual(HITS);
  });

  it('count for the records only as the standard match with both teams at one difficulty', () => {
    expect(countsForRecords(DEFAULT_MATCH_RULES, 'hard', 'hard')).toBe(true);
    expect(countsForRecords(DEFAULT_MATCH_RULES, 'hard', 'normal')).toBe(false);
    expect(countsForRecords({ ...DEFAULT_MATCH_RULES, teamSize: 1 }, 'normal', 'normal')).toBe(false);
    expect(countsForRecords({ ...DEFAULT_MATCH_RULES, winsNeeded: 3 }, 'normal', 'normal')).toBe(false);
    expect(countsForRecords({ ...DEFAULT_MATCH_RULES, roundTime: 180 }, 'normal', 'normal')).toBe(false);
    expect(countsForRecords({ ...DEFAULT_MATCH_RULES, friendlyFire: false }, 'normal', 'normal')).toBe(false);
    expect(countsForRecords({ ...DEFAULT_MATCH_RULES, ricochetsCount: true }, 'normal', 'normal')).toBe(false);
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
    const m = { winsNeeded: 3, roundTime: 90, teamSize: 1, friendlyFire: false, ricochetsCount: true };
    expect(hitRulesFor(m)).toMatchObject({ friendlyFire: false, ricochetsCount: true, bodyRadius: HITS.bodyRadius });
    expect(roundRulesFor(m)).toMatchObject({ winsNeeded: 3, roundTime: 90, teamSize: 1, resetDelay: ROUNDS.resetDelay });
  });

  it('sum the rules up for New game', () => {
    expect(formatRoundTime(90)).toBe('1:30');
    expect(formatRoundTime(300)).toBe('5:00');
    expect(matchRulesSummary(DEFAULT_MATCH_RULES)).toEqual({ value: '3v3 · first to 5', detail: "2:30 rounds. Friendly fire on; ricochets don't count." });
  });

  it('read back what was saved, and the default for anything missing or off the menu', () => {
    vi.stubGlobal('localStorage', storageWith({ winsNeeded: '7', roundTime: 210, teamSize: '2', friendlyFire: 'off', ricochets: 'on' }));
    expect(loadMatchRules()).toEqual({ winsNeeded: 7, roundTime: 210, teamSize: 2, friendlyFire: false, ricochetsCount: true });
    vi.stubGlobal('localStorage', storageWith({ winsNeeded: '4', roundTime: 200, teamSize: '6', friendlyFire: 'maybe' }));
    expect(loadMatchRules()).toEqual(DEFAULT_MATCH_RULES);
  });
});
