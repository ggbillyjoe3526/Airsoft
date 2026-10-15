import { describe, expect, it } from 'vitest';
import { FLAG, OVERTIME } from '../config/modes';
import { LOADOUT } from '../config/replicas';
import { createBBPool } from './ballistics';
import { type Character, createCharacter } from './character';
import type { GameEvent } from './events';
import { createRoundState, type RoundContext, type RoundRules, type RoundState, stepRound } from './round';
import { vec3 } from './vec';

/** Edges of Elimination's overtime flag (OT1) that sim/overtimeFlag.test.ts leaves: the match, a draw replayed, the pause. */

const DT = 1 / 60;
const RULES: RoundRules = { roundTime: 3, resetDelay: 2, winsNeeded: 2, winBy: 1, timeOutToMorePlayers: false, halfTimeAfter: 5, eliminationFirstEnd: 0, flag: { ...FLAG, firstAttackers: 0 }, overtime: OVERTIME };
const SPOT = vec3(0, 0, 0);
const SPAWNS = [
  [0, 1].map((z) => ({ position: vec3(-20, 0, z), yaw: -Math.PI / 2 })),
  [2, 3].map((z) => ({ position: vec3(20, 0, z), yaw: Math.PI / 2 })),
];
const CTX: RoundContext = { rules: RULES, pole: vec3(10, 0, 0), spawns: SPAWNS, spawnLift: 0, overtimeFlag: SPOT };
const teams = (): Character[] => [0, 1, 2, 3].map((id) => createCharacter(id, vec3(id < 2 ? -20 : 20, 0, id), 0, LOADOUT, id < 2 ? 0 : 1));

function run(seconds: number, round: RoundState, cs: Character[], events: GameEvent[], ctx = CTX): void {
  const bbs = createBBPool(4);
  for (let i = 0; i < Math.round(seconds / DT); i++) stepRound(round, cs, bbs, ctx, events, DT);
}

describe('the overtime flag and the match', () => {
  it('a touch that takes a team to its last win ends the match, with the reason overtimeFlag, and the flag stays up', () => {
    const cs = teams();
    const round = createRoundState(RULES);
    round.score[1] = RULES.winsNeeded - 1;
    const events: GameEvent[] = [];
    run(RULES.roundTime + DT, round, cs, events);
    expect(round.overtimeFlag.up).toBe(true);
    cs[3]!.position.x = 0.3;
    cs[3]!.position.z = 0;
    run(DT, round, cs, events);
    expect(round.phase).toBe('matchOver');
    expect(round.matchWinner).toBe(1);
    expect(round.reason).toBe('overtimeFlag');
    expect(round.overtimeFlag.up).toBe(true);
  });

  it('a drawn overtime replays the same round number with the flag down and all its time; the touch is scored only once', () => {
    const cs = teams();
    const round = createRoundState(RULES);
    const events: GameEvent[] = [];
    run(RULES.roundTime + OVERTIME.time + 0.5, round, cs, events);
    expect(round.phase).toBe('over');
    expect(round.reason).toBe('time');
    expect(round.overtimeFlag.up).toBe(true); // up through the pause
    expect(round.overtimeFlag.left).toBeLessThanOrEqual(0);
    const number = round.number;
    run(RULES.resetDelay + 0.2, round, cs, events);
    expect(round.phase).toBe('live');
    expect(round.number).toBe(number);
    expect(round.overtimeFlag.up).toBe(false);
    expect(round.overtimeFlag.left).toBe(OVERTIME.time);
    expect(round.clock).toBeGreaterThan(RULES.roundTime - 1);
    // It goes up again at the next buzzer, with an event each time.
    run(RULES.roundTime + 0.2, round, cs, events);
    expect(events.filter((e) => e.type === 'overtime')).toHaveLength(2);
  });

  it('both teams already standing at the spot when the flag goes up: contested at once, nobody wins', () => {
    const both = teams();
    both[0]!.position.x = 0.4;
    both[0]!.position.z = 0;
    both[2]!.position.x = -0.4;
    both[2]!.position.z = 0;
    const round = createRoundState(RULES);
    const events: GameEvent[] = [];
    run(RULES.roundTime + 0.5, round, both, events);
    expect(round.overtimeFlag.status).toBe('contested');
    expect(round.phase).toBe('live');
    expect(events.some((e) => e.type === 'roundOver')).toBe(false);
  });

  it('a team knocked out while the flag is up and the other already contesting it: the survivor takes it', () => {
    const cs = teams();
    cs[0]!.position.x = 0.4;
    cs[0]!.position.z = 0;
    cs[2]!.position.x = -0.4;
    cs[2]!.position.z = 0;
    const round = createRoundState(RULES);
    const events: GameEvent[] = [];
    run(RULES.roundTime + 0.5, round, cs, events);
    cs[2]!.status = 'calling';
    run(DT, round, cs, events);
    expect(events).toContainEqual({ type: 'roundOver', winner: 0, reason: 'overtimeFlag' });
  });
});
