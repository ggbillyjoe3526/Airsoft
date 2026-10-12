import { describe, expect, it, vi } from 'vitest';
import { DEV_DEFAULTS, type DevSettings } from './config/dev';
import { ROUNDS } from './config/hits';
import { MatchSession } from './matchSession';

/**
 * BP3b QA: a round ended from Dev settings keeps the match out of the records however the switches are set after it,
 * and a Skip to next round tells the combat presentation to drop its owed AEG wind-downs. The real session needs a GPU
 * and physics, so the real class runs on a bare object holding what these methods touch.
 */
function bare(played: boolean) {
  const s = Object.create(MatchSession.prototype) as MatchSession;
  const combat = { skipBegins: vi.fn() };
  Object.assign(s, {
    player: { armament: { bottomless: false }, ghost: false },
    match: { setWatchingBots: vi.fn(), setBotIntents: vi.fn() },
    state: { round: { phase: 'live', clock: 100, overtime: 0 } },
    rounds: ROUNDS,
    setup: { devContentUsed: false },
    standardRules: true,
    devAssisted: false,
    devEndedRound: false,
    played,
    botsHoldFire: false,
    skip: null,
    combat,
  });
  return { s, combat };
}
const off: DevSettings = { ...DEV_DEFAULTS };
const cheating: DevSettings = { ...DEV_DEFAULTS, ghost: true };

describe('a round ended from Dev settings stays out of the records', () => {
  it('counts for the records at first, and not after End the round now, even with every switch off again (before play)', () => {
    const { s } = bare(false);
    s.setDevCheats(off);
    expect(s.countsForRecords).toBe(true);
    expect(s.endRoundNow()).toBe(true);
    expect(s.notCountedReason).toBe('dev');
    // Before play begins, the switches alone are re-read each time: without the memory of the ended round this clears.
    s.setDevCheats(cheating);
    s.setDevCheats(off);
    expect(s.countsForRecords).toBe(false);
    expect(s.notCountedReason).toBe('dev');
  });

  it('is still counted after play has begun, and with no live round nothing is ended', () => {
    const { s } = bare(true);
    s.endRoundNow();
    s.setDevCheats(off);
    expect(s.countsForRecords).toBe(false);
    const idle = bare(false);
    (idle.s as unknown as { state: { round: { phase: string } } }).state.round.phase = 'reset';
    expect(idle.s.endRoundNow()).toBe(false);
    idle.s.setDevCheats(off);
    expect(idle.s.countsForRecords).toBe(true);
  });
});

describe('beginSkip drops the AEG wind-downs still owed', () => {
  it('tells the combat presentation when a skip starts, and not when none is offered', () => {
    const { s, combat } = bare(true);
    Object.defineProperty(s, 'skipOffer', { value: null, configurable: true });
    expect(s.beginSkip()).toBe(false);
    expect(combat.skipBegins).not.toHaveBeenCalled();
    Object.defineProperty(s, 'skipOffer', { value: 'round', configurable: true });
    expect(s.beginSkip()).toBe(true);
    expect(combat.skipBegins).toHaveBeenCalledTimes(1);
  });
});
