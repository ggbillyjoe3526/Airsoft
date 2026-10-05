import type { ContentTag } from '../config/content';
import { DEPOT } from './depot';
import type { MapData } from './mapTypes';
import { NEON_HEIGHTS } from './neonHeights';
import { WOODLAND } from './woodland';

/** The fields. More join as they are built (the v0.4 list). */
export type MapId = 'depot' | 'woodland' | 'neonHeights';

/** One field in New game's Map pop-up. */
export interface MapEntry {
  id: MapId;
  label: string;
  blurb: string;
  /** Public or dev (M35): a `dev` map is listed only while the Dev content switch is on. */
  tag: ContentTag;
  data: MapData;
  /**
   * Players per team: picking the map sets `standard`, and the Match pop-up offers up to `max` (the map's spawns per
   * end). Records count only `standard` (config/matchRules countsForRecords).
   */
  teamSize: { standard: number; max: number };
}

/**
 * The maps in the order New game's Map pop-up lists them. Woodland and Neon Heights are dev content until the owner makes
 * them public.
 */
export const MAPS: readonly MapEntry[] = [
  { id: 'depot', label: 'Depot', blurb: 'An abandoned warehouse yard.', tag: 'public', data: DEPOT, teamSize: { standard: 3, max: 3 } },
  { id: 'woodland', label: 'Woodland', blurb: 'A wide wood with a hill, at night.', tag: 'dev', data: WOODLAND, teamSize: { standard: 4, max: 5 } },
  {
    id: 'neonHeights',
    label: 'Neon Heights',
    blurb: 'A neon city block on three floors.',
    tag: 'dev',
    data: NEON_HEIGHTS,
    teamSize: { standard: 4, max: 5 },
  },
];

/**
 * Fields still being built (owner, 2026-10-04): listed under the playable maps in the Map pop-up, greyed out with a
 * "Coming soon" tag, and never picked or saved. Dev content (M35): listed only while Dev content is on. A map moves up
 * to MAPS when it is playable (tagged dev until the owner makes it public), as Woodland did (M33d).
 */
export const COMING_MAPS: readonly { label: string; blurb: string; tag: ContentTag }[] = [];

/** The tag on a map that is still being built. */
export const COMING_SOON_TAG = 'Coming soon';

export const DEFAULT_MAP: MapId = 'depot';

/** The entry for `id` (the default map's for an id no longer offered). */
export function mapEntry(id: MapId): MapEntry {
  return MAPS.find((m) => m.id === id) ?? MAPS.find((m) => m.id === DEFAULT_MAP)!;
}

/** The map data for `id` (the default map for an id no longer offered). */
export function mapData(id: MapId): MapData {
  return mapEntry(id).data;
}

/** The team size played on map `id` when `picked` is chosen: no more than the map has spawns for. */
export function teamSizeOn(id: MapId, picked: number): number {
  return Math.min(picked, mapEntry(id).teamSize.max);
}
