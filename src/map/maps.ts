import { DEPOT } from './depot';
import type { MapData } from './mapTypes';

/** The fields that can be played. More join as they are built (Woodland, M33; the v0.4 list). */
export type MapId = 'depot';

/** The maps in the order New game's Map pop-up lists them, with their labels. */
export const MAPS: readonly { id: MapId; label: string; blurb: string; data: MapData }[] = [
  { id: 'depot', label: 'Depot', blurb: 'An abandoned warehouse yard.', data: DEPOT },
];

/**
 * Fields still being built (owner, 2026-10-04): listed under the playable maps in the Map pop-up, greyed out with a
 * "Coming soon" tag, and never picked or saved. A map moves up to MAPS when it is playable.
 */
export const COMING_MAPS: readonly { label: string; blurb: string }[] = [
  { label: 'Woodland', blurb: 'A wide wood at night, still being built.' },
];

/** The tag on a map that is still being built. */
export const COMING_SOON_TAG = 'Coming soon';

export const DEFAULT_MAP: MapId = 'depot';

/** The map data for `id` (the default map for an id no longer offered). */
export function mapData(id: MapId): MapData {
  return (MAPS.find((m) => m.id === id) ?? MAPS.find((m) => m.id === DEFAULT_MAP)!).data;
}
