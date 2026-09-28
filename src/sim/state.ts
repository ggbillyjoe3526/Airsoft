import { type BBPool, createBBPool } from './ballistics';
import type { Character } from './character';
import type { GameEvent } from './events';
import { createRng, type RngState } from './rng';

/** Entire simulation state as plain data. Presentation layers read it, never write it. */
export interface GameState {
  tick: number;
  time: number;
  characters: Character[];
  bbs: BBPool;
  /** What happened during the last tick (shots, impacts, reloads...). Cleared every tick. */
  events: GameEvent[];
  rng: RngState;
}

export function createGameState(seed: number, maxBBs: number): GameState {
  return {
    tick: 0,
    time: 0,
    characters: [],
    bbs: createBBPool(maxBBs),
    events: [],
    rng: createRng(seed),
  };
}
