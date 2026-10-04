import { describe, expect, it } from 'vitest';
import { FLAG } from '../config/modes';
import { LOADOUT } from '../config/replicas';
import { createBBPool, spawnBB } from './ballistics';
import { type Character, createCharacter } from './character';
import type { GameEvent } from './events';
import { attackersInRound, createRoundState, placeTeams, type RoundContext, type RoundRules, type RoundState, restartMatch, stepRound, teamEnd } from './round';
import { vec3 } from './vec';

const DT = 1 / 60;
const RULES: RoundRules = { roundTime: 10, resetDelay: 2, winsNeeded: 3, halfTimeAfter: 2, eliminationFirstEnd: 0, flag: { ...FLAG, firstAttackers: 0 } };
/** The pole, on the east side: end 1, where the defenders start. */
const POLE = vec3(10, 0, 0);
/** Two spawns at each end: west (end 0) and east (end 1). */
const SPAWNS = [
  [0, 1].map((z) => ({ position: vec3(-20, 0, z), yaw: -Math.PI / 2 })),
  [2, 3].map((z) => ({ position: vec3(20, 0, z), yaw: Math.PI / 2 })),
];
const CTX: RoundContext = { rules: RULES, loadout: LOADOUT, pole: POLE, spawns: SPAWNS, spawnLift: 0.05 };

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
    spawnBB(bbs, 0, vec3(), vec3(0, 0, -1), 80, 0, 0.25e-3);
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
    const round = createRoundState(RULES, 'elimination', POLE);
    const cs = teams();
    cs[0]!.position.x = POLE.x;
    const events: GameEvent[] = [];
    run(RULES.flag.raiseTime + 1, round, cs, events);
    expect(round.attackers).toBe(-1);
    expect(round.flag.progress).toBe(0);
    expect(round.phase).toBe('live');
  });
});

describe('ends of the map', () => {
  it('put Blue at its first end in elimination and the attackers at the west end in Attack / Defend, swapping at half-time', () => {
    const ends = (mode: 'elimination' | 'attackDefend', rules: RoundRules) => [1, 2, 3, 4].map((n) => [teamEnd(0, mode, n, rules), teamEnd(1, mode, n, rules)]);
    const swap = [
      [0, 1],
      [0, 1],
      [1, 0],
      [1, 0],
    ];
    expect(ends('elimination', RULES)).toEqual(swap);
    expect(ends('attackDefend', RULES)).toEqual(swap);
    // Orange attacking first starts at the west end.
    expect(ends('attackDefend', { ...RULES, flag: { ...RULES.flag, firstAttackers: 1 } })).toEqual(swap.map(([a, b]) => [b, a]));
    // Blue starting in the east in elimination; Attack / Defend ignores it.
    const eastFirst = { ...RULES, eliminationFirstEnd: 1 };
    expect(ends('elimination', eastFirst)).toEqual(swap.map(([a, b]) => [b, a]));
    expect(ends('attackDefend', eastFirst)).toEqual(swap);
  });

  it('give each character its slot’s spawn at its team’s end, lifted off the floor, and swap ends in elimination too', () => {
    const round = createRoundState(RULES);
    const cs = teams();
    placeTeams(round, cs, CTX);
    expect(cs.map((c) => [c.end, c.spawnPosition.x, c.spawnPosition.y, c.spawnPosition.z, c.spawnYaw])).toEqual([
      [0, -20, 0.05, 0, -Math.PI / 2],
      [0, -20, 0.05, 1, -Math.PI / 2],
      [1, 20, 0.05, 2, Math.PI / 2],
      [1, 20, 0.05, 3, Math.PI / 2],
    ]);
    const events: GameEvent[] = [];
    for (let r = 0; r < RULES.halfTimeAfter; r++) run(RULES.roundTime + RULES.resetDelay + 0.1, round, cs, events); // draws
    expect(round.number).toBe(RULES.halfTimeAfter + 1);
    expect(cs.map((c) => [c.end, c.position.x, c.position.z])).toEqual([
      [1, 20, 2],
      [1, 20, 3],
      [0, -20, 0],
      [0, -20, 1],
    ]);
  });

  it('start a team smaller than its spawn line from the middle of it (a 1v1, M20)', () => {
    const round = createRoundState(RULES);
    const line = (x: number) => [0, 1, 2].map((z) => ({ position: vec3(x, 0, z), yaw: 0 }));
    const cs = [createCharacter(0, vec3(), 0, LOADOUT, 0), createCharacter(1, vec3(), 0, LOADOUT, 1)];
    placeTeams(round, cs, { ...CTX, spawns: [line(-20), line(20)] });
    expect(cs.map((c) => [c.spawnPosition.x, c.spawnPosition.z])).toEqual([
      [-20, 1],
      [20, 1],
    ]);
  });

  it('leave spawns alone when the map gives none for an end', () => {
    const round = createRoundState(RULES);
    const cs = teams();
    placeTeams(round, cs, { ...CTX, spawns: [] });
    expect(cs.map((c) => [c.end, c.spawnPosition.x])).toEqual([
      [0, -20],
      [0, -20],
      [1, 20],
      [1, 20],
    ]);
  });
});

describe('flag rounds', () => {
  it('put the pole on the defenders’ side and give the round to the attackers once their flag is raised', () => {
    const round = createRoundState(RULES, 'attackDefend', POLE);
    expect(round.attackers).toBe(0);
    expect(round.flag.position).toEqual(POLE);
    const cs = teams();
    cs[0]!.position.x = POLE.x + 1;
    const events: GameEvent[] = [];
    run(RULES.flag.raiseTime - 0.2, round, cs, events);
    expect(round.phase).toBe('live');
    run(0.4, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 0, reason: 'captured' });
    expect(round).toMatchObject({ phase: 'over', winner: 0, reason: 'captured', score: [1, 0] });
  });

  it('give the round to the defenders when time runs out, even with the flag part-way up', () => {
    const round = createRoundState(RULES, 'attackDefend', POLE);
    const cs = teams();
    round.flag.progress = 0.9;
    const events: GameEvent[] = [];
    run(RULES.roundTime + DT, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 1, reason: 'time' });
    expect(round.score).toEqual([0, 1]);
  });

  it('go to overtime while the attackers are working the rope at time-out, and end when they stop', () => {
    const round = createRoundState(RULES, 'attackDefend', POLE);
    const cs = teams();
    const attacker = cs[0]!;
    const events: GameEvent[] = [];
    run(RULES.roundTime - 1, round, cs, events);
    attacker.position.x = POLE.x; // starts raising with a second to go
    run(2, round, cs, events);
    expect(round.phase).toBe('live');
    expect(round.overtime).toBeGreaterThan(0.9);
    attacker.position.x = 20; // steps away: overtime is over
    run(2 * DT, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 1, reason: 'time' });
  });

  it('let a raise finish in overtime, but never run overtime past maxOvertime', () => {
    const round = createRoundState(RULES, 'attackDefend', POLE);
    const cs = teams();
    cs[0]!.position.x = POLE.x;
    const events: GameEvent[] = [];
    run(RULES.roundTime - 2, round, cs, events); // the flag is nearly up when time runs out
    round.flag.progress = 0.8;
    run(3, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 0, reason: 'captured' });

    const stuck = createRoundState(RULES, 'attackDefend', POLE);
    const both = teams();
    both[0]!.position.x = POLE.x; // attacker and defender at the pole: contested for ever
    both[2]!.position.x = POLE.x;
    both[2]!.position.z = 0;
    const late: GameEvent[] = [];
    run(RULES.roundTime + RULES.flag.maxOvertime + 0.1, stuck, both, late);
    expect(late).toContainEqual({ type: 'roundOver', winner: 1, reason: 'time' });
    expect(stuck.overtime).toBeCloseTo(RULES.flag.maxOvertime, 1);
  });

  it('still end on a wipe-out, whoever attacks', () => {
    const round = createRoundState(RULES, 'attackDefend', POLE);
    const cs = teams();
    cs[0]!.status = 'out';
    cs[1]!.status = 'out';
    const events: GameEvent[] = [];
    run(DT, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 1, reason: 'eliminated' });
  });

  it('swap attack and defence at half-time: the new attackers start at the west end, the pole stays, the flag is back at the bottom', () => {
    expect([1, 2, 3, 4].map((n) => attackersInRound(n, RULES))).toEqual([0, 0, 1, 1]);
    const round = createRoundState(RULES, 'attackDefend', POLE);
    const cs = teams();
    const events: GameEvent[] = [];
    const seen: { number: number; attackers: number; blueEnd: number; blueX: number }[] = [];
    for (let r = 0; r < 3; r++) {
      round.flag.progress = 0.5;
      run(RULES.roundTime + RULES.resetDelay + 0.1, round, cs, events); // defenders win on time
      seen.push({ number: round.number, attackers: round.attackers, blueEnd: cs[0]!.end, blueX: cs[0]!.position.x });
    }
    expect(seen).toEqual([
      { number: 2, attackers: 0, blueEnd: 0, blueX: -20 },
      { number: 3, attackers: 1, blueEnd: 1, blueX: 20 },
      { number: 4, attackers: 1, blueEnd: 1, blueX: 20 },
    ]);
    expect(round.flag.position).toEqual(POLE);
    expect(round.flag.progress).toBe(0);
    expect(round.score).toEqual([1, 2]);
    // Orange, attacking now, starts at the west end.
    expect(cs.filter((c) => c.team === 1).map((c) => [c.end, c.position.x])).toEqual([
      [0, -20],
      [0, -20],
    ]);
  });

  it('restart in the chosen mode, with the first attackers again', () => {
    const round = createRoundState(RULES, 'elimination', POLE);
    const cs = teams();
    restartMatch(round, cs, createBBPool(1), CTX, [], 'attackDefend');
    expect(round).toMatchObject({ mode: 'attackDefend', number: 1, attackers: RULES.flag.firstAttackers });
    expect(round.flag.position).toEqual(POLE);
    restartMatch(round, cs, createBBPool(1), CTX, [], 'elimination');
    expect(round).toMatchObject({ mode: 'elimination', attackers: -1 });
  });
});
