import { DEPOT } from './depot';
import type { MapData } from './mapTypes';
import { WOODLAND } from './woodland';

/** The fields. More join as they are built (the v0.4 list). */
export type MapId = 'depot' | 'woodland';

/** One field in New game's Map pop-up. */
export interface MapEntry {
  id: MapId;
  label: string;
  blurb: string;
  data: MapData;
  /**
   * Players per team: picking the map sets `standard`, and the Match pop-up offers up to `max` (the map's spawns per
   * end). Records count only `standard` (config/matchRules countsForRecords).
   */
  teamSize: { standard: number; max: number };
}

/**
 * The maps in the order the Map pop-up lists them. One still being built (`data.inDevelopment`, owner, 2026-10-04) is
 * listed too: greyed out as Coming soon, unless Dev settings › Access maps in development is on.
 */
export const MAPS: readonly MapEntry[] = [
  { id: 'depot', label: 'Depot', blurb: 'An abandoned warehouse yard.', data: DEPOT, teamSize: { standard: 3, max: 3 } },
  { id: 'woodland', label: 'Woodland', blurb: 'A wide wood with a hill, at night.', data: WOODLAND, teamSize: { standard: 4, max: 5 } },
];

/** The tag on a map still being built: while it is locked, and once Dev settings open it. */
export const COMING_SOON_TAG = 'Coming soon';
export const IN_DEVELOPMENT_TAG = 'In development';

export const DEFAULT_MAP: MapId = 'depot';

/** The entry for `id` (the default map's for an id no longer offered). */
export function mapEntry(id: MapId): MapEntry {
  return MAPS.find((m) => m.id === id) ?? MAPS.find((m) => m.id === DEFAULT_MAP)!;
}

/** Whether `id` can be played now: every finished map, and a map in development only with `devAccess`. */
export function mapOpen(id: MapId, devAccess: boolean): boolean {
  return devAccess || !mapEntry(id).data.inDevelopment;
}

/** The map that is played for the picked `id`: itself if it is open, else the default map. */
export function playableMap(id: MapId, devAccess: boolean): MapId {
  return mapOpen(id, devAccess) ? mapEntry(id).id : DEFAULT_MAP;
}

/** The map data for `id` (the default map for an id no longer offered). */
export function mapData(id: MapId): MapData {
  return mapEntry(id).data;
}

/** The team size played on map `id` when `picked` is chosen: no more than the map has spawns for. */
export function teamSizeOn(id: MapId, picked: number): number {
  return Math.min(picked, mapEntry(id).teamSize.max);
}
