import type { ContentTag } from '../config/content';
import { DEPOT } from './depot';
import type { MapData } from './mapTypes';

/** The fields. More join as they are built (the v0.4 list). */
export type MapId = 'depot' | 'woodland' | 'neonHeights';

/** One field in New game's Map pop-up. Its data is read with mapData (a dev map's arrives with loadDevMaps). */
export interface MapEntry {
  id: MapId;
  label: string;
  blurb: string;
  /** Public or dev (M35): a `dev` map is listed only while the Dev content switch is on. */
  tag: ContentTag;
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
  { id: 'depot', label: 'Depot', blurb: 'An abandoned warehouse yard.', tag: 'public', teamSize: { standard: 3, max: 3 } },
  { id: 'woodland', label: 'Woodland', blurb: 'A wide wood with a hill, at night.', tag: 'dev', teamSize: { standard: 4, max: 5 } },
  { id: 'neonHeights', label: 'Neon Heights', blurb: 'A neon city block on three floors.', tag: 'dev', teamSize: { standard: 4, max: 5 } },
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

/**
 * The data of each map loaded so far (M50, audit CORE-01): the public maps' ships in the game's chunk; the dev maps' is
 * in its own chunk (map/devMaps.ts), fetched only once Dev content is on (loadDevMaps), so a player who never turns it
 * on never downloads it.
 */
const loaded = new Map<MapId, MapData>([['depot', DEPOT]]);

/** Adds maps' data once their module has loaded (loadDevMaps; the unit tests' setup, src/testSetup.ts). */
export function registerMaps(data: Partial<Record<MapId, MapData>>): void {
  for (const m of MAPS) {
    const d = data[m.id];
    if (d) loaded.set(m.id, d);
  }
}

/** Whether every map's data is here: Dev content waits for it before it lists the dev maps (game.ts). */
export function allMapsLoaded(): boolean {
  return MAPS.every((m) => loaded.has(m.id));
}

let devMaps: Promise<boolean> | null = null;

/**
 * Fetches the dev maps' chunk and adds their data: true once it is in, false if the chunk could not be fetched (the
 * next call tries again). One fetch however often it is asked for.
 */
export function loadDevMaps(): Promise<boolean> {
  devMaps ??= import('./devMaps').then(
    (m) => {
      registerMaps(m.DEV_MAP_DATA);
      return true;
    },
    (error: unknown) => {
      devMaps = null;
      console.warn('The dev maps could not be loaded; Dev content stays off.', error);
      return false;
    },
  );
  return devMaps;
}

/** The entry for `id` (the default map's for an id no longer offered). */
export function mapEntry(id: MapId): MapEntry {
  return MAPS.find((m) => m.id === id) ?? MAPS.find((m) => m.id === DEFAULT_MAP)!;
}

/**
 * The map data for `id`: the default map's for an id no longer offered, and for a dev map not loaded yet (it is only
 * offered once loaded, so nothing plays it before; newGamePicks.ts playedPicks).
 */
export function mapData(id: MapId): MapData {
  return loaded.get(id) ?? loaded.get(DEFAULT_MAP)!;
}

/** Whether `id`'s data is here (a dev map's arrives with loadDevMaps). */
export function mapLoaded(id: MapId): boolean {
  return loaded.has(id);
}

/** The team size played on map `id` when `picked` is chosen: no more than the map has spawns for. */
export function teamSizeOn(id: MapId, picked: number): number {
  return Math.min(picked, mapEntry(id).teamSize.max);
}
