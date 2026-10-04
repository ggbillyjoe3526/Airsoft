import { describe, expect, it } from 'vitest';
import { FLAG } from '../config/modes';
import { DEFAULT_MATCH_RULES, roundRulesFor, standardRulesOf } from '../config/matchRules';
import { LOADOUT } from '../config/replicas';
import { createBBPool } from './ballistics';
import { type Character, createCharacter } from './character';
import type { GameEvent } from './events';
import { createRoundState, type RoundContext, stepRound, teamEnd } from './round';
import { vec3 } from './vec';

/**
 * M39 QA: the Tournament round rules as the Rules picker builds them (roundRulesFor(standardRulesOf('tournament'))):
 * first to 7, half-time after 6, win by two, Elimination time-outs to the side with more players left.
 */
const DT = 1 / 60;
const TOURNAMENT = { ...roundRulesFor(standardRulesOf('tournament')), flag: { ...FLAG, firstAttackers: 0 } };
const SKIRMISH = { ...roundRulesFor(DEFAULT_MATCH_RULES), flag: { ...FLAG, firstAttackers: 0 } };
const SPAWNS = [
  [0, 1].map((z) => ({ position: vec3(-20, 0, z), yaw: -Math.PI / 2 })),
  [2, 3].map((z) => ({ position: vec3(20, 0, z), yaw: Math.PI / 2 })),
];

function teams(): Character[] {
  return [0, 1, 2, 3].map((id) => createCharacter(id, vec3(id < 2 ? -20 : 20, 0, id), 0, LOADOUT, id < 2 ? 0 : 1));
}

function play(rules: typeof TOURNAMENT) {
  const ctx: RoundContext = { rules, pole: vec3(10, 0, 0), spawns: SPAWNS, spawnLift: 0.05 };
  const round = createRoundState(rules);
  const cs = teams();
  const events: GameEvent[] = [];
  const bbs = createBBPool(4);
  const step = (seconds: number): void => {
    for (let i = 0; i < seconds / DT; i++) stepRound(round, cs, bbs, ctx, events, DT);
  };
  /** Team `team` wins the round by wiping the other out; waits for the next round to start unless the match is over. */
  const win = (team: number): void => {
    for (const c of cs) if (c.team !== team) c.status = 'out';
    step(DT);
    if (round.phase !== 'matchOver') step(rules.resetDelay + 0.1);
  };
  return { round, cs, events, step, win };
}

/** Plays 6-6 (alternating, so neither team reaches 7 first). */
function toSixAll(g: ReturnType<typeof play>): void {
  for (let i = 0; i < 6; i++) {
    g.win(0);
    g.win(1);
  }
}

describe('first to 7, win by two (M39 criterion 2)', () => {
  it('builds first to 7 with half-time after 6 and a two-round lead from the ruleset', () => {
    expect(TOURNAMENT).toMatchObject({ winsNeeded: 7, halfTimeAfter: 6, winBy: 2, roundTime: 120, timeOutToMorePlayers: true });
    expect(SKIRMISH).toMatchObject({ winsNeeded: 5, halfTimeAfter: 4, winBy: 1, timeOutToMorePlayers: false });
  });

  it('continues at 7-6 (a team on the wins needed but one ahead) and ends at 8-6', () => {
    const g = play(TOURNAMENT);
    toSixAll(g);
    expect(g.round.score).toEqual([6, 6]);
    expect(g.round.phase).toBe('live');
    g.win(0);
    expect(g.round.score).toEqual([7, 6]);
    expect(g.round.phase).toBe('live'); // 7 wins but only one ahead: overtime
    expect(g.round.matchWinner).toBe(-1);
    g.win(0);
    expect(g.round.score).toEqual([8, 6]);
    expect(g.round.phase).toBe('matchOver');
    expect(g.round.matchWinner).toBe(0);
    expect(g.events).toContainEqual({ type: 'matchOver', winner: 0 });
  });

  it('plays on from 7-6 to 7-7, and on again until a team is two ahead, whoever it is', () => {
    const g = play(TOURNAMENT);
    toSixAll(g);
    g.win(0); // 7-6
    g.win(1); // 7-7
    g.win(1); // 7-8
    expect(g.round.phase).toBe('live');
    g.win(1); // 7-9
    expect(g.round.phase).toBe('matchOver');
    expect(g.round.matchWinner).toBe(1);
  });

  it('ends a clear 7-0 at once, with no overtime', () => {
    const g = play(TOURNAMENT);
    for (let i = 0; i < 6; i++) g.win(0);
    expect(g.round.phase).toBe('live');
    g.win(0);
    expect(g.round.score).toEqual([7, 0]);
    expect(g.round.phase).toBe('matchOver');
  });

  it('plays Skirmish as before: 5-4 ends the match', () => {
    const g = play(SKIRMISH);
    for (let i = 0; i < 4; i++) {
      g.win(0);
      g.win(1);
    }
    g.win(0);
    expect(g.round.score).toEqual([5, 4]);
    expect(g.round.phase).toBe('matchOver');
  });

  it('swaps ends once, after round 6, and keeps them swapped through overtime', () => {
    const g = play(TOURNAMENT);
    const blueEnds: number[] = []; // Blue's end as rounds 2 to 14 start (the first round is placed by the match build)
    for (let i = 0; i < 13; i++) {
      g.win(i < 12 ? i % 2 : 0); // 6-6 alternating, then 7-6: round 14 is overtime
      blueEnds.push(g.cs[0]!.end);
    }
    expect(g.round.number).toBe(14);
    // Rounds 2..6 from the first end, 7..14 from the other.
    expect(blueEnds).toEqual([...Array(5).fill(1), ...Array(8).fill(0)]);
    for (let n = 7; n < 25; n++) expect(teamEnd(0, 'elimination', n, TOURNAMENT)).toBe(teamEnd(0, 'elimination', 7, TOURNAMENT));
    expect(teamEnd(0, 'elimination', 6, TOURNAMENT)).not.toBe(teamEnd(0, 'elimination', 7, TOURNAMENT));
  });
});

describe('Elimination time-outs (M39 criterion 2)', () => {
  it('goes to the side with more players left, whichever side it is', () => {
    for (const [out, winner] of [[[3], 0], [[0], 1]] as const) {
      const g = play(TOURNAMENT);
      for (const i of out) g.cs[i]!.status = 'out';
      g.step(TOURNAMENT.roundTime + 0.1);
      expect(g.events).toContainEqual({ type: 'roundOver', winner, reason: 'time' });
      expect(g.round.score[winner]).toBe(1);
    }
  });

  it('counts only players still in play: a hit player calling it is not left', () => {
    const g = play(TOURNAMENT);
    g.cs[0]!.status = 'calling';
    g.step(TOURNAMENT.roundTime + 0.1);
    expect(g.events).toContainEqual({ type: 'roundOver', winner: 1, reason: 'time' });
  });

  it('is a draw, replayed under the same number, when the sides are level', () => {
    const g = play(TOURNAMENT);
    g.cs[0]!.status = 'out';
    g.cs[3]!.status = 'out';
    g.step(TOURNAMENT.roundTime + 0.1);
    expect(g.events).toContainEqual({ type: 'roundOver', winner: -1, reason: 'time' });
    expect(g.round.score).toEqual([0, 0]);
    expect(g.round.draws).toBe(1);
    g.step(TOURNAMENT.resetDelay + 0.1);
    expect(g.round.number).toBe(1);
    expect(g.round.phase).toBe('live');
  });

  it('stays a replayed draw in Skirmish whatever the head count', () => {
    const g = play(SKIRMISH);
    g.cs[3]!.status = 'out';
    g.step(SKIRMISH.roundTime + 0.1);
    expect(g.events).toContainEqual({ type: 'roundOver', winner: -1, reason: 'time' });
    expect(g.round.score).toEqual([0, 0]);
    g.step(SKIRMISH.resetDelay + 0.1);
    expect(g.round.number).toBe(1);
  });
});
