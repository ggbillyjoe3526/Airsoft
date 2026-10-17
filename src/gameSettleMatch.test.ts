import { describe, expect, it, vi } from 'vitest';
import { Game } from './game';
import { GAME_LEVELS } from './progress/gameLevels';
import { newProgress, type Progress } from './progress/progress';
import type { MatchOutcome } from './progress/xp';
import { emptyRecords, type MatchResult, type Records, resultKey } from './stats/records';
import { MatchTakes } from './stats/settleMatch';

/**
 * `Game` settling a decided match (KNOWN_ISSUES: only checked by hand until KI1): its private `settleMatch` run on a
 * stand-in game and session (a Game needs a page to build), and where the game calls it, read from its source.
 */

const RESULT: MatchResult = { difficulty: 'normal', mode: 'elimination', won: true, hits: 7, bbsFired: 40 };
const OUTCOME: MatchOutcome = { won: true, roundsWon: 5, hits: 7, winsNeeded: 5, difficulty: 'normal' };

interface StandIn {
  records: Records;
  progress: Progress;
  lastXp: unknown;
  noXpReason: string | null;
  recordNews: unknown;
  settledSession: unknown;
  menus: { refresh: () => void };
}

/** A game with only what settling reads, and a session decided or not; `pays`: XP (no Dev help). */
function standIn(pays = true) {
  const game = Object.assign(Object.create(Game.prototype) as object, {
    records: emptyRecords(),
    progress: newProgress(GAME_LEVELS),
    dev: { adaptiveDifficulty: false, devContent: false, unlockAllGear: false },
    menus: { refresh: vi.fn() },
    settledSession: null,
    recordNews: null,
    lastXp: null,
    noXpReason: null,
    adaptiveLine: null,
    loadoutChanged: false,
    setupChanged: false,
  }) as StandIn;
  const takes = new MatchTakes();
  const round = { phase: 'live' as string };
  const session = {
    state: { round },
    setup: { adaptive: null },
    givesXp: pays,
    noXpReason: pays ? null : 'dev',
    adaptiveResult: () => null,
    takeMatchResult: vi.fn(() => takes.result(round.phase === 'matchOver', true, () => RESULT)),
    takeOutcome: vi.fn(() => takes.outcome(round.phase === 'matchOver', pays, () => OUTCOME)),
  };
  const settle = (): void => (Game.prototype as unknown as { settleMatch(this: StandIn, s: unknown): void }).settleMatch.call(game, session);
  return { game, session, round, settle };
}

describe('Game settles a decided match once (M19, FA1, FA10; KI1)', () => {
  it('does nothing while the match is still on', () => {
    const { game, session, settle } = standIn();
    settle();
    expect(session.takeMatchResult).not.toHaveBeenCalled();
    expect(game.records).toEqual(emptyRecords());
    expect(game.progress.xp).toBe(0);
  });

  it('records the match and gives its XP the first frame it is over, and never again for that session', () => {
    const { game, session, round, settle } = standIn();
    round.phase = 'matchOver';
    settle();
    expect(game.records.results[resultKey('normal', 'elimination')]).toEqual({ wins: 1, losses: 0 });
    expect(game.recordNews).not.toBeNull();
    const xp = game.progress.xp;
    expect(xp).toBeGreaterThan(0);
    expect(game.lastXp).not.toBeNull();
    expect(game.menus.refresh).toHaveBeenCalled();
    // The result screen's call, and every later frame's, change nothing.
    settle();
    settle();
    expect(session.takeMatchResult).toHaveBeenCalledTimes(1);
    expect(game.records.results[resultKey('normal', 'elimination')]).toEqual({ wins: 1, losses: 0 });
    expect(game.progress.xp).toBe(xp);
  });

  it('a match with Dev help gives no XP and says why, but still goes in the records', () => {
    const { game, round, settle } = standIn(false);
    round.phase = 'matchOver';
    settle();
    expect(game.progress.xp).toBe(0);
    expect(game.lastXp).toBeNull();
    expect(game.noXpReason).toBe('dev');
    expect(game.records.results[resultKey('normal', 'elimination')]).toEqual({ wins: 1, losses: 0 });
  });
});

describe('where Game settles (KI1)', () => {
  const source = (import.meta.glob<string>('/src/game.ts', { query: '?raw', import: 'default', eager: true })['/src/game.ts'] ?? '').replace(/\r\n/g, '\n');

  it('every frame of a match, straight after the simulation advances, and again as the result screen opens', () => {
    const advance = source.indexOf('s.advance(dt * this.dev.gameSpeed)');
    expect(advance).toBeGreaterThan(0);
    const after = source.slice(advance, source.indexOf('\n', source.indexOf("if (s.kind === 'match') this.settleMatch(s);", advance)));
    expect(after).toContain("if (s.kind === 'match') this.settleMatch(s);");
    // No more than a few lines on (the smoothing of the sim time between).
    expect(after.split('\n').length).toBeLessThan(5);
    const result = source.indexOf("screen === 'result'");
    expect(result).toBeGreaterThan(0);
    expect(source.slice(result, source.indexOf('this.menus.showResult(', result))).toContain('this.settleMatch(s);');
    expect(source.split('this.settleMatch(s)').length - 1).toBe(2);
  });
});
