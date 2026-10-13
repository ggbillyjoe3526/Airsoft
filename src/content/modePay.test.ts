import { describe, expect, it } from 'vitest';
import { ROUNDS } from '../config/hits';
import { GAME_LEVELS } from '../progress/gameLevels';
import { matchXp } from '../progress/xp';
import { evenMatchRounds, type PayRules, type PlayedRounds, roundsPayNoise, roundsPayPerMinute } from './modePay';

/**
 * What a mode played in rounds gives a minute (CT3, the balance run's "pay in line with Elimination"; LV1: XP, from
 * levels.md's XP tables): the even match's rounds, the XP a minute from a sweep's rounds and hits, and how far that
 * may be off from the sweep's size alone.
 */

const XP = GAME_LEVELS.xp;

const RULES: PayRules = { winsNeeded: ROUNDS.winsNeeded, winBy: 1, resetDelay: 5 };
/** `n` rounds of `seconds` each, alternating winners, with `draws` of them drawn. */
const rounds = (n: number, seconds: number | ((i: number) => number), draws = 0): PlayedRounds['rounds'] =>
  Array.from({ length: n }, (_, i) => ({ seconds: typeof seconds === 'number' ? seconds : seconds(i), winner: i < draws ? -1 : i % 2 }));
const played = (r: PlayedRounds['rounds'], hits = 0): PlayedRounds => ({ rounds: r, hits, players: 6, seconds: r.reduce((s, x) => s + x.seconds, 0) });

describe('an even match’s rounds', () => {
  it('decides a one-round match in one round, won 1 to 0', () => {
    const r = evenMatchRounds({ winsNeeded: 1, winBy: 1 });
    expect(r.decided).toBeCloseTo(1, 9);
    expect(r.winner).toBeCloseTo(1, 9);
    expect(r.loser).toBeCloseTo(0, 9);
  });

  it('decides first to 2 in 2.5 rounds on average: 2 to 0 or 2 to 1, half the time each', () => {
    const r = evenMatchRounds({ winsNeeded: 2, winBy: 1 });
    expect(r.decided).toBeCloseTo(2.5, 9);
    expect(r.winner).toBeCloseTo(2, 9);
    expect(r.loser).toBeCloseTo(0.5, 9);
  });

  it('takes longer with win by two, the winner at least two clear', () => {
    // A lead of two from level: four rounds on average (a fair walk to ±2), less the long tail past the cap (1 in 4096).
    const one = evenMatchRounds({ winsNeeded: 1, winBy: 2 });
    expect(one.decided).toBeCloseTo(4, 1);
    expect(one.winner - one.loser).toBeCloseTo(2, 2);
    for (const winsNeeded of [3, 5, 7]) {
      const byOne = evenMatchRounds({ winsNeeded, winBy: 1 });
      const byTwo = evenMatchRounds({ winsNeeded, winBy: 2 });
      expect(byTwo.decided, `first to ${winsNeeded}`).toBeGreaterThan(byOne.decided);
      expect(byTwo.winner).toBeGreaterThanOrEqual(winsNeeded);
      expect(byTwo.winner - byTwo.loser).toBeGreaterThanOrEqual(2 - 1e-3);
      expect(byOne.winner).toBeCloseTo(winsNeeded, 9);
      expect(byOne.decided).toBeGreaterThan(winsNeeded);
      expect(byOne.decided).toBeLessThan(2 * winsNeeded);
      // Every match is decided: the chances add to one, so decided is the winner's plus the loser's.
      expect(byTwo.decided).toBeCloseTo(byTwo.winner + byTwo.loser, 6);
    }
  });
});

describe('XP a minute from a sweep’s rounds', () => {
  it('is no number with no rounds, or every round drawn', () => {
    expect(roundsPayPerMinute(XP, 'normal', { rounds: [], hits: 0, players: 6, seconds: 0 }, RULES)).toBeNaN();
    expect(roundsPayPerMinute(XP, 'normal', played(rounds(4, 60, 4)), RULES)).toBeNaN();
    expect(roundsPayPerMinute(XP, 'normal', played(rounds(4, 60, 3)), RULES)).toBeGreaterThan(0);
  });

  it('pays less a minute for longer rounds, and for more draws', () => {
    const short = roundsPayPerMinute(XP, 'normal', played(rounds(10, 40)), RULES);
    const long = roundsPayPerMinute(XP, 'normal', played(rounds(10, 120)), RULES);
    expect(short).toBeGreaterThan(long);
    expect(roundsPayPerMinute(XP, 'normal', played(rounds(10, 40, 3)), RULES)).toBeLessThan(short);
  });

  it('pays more for more hits: each a player’s share at the hit rate', () => {
    const none = roundsPayPerMinute(XP, 'normal', played(rounds(10, 60)), RULES);
    // 60 hits among 6 players over 10 minutes: one hit a player a minute.
    const some = roundsPayPerMinute(XP, 'normal', played(rounds(10, 60), 60), RULES);
    expect(some - none).toBeCloseTo(XP.earn.hit * XP.difficulty.normal, 9);
  });

  it('prices the match as the game gives it (matchXp): the even match’s winner and loser over its minutes', () => {
    // First to 5 by one, 60 s rounds and a 5 s reset, no draws, no hits.
    const even = evenMatchRounds(RULES);
    const minutes = (even.decided * (60 + RULES.resetDelay)) / 60;
    const give = (won: boolean, roundsWon: number) => matchXp(XP, { won, roundsWon, hits: 0, winsNeeded: RULES.winsNeeded, difficulty: 'normal', teammateDifficulty: 'normal' }).total;
    const expected = (give(true, even.winner) + give(false, even.loser)) / 2 / minutes;
    expect(roundsPayPerMinute(XP, 'normal', played(rounds(10, 60)), RULES)).toBeCloseTo(expected, 9);
    // levels.md as shipped: Match played 100, Match won 100, Round won 20.
    expect(XP.earn).toEqual({ matchPlayed: 100, matchWon: 100, roundWon: 20, hit: 10 });
  });

  it('pays more at a harder level', () => {
    const at = (level: 'easy' | 'normal' | 'hard') => roundsPayPerMinute(XP, level, played(rounds(10, 60), 30), RULES);
    expect(at('easy')).toBeLessThan(at('normal'));
    expect(at('normal')).toBeLessThan(at('hard'));
  });
});

describe('how far the pay may be off from the sweep’s size', () => {
  it('is no number under two rounds or with every round drawn', () => {
    expect(roundsPayNoise(played(rounds(1, 60)), RULES)).toBeNaN();
    expect(roundsPayNoise(played(rounds(0, 60)), RULES)).toBeNaN();
    expect(roundsPayNoise(played(rounds(4, 60, 4)), RULES)).toBeNaN();
  });

  it('is nothing for identical rounds with no draws', () => {
    expect(roundsPayNoise(played(rounds(8, 60)), RULES)).toBe(0);
  });

  it('shrinks with more rounds of the same spread', () => {
    const spread = (i: number) => (i % 2 === 0 ? 40 : 80);
    const few = roundsPayNoise(played(rounds(8, spread)), RULES);
    const many = roundsPayNoise(played(rounds(32, spread)), RULES);
    expect(few).toBeGreaterThan(0);
    expect(many).toBeLessThan(few);
    // About the square root: four times the rounds, about half the error.
    expect(many / few).toBeCloseTo(0.5, 1);
  });

  it('grows with draws', () => {
    expect(roundsPayNoise(played(rounds(10, 60, 3)), RULES)).toBeGreaterThan(0);
  });
});
