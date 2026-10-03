/**
 * Match info (M19, the owner's feature picks, 2026-10-03): the hit feed, teammate markers, the stats tables, local
 * records and the crosshair options. First guesses, to tune in play.
 */

/** The hit feed in the top-right corner: "Orange 2 called HIT · Blue 1", newest at the top. */
export const HIT_FEED = {
  /** Most lines shown at once; an older line is dropped when a new one comes in. */
  maxLines: 5,
  /** Seconds a line stays up (simulation time, so a pause holds it), the last `fadeTime` of them fading out. */
  lineTime: 6,
  fadeTime: 1,
} as const;

/** The marker with the name over each teammate (never over an enemy). */
export const TEAMMATE_MARKERS = {
  /** Metres above the teammate's eyes the marker's tip sits. */
  aboveEyes: 0.45,
} as const;

/** The stats tables (hold-Tab scoreboard, between rounds, end-of-match summary) and the local records. */
export const STATS = {
  /** A match counts towards the best-accuracy record only once you've fired at least this many BBs in it. */
  minBBsForAccuracyRecord: 30,
} as const;

/** Where the records are kept in the browser (separate from the settings object: records are not settings). */
export const RECORDS_KEY = 'airsoft.records';

export type CrosshairShape = 'cross' | 'crossDot' | 'dot' | 'circle';
export type CrosshairColor = 'white' | 'green' | 'yellow' | 'cyan' | 'pink' | 'red';
export type CrosshairOutline = 'on' | 'off';

/** The crosshair as the player set it up on Settings → Crosshair. */
export interface CrosshairSettings {
  shape: CrosshairShape;
  /** Arm length (px). */
  size: number;
  /** Line width, and the dot's size (px). */
  thickness: number;
  /** The smallest gap between the centre and the arms or the circle (px): the spread opens it further. */
  gap: number;
  color: CrosshairColor;
  outline: CrosshairOutline;
}

/** The crosshair before any change: the one the game always had (a cross with a centre dot, white, outlined). */
export const DEFAULT_CROSSHAIR: CrosshairSettings = {
  shape: 'crossDot',
  size: 7,
  thickness: 2,
  gap: 4,
  color: 'white',
  outline: 'on',
};

export const CROSSHAIR_SHAPES: readonly { id: CrosshairShape; label: string; blurb: string }[] = [
  { id: 'crossDot', label: 'Cross and dot', blurb: 'Four arms that open with your spread, and a dot in the middle.' },
  { id: 'cross', label: 'Cross', blurb: 'Four arms that open with your spread.' },
  { id: 'circle', label: 'Circle', blurb: 'A ring as wide as your spread, and a dot in the middle.' },
  { id: 'dot', label: 'Dot only', blurb: 'Just a dot: it does not show your spread.' },
];

/** Colours a crosshair can take. Blue and orange are left out: they are the teams' colours. */
export const CROSSHAIR_COLORS: readonly { id: CrosshairColor; label: string; blurb: string; css: string }[] = [
  { id: 'white', label: 'White', blurb: '', css: 'rgba(255, 255, 255, 0.92)' },
  { id: 'green', label: 'Green', blurb: '', css: '#5cff6e' },
  { id: 'yellow', label: 'Yellow', blurb: '', css: '#ffe94a' },
  { id: 'cyan', label: 'Cyan', blurb: '', css: '#4af2ff' },
  { id: 'pink', label: 'Pink', blurb: '', css: '#ff6ee6' },
  { id: 'red', label: 'Red', blurb: '', css: '#ff3b30' },
];

export const CROSSHAIR_OUTLINES: readonly { id: CrosshairOutline; label: string; blurb: string }[] = [
  { id: 'on', label: 'On', blurb: 'A thin dark edge keeps it readable on bright walls.' },
  { id: 'off', label: 'Off', blurb: '' },
];

/** Slider ranges (px). */
export const CROSSHAIR_RANGES = {
  size: { min: 2, max: 16, step: 1 },
  thickness: { min: 1, max: 4, step: 1 },
  gap: { min: 0, max: 12, step: 1 },
} as const;

/** The Settings preview's second crosshair: as if moving, this many pixels wider than standing still. */
export const CROSSHAIR_PREVIEW_SPREAD = 10;
