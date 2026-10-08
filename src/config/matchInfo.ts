/**
 * Match info (M19, the owner's feature picks, 2026-10-03): the hit feed, teammate markers, the stats tables, local
 * records and the crosshair options. First guesses, to tune in play.
 */

import { type Difficulty, difficultyAtLeast } from './bots';

/** The hit feed in the top-right corner, newest at the top (a screen reader hears "Orange 2 called HIT · Blue 1"). */
export const HIT_FEED = {
  /** Most lines shown at once; an older line is dropped when a new one comes in. */
  maxLines: 5,
  /** Seconds a line stays up (simulation time, so a pause holds it), the last `fadeTime` of them fading out. */
  lineTime: 6,
  fadeTime: 1,
  /** Lines kept when the feed is set to Keep (Settings → HUD, M24): the match's last this many hits, none fading. */
  keptLines: 10,
  /** The tag at the end of each row (G4). */
  tag: 'Hit',
} as const;

/** Settings → HUD → Hit feed (M24): lines fade as before, or the last few stay up for the whole match. */
export type HitFeedMode = 'fade' | 'keep';

export const HIT_FEED_MODES: readonly { id: HitFeedMode; label: string; blurb: string }[] = [
  { id: 'fade', label: 'Fade', blurb: `Each hit shows for ${HIT_FEED.lineTime} s, up to ${HIT_FEED.maxLines} at once.` },
  { id: 'keep', label: 'Keep', blurb: `The last ${HIT_FEED.keptLines} hits stay on screen for the whole match.` },
];

export const DEFAULT_HIT_FEED_MODE: HitFeedMode = 'fade';

/**
 * Settings → HUD → What got you (M41, owner's esports plan 2026-10-04, question 9): the card after you're hit that says
 * where the shot came from, whether that bot was holding the angle, how long you were in its view and whether you were
 * moving. Auto shows it only against Pro opponents (a hard game feels fair when you can see why you lost); On shows it
 * on every difficulty, Off never.
 */
export type WhatGotYouMode = 'auto' | 'on' | 'off';

export const WHAT_GOT_YOU_MODES: readonly { id: WhatGotYouMode; label: string; blurb: string }[] = [
  { id: 'auto', label: 'Auto', blurb: 'Shown only against Pro opponents.' },
  { id: 'on', label: 'On', blurb: 'After every hit, on any difficulty: where it came from, whether that bot was holding the angle, and how long you were seen.' },
  { id: 'off', label: 'Off', blurb: 'Never shown.' },
];

export const DEFAULT_WHAT_GOT_YOU_MODE: WhatGotYouMode = 'auto';

export const WHAT_GOT_YOU = {
  /** Auto turns the card on when the opponents' difficulty is at least this one. */
  autoFrom: 'pro',
  /** Horizontal speed (m/s) at the hit from which you count as moving (a crouched creep is about 1 m/s; standing is 0). */
  movingSpeed: 0.5,
} as const satisfies { autoFrom: Difficulty; movingSpeed: number };

/** Whether the card shows in a match against `opponents` with the setting at `mode`. */
export function whatGotYouShown(mode: WhatGotYouMode, opponents: Difficulty): boolean {
  return mode === 'on' || (mode === 'auto' && difficultyAtLeast(opponents, WHAT_GOT_YOU.autoFrom));
}

/**
 * Settings → HUD → Scoreboard size (M24; owner, 2026-10-04: larger than before, and adjustable): a scale on the
 * scoreboard over the field, 1 = its size before M24.
 */
export const SCOREBOARD_SIZE = {
  min: 0.8,
  max: 2,
  step: 0.1,
  default: 1.3,
  /** Half the scoreboard's width at size 1 in its widest form (Attack and Defend), px. */
  halfWidth: 222,
  /** Room kept between the scoreboard and the screen's right edge for the hit feed, px (bug pass: never under it). */
  feedRoom: 220,
} as const;

/**
 * The scoreboard's scale on a `viewportWidth` px wide screen for the size picked: as picked, unless that would leave the
 * hit feed less than SCOREBOARD_SIZE.feedRoom beside it; then as large as fits, but never below size 1.
 */
export function scoreboardScale(picked: number, viewportWidth: number): number {
  const fits = (viewportWidth / 2 - SCOREBOARD_SIZE.feedRoom) / SCOREBOARD_SIZE.halfWidth;
  return Math.min(picked, Math.max(1, fits));
}

/**
 * Settings → HUD → HUD size (audit UI-04): a scale on the whole HUD (the replica panel, the scoreboard, the minimap,
 * the hit feed, the squad line, the round messages, the order wheel and the markers over the field; the crosshair keeps
 * its own size). 100 % fits the screen: the HUD grows with a window taller than `referenceHeight` (1440p, 4K without
 * the system's scaling) up to `maxAuto` times, so its type doesn't shrink to a sliver there.
 */
export const HUD_SIZE = {
  min: 0.8,
  max: 1.5,
  step: 0.05,
  default: 1,
  /** The window height (CSS px) the HUD is drawn for at 100 %. */
  referenceHeight: 1080,
  /** The most a tall window grows it on its own. */
  maxAuto: 1.5,
} as const;

/** The HUD's scale on a `viewportHeight` px tall window for the size picked (1 = as drawn at 1080 px high). */
export function hudScale(picked: number, viewportHeight: number): number {
  const auto = Math.min(HUD_SIZE.maxAuto, Math.max(1, viewportHeight / HUD_SIZE.referenceHeight));
  return Math.round(picked * auto * 1000) / 1000;
}

/** The marker with the name over each teammate (never over an enemy). */
export const TEAMMATE_MARKERS = {
  /**
   * Metres above the teammate's eyes the marker's tip is anchored: just clear of the tallest headgear (G7's helmets top
   * out about 0.12 m above the eyes, a robot's antenna 0.16 m; the hats before them 0.15 m, under 0.2 m then). A fixed
   * world offset grows on screen as they come closer, so it is kept this small (FA13: 0.45 m floated the tag a hand's
   * width over a teammate's head up close); style.css adds a few pixels on screen so a far-off tag still clears the head.
   */
  aboveEyes: 0.18,
} as const;

/** The stats tables (hold-Tab scoreboard, between rounds, end-of-match summary) and the local records. */
export const STATS = {
  /** A match counts towards the best-accuracy record only once you've fired at least this many BBs in it. */
  minBBsForAccuracyRecord: 30,
} as const;

/** Where the records are kept in the browser (separate from the settings object: records are not settings). */
export const RECORDS_KEY = 'airsoft.records';

export type CrosshairShape = 'cross' | 'crossDot' | 'dot' | 'circle';
export type CrosshairColor = 'white' | 'green' | 'yellow' | 'cyan' | 'pink' | 'red' | 'custom';
export type CrosshairOutline = 'on' | 'off';
/** Whether the crosshair opens with the spread (`on`) or keeps its gap (`off`, static; audit UI-21). */
export type CrosshairDynamic = 'on' | 'off';

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
  /** The colour when `color` is `custom` (#rrggbb, from the colour box; audit UI-21). */
  customColor: string;
  /** 0.2 (faint) to 1 (solid). */
  opacity: number;
  dynamic: CrosshairDynamic;
  outline: CrosshairOutline;
}

/** The crosshair before any change: the one the game always had (a cross with a centre dot, white, outlined). */
export const DEFAULT_CROSSHAIR: CrosshairSettings = {
  shape: 'crossDot',
  size: 7,
  thickness: 2,
  gap: 4,
  color: 'white',
  customColor: '#5cff6e',
  opacity: 1,
  dynamic: 'on',
  outline: 'on',
};

export const CROSSHAIR_SHAPES: readonly { id: CrosshairShape; label: string; blurb: string }[] = [
  { id: 'crossDot', label: 'Cross and Dot', blurb: 'Four arms that open with your spread, and a dot in the middle.' },
  { id: 'cross', label: 'Cross', blurb: 'Four arms that open with your spread.' },
  { id: 'circle', label: 'Circle', blurb: 'A ring as wide as your spread, and a dot in the middle.' },
  { id: 'dot', label: 'Dot Only', blurb: 'Just a dot: it does not show your spread.' },
];

/** Colours a crosshair can take. Blue and orange are left out: they are the teams' colours. */
export const CROSSHAIR_COLORS: readonly { id: CrosshairColor; label: string; blurb: string; css: string }[] = [
  { id: 'white', label: 'White', blurb: '', css: 'rgba(255, 255, 255, 0.92)' },
  { id: 'green', label: 'Green', blurb: '', css: '#5cff6e' },
  { id: 'yellow', label: 'Yellow', blurb: '', css: '#ffe94a' },
  { id: 'cyan', label: 'Cyan', blurb: '', css: '#4af2ff' },
  { id: 'pink', label: 'Pink', blurb: '', css: '#ff6ee6' },
  { id: 'red', label: 'Red', blurb: '', css: '#ff3b30' },
  // Any colour (audit UI-21): its swatch shows the colour picked in the box beside it.
  { id: 'custom', label: 'Custom', blurb: 'The colour in the box: click it to pick any.', css: '' },
];

/** A custom crosshair colour as saved: #rrggbb only (it goes into a style). */
export const CROSSHAIR_HEX = /^#[0-9a-f]{6}$/i;

export const CROSSHAIR_DYNAMIC: readonly { id: CrosshairDynamic; label: string; blurb: string }[] = [
  { id: 'on', label: 'Dynamic', blurb: 'Opens as you move and fire, to show where your BBs can go.' },
  { id: 'off', label: 'Static', blurb: 'Keeps its gap whatever your spread.' },
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
  opacity: { min: 0.2, max: 1, step: 0.05 },
} as const;

/** The Settings preview's second crosshair: as if moving, this many pixels wider than standing still. */
export const CROSSHAIR_PREVIEW_SPREAD = 10;
