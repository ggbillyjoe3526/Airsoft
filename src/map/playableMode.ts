import type { MatchMode } from '../config/modes';
import type { MapData } from './mapTypes';

/**
 * The mode `wanted` plays as on `map`: Attack / Defend needs a flagpole and Extraction (M43) its data; without them
 * the match is Elimination, which every map can play.
 */
export function playableMode(map: Pick<MapData, 'flag' | 'extraction'>, wanted: MatchMode): MatchMode {
  if (wanted === 'attackDefend') return map.flag ? wanted : 'elimination';
  if (wanted === 'extraction') return map.extraction ? wanted : 'elimination';
  return wanted;
}
