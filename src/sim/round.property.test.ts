import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import { describe, expect } from 'vitest';
import { FLAG, type MatchMode, OVERTIME } from '../config/modes';
import { LOADOUT } from '../config/replicas';
import { createBBPool } from './ballistics';
import { type Character, createCharacter } from './character';
import type { GameEvent } from './events';
import { attackersInRound, createRoundState, matchWon, type RoundContext, type RoundRules, stepRound, teamEnd, timeOutWinner } from './round';
import { vec3 } from './vec';

/**
 * Property tests (TL1, fast-check): scoring, half-time and the match's end over generated rules and generated runs of
 * round results, played through the real round flow (stepRound). Seeded; a failure prints the smallest rules and run
 * that break the rule, and its seed and path.
 */
const SEED = 20261018;
const DT = 1 / 60;

const rules = fc.record({
  winsNeeded: fc.integer({ min: 1, max: 9 }),
  winBy: fc.integer({ min: 1, max: 2 }),
  halfTimeAfter: fc.integer({ min: 1, max: 9 }),
  eliminationFirstEnd: fc.integer({ min: 0, max: 1 }),
  firstAttackers: fc.integer({ min: 0, max: 1 }),
  timeOutToMorePlayers: fc.boolean(),
  resetDelay: fc.double({ min: 0.02, max: 0.5, noNaN: true }),
});
type Picked = typeof rules extends fc.Arbitrary<infer T> ? T : never;

function roundRules(p: Picked): RoundRules {
  const { firstAttackers, ...rest } = p;
  return { roundTime: 60, ...rest, flag: { ...FLAG, firstAttackers }, overtime: OVERTIME };
}

const score = fc.tuple(fc.nat({ max: 30 }), fc.nat({ max: 30 }));

describe('round and match rule properties (TL1)', () => {
  test.prop([rules, score], { seed: SEED, numRuns: 500 })('never gives the match to both teams, and treats the teams alike', (p, [a, b]) => {
    const r = roundRules(p);
    expect(matchWon([a, b], 0, r) && matchWon([a, b], 1, r)).toBe(false);
    expect(matchWon([a, b], 0, r)).toBe(matchWon([b, a], 1, r));
    expect(timeOutWinner(a, b, r)).toBe(a === b || !r.timeOutToMorePlayers ? -1 : timeOutWinner(b, a, r) === 0 ? 1 : 0);
  });

  test.prop([rules, fc.constantFrom<MatchMode>('elimination', 'attackDefend'), fc.integer({ min: 1, max: 30 })], { seed: SEED, numRuns: 500 })(
    'puts the teams at opposite ends every round, and swaps them once, after half-time',
    (p, mode, round) => {
      const r = roundRules(p);
      const blue = teamEnd(0, mode, round, r);
      expect(teamEnd(1, mode, round, r)).toBe(1 - blue);
      expect(teamEnd(0, mode, round + 1, r) !== blue).toBe(round === r.halfTimeAfter);
      if (mode === 'attackDefend') expect(teamEnd(attackersInRound(round, r), mode, round, r)).toBe(0);
    },
  );

  test.prop([rules, fc.constantFrom<MatchMode>('elimination', 'attackDefend'), fc.array(fc.constantFrom(0, 1, -1), { minLength: 1, maxLength: 40 })], {
    seed: SEED,
    numRuns: 150,
  })('scores every round, replays a draw under the same number, and ends the match the moment a team has won it', (p, mode, results) => {
    const r = roundRules(p);
    const ctx: RoundContext = { rules: r, pole: vec3(20, 0, 0), spawns: [[], []], spawnLift: 0.05 };
    const cs: Character[] = [0, 1, 2, 3].map((id) => createCharacter(id, vec3(id < 2 ? -20 : 20, 0, id), 0, LOADOUT, id < 2 ? 0 : 1));
    const bbs = createBBPool(4);
    const events: GameEvent[] = [];
    const round = createRoundState(r, mode, ctx.pole);
    const expected: [number, number] = [0, 0];
    let number = 1;
    let draws = 0;
    for (const winner of results) {
      expect(round.phase).toBe('live');
      expect(round.number).toBe(number);
      // The losers (both teams, for a draw) are all hit and walking off; the next tick ends the round.
      for (const c of cs) if (winner === -1 || c.team !== winner) c.status = 'out';
      stepRound(round, cs, bbs, ctx, events, DT);
      expect(round.winner).toBe(winner);
      if (winner === -1) draws++;
      else expected[winner]++;
      expect(round.score).toEqual(expected);
      expect(round.draws).toBe(draws);
      if (winner !== -1 && matchWon(expected, winner, r)) {
        expect(round.phase).toBe('matchOver');
        expect(round.matchWinner).toBe(winner);
        expect(expected[winner]).toBeGreaterThanOrEqual(r.winsNeeded);
        expect(expected[winner] - expected[1 - winner]!).toBeGreaterThanOrEqual(r.winBy);
        // Nothing moves after the match is over.
        for (let i = 0; i < (r.resetDelay + 1) / DT; i++) stepRound(round, cs, bbs, ctx, events, DT);
        expect(round.phase).toBe('matchOver');
        expect(round.score).toEqual(expected);
        return;
      }
      expect(round.phase).toBe('over');
      expect(round.matchWinner).toBe(-1);
      while (round.phase === 'over') stepRound(round, cs, bbs, ctx, events, DT);
      if (winner !== -1) number++;
      expect(events.at(-1)).toEqual({ type: 'roundStart', round: number });
      expect(cs.every((c) => c.status === 'alive')).toBe(true);
      for (const c of cs) expect(c.end).toBe(teamEnd(c.team, mode, number, r));
      if (mode === 'attackDefend') expect(round.attackers).toBe(attackersInRound(number, r));
    }
  });
});
