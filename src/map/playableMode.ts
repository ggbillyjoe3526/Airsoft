import { type MatchMode, MODE_SHAPES } from '../config/modes';
import type { MapData } from './mapTypes';

/** Whether `map` has what `mode` needs (config/modes.ts MODE_SHAPES): its flagpole, or its Extraction data. */
export function mapHosts(map: Pick<MapData, 'flag' | 'extraction'>, mode: MatchMode): boolean {
  const need = MODE_SHAPES[mode].needs;
  return need === null || map[need] !== undefined;
}

/**
 * The mode `wanted` plays as on `map`: Attack / Defend needs a flagpole and Extraction (M43) its data; without them
 * the match is Elimination, which every map can play.
 */
export function playableMode(map: Pick<MapData, 'flag' | 'extraction'>, wanted: MatchMode): MatchMode {
  return mapHosts(map, wanted) ? wanted : 'elimination';
}

/**
 * Whether the Match screen offers `mode` on `map`: only where the map has what the mode needs (owner, 2026-10-16, MR1:
 * a map shows only the modes that apply to it), so Attack / Defend needs a flagpole and Extraction its data (M43).
 * A saved pick the map can't host plays as `playableMode` says.
 */
export function modeOffered(map: Pick<MapData, 'flag' | 'extraction'>, mode: MatchMode): boolean {
  return mapHosts(map, mode);
}
