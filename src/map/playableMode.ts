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
 * Whether New game offers `mode` on `map`: Extraction only where the map has its data (M43); the others everywhere,
 * as before (Attack / Defend on a map without a flagpole still plays as Elimination, above).
 */
export function modeOffered(map: Pick<MapData, 'flag' | 'extraction'>, mode: MatchMode): boolean {
  return MODE_SHAPES[mode].without === 'elimination' || mapHosts(map, mode);
}
