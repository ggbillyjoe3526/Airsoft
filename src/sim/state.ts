import type { Character } from './character';
import { createRng, type RngState } from './rng';

/** Entire simulation state as plain data. Presentation layers read it, never write it. */
export interface GameState {
  tick: number;
  time: number;
  characters: Character[];
  rng: RngState;
}

export function createGameState(seed: number): GameState {
  return {
    tick: 0,
    time: 0,
    characters: [],
    rng: createRng(seed),
  };
}
