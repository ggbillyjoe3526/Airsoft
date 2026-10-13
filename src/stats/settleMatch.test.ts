import { describe, expect, it } from 'vitest';
import { GAME_POOL } from '../pool/gamePool';
import { GAME_LEVELS } from '../progress/gameLevels';
import { levelOf, unlocksUpTo } from '../progress/levels';
import { newProgress } from '../progress/progress';
import { type MatchOutcome, matchXp } from '../progress/xp';
import { emptyRecords, type MatchResult, resultKey } from './records';
import { DEFAULT_MAP } from '../map/maps';
import { DEFAULT_DIFFICULTY } from '../config/bots';
import { DEFAULT_MATCH_RULES, DEFAULT_RULESET } from '../config/matchRules';
import { matchUsesDev, type NewGamePicks } from '../newGamePicks';
import { MatchTakes, matchStanding, settleMatch } from './settleMatch';

const RESULT = { difficulty: 'normal', mode: 'elimination', won: true, hits: 7, bbsFired: 40 } as const;
const OUTCOME = { won: true, roundsWon: 5, hits: 7, winsNeeded: 5, difficulty: 'normal' } as const;
const L = GAME_LEVELS;
const earn = L.xp.earn;
const total = (level: number) => L.levels[level]!.total;

describe('settling a finished match (audit CORE-06, LV1)', () => {
  it('records it and gives its XP in one go, with no screen involved', () => {
    const records = emptyRecords();
    const progress = newProgress(L);
    const settled = settleMatch(records, progress, L, RESULT, OUTCOME);
    expect(records.results[resultKey('normal', 'elimination')]).toEqual({ wins: 1, losses: 0 });
    expect(settled.news).not.toBeNull();
    // A won first-to-5 on Normal: Match played, Match won, 5 rounds and 7 hits.
    expect(settled.xp!.total).toBe(earn.matchPlayed + earn.matchWon + 5 * earn.roundWon + 7 * earn.hit);
    expect(settled.xp).toEqual(matchXp(L.xp, OUTCOME));
    expect(progress.xp).toBe(settled.xp!.total);
  });

  it('unlocks the items of every level the XP reaches, once, and says so in the level up', () => {
    const progress = newProgress(L);
    // Just short of level 1: this match carries it past level 1 and into level 2.
    progress.xp = total(1) - 1;
    const gain = matchXp(L.xp, OUTCOME).total;
    expect(levelOf(L, total(1) - 1 + gain)).toBe(2);
    const settled = settleMatch(emptyRecords(), progress, L, null, OUTCOME);
    expect(settled.levelUp).toEqual({ from: 0, to: 2, unlocked: [...L.levels[1]!.unlocks, ...L.levels[2]!.unlocks] });
    expect(progress.unlocked).toEqual(unlocksUpTo(L, 2));
    // The next match within level 2 unlocks nothing new.
    const again = settleMatch(emptyRecords(), progress, L, null, { ...OUTCOME, won: false, roundsWon: 0, hits: 0 });
    expect(again.levelUp).toEqual({ from: 2, to: 2, unlocked: [] });
    expect(progress.unlocked).toEqual(unlocksUpTo(L, 2));
  });

  it('reports the XP at the cap but counts none past it', () => {
    const progress = newProgress(L);
    progress.xp = total(L.cap);
    progress.unlocked = unlocksUpTo(L, L.cap);
    const settled = settleMatch(emptyRecords(), progress, L, null, OUTCOME);
    expect(settled.xp!.total).toBeGreaterThan(0);
    expect(settled.levelUp).toEqual({ from: L.cap, to: L.cap, unlocked: [] });
    expect(progress.xp).toBe(total(L.cap));
  });

  it('changes nothing for a match already taken or giving no XP', () => {
    const records = emptyRecords();
    const progress = newProgress(L);
    expect(settleMatch(records, progress, L, null, null)).toEqual({ news: null, xp: null, levelUp: null });
    expect(records).toEqual(emptyRecords());
    expect(progress).toEqual(newProgress(L));
  });
});

describe('an Extraction haul (M44, LV1)', () => {
  const HAUL = { xp: 85 };

  it('gives the haul\'s XP with the hits, in the same settle (one save)', () => {
    const progress = newProgress(L);
    const settled = settleMatch(emptyRecords(), progress, L, null, { ...OUTCOME, extraction: true, haul: HAUL });
    // 85 got out with and 7 hits, on Normal (M47).
    expect(settled.xp!.total).toBe(85 + 7 * earn.hit);
    expect(progress.xp).toBe(settled.xp!.total);
  });

  it('gives nothing when the run gives no XP (Dev settings, dev content) or was settled already', () => {
    const progress = newProgress(L);
    expect(settleMatch(emptyRecords(), progress, L, null, null).xp).toBeNull();
    expect(progress).toEqual(newProgress(L));
  });
});

describe('an Extraction haul and dev content (M44)', () => {
  const HAUL = { xp: 85 };
  const extraction: NewGamePicks = { map: DEFAULT_MAP, mode: 'extraction', difficulty: DEFAULT_DIFFICULTY, teammateDifficulty: DEFAULT_DIFFICULTY, ruleset: DEFAULT_RULESET, rules: { ...DEFAULT_MATCH_RULES } };

  it('keeps nothing from an Extraction run today: the mode is dev content, so the run gives no XP', () => {
    expect(matchUsesDev(extraction, [], GAME_POOL, true)).toBe(true);
    const standing = matchStanding({ standardRules: true, devAssisted: false, devContentUsed: true });
    expect(standing.noXp).toBe('devContent');
    const progress = newProgress(L);
    const takes = new MatchTakes();
    const outcome = takes.outcome(true, standing.noXp === null, () => ({ ...OUTCOME, haul: HAUL }));
    expect(outcome).toBeNull();
    expect(settleMatch(emptyRecords(), progress, L, null, outcome)).toEqual({ news: null, xp: null, levelUp: null });
    expect(progress).toEqual(newProgress(L));
  });

  it('gives the haul once only: a second settle of the same decided run adds nothing', () => {
    const takes = new MatchTakes();
    const progress = newProgress(L);
    settleMatch(emptyRecords(), progress, L, null, takes.outcome(true, true, () => ({ ...OUTCOME, extraction: true, haul: HAUL })));
    const before = structuredClone(progress);
    const again = takes.outcome(true, true, () => ({ ...OUTCOME, extraction: true, haul: HAUL }));
    expect(settleMatch(emptyRecords(), progress, L, null, again).xp).toBeNull();
    expect(progress).toEqual(before);
  });
});

describe('a match taken once for the records and once for XP (audit POOL-25)', () => {
  it('gives nothing before the match is decided, then once only', () => {
    const t = new MatchTakes();
    expect(t.result(false, true, () => RESULT)).toBeNull();
    expect(t.outcome(false, true, () => OUTCOME)).toBeNull();
    expect(t.result(true, true, () => RESULT)).toBe(RESULT);
    expect(t.outcome(true, true, () => OUTCOME)).toBe(OUTCOME);
    expect(t.result(true, true, () => RESULT)).toBeNull();
    expect(t.outcome(true, true, () => OUTCOME)).toBeNull();
  });

  it('never gives XP for a Dev-assisted match, even when the help is off by the next call', () => {
    const t = new MatchTakes();
    const progress = newProgress(L);
    expect(settleMatch(emptyRecords(), progress, L, null, t.outcome(true, false, () => OUTCOME)).xp).toBeNull();
    expect(settleMatch(emptyRecords(), progress, L, null, t.outcome(true, true, () => OUTCOME)).xp).toBeNull();
    expect(progress.xp).toBe(0);
  });

  it('gives XP for a match with custom rules without recording it', () => {
    const t = new MatchTakes();
    const records = emptyRecords();
    const progress = newProgress(L);
    const settled = settleMatch(records, progress, L, t.result(true, false, () => RESULT), t.outcome(true, true, () => OUTCOME));
    expect(settled.news).toBeNull();
    expect(records).toEqual(emptyRecords());
    expect(settled.xp!.total).toBeGreaterThan(0);
    expect(progress.xp).toBe(settled.xp!.total);
  });
});

describe('what keeps a match out of the records and what gives XP (M35 matchStanding, LV1)', () => {
  const bools = [true, false];
  const expected = (standardRules: boolean, devAssisted: boolean, devContentUsed: boolean) => {
    const noXp = devAssisted ? 'dev' : devContentUsed ? 'devContent' : null;
    // Custom rules come first for the records; the XP never looks at them.
    return { notCounted: !standardRules ? 'rules' : (noXp ?? ''), noXp };
  };

  it('counts a standard match with nothing dev about it and gives it XP', () => {
    expect(matchStanding({ standardRules: true, devAssisted: false, devContentUsed: false })).toEqual({ notCounted: '', noXp: null });
  });

  it('gives each of the eight combinations the reasons the rule names', () => {
    for (const standardRules of bools) for (const devAssisted of bools) for (const devContentUsed of bools) {
      expect(matchStanding({ standardRules, devAssisted, devContentUsed }), JSON.stringify({ standardRules, devAssisted, devContentUsed })).toEqual(
        expected(standardRules, devAssisted, devContentUsed),
      );
    }
  });

  it('keeps custom rules out of the records but still gives them XP', () => {
    expect(matchStanding({ standardRules: false, devAssisted: false, devContentUsed: false })).toEqual({ notCounted: 'rules', noXp: null });
  });

  it('names Dev settings before dev content, for the records and for the XP', () => {
    expect(matchStanding({ standardRules: true, devAssisted: true, devContentUsed: true })).toEqual({ notCounted: 'dev', noXp: 'dev' });
    expect(matchStanding({ standardRules: true, devAssisted: false, devContentUsed: true })).toEqual({ notCounted: 'devContent', noXp: 'devContent' });
    expect(matchStanding({ standardRules: true, devAssisted: true, devContentUsed: false })).toEqual({ notCounted: 'dev', noXp: 'dev' });
  });

  it('names custom rules first for the records while the XP still names the dev reason', () => {
    expect(matchStanding({ standardRules: false, devAssisted: true, devContentUsed: true })).toEqual({ notCounted: 'rules', noXp: 'dev' });
    expect(matchStanding({ standardRules: false, devAssisted: false, devContentUsed: true })).toEqual({ notCounted: 'rules', noXp: 'devContent' });
    expect(matchStanding({ standardRules: false, devAssisted: true, devContentUsed: false })).toEqual({ notCounted: 'rules', noXp: 'dev' });
  });
});

describe('settling an Extraction run (M47, LV1)', () => {
  const HAUL = { xp: 120 };
  const runResult = (over: { won: boolean }, run = { haulXp: 120, finds: 2, seconds: 200 }): MatchResult => ({
    difficulty: 'normal',
    mode: 'extraction',
    hits: 3,
    bbsFired: 0,
    ...over,
    run,
  });
  const runOutcome = (over: Partial<MatchOutcome> = {}): MatchOutcome => ({ extraction: true, won: true, roundsWon: 1, hits: 3, winsNeeded: 1, difficulty: 'normal', haul: HAUL, ...over });

  it('records the run in its cell with its bests, apart from the match-win streak, and gives the haul and the hits in one settle', () => {
    const records = emptyRecords();
    const progress = newProgress(L);
    const settled = settleMatch(records, progress, L, runResult({ won: true }), runOutcome());
    expect(records.results[resultKey('normal', 'extraction')]).toEqual({ wins: 1, losses: 0 });
    expect(records).toMatchObject({ streak: 0, bestStreak: 0, bestHaul: 120, extractionStreak: 1, bestExtractionStreak: 1, fastestExtraction: 200 });
    expect(settled.news).toMatchObject({ bestHaul: true, bestExtractionStreak: true, fastestExtraction: true, bestStreak: false });
    expect(settled.xp!.lines).toEqual([
      { label: 'Got out with', xp: 120 },
      { label: '3 hits on an opponent', xp: 3 * earn.hit },
    ]);
    // The XP arrives once, with the run's lines.
    expect(progress.xp).toBe(120 + 3 * earn.hit);
  });

  it('times the whole run\'s XP by the difficulty', () => {
    const progress = newProgress(L);
    const settled = settleMatch(emptyRecords(), progress, L, null, runOutcome({ difficulty: 'hard' }));
    expect(settled.xp!.total).toBe(Math.round((120 + 3 * earn.hit) * L.xp.difficulty.hard));
    expect(progress.xp).toBe(settled.xp!.total);
  });

  it('gives your hits only for a run you are out of or caught out of, records a lost run and ends the streak', () => {
    const records = emptyRecords();
    settleMatch(records, newProgress(L), L, runResult({ won: true }), runOutcome());
    const progress = newProgress(L);
    // No haul in the outcome (MatchSession carries one only from a run that got out with something).
    const out = { extraction: true, won: false, roundsWon: 0, hits: 3, winsNeeded: 1, difficulty: 'normal' } as const;
    const settled = settleMatch(records, progress, L, runResult({ won: false }, { haulXp: 0, finds: 0, seconds: 90 }), out);
    expect(settled.xp!.lines).toEqual([{ label: '3 hits on an opponent', xp: 3 * earn.hit }]);
    expect(progress.xp).toBe(3 * earn.hit);
    expect(records.results[resultKey('normal', 'extraction')]).toEqual({ wins: 1, losses: 1 });
    expect(records).toMatchObject({ extractionStreak: 0, bestExtractionStreak: 1, bestHaul: 120, fastestExtraction: 200 });
    expect(settled.news).toMatchObject({ bestHaul: false, bestExtractionStreak: false, fastestExtraction: false });
  });

  it('gives no XP and records nothing for a dev content run: both takes come back empty, whatever the run found', () => {
    const standing = matchStanding({ standardRules: true, devAssisted: false, devContentUsed: true });
    expect(standing).toEqual({ notCounted: 'devContent', noXp: 'devContent' });
    const takes = new MatchTakes();
    const result = takes.result(true, standing.notCounted === '', () => runResult({ won: true }));
    const outcome = takes.outcome(true, standing.noXp === null, () => runOutcome());
    expect(result).toBeNull();
    expect(outcome).toBeNull();
    const records = emptyRecords();
    const progress = newProgress(L);
    expect(settleMatch(records, progress, L, result, outcome)).toEqual({ news: null, xp: null, levelUp: null });
    expect(records).toEqual(emptyRecords());
    expect(progress).toEqual(newProgress(L));
  });

  it('records the same run and gives its XP once the mode is no longer dev content (standing with nothing dev about it)', () => {
    const standing = matchStanding({ standardRules: true, devAssisted: false, devContentUsed: false });
    const takes = new MatchTakes();
    const records = emptyRecords();
    const progress = newProgress(L);
    const settled = settleMatch(
      records,
      progress,
      L,
      takes.result(true, standing.notCounted === '', () => runResult({ won: true })),
      takes.outcome(true, standing.noXp === null, () => runOutcome()),
    );
    expect(settled.news).not.toBeNull();
    expect(settled.xp!.total).toBe(120 + 3 * earn.hit);
    expect(records.extractionStreak).toBe(1);
  });
});
