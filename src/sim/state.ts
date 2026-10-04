import type { MatchMode } from '../config/modes';
import { type BBPool, createBBPool } from './ballistics';
import type { Character } from './character';
import type { GameEvent } from './events';
import type { RangeTarget } from './rangeTargets';
import { createRoundState, type RoundRules, type RoundState } from './round';
import { createRng, type RngState } from './rng';
import type { Vec3 } from './vec';

/** Entire simulation state as plain data. Presentation layers read it, never write it. */
export interface GameState {
  tick: number;
  time: number;
  characters: Character[];
  bbs: BBPool;
  /** What happened during the last tick (shots, impacts, reloads...). Cleared every tick. */
  events: GameEvent[];
  rng: RngState;
  round: RoundState;
  /** Practice range targets (M21); empty in a match. */
  targets: RangeTarget[];
}

/** A fresh game in `mode` (flag mode needs the map's flagpole). */
export function createGameState(seed: number, maxBBs: number, rules: RoundRules, mode: MatchMode = 'elimination', pole?: Vec3): GameState {
  return {
    tick: 0,
    time: 0,
    characters: [],
    bbs: createBBPool(maxBBs),
    events: [],
    rng: createRng(seed),
    round: createRoundState(rules, mode, pole),
    targets: [],
  };
}
