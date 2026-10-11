import { describe, expect, it } from 'vitest';
import type { BotController } from '../../ai/botController';
import { MAP_BALANCE_WATCH } from '../../config/contentRules';
import type { MapData } from '../../map/mapTypes';
import type { GameState } from '../../sim/state';
import { addTallies, lowestFloor, watchMatch } from './matchWatch';

/**
 * The map balance run's watcher (CT2): it must see a bot that never leaves spawn, one stuck still with nothing to do and
 * anyone falling through the floor, and excuse a bot holding a spot or fighting.
 */

const DT = 1 / 60;
const W = MAP_BALANCE_WATCH;

/** A bot as the watcher reads it: idle unless told otherwise. */
function bot(id: number, at: { x: number; y: number; z: number }, extra: Record<string, unknown> = {}) {
  const character = { id, status: 'alive', position: { ...at }, spawnPosition: { ...at }, velocity: { x: 0, y: 0, z: 0 } };
  return { character, mode: 'advance', holding: false, atPost: false, orderSettled: false, order: 'none', orderCovering: false, watchUntil: 0, searchLookLeft: 0, cover: { position: { x: 99, y: 0, z: 99 } }, ...extra };
}

type Bot = ReturnType<typeof bot>;

/** Plays `seconds` of a live round, `move` stepping each bot per tick, then ends the round. */
function play(bots: Bot[], seconds: number, move: (b: Bot, t: number) => void = () => {}) {
  const map = { killY: -10 } as MapData;
  const watch = watchMatch(map, 0, DT);
  const state = { round: { phase: 'live' }, events: [] as { type: string }[], time: 0, characters: bots.map((b) => b.character) };
  const controller = { bots } as unknown as BotController;
  for (let t = 0; t < seconds; t += DT) {
    state.time = t;
    for (const b of bots) move(b, t);
    watch.onTick(state as unknown as GameState, controller);
  }
  state.events = [{ type: 'roundOver' }];
  state.round.phase = 'over';
  watch.onTick(state as unknown as GameState, controller);
  return watch.tally;
}

describe('the map balance run’s watcher', () => {
  it('counts a bot that never leaves its spawn and one stuck still with nothing to do', () => {
    const tally = play([bot(1, { x: 0, y: 0, z: 0 })], W.leaveSpawnSeconds + 1);
    expect(tally).toMatchObject({ botRounds: 1, stayedAtSpawn: 1, stuck: 1, fell: 0 });
    expect(tally.firstStuck).toBe('0.0, 0.0, 0.0');
    expect(tally.botMinutes).toBeCloseTo((W.leaveSpawnSeconds + 1) / 60, 1);
  });

  it('passes a bot that walks out of spawn, and excuses one holding or fighting', () => {
    const walker = bot(1, { x: 0, y: 0, z: 0 });
    const holder = bot(2, { x: 5, y: 0, z: 0 }, { holding: true });
    const fighter = bot(3, { x: 9, y: 0, z: 0 }, { mode: 'fight' });
    const tally = play([walker, holder, fighter], W.leaveSpawnSeconds + 1, (b, t) => {
      if (b !== walker) return;
      b.character.position.x = t * 2;
      b.character.velocity.x = 2;
    });
    expect(tally.stuck).toBe(0);
    // The holder and the fighter never left spawn: that is counted whatever excuses them from being stuck.
    expect(tally).toMatchObject({ botRounds: 3, stayedAtSpawn: 2 });
  });

  it('does not judge a round too short to leave spawn in', () => {
    expect(play([bot(1, { x: 0, y: 0, z: 0 })], W.leaveSpawnSeconds / 2)).toMatchObject({ botRounds: 0, stayedAtSpawn: 0 });
  });

  it('counts a fall through the floor once per character a round', () => {
    const faller = bot(1, { x: 0, y: 0, z: 0 });
    const tally = play([faller], 2, (b, t) => {
      b.character.position.y = -t * 2;
    });
    expect(tally.fell).toBe(1);
  });

  it('finds the lowest floor and adds tallies', () => {
    expect(lowestFloor(new Float32Array([Number.NaN, 2, -0.5, 1]))).toBe(-0.5);
    const a = { botRounds: 2, stayedAtSpawn: 1, botMinutes: 1.5, stuck: 0, firstStuck: '', fell: 0 };
    const b = { botRounds: 3, stayedAtSpawn: 0, botMinutes: 2, stuck: 2, firstStuck: '1, 0, 1', fell: 1 };
    expect(addTallies(a, b)).toEqual({ botRounds: 5, stayedAtSpawn: 1, botMinutes: 3.5, stuck: 2, firstStuck: '1, 0, 1', fell: 1 });
  });
});
