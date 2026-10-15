import { describe, expect, it } from 'vitest';
import { FLAG, OVERTIME } from '../config/modes';
import { LOADOUT } from '../config/replicas';
import { createBBPool } from './ballistics';
import { type Character, createCharacter } from './character';
import type { GameEvent } from './events';
import { createOvertimeFlag, raiseOvertimeFlag, resetOvertimeFlag, stepOvertimeFlag, touchesOvertimeFlag } from './overtimeFlag';
import { createRoundState, longestOvertime, type RoundContext, type RoundRules, type RoundState, runOutRound, stepRound } from './round';
import { vec3 } from './vec';

/**
 * Elimination's overtime flag (OT1, Dev 6 item 45): a level time-out puts a flag up near the middle, and the first team
 * to touch it wins the round. Contested, nobody takes it; untouched, the time-out rule decides; a wipe-out still ends it.
 */

const DT = 1 / 60;
const RULES: RoundRules = { roundTime: 5, resetDelay: 2, winsNeeded: 3, winBy: 1, timeOutToMorePlayers: false, halfTimeAfter: 2, eliminationFirstEnd: 0, flag: { ...FLAG, firstAttackers: 0 }, overtime: OVERTIME };
const SPOT = vec3(0, 0, 0);
const SPAWNS = [
  [0, 1].map((z) => ({ position: vec3(-20, 0, z), yaw: -Math.PI / 2 })),
  [2, 3].map((z) => ({ position: vec3(20, 0, z), yaw: Math.PI / 2 })),
];
const CTX: RoundContext = { rules: RULES, pole: vec3(10, 0, 0), spawns: SPAWNS, spawnLift: 0, overtimeFlag: SPOT };

/** Two a side, Blue (0, 1) at the west end and Orange (2, 3) at the east, far from the flag. */
function teams(): Character[] {
  return [0, 1, 2, 3].map((id) => createCharacter(id, vec3(id < 2 ? -20 : 20, 0, id), 0, LOADOUT, id < 2 ? 0 : 1));
}

function run(seconds: number, round: RoundState, cs: Character[], events: GameEvent[], ctx: RoundContext = CTX): void {
  const bbs = createBBPool(4);
  for (let i = 0; i < Math.round(seconds / DT); i++) stepRound(round, cs, bbs, ctx, events, DT);
}

/** A round played to its buzzer with nobody touching anything: the flag goes up on the last tick. */
function toOvertime(cs: Character[], ctx: RoundContext = CTX): { round: RoundState; events: GameEvent[] } {
  const round = createRoundState(ctx.rules);
  const events: GameEvent[] = [];
  run(ctx.rules.roundTime + DT, round, cs, events, ctx);
  return { round, events };
}

const put = (c: Character, x: number, z: number, y = 0) => {
  c.position.x = x;
  c.position.y = y;
  c.position.z = z;
};

describe('the overtime flag goes up', () => {
  it('when the clock runs out with nobody knocked out: at the map\'s spot, once, with no result yet', () => {
    const { round, events } = toOvertime(teams());
    expect(round.phase).toBe('live');
    expect(round.overtimeFlag.up).toBe(true);
    expect(round.overtimeFlag.position).toEqual(SPOT);
    expect(round.overtimeFlag.position).not.toBe(SPOT); // a copy: the map's spot is never written
    expect(events.filter((e) => e.type === 'overtime')).toEqual([{ type: 'overtime', position: SPOT }]);
    expect(events.some((e) => e.type === 'roundOver')).toBe(false);
  });

  it('under the more-players rule only when the teams are level; a lead takes the round at the buzzer', () => {
    const rules = { ...RULES, timeOutToMorePlayers: true };
    const ctx = { ...CTX, rules };
    expect(toOvertime(teams(), ctx).round.overtimeFlag.up).toBe(true);
    const cs = teams();
    cs[3]!.status = 'out';
    // One of Orange out at once would be a wipe-out of nobody: two a side, so Blue simply has more left.
    const { round, events } = toOvertime(cs, ctx);
    expect(round.overtimeFlag.up).toBe(false);
    expect(events).toContainEqual({ type: 'roundOver', winner: 0, reason: 'time' });
  });

  it('never on a map with no spot for it, nor in Attack / Defend (Extraction steps no round clock of its own)', () => {
    const { round, events } = toOvertime(teams(), { ...CTX, overtimeFlag: undefined });
    expect(round.overtimeFlag.up).toBe(false);
    expect(events).toContainEqual({ type: 'roundOver', winner: -1, reason: 'time' });
    const r = createRoundState(RULES, 'attackDefend', vec3(10, 0, 0));
    const evs: GameEvent[] = [];
    run(RULES.roundTime + longestOvertime(RULES) + 1, r, teams(), evs);
    expect(r.overtimeFlag.up).toBe(false);
    expect(evs.some((e) => e.type === 'overtime')).toBe(false);
    expect(evs).toContainEqual({ type: 'roundOver', winner: 1, reason: 'time' });
  });
});

describe('who takes it', () => {
  it('the first team with a hand on it wins the round at once', () => {
    const cs = teams();
    const { round, events } = toOvertime(cs);
    put(cs[2]!, SPOT.x + OVERTIME.reach * 0.9, SPOT.z);
    run(DT, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 1, reason: 'overtimeFlag' });
    expect(round.score).toEqual([0, 1]);
    expect(round.overtimeFlag.up).toBe(true); // it stays up through the pause, the winner's colour
    run(RULES.resetDelay + DT, round, cs, events);
    expect(round.phase).toBe('live');
    expect(round.overtimeFlag.up).toBe(false); // down again for the next round, with all its time
    expect(round.overtimeFlag.left).toBe(OVERTIME.time);
  });

  it('both teams at it hold each other off: contested, nobody wins, and its time still runs', () => {
    const cs = teams();
    const { round, events } = toOvertime(cs);
    put(cs[0]!, SPOT.x - 0.5, SPOT.z);
    put(cs[3]!, SPOT.x + 0.5, SPOT.z);
    const left = round.overtimeFlag.left;
    run(1, round, cs, events);
    expect(round.phase).toBe('live');
    expect(round.overtimeFlag.status).toBe('contested');
    expect(round.overtimeFlag.left).toBeCloseTo(left - 1, 3);
    // One of them hit: the other has it.
    cs[3]!.status = 'calling';
    run(DT, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 0, reason: 'overtimeFlag' });
  });

  it('only a player in play counts, within reach and on its floor', () => {
    const flag = createOvertimeFlag();
    resetOvertimeFlag(flag, OVERTIME);
    raiseOvertimeFlag(flag, SPOT);
    const c = createCharacter(0, vec3(), 0, LOADOUT, 0);
    put(c, OVERTIME.reach, 0);
    expect(touchesOvertimeFlag(c, flag, OVERTIME)).toBe(true);
    put(c, OVERTIME.reach + 0.05, 0);
    expect(touchesOvertimeFlag(c, flag, OVERTIME)).toBe(false);
    put(c, 0, 0, OVERTIME.reachHeight + 0.5); // the floor above
    expect(touchesOvertimeFlag(c, flag, OVERTIME)).toBe(false);
    put(c, 0, 0);
    c.status = 'calling';
    expect(touchesOvertimeFlag(c, flag, OVERTIME)).toBe(false);
    expect(stepOvertimeFlag(flag, [c], OVERTIME, DT)).toBe(-1);
  });

  it('a wipe-out in overtime still ends the round as a wipe-out', () => {
    const cs = teams();
    const { round, events } = toOvertime(cs);
    cs[0]!.status = 'out';
    cs[1]!.status = 'out';
    run(DT, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 1, reason: 'eliminated' });
  });

  it('untouched when its time is up: the time-out rule decides, a draw played again by default', () => {
    const cs = teams();
    const { round, events } = toOvertime(cs);
    run(OVERTIME.time - 0.5, round, cs, events);
    expect(round.phase).toBe('live');
    run(0.5 + DT, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: -1, reason: 'time' });
    expect(round.draws).toBe(1);
    // Under the more-players rule, a lead made in overtime takes it then.
    const ctx = { ...CTX, rules: { ...RULES, timeOutToMorePlayers: true } };
    const more = teams();
    const ot = toOvertime(more, ctx);
    more[1]!.status = 'out';
    run(OVERTIME.time + DT, ot.round, more, ot.events, ctx);
    expect(ot.events).toContainEqual({ type: 'roundOver', winner: 1, reason: 'time' });
  });
});

describe('End the round now (Dev settings) and the longest round', () => {
  it('runs the clock out without the flag going up, or brings an overtime under way to its end', () => {
    const before = createRoundState(RULES);
    const events: GameEvent[] = [];
    runOutRound(before, RULES);
    run(DT, before, teams(), events);
    expect(before.overtimeFlag.up).toBe(false);
    expect(events).toContainEqual({ type: 'roundOver', winner: -1, reason: 'time' });

    const cs = teams();
    const ot = toOvertime(cs);
    runOutRound(ot.round, RULES);
    run(DT, ot.round, cs, ot.events);
    expect(ot.events).toContainEqual({ type: 'roundOver', winner: -1, reason: 'time' });
  });

  it('a round lasts at most its clock and the longer of the two overtimes', () => {
    expect(longestOvertime(RULES)).toBe(Math.max(FLAG.maxOvertime, OVERTIME.time));
    const { round, events } = toOvertime(teams());
    run(longestOvertime(RULES) + DT, round, teams(), events); // a tick's slack for the clock's own rounding
    expect(round.phase).not.toBe('live');
  });
});
