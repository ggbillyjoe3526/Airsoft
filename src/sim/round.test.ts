import { describe, expect, it } from 'vitest';
import { FLAG } from '../config/modes';
import { LOADOUT } from '../config/replicas';
import { createBBPool, spawnBB } from './ballistics';
import { type Character, createCharacter } from './character';
import type { GameEvent } from './events';
import { createRunState } from './extraction';
import { attackersInRound, createRoundState, matchWon, placeTeams, type RoundContext, type RoundRules, type RoundState, restartMatch, stepRound, teamEnd, timeOutWinner } from './round';
import { vec3 } from './vec';

const DT = 1 / 60;
const RULES: RoundRules = { roundTime: 10, resetDelay: 2, winsNeeded: 3, winBy: 1, timeOutToMorePlayers: false, halfTimeAfter: 2, eliminationFirstEnd: 0, flag: { ...FLAG, firstAttackers: 0 } };
/** The pole, on the east side: end 1, where the defenders start. */
const POLE = vec3(10, 0, 0);
/** Two spawns at each end: west (end 0) and east (end 1). */
const SPAWNS = [
  [0, 1].map((z) => ({ position: vec3(-20, 0, z), yaw: -Math.PI / 2 })),
  [2, 3].map((z) => ({ position: vec3(20, 0, z), yaw: Math.PI / 2 })),
];
const CTX: RoundContext = { rules: RULES, pole: POLE, spawns: SPAWNS, spawnLift: 0.05 };

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

  it('plays a drawn round again under the same number, at the same ends, and counts the draw (owner, audit SIM-19)', () => {
    const round = createRoundState(RULES);
    const cs = teams();
    const events: GameEvent[] = [];
    // Round 1 decided, then round 2 (the last before half-time) runs out of time twice.
    cs[2]!.status = 'out';
    cs[3]!.status = 'out';
    run(RULES.resetDelay + 0.2, round, cs, events);
    expect(round.number).toBe(2);
    for (let k = 0; k < 2; k++) {
      run(RULES.roundTime + RULES.resetDelay + 0.1, round, cs, events);
      expect(round.number).toBe(2);
      expect(round.phase).toBe('live');
      expect(cs[0]!.end).toBe(RULES.eliminationFirstEnd); // no half-time swap after a draw
    }
    expect(events.filter((e) => e.type === 'roundStart').map((e) => (e.type === 'roundStart' ? e.round : 0))).toEqual([2, 2, 2]);
    expect(round.draws).toBe(2);
    expect(round.score).toEqual([1, 0]);
    // A decided round moves on, and half-time follows it.
    cs[2]!.status = 'out';
    cs[3]!.status = 'out';
    run(RULES.resetDelay + 0.2, round, cs, events);
    expect(round.number).toBe(3);
    expect(cs[0]!.end).toBe(1 - RULES.eliminationFirstEnd);
    // A new match clears the count.
    restartMatch(round, cs, createBBPool(1), CTX, [], 'elimination');
    expect(round.draws).toBe(0);
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
    // Decided rounds (a draw is played again under the same number): each team wins one, so nobody reaches winsNeeded.
    for (let r = 0; r < RULES.halfTimeAfter; r++) {
      for (const c of cs) if (c.team === r % 2) c.status = 'out';
      run(RULES.resetDelay + 0.2, round, cs, events);
    }
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

  it('keep each replica’s fire selector from round to round, and put it back on its default for a new match', () => {
    const round = createRoundState(RULES);
    const cs = teams();
    const rifle = LOADOUT.findIndex((r) => r.fireModes.length > 1);
    const other = LOADOUT[rifle]!.fireModes.find((m) => m !== LOADOUT[rifle]!.defaultFireMode)!;
    cs[0]!.armament.modes[rifle] = other;
    const events: GameEvent[] = [];
    cs[2]!.status = 'out';
    cs[3]!.status = 'out';
    run(RULES.resetDelay + 0.2, round, cs, events);
    expect(events).toContainEqual({ type: 'roundStart', round: 2 });
    expect(cs[0]!.armament.modes[rifle]).toBe(other);
    restartMatch(round, cs, createBBPool(1), CTX, [], 'elimination');
    expect(cs[0]!.armament.modes).toEqual(LOADOUT.map((r) => r.defaultFireMode));
  });
});

describe('Elimination and Attack / Defend stay as they were beside Extraction (M43 acceptance 6)', () => {
  it('leave the run inert through a drawn round, a wipe-out and the next round starting, with or without the run context', () => {
    const X = { rules: { extractTime: 10 } } as unknown as RoundContext['extraction'];
    for (const ctx of [CTX, { ...CTX, extraction: X }]) {
      for (const mode of ['elimination', 'attackDefend'] as const) {
        const round = createRoundState(RULES, mode, POLE);
        expect(round.run).toEqual(createRunState());
        const cs = teams();
        const events: GameEvent[] = [];
        const bbs = createBBPool(4);
        // A timed-out round, then a wipe-out, then the next round's start.
        for (let i = 0; i < (RULES.roundTime + RULES.resetDelay + 0.5) / DT; i++) stepRound(round, cs, bbs, ctx, events, DT);
        expect(events.filter((e) => e.type === 'roundOver')[0]).toMatchObject({ reason: 'time' });
        expect(events.some((e) => e.type === 'roundStart')).toBe(true);
        cs[2]!.status = 'out';
        cs[3]!.status = 'out';
        for (let i = 0; i < 3 / DT; i++) stepRound(round, cs, bbs, ctx, events, DT);
        expect(events).toContainEqual({ type: 'roundOver', winner: 0, reason: 'eliminated' });
        expect(round.mode).toBe(mode);
        expect(round.run).toEqual(createRunState());
        expect(events.some((e) => e.type === 'respawned' || e.type === 'exitCount' || e.type === 'exitOpened' || e.type === 'runWarning')).toBe(false);
        expect(round.reason).not.toBe('extracted');
      }
    }
  });

  it('keep ending a round on the clock with a draw, as before, when a map has Extraction data', () => {
    const round = createRoundState(RULES);
    const events: GameEvent[] = [];
    const ctx: RoundContext = { ...CTX, extraction: { rules: { extractTime: 1 } } as unknown as RoundContext['extraction'] };
    const cs = teams();
    const bbs = createBBPool(1);
    for (let i = 0; i < (RULES.roundTime + 0.2) / DT; i++) stepRound(round, cs, bbs, ctx, events, DT);
    expect(events).toContainEqual({ type: 'roundOver', winner: -1, reason: 'time' });
    expect(round.phase).toBe('over');
    expect(round.score).toEqual([0, 0]);
  });

  it('an Extraction round without its run context is a programming error, not a quiet Elimination', () => {
    const round = createRoundState(RULES, 'extraction');
    expect(() => stepRound(round, teams(), createBBPool(1), CTX, [], DT)).toThrow(/Extraction needs the run context/);
  });

  it('restarting from Extraction into Elimination puts the teams at their ends and the run is not stepped', () => {
    const cs = teams();
    const round = createRoundState(RULES, 'elimination');
    round.mode = 'extraction';
    round.run.outcome = 'out';
    restartMatch(round, cs, createBBPool(1), CTX, [], 'elimination');
    expect(round).toMatchObject({ mode: 'elimination', number: 1, phase: 'live', matchWinner: -1 });
    expect(cs[0]!.position.x).toBeCloseTo(-20);
    expect(cs[2]!.position.x).toBeCloseTo(20);
  });
});

describe('Tournament round rules (M39)', () => {
  const TOURNAMENT: RoundRules = { ...RULES, winsNeeded: 3, winBy: 2, timeOutToMorePlayers: true };
  const ctx: RoundContext = { ...CTX, rules: TOURNAMENT };
  const step = (seconds: number, round: RoundState, cs: Character[], events: GameEvent[]): void => {
    const bbs = createBBPool(4);
    for (let i = 0; i < seconds / DT; i++) stepRound(round, cs, bbs, ctx, events, DT);
  };
  /** Plays one round won by `team` (the other wiped out) and waits for the next to start. */
  const winRound = (team: number, round: RoundState, cs: Character[], events: GameEvent[]): void => {
    for (const c of cs) if (c.team !== team) c.status = 'out';
    step(DT, round, cs, events);
    if (round.phase !== 'matchOver') step(TOURNAMENT.resetDelay + 0.1, round, cs, events);
  };

  it('needs a two-round lead once a team has the wins needed: level one short, it plays on (overtime)', () => {
    const round = createRoundState(TOURNAMENT);
    const cs = teams();
    const events: GameEvent[] = [];
    for (const team of [0, 1, 0, 1]) winRound(team, round, cs, events); // 2-2
    winRound(0, round, cs, events); // 3-2: the wins needed, but only one ahead
    expect(round.score).toEqual([3, 2]);
    expect(round.phase).toBe('live');
    winRound(1, round, cs, events); // 3-3
    winRound(1, round, cs, events); // 3-4
    expect(round.phase).toBe('live');
    winRound(1, round, cs, events); // 3-5
    expect(round.phase).toBe('matchOver');
    expect(round.matchWinner).toBe(1);
    // A clear run still ends at the wins needed.
    const quick = createRoundState(TOURNAMENT);
    for (let r = 0; r < 3; r++) winRound(0, quick, teams(), []);
    expect(quick.score).toEqual([3, 0]);
    expect(quick.phase).toBe('matchOver');
  });

  it('swaps ends once, at half-time, and not again in overtime', () => {
    expect(teamEnd(0, 'elimination', TOURNAMENT.halfTimeAfter, TOURNAMENT)).toBe(0);
    for (let n = TOURNAMENT.halfTimeAfter + 1; n < 20; n++) expect(teamEnd(0, 'elimination', n, TOURNAMENT)).toBe(1);
  });

  it('gives an Elimination time-out to the team with more players left, and a level one is a draw played again', () => {
    const round = createRoundState(TOURNAMENT);
    const cs = teams();
    const events: GameEvent[] = [];
    cs[3]!.status = 'out';
    step(TOURNAMENT.roundTime + 0.1, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 0, reason: 'time' });
    expect(round.score).toEqual([1, 0]);
    step(TOURNAMENT.resetDelay + 0.1, round, cs, events);
    expect(round.number).toBe(2);
    const level: GameEvent[] = [];
    step(TOURNAMENT.roundTime + 0.1, round, cs, level);
    expect(level).toContainEqual({ type: 'roundOver', winner: -1, reason: 'time' });
    step(TOURNAMENT.resetDelay + 0.1, round, cs, level);
    expect(round.number).toBe(2); // replayed
  });

  it('decides time-outs and match wins as pure rules, unchanged without them', () => {
    expect(timeOutWinner(2, 1, TOURNAMENT)).toBe(0);
    expect(timeOutWinner(1, 3, TOURNAMENT)).toBe(1);
    expect(timeOutWinner(2, 2, TOURNAMENT)).toBe(-1);
    expect(timeOutWinner(3, 1, RULES)).toBe(-1); // Skirmish: always a draw
    expect(matchWon([3, 2], 0, RULES)).toBe(true);
    expect(matchWon([3, 2], 0, TOURNAMENT)).toBe(false);
    expect(matchWon([4, 2], 0, TOURNAMENT)).toBe(true);
    expect(matchWon([2, 0], 0, TOURNAMENT)).toBe(false);
  });

  it('leaves Attack / Defend time-outs to the defenders', () => {
    const round = createRoundState(TOURNAMENT, 'attackDefend', POLE);
    const cs = teams();
    const events: GameEvent[] = [];
    cs[0]!.status = 'out'; // the attackers (team 0) are a player down
    step(TOURNAMENT.roundTime + TOURNAMENT.flag.maxOvertime + 0.2, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 1, reason: 'time' });
  });
});
