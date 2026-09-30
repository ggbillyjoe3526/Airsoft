import { describe, expect, it } from 'vitest';
import { LOADOUT } from '../config/replicas';
import { createBBPool, spawnBB } from './ballistics';
import { type Character, createCharacter } from './character';
import type { GameEvent } from './events';
import { createRoundState, type RoundRules, restartMatch, stepRound } from './round';
import { vec3 } from './vec';

const DT = 1 / 60;
const RULES: RoundRules = { roundTime: 10, resetDelay: 2, winsNeeded: 3 };

function teams(): Character[] {
  return [0, 1, 2, 3].map((id) => createCharacter(id, vec3(id, 0, 0), 0, LOADOUT, id < 2 ? 0 : 1));
}

function run(seconds: number, round: ReturnType<typeof createRoundState>, cs: Character[], events: GameEvent[]): void {
  const bbs = createBBPool(4);
  for (let i = 0; i < seconds / DT; i++) stepRound(round, cs, bbs, LOADOUT, RULES, events, DT);
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
    restartMatch(round, cs, bbs, LOADOUT, RULES, restart);
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
});
