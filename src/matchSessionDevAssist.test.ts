import { describe, expect, it, vi } from 'vitest';
import { DEV_DEFAULTS, type DevSettings } from './config/dev';
import { ROUNDS } from './config/hits';
import { MAG_SHARE } from './config/magShare';
import { LOADOUT } from './config/replicas';
import { MatchSession } from './matchSession';
import { createCharacter } from './sim/character';
import { vec3 } from './sim/vec';

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
    state: { round: { phase: 'live', clock: 100, overtime: 0, overtimeFlag: { left: ROUNDS.overtime.time } } },
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

describe('Dev settings › Bots run low on BBs (MG1)', () => {
  /** A bare session with three bots on each team, in round `round` at simulation time `time`. */
  function lowSession(time: number, round = 1) {
    const { s } = bare(false);
    const bots = [0, 0, 0, 1, 1, 1].map((team, i) => ({ character: createCharacter(i + 1, vec3(), 0, LOADOUT, team) }));
    Object.assign(s, { state: { time, round: { phase: 'live', clock: 100, overtime: 0, number: round } }, bots: { bots }, runLowAt: MAG_SHARE.devLowAfter });
    const empty = () => bots.filter((b) => b.character.armament.ammo[0]!.pouch.every((n) => n === 0)).map((b) => b.character.id);
    const tick = () => (s as unknown as { runBotsLow(): void }).runBotsLow();
    return { s, bots, empty, tick, state: (s as unknown as { state: { time: number } }).state };
  }
  const low: DevSettings = { ...DEV_DEFAULTS, botsRunLow: true };

  it('puts one bot a team on its last magazine once, devLowAfter into the round, round 1 included', () => {
    const f = lowSession(0);
    f.s.setDevCheats(low);
    f.tick();
    expect(f.empty()).toEqual([]);
    f.state.time = MAG_SHARE.devLowAfter;
    f.tick();
    // Round 1: the second bot of each team (round % count).
    expect(f.empty()).toEqual([2, 5]);
    for (const b of f.bots) b.character.armament.ammo[0]!.pouch.fill(60);
    f.state.time += 30;
    f.tick();
    expect(f.empty()).toEqual([]);
  });

  it('with the switch off, nobody', () => {
    const f = lowSession(MAG_SHARE.devLowAfter);
    f.s.setDevCheats(DEV_DEFAULTS);
    f.tick();
    expect(f.empty()).toEqual([]);
  });
});
