import { describe, expect, it } from 'vitest';
import { FLAG } from '../config/modes';
import { LOADOUT } from '../config/replicas';
import { createBBPool, spawnBB } from './ballistics';
import { type Character, createCharacter } from './character';
import type { GameEvent } from './events';
import { attackersInRound, createRoundState, type RoundContext, type RoundRules, type RoundState, restartMatch, stepRound } from './round';
import { vec3 } from './vec';

const DT = 1 / 60;
const RULES: RoundRules = { roundTime: 10, resetDelay: 2, winsNeeded: 3, flag: { ...FLAG, halfTimeAfter: 2, firstAttackers: 0 } };
/** Blue's pole on the west, Orange's on the east. */
const FLAG_SPOTS = [vec3(-10, 0, 0), vec3(10, 0, 0)];
const CTX: RoundContext = { rules: RULES, loadout: LOADOUT, flagSpots: FLAG_SPOTS };

function teams(): Character[] {
  return [0, 1, 2, 3].map((id) => createCharacter(id, vec3(id < 2 ? -20 : 20, 0, id), 0, LOADOUT, id < 2 ? 0 : 1));
}

function run(seconds: number, round: RoundState, cs: Character[], events: GameEvent[]): void {
  const bbs = createBBPool(4);
  for (let i = 0; i < seconds / DT; i++) stepRound(round, cs, bbs, CTX, events, DT);
}

describe('round flow', () => {
  it('counts the clock down and calls a draw when time runs out, without scoring', () => {
    const round = createRoundState(RULES);
    const events: GameEvent[] = [];
    run(RULES.roundTime - 1, round, teams(), events);
    expect(round.phase).toBe('live');
    expect(round.clock).toBeCloseTo(1, 1);
    run(1.1, round, teams(), events);
    expect(events).toContainEqual({ type: 'roundOver', winner: -1, reason: 'time' });
    expect(round.score).toEqual([0, 0]);
    expect(round.phase).toBe('over');
  });

  it('scores a wipe-out for the other team, then starts the next round with a full clock', () => {
    const round = createRoundState(RULES);
    const cs = teams();
    const events: GameEvent[] = [];
    cs[2]!.status = 'out';
    cs[3]!.status = 'calling';
    run(DT, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 0, reason: 'eliminated' });
    expect(round.score).toEqual([1, 0]);
    run(RULES.resetDelay + 0.1, round, cs, events);
    expect(events).toContainEqual({ type: 'roundStart', round: 2 });
    expect(round.phase).toBe('live');
    expect(round.clock).toBeCloseTo(RULES.roundTime, 0);
    expect(cs.every((c) => c.status === 'alive')).toBe(true);
  });

  it('ends the match when a team reaches the wins needed, and stays over until restarted', () => {
    const round = createRoundState(RULES);
    const cs = teams();
    const events: GameEvent[] = [];
    for (let r = 0; r < RULES.winsNeeded; r++) {
      cs[0]!.status = 'out';
      cs[1]!.status = 'out';
      run(RULES.resetDelay + 0.2, round, cs, events);
    }
    expect(round.score).toEqual([0, RULES.winsNeeded]);
    expect(round.phase).toBe('matchOver');
    expect(round.matchWinner).toBe(1);
    expect(events).toContainEqual({ type: 'matchOver', winner: 1 });
    run(30, round, cs, events);
    expect(round.phase).toBe('matchOver');
    expect(cs[0]!.status).toBe('out');

    const bbs = createBBPool(2);
    spawnBB(bbs, 0, vec3(), vec3(0, 0, -1), 80, 0);
    const restart: GameEvent[] = [];
    restartMatch(round, cs, bbs, CTX, restart, 'elimination');
    expect(restart).toContainEqual({ type: 'roundStart', round: 1 });
    expect(round).toMatchObject({ number: 1, phase: 'live', score: [0, 0], matchWinner: -1, clock: RULES.roundTime });
    expect(cs.every((c) => c.status === 'alive')).toBe(true);
    expect(bbs.bbs.every((b) => !b.active)).toBe(true);
  });

  it('calls it a draw when both teams are out at once', () => {
    const round = createRoundState(RULES);
    const cs = teams();
    for (const c of cs) c.status = 'out';
    const events: GameEvent[] = [];
    run(DT, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: -1, reason: 'eliminated' });
    expect(round.score).toEqual([0, 0]);
  });

  it('has no attackers and ignores anyone standing at a flag spot in elimination', () => {
    const round = createRoundState(RULES, 'elimination', FLAG_SPOTS);
    const cs = teams();
    cs[0]!.position.x = FLAG_SPOTS[1]!.x;
    const events: GameEvent[] = [];
    run(RULES.flag.raiseTime + 1, round, cs, events);
    expect(round.attackers).toBe(-1);
    expect(round.flag.progress).toBe(0);
    expect(round.phase).toBe('live');
  });
});

describe('flag rounds', () => {
  it('put the pole on the defenders’ side and give the round to the attackers once their flag is raised', () => {
    const round = createRoundState(RULES, 'attackDefend', FLAG_SPOTS);
    expect(round.attackers).toBe(0);
    expect(round.flag.position).toEqual(FLAG_SPOTS[1]); // Orange defends its own pole
    const cs = teams();
    cs[0]!.position.x = FLAG_SPOTS[1]!.x + 1;
    const events: GameEvent[] = [];
    run(RULES.flag.raiseTime - 0.2, round, cs, events);
    expect(round.phase).toBe('live');
    run(0.4, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 0, reason: 'captured' });
    expect(round).toMatchObject({ phase: 'over', winner: 0, reason: 'captured', score: [1, 0] });
  });

  it('give the round to the defenders when time runs out, even with the flag part-way up', () => {
    const round = createRoundState(RULES, 'attackDefend', FLAG_SPOTS);
    const cs = teams();
    round.flag.progress = 0.9;
    const events: GameEvent[] = [];
    run(RULES.roundTime + DT, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 1, reason: 'time' });
    expect(round.score).toEqual([0, 1]);
  });

  it('go to overtime while the attackers are working the rope at time-out, and end when they stop', () => {
    const round = createRoundState(RULES, 'attackDefend', FLAG_SPOTS);
    const cs = teams();
    const attacker = cs[0]!;
    const events: GameEvent[] = [];
    run(RULES.roundTime - 1, round, cs, events);
    attacker.position.x = FLAG_SPOTS[1]!.x; // starts raising with a second to go
    run(2, round, cs, events);
    expect(round.phase).toBe('live');
    expect(round.overtime).toBeGreaterThan(0.9);
    attacker.position.x = 20; // steps away: overtime is over
    run(2 * DT, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 1, reason: 'time' });
  });

  it('let a raise finish in overtime, but never run overtime past maxOvertime', () => {
    const round = createRoundState(RULES, 'attackDefend', FLAG_SPOTS);
    const cs = teams();
    cs[0]!.position.x = FLAG_SPOTS[1]!.x;
    const events: GameEvent[] = [];
    run(RULES.roundTime - 2, round, cs, events); // the flag is nearly up when time runs out
    round.flag.progress = 0.8;
    run(3, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 0, reason: 'captured' });

    const stuck = createRoundState(RULES, 'attackDefend', FLAG_SPOTS);
    const both = teams();
    both[0]!.position.x = FLAG_SPOTS[1]!.x; // attacker and defender at the pole: contested for ever
    both[2]!.position.x = FLAG_SPOTS[1]!.x;
    both[2]!.position.z = 0;
    const late: GameEvent[] = [];
    run(RULES.roundTime + RULES.flag.maxOvertime + 0.1, stuck, both, late);
    expect(late).toContainEqual({ type: 'roundOver', winner: 1, reason: 'time' });
    expect(stuck.overtime).toBeCloseTo(RULES.flag.maxOvertime, 1);
  });

  it('still end on a wipe-out, whoever attacks', () => {
    const round = createRoundState(RULES, 'attackDefend', FLAG_SPOTS);
    const cs = teams();
    cs[0]!.status = 'out';
    cs[1]!.status = 'out';
    const events: GameEvent[] = [];
    run(DT, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 1, reason: 'eliminated' });
  });

  it('swap attack and defence at half-time, moving the pole to the other side, with the flag back at the bottom', () => {
    expect([1, 2, 3, 4].map((n) => attackersInRound(n, RULES))).toEqual([0, 0, 1, 1]);
    const round = createRoundState(RULES, 'attackDefend', FLAG_SPOTS);
    const cs = teams();
    const events: GameEvent[] = [];
    const seen: { number: number; attackers: number; x: number }[] = [];
    for (let r = 0; r < 3; r++) {
      seen.push({ number: round.number, attackers: round.attackers, x: round.flag.position.x });
      round.flag.progress = 0.5;
      run(RULES.roundTime + RULES.resetDelay + 0.1, round, cs, events); // defenders win on time
    }
    expect(seen).toEqual([
      { number: 1, attackers: 0, x: 10 },
      { number: 2, attackers: 0, x: 10 },
      { number: 3, attackers: 1, x: -10 },
    ]);
    expect(round.flag.progress).toBe(0);
    expect(round.score).toEqual([1, 2]);
  });

  it('restart in the chosen mode, with the first attackers again', () => {
    const round = createRoundState(RULES, 'elimination', FLAG_SPOTS);
    const cs = teams();
    restartMatch(round, cs, createBBPool(1), CTX, [], 'attackDefend');
    expect(round).toMatchObject({ mode: 'attackDefend', number: 1, attackers: RULES.flag.firstAttackers });
    expect(round.flag.position).toEqual(FLAG_SPOTS[1 - RULES.flag.firstAttackers]);
    restartMatch(round, cs, createBBPool(1), CTX, [], 'elimination');
    expect(round).toMatchObject({ mode: 'elimination', attackers: -1 });
  });
});
