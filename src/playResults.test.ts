import { describe, expect, it, vi } from 'vitest';
import type { DevSettings } from './config/dev';
import type { MatchSession } from './matchSession';
import { PlayResults } from './playResults';
import { GAME_LEVELS } from './progress/gameLevels';
import { newProgress } from './progress/progress';
import type { MatchOutcome } from './progress/xp';
import { emptyRecords, type MatchResult, resultKey } from './stats/records';
import { MatchTakes } from './stats/settleMatch';

/**
 * Settling a decided match (KNOWN_ISSUES: only checked by hand until KI1; out of game.ts into playResults.ts, DX8): on a
 * stand-in session (a match needs a page to build), and where the game calls it, read from its source.
 */

const RESULT: MatchResult = { difficulty: 'normal', mode: 'elimination', won: true, hits: 7, bbsFired: 40 };
const OUTCOME: MatchOutcome = { won: true, roundsWon: 5, hits: 7, winsNeeded: 5, difficulty: 'normal' };

/** The results with a fresh progress and no records, and a session decided or not; `pays`: XP (no Dev help). */
function standIn(pays = true) {
  const progress = newProgress(GAME_LEVELS);
  const setup = { syncedProgress: () => progress, kitChanged: vi.fn() };
  const menus = { refresh: vi.fn() };
  const dev = { adaptiveDifficulty: false, devContent: false, unlockAllGear: false } as DevSettings;
  const results = new PlayResults(setup, () => dev, menus, emptyRecords());
  const takes = new MatchTakes();
  const round = { phase: 'live' as string };
  const session = {
    state: { round },
    setup: { adaptive: null, difficulty: 'normal', ruleset: 'standard' },
    mode: 'elimination',
    givesXp: pays,
    noXpReason: pays ? null : 'dev',
    notCountedReason: null,
    adaptiveResult: () => null,
    runFinds: () => [],
    takeMatchResult: vi.fn(() => takes.result(round.phase === 'matchOver', true, () => RESULT)),
    takeOutcome: vi.fn(() => takes.outcome(round.phase === 'matchOver', pays, () => OUTCOME)),
  };
  const settle = (): void => results.settle(session as unknown as MatchSession);
  const summary = () => results.summary(session as unknown as MatchSession, { result: 'won', summaryBlocks: [] } as unknown as ReturnType<MatchSession['resultView']>);
  return { results, progress, menus, session, round, settle, summary };
}

describe('the results settle a decided match once (M19, FA1, FA10; KI1)', () => {
  it('does nothing while the match is still on', () => {
    const { results, progress, session, settle } = standIn();
    settle();
    expect(session.takeMatchResult).not.toHaveBeenCalled();
    expect(results.records).toEqual(emptyRecords());
    expect(progress.xp).toBe(0);
  });

  it('records the match and gives its XP the first frame it is over, and never again for that session', () => {
    const { results, progress, menus, session, round, settle, summary } = standIn();
    round.phase = 'matchOver';
    settle();
    expect(results.records.results[resultKey('normal', 'elimination')]).toEqual({ wins: 1, losses: 0 });
    const xp = progress.xp;
    expect(xp).toBeGreaterThan(0);
    expect(summary().xp).not.toBeNull();
    expect(menus.refresh).toHaveBeenCalled();
    // The result screen's call, and every later frame's, change nothing.
    settle();
    settle();
    expect(session.takeMatchResult).toHaveBeenCalledTimes(1);
    expect(results.records.results[resultKey('normal', 'elimination')]).toEqual({ wins: 1, losses: 0 });
    expect(progress.xp).toBe(xp);
  });

  it('a match with Dev help gives no XP and says why, but still goes in the records', () => {
    const { results, progress, round, settle, summary } = standIn(false);
    round.phase = 'matchOver';
    settle();
    expect(progress.xp).toBe(0);
    expect(summary().xp).toBeNull();
    expect(summary().noXp).toBe('dev');
    expect(results.records.results[resultKey('normal', 'elimination')]).toEqual({ wins: 1, losses: 0 });
  });

  it('keeps a timed challenge best only when a run beats it (M93)', () => {
    const { results } = standIn();
    expect(results.challengeBest('range')).toBe(0);
    results.challengeRun('range', 12);
    results.challengeRun('range', 9);
    expect(results.challengeBest('range')).toBe(12);
  });
});

describe('where the game settles (KI1)', () => {
  const sources = import.meta.glob<string>(['/src/game.ts', '/src/playFlow.ts'], { query: '?raw', import: 'default', eager: true });
  const read = (file: string): string => (sources[file] ?? '').replace(/\r\n/g, '\n');
  const game = read('/src/game.ts');
  const flow = read('/src/playFlow.ts');

  it('every frame of a match, straight after the simulation advances, and again as the result screen opens', () => {
    const advance = game.indexOf('s.advance(dt * this.dev.inForce.gameSpeed)');
    expect(advance).toBeGreaterThan(0);
    const after = game.slice(advance, game.indexOf('\n', game.indexOf("if (s.kind === 'match') this.results.settle(s);", advance)));
    expect(after).toContain("if (s.kind === 'match') this.results.settle(s);");
    // No more than a few lines on (the smoothing of the sim time between).
    expect(after.split('\n').length).toBeLessThan(5);
    const result = flow.indexOf("screen === 'result'");
    expect(result).toBeGreaterThan(0);
    expect(flow.slice(result, flow.indexOf('menus.showResult(', result))).toContain('this.parts.results.settle(s);');
    expect(game.split('results.settle(s)').length - 1 + flow.split('results.settle(s)').length - 1).toBe(2);
  });
});
