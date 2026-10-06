/**
 * The menus' pictures (graphics overhaul G3): a still of each map in each light it offers, a picture per match mode and
 * the two backdrops (the title's, sharp, and one blurred once for every other screen, so no screen blurs live). All are
 * drawn by the game itself (pipeline/map-stills.mjs, from the built game in a browser) and served from public/menu/.
 * This file has no imports, so that script reads it as it is.
 */

/** The folder under public/ the pictures are served from. */
export const MENU_ART_DIR = 'menu';

/**
 * Where a picture's camera stands: over the field looking across it from behind Blue's start, high over its middle (a
 * city, whose streets only show from above), at eye height behind Blue's start, where the player first stands (a
 * little higher), or on Blue's side of the flagpole looking at it.
 */
export type StillView = 'overview' | 'aerial' | 'ground' | 'street' | 'flag';

export interface StillShot {
  /** The file under MENU_ART_DIR. */
  file: string;
  /** The map (a MapId) and the light (a LightingPresetId) it is drawn in. */
  map: string;
  light: 'day' | 'night';
  view: StillView;
}

/** One still per map and light offered, as the Play screen's map cards show them. */
export const MAP_STILLS: readonly StillShot[] = [
  { file: 'depot-day.jpg', map: 'depot', light: 'day', view: 'overview' },
  { file: 'woodland-night.jpg', map: 'woodland', light: 'night', view: 'overview' },
  { file: 'neonHeights-night.jpg', map: 'neonHeights', light: 'night', view: 'aerial' },
  { file: 'neonHeights-day.jpg', map: 'neonHeights', light: 'day', view: 'aerial' },
];

/** The mode cards' pictures (by MatchMode): a moment that reads as the mode. */
export const MODE_STILLS: Readonly<Record<string, StillShot>> = {
  elimination: { file: 'mode-elimination.jpg', map: 'depot', light: 'day', view: 'ground' },
  attackDefend: { file: 'mode-attackDefend.jpg', map: 'depot', light: 'day', view: 'flag' },
  extraction: { file: 'mode-extraction.jpg', map: 'woodland', light: 'night', view: 'street' },
};

/** Map stills and mode pictures: small JPEGs, a card's size at twice the density of a 1080p screen's half. */
export const STILL_SIZE = { width: 480, height: 270, quality: 0.8, maxBytes: 40_000 } as const;

/**
 * The backdrops: the title's (a wide view of Depot), and the same view blurred and darkened once, small, for every other
 * screen (scaled up, a blurred picture loses nothing).
 */
export const BACKDROPS = {
  title: { file: 'title.jpg', map: 'depot', light: 'day', view: 'overview', width: 1280, height: 720, quality: 0.78, maxBytes: 160_000 },
  blurred: { file: 'backdrop.jpg', width: 480, height: 270, blur: 10, quality: 0.75, maxBytes: 20_000 },
} as const;

/** Where the camera stands for each view, in metres from the start it looks across from (`back`, `up`), and what it looks at. */
export const STILL_CAMERA: Readonly<Record<StillView, { back: number; up: number; lookUp: number; fov: number }>> = {
  overview: { back: 6, up: 14, lookUp: 0, fov: 55 },
  ground: { back: 1, up: 1.7, lookUp: 1.4, fov: 62 },
  aerial: { back: 8, up: 30, lookUp: 0, fov: 60 },
  street: { back: 0, up: 1.2, lookUp: 0, fov: 64 },
  flag: { back: 9, up: 3.2, lookUp: 1.8, fov: 58 },
};

/** The map still's file for a map in a light, or null when none was drawn. */
export function mapStillFile(map: string, light: string): string | null {
  return MAP_STILLS.find((s) => s.map === map && s.light === light)?.file ?? MAP_STILLS.find((s) => s.map === map)?.file ?? null;
}
