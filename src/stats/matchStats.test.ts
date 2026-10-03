import { describe, expect, it } from 'vitest';
import { ROUNDS } from '../config/hits';
import { LOADOUT } from '../config/replicas';
import { createCharacter } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { createGameState, type GameState } from '../sim/state';
import { vec3 } from '../sim/vec';
import { accuracy, MatchStats } from './matchStats';

const DT = 1 / 60;

/** Blue 0 and 1 against Orange 2 and 3, round 1 live. */
function match(): GameState {
  const state = createGameState(1, 8, ROUNDS);
  for (let id = 0; id < 4; id++) state.characters.push(createCharacter(id, vec3(), 0, LOADOUT, id < 2 ? 0 : 1));
  return state;
}

function tick(stats: MatchStats, state: GameState, events: GameEvent[]): void {
  state.events.length = 0;
  state.events.push(...events);
  stats.afterTick(state, DT);
}

const shot = (id: number): GameEvent => ({ type: 'shot', characterId: id, replicaId: 'aeg', position: vec3() });
const hit = (victimId: number, shooterId: number): GameEvent => ({ type: 'characterHit', victimId, shooterId, position: vec3(), direction: vec3(1, 0, 0) });

describe('match stats (M19)', () => {
  it('counts BBs fired, hits on opponents, friendly hits and times hit, for the round and the match', () => {
    const state = match();
    const stats = new MatchStats(state.characters);
    tick(stats, state, [shot(0), shot(0), shot(0), shot(2)]);
    tick(stats, state, [hit(2, 0), hit(1, 0)]);
    expect(stats.matchOf(0)).toMatchObject({ bbsFired: 3, hits: 1, friendlyHits: 1, timesHit: 0 });
    expect(stats.matchOf(2)).toMatchObject({ bbsFired: 1, hits: 0, timesHit: 1 });
    expect(stats.matchOf(1)).toMatchObject({ timesHit: 1, hits: 0 });
    expect(stats.roundOf(0)).toEqual(stats.matchOf(0));
  });

  it('measures accuracy as opponents hit per BB fired (friendly hits do not count), none before a BB', () => {
    const state = match();
    const stats = new MatchStats(state.characters);
    expect(accuracy(stats.matchOf(0))).toBeNull();
    tick(stats, state, [shot(0), shot(0), shot(0), shot(0)]);
    tick(stats, state, [hit(2, 0), hit(1, 0)]);
    expect(accuracy(stats.matchOf(0))).toBe(0.25);
  });

  it('counts time alive only for players in play while the round is live', () => {
    const state = match();
    const stats = new MatchStats(state.characters);
    state.characters[3]!.status = 'calling';
    for (let i = 0; i < 60; i++) tick(stats, state, []);
    expect(stats.matchOf(0).timeAlive).toBeCloseTo(1, 5);
    expect(stats.matchOf(3).timeAlive).toBe(0);
    state.round.phase = 'over';
    for (let i = 0; i < 60; i++) tick(stats, state, []);
    expect(stats.matchOf(0).timeAlive).toBeCloseTo(1, 5);
  });

  it('starts each round from zero but keeps the match totals; reset clears both', () => {
    const state = match();
    const stats = new MatchStats(state.characters);
    tick(stats, state, [shot(1), hit(3, 1)]);
    const before = stats.version;
    tick(stats, state, [{ type: 'roundStart', round: 2 }]);
    expect(stats.version).toBeGreaterThan(before);
    expect(stats.roundOf(1)).toMatchObject({ bbsFired: 0, hits: 0, timeAlive: 0 });
    expect(stats.matchOf(1)).toMatchObject({ bbsFired: 1, hits: 1 });
    // The tick that sets up a round adds no time alive.
    expect(stats.roundOf(0).timeAlive).toBe(0);
    stats.reset();
    expect(stats.matchOf(1)).toMatchObject({ bbsFired: 0, hits: 0, timeAlive: 0 });
  });
});
