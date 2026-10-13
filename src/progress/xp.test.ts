import { describe, expect, it } from 'vitest';
import { CUSTOM_RULES_PAY_CAP } from '../config/matchRules';
import { GAME_LEVELS } from './gameLevels';
import { DEFAULT_XP, type XpRules } from './levels';
import { type MatchOutcome, matchXp } from './xp';

const R = GAME_LEVELS.xp;
const WON: MatchOutcome = { won: true, roundsWon: 5, hits: 7, winsNeeded: 5, difficulty: 'normal' };
const LOST: MatchOutcome = { won: false, roundsWon: 3, hits: 4, winsNeeded: 5, difficulty: 'normal' };

describe('levels.md\'s XP as shipped (premise)', () => {
  it('gives 100 for a match played and won, 20 a round and 10 a hit, ×0.5 to ×2 by difficulty', () => {
    expect(R).toEqual(DEFAULT_XP);
    expect(R).toEqual({ earn: { matchPlayed: 100, matchWon: 100, roundWon: 20, hit: 10 }, difficulty: { easy: 0.5, normal: 1, hard: 1.5, pro: 2 } });
  });
});

describe('a match\'s XP (LV1)', () => {
  it('gives a won first-to-5 its four lines in full', () => {
    expect(matchXp(R, WON)).toEqual({
      lines: [
        { label: 'Match played', xp: 100 },
        { label: 'Match won', xp: 100 },
        { label: '5 rounds won', xp: 100 },
        { label: '7 hits on an opponent', xp: 70 },
      ],
      multiplier: 1,
      total: 370,
    });
  });

  it('gives a lost first-to-5 no Match won line', () => {
    expect(matchXp(R, LOST)).toEqual({
      lines: [
        { label: 'Match played', xp: 100 },
        { label: '3 rounds won', xp: 60 },
        { label: '4 hits on an opponent', xp: 40 },
      ],
      multiplier: 1,
      total: 200,
    });
  });

  it('names one round and one hit in the singular, and leaves out a line with none', () => {
    expect(matchXp(R, { ...LOST, roundsWon: 1, hits: 1 }).lines).toEqual([
      { label: 'Match played', xp: 100 },
      { label: '1 round won', xp: 20 },
      { label: '1 hit on an opponent', xp: 10 },
    ]);
    expect(matchXp(R, { ...LOST, roundsWon: 0, hits: 0 })).toEqual({ lines: [{ label: 'Match played', xp: 100 }], multiplier: 1, total: 100 });
  });

  it('scales Match played, Match won and the rounds by a shorter match, but never the hits', () => {
    // First to 3: three fifths of the match lines.
    expect(matchXp(R, { ...WON, roundsWon: 3, winsNeeded: 3 }).lines).toEqual([
      { label: 'Match played', xp: 60 },
      { label: 'Match won', xp: 60 },
      { label: '3 rounds won', xp: 36 },
      { label: '7 hits on an opponent', xp: 70 },
    ]);
    // A longer match gives no more than the standard one for the same play.
    expect(matchXp(R, { ...WON, winsNeeded: 9 })).toEqual(matchXp(R, WON));
    expect(matchXp(R, { ...WON, roundsWon: 0, hits: 0, winsNeeded: 0 }).total).toBe(0);
  });

  it('multiplies the total by the difficulty', () => {
    expect(matchXp(R, { ...WON, difficulty: 'easy' })).toMatchObject({ multiplier: 0.5, total: 185 });
    expect(matchXp(R, { ...WON, difficulty: 'hard' })).toMatchObject({ multiplier: 1.5, total: 555 });
    expect(matchXp(R, { ...WON, difficulty: 'pro' })).toMatchObject({ multiplier: 2, total: 740 });
    // The lines stay as earned; only the total is multiplied.
    expect(matchXp(R, { ...WON, difficulty: 'pro' }).lines).toEqual(matchXp(R, WON).lines);
  });

  it('takes the lower of the opponents\' and the teammates\' difficulty multipliers', () => {
    expect(matchXp(R, { ...WON, difficulty: 'hard', teammateDifficulty: 'easy' }).multiplier).toBe(0.5);
    expect(matchXp(R, { ...WON, difficulty: 'easy', teammateDifficulty: 'pro' }).multiplier).toBe(0.5);
    expect(matchXp(R, { ...WON, difficulty: 'pro', teammateDifficulty: 'hard' }).multiplier).toBe(1.5);
    expect(matchXp(R, { ...WON, difficulty: 'hard', teammateDifficulty: 'hard' })).toMatchObject({ multiplier: 1.5, total: 555 });
  });

  it('caps custom rules at CUSTOM_RULES_PAY_CAP, leaving a lower difficulty as it is', () => {
    expect(CUSTOM_RULES_PAY_CAP).toBe(1.5);
    expect(matchXp(R, { ...WON, difficulty: 'pro', customRules: true })).toMatchObject({ multiplier: CUSTOM_RULES_PAY_CAP, total: 555 });
    expect(matchXp(R, { ...WON, difficulty: 'pro', teammateDifficulty: 'pro', customRules: true }).multiplier).toBe(CUSTOM_RULES_PAY_CAP);
    expect(matchXp(R, { ...WON, difficulty: 'normal', customRules: true }).multiplier).toBe(1);
    expect(matchXp(R, { ...WON, difficulty: 'easy', customRules: true }).multiplier).toBe(0.5);
  });

  it('rounds the total to a whole number', () => {
    // 100 + 3 × 10 on Easy: 65; 101 on Easy: 50.5, rounded up.
    expect(matchXp(R, { ...LOST, roundsWon: 0, hits: 3, difficulty: 'easy' }).total).toBe(65);
    const odd: XpRules = { ...R, earn: { ...R.earn, matchPlayed: 101 } };
    expect(matchXp(odd, { ...LOST, roundsWon: 0, hits: 0, difficulty: 'easy' }).total).toBe(51);
  });

  it('reads its numbers from the rules it is given (levels.md), not built-in ones', () => {
    const rules: XpRules = { earn: { matchPlayed: 1, matchWon: 2, roundWon: 3, hit: 4 }, difficulty: { easy: 1, normal: 10, hard: 1, pro: 1 } };
    expect(matchXp(rules, WON)).toMatchObject({ multiplier: 10, total: (1 + 2 + 5 * 3 + 7 * 4) * 10 });
  });
});

describe('an Extraction run\'s XP (M47, LV1)', () => {
  const RUN: MatchOutcome = { extraction: true, won: true, roundsWon: 1, hits: 3, winsNeeded: 1, difficulty: 'normal', haul: { xp: 120 } };

  it('gives the haul got out with and the hits, with no match or round lines', () => {
    expect(matchXp(R, RUN)).toEqual({
      lines: [
        { label: 'Got out with', xp: 120 },
        { label: '3 hits on an opponent', xp: 30 },
      ],
      multiplier: 1,
      total: 150,
    });
  });

  it('multiplies the whole run by the difficulty', () => {
    expect(matchXp(R, { ...RUN, difficulty: 'hard' }).total).toBe(225);
    expect(matchXp(R, { ...RUN, difficulty: 'easy', teammateDifficulty: 'pro' }).total).toBe(75);
  });

  it('gives the hits alone for a run that got out empty-handed or didn\'t get out', () => {
    expect(matchXp(R, { ...RUN, haul: { xp: 0 } }).lines).toEqual([{ label: '3 hits on an opponent', xp: 30 }]);
    const { haul: _, ...out } = RUN;
    expect(matchXp(R, { ...out, won: false, roundsWon: 0 })).toEqual({ lines: [{ label: '3 hits on an opponent', xp: 30 }], multiplier: 1, total: 30 });
    expect(matchXp(R, { ...out, won: false, roundsWon: 0, hits: 0 })).toEqual({ lines: [], multiplier: 1, total: 0 });
  });

  it('leaves the haul out of a match in the other modes', () => {
    const { extraction: _, ...match } = RUN;
    expect(matchXp(R, match).lines.map((l) => l.label)).not.toContain('Got out with');
  });
});
