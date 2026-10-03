import { DEPOT } from './depot';
import type { MapData } from './mapTypes';

/** The fields that can be played. More join as they are built (Woodland in v0.2, the v0.4 list). */
export type MapId = 'depot';

/** The maps in the order New game's Map pop-up lists them, with their labels. */
export const MAPS: readonly { id: MapId; label: string; blurb: string; data: MapData }[] = [
  { id: 'depot', label: 'Depot', blurb: 'A warehouse yard: three lanes (Dock Road, Container Alley, the Office) to one flagpole.', data: DEPOT },
];

export const DEFAULT_MAP: MapId = 'depot';

/** The map data for `id` (the default map for an id no longer offered). */
export function mapData(id: MapId): MapData {
  return (MAPS.find((m) => m.id === id) ?? MAPS.find((m) => m.id === DEFAULT_MAP)!).data;
}
