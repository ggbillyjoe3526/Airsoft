import { describe, expect, it, vi } from 'vitest';
import { AdaptiveRun } from './ai/adaptiveRun';
import { skillAt } from './ai/adaptiveSkill';
import { BOT_BEHAVIOUR, botConfig } from './config/bots';
import { DEV_DEFAULTS, type DevSettings } from './config/dev';
import { ROUNDS } from './config/hits';
import { MatchSession, teamBotConfigs } from './matchSession';

/**
 * Adaptive difficulty in a match (AD1). The real session needs a GPU and physics, so the real class runs on a bare
 * object holding what these methods touch (as matchSessionDevAssist.test.ts).
 */
function bare(adaptive: AdaptiveRun | null, phase = 'matchOver', matchWinner = 0) {
  const s = Object.create(MatchSession.prototype) as MatchSession;
  Object.assign(s, {
    player: { armament: { bottomless: false }, ghost: false, team: 0 },
    match: { setWatchingBots: vi.fn(), setBotIntents: vi.fn() },
    state: { round: { phase, matchWinner, clock: 100, overtime: 0, overtimeFlag: { left: ROUNDS.overtime.time } } },
    rounds: ROUNDS,
    setup: { devContentUsed: false },
    standardRules: true,
    devAssisted: false,
    devEndedRound: false,
    otherDevHelp: false,
    played: true,
    botsHoldFire: false,
    adaptive,
  });
  return s;
}
const adaptiveOnly: DevSettings = { ...DEV_DEFAULTS, adaptiveDifficulty: true };

describe('adaptive difficulty in a match (AD1)', () => {
  it('keeps the match out of the records, but learns from it', () => {
    const run = new AdaptiveRun(1, 2, 'normal', { id: 0, team: 0 });
    const s = bare(run);
    s.setDevCheats(adaptiveOnly);
    expect(s.countsForRecords).toBe(false);
    expect(s.adaptiveResult()).toEqual({ start: 1, next: run.next(true) });
    expect(run.next(true)).toBeGreaterThan(1);
    const lost = bare(new AdaptiveRun(1, 2, 'normal', { id: 0, team: 0 }), 'matchOver', 1);
    lost.setDevCheats(adaptiveOnly);
    expect(lost.adaptiveResult()!.next).toBeLessThan(1);
  });

  it('learns nothing from a match other Dev settings helped, even if switched off again, or one with a round ended from Dev settings', () => {
    const s = bare(new AdaptiveRun(1, 2, 'normal', { id: 0, team: 0 }));
    s.setDevCheats({ ...adaptiveOnly, ghost: true });
    s.setDevCheats(adaptiveOnly);
    expect(s.adaptiveResult()).toEqual({ start: 1, next: null });
    const ended = bare(new AdaptiveRun(1, 2, 'normal', { id: 0, team: 0 }), 'live');
    ended.setDevCheats(adaptiveOnly);
    expect(ended.endRoundNow()).toBe(true);
    (ended as unknown as { state: { round: { phase: string } } }).state.round.phase = 'matchOver';
    expect(ended.adaptiveResult()).toEqual({ start: 1, next: null });
  });

  it('has nothing to say before the match is decided or at a fixed level', () => {
    expect(bare(new AdaptiveRun(1, 2, 'normal', { id: 0, team: 0 }), 'live').adaptiveResult()).toBeNull();
    expect(bare(null).adaptiveResult()).toBeNull();
  });

  it("plays the other team at the rating's skill and your teammates at their own level", () => {
    const run = new AdaptiveRun(1.4, 2, 'normal', { id: 0, team: 0 });
    const setup = { difficulty: 'normal', teammateDifficulty: 'easy' } as const;
    const [mine, theirs] = teamBotConfigs(0, setup, run);
    expect(mine).toEqual(botConfig('easy'));
    expect(theirs).toEqual({ ...BOT_BEHAVIOUR, ...skillAt(1.4, 'normal') });
    // From Beta the lists swap; at a fixed level both are plain levels.
    expect(teamBotConfigs(1, setup, run)[1]).toEqual(botConfig('easy'));
    expect(teamBotConfigs(0, setup, null)).toEqual([botConfig('easy'), botConfig('normal')]);
  });
});
