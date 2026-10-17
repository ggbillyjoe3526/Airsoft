import { DEFAULT_SOUND_CUE_COLOUR, REDUCED_MOTION_CHOICES, SOUND_CUE_CHOICES, SOUND_CUE_COLOURS, SOUND_CUE_SIZE, type SoundCueColour } from '../config/accessibility';
import { CALLOUT_CHOICES, type CalloutsMode, DEFAULT_CALLOUTS } from '../config/callouts';
import {
  DEFAULT_HIT_MARKER,
  DEFAULT_HIT_MARKER_SETTINGS,
  HIT_MARKER_CHOICES,
  HIT_MARKER_COLORS,
  HIT_MARKER_OUTLINES,
  HIT_MARKER_RANGES,
  type HitMarkerSettings,
} from '../config/hits';
import { DEFAULT_MAG_PROMPTS, MAG_PROMPT_CHOICES, type MagPromptsMode } from '../config/magShare';
import {
  AMMO_COUNTER_CHOICES,
  type AmmoCounterMode,
  CROSSHAIR_COLORS,
  CROSSHAIR_DYNAMIC,
  CROSSHAIR_HEX,
  CROSSHAIR_OUTLINES,
  CROSSHAIR_RANGES,
  CROSSHAIR_SHAPES,
  type CrosshairSettings,
  DEFAULT_AMMO_COUNTER,
  DEFAULT_CROSSHAIR,
  DEFAULT_FEED_CORNER,
  DEFAULT_HIT_FEED_MODE,
  DEFAULT_WHAT_GOT_YOU_MODE,
  FEED_CORNERS,
  type FeedCorner,
  HIT_FEED_MODES,
  type HitFeedMode,
  HUD_OPACITY,
  HUD_SIZE,
  SCOREBOARD_SIZE,
  WHAT_GOT_YOU_MODES,
  type WhatGotYouMode,
} from '../config/matchInfo';
import { DEFAULT_MINIMAP_TURN, MINIMAP_TURN_CHOICES, type MinimapTurn } from '../config/minimap';
import { DEFAULT_PING_MARKERS, PING_MARKER_CHOICES, type PingMarkersMode } from '../config/pings';
import { DEFAULT_TEAM_COLOURS, TEAM_COLOUR_CHOICES, type TeamColourSetId } from '../config/teams';
import { browserStorage, loadChoice, loadSetting, numberIn, oneOf } from './storage';

/**
 * Every HUD and accessibility preference in one object (DX5, audit A1 and B7): Settings › Gameplay's crosshair and hit
 * marker, the HUD tab and the Accessibility tab. `Game` loads it once; the menus change it (each row saves its own key,
 * as before), and `Game`, both sessions and their presentations read it by reference, so a new preference is a field
 * here, its loader below and the rows and readers that use it.
 */
export interface HudPrefs {
  crosshair: CrosshairSettings;
  /** Settings › Gameplay › Hit marker (M97): off unless the player turned it on. */
  hitMarker: HitMarkerSettings;
  /** The HUD's size as picked (audit UI-04; the screen's height scales it further), the scoreboard's, the panels' opacity (G4). */
  hudSize: number;
  scoreboardSize: number;
  hudOpacity: number;
  /** The hit feed's lines fade or stay (M24), and where the feed sits (Dev 6 playtest item 32). */
  hitFeed: HitFeedMode;
  feedCorner: FeedCorner;
  /** The card after a hit (M41): Auto shows it against Pro opponents only. */
  whatGotYou: WhatGotYouMode;
  /** The minimap rotating or north up (M83); callouts (CL1), ping markers (PG1), the mag hand-off's line (MG1), the BB counts (AC1). */
  minimapTurn: MinimapTurn;
  callouts: CalloutsMode;
  pingMarkers: PingMarkersMode;
  magPrompts: MagPromptsMode;
  ammoCounter: AmmoCounterMode;
  /** Reduced motion as picked, or null until the player picks (audit UI-07): then `systemReducedMotion` decides. */
  reducedMotion: boolean | null;
  /** The team colours (M18b): built into the figures, so a new set shows from the next match (on the range, from Resume). */
  teamColours: TeamColourSetId;
  /** The on-screen sound cues (M18b) and their size and colour (M24). */
  soundCues: boolean;
  soundCueSize: number;
  soundCueColour: SoundCueColour;
  /** The system's "reduce motion" setting, kept current by `Game` (never saved). */
  systemReducedMotion: boolean;
  /** Goes up with every change (`setHudPref`): a session re-reads what it shows when it moved since it last looked. */
  version: number;
}

/** A preference `setHudPref` changes. */
export type HudPrefKey = Exclude<keyof HudPrefs, 'version'>;

/** Every preference as saved, each falling back to its default on its own (`systemReducedMotion` starts false). */
export function loadHudPrefs(storage = browserStorage()): HudPrefs {
  return {
    crosshair: loadCrosshair(storage),
    hitMarker: loadHitMarker(storage),
    hudSize: loadHudSize(storage),
    scoreboardSize: loadScoreboardSize(storage),
    hudOpacity: loadHudOpacity(storage),
    hitFeed: loadHitFeedMode(storage),
    feedCorner: loadFeedCorner(storage),
    whatGotYou: loadWhatGotYouMode(storage),
    minimapTurn: loadMinimapTurn(storage),
    callouts: loadCallouts(storage),
    pingMarkers: loadPingMarkers(storage),
    magPrompts: loadMagPrompts(storage),
    ammoCounter: loadAmmoCounter(storage),
    reducedMotion: loadReducedMotion(storage),
    teamColours: loadTeamColours(storage),
    soundCues: loadSoundCues(storage),
    soundCueSize: loadSoundCueSize(storage),
    soundCueColour: loadSoundCueColour(storage),
    systemReducedMotion: false,
    version: 0,
  };
}

/** One preference changed (the menus, or the system's reduce-motion setting): set, and the version moved on. */
export function setHudPref<K extends HudPrefKey>(prefs: HudPrefs, key: K, value: HudPrefs[K]): void {
  prefs[key] = value;
  prefs.version++;
}

/** Whether motion is reduced now: the player's pick, else the system's setting (audit UI-07). */
export function motionReduced(prefs: HudPrefs): boolean {
  return effectiveReducedMotion(prefs.reducedMotion, prefs.systemReducedMotion);
}

/**
 * The saved Reduced motion choice (Settings → Accessibility), or null while the player has not picked (audit UI-07):
 * then the system's "reduce motion" setting decides, live (`systemReducedMotionQuery`). Stored as before.
 */
export function loadReducedMotion(storage = browserStorage()): boolean | null {
  const saved = loadSetting<'on' | 'off' | null>('reducedMotion', oneOf(REDUCED_MOTION_CHOICES.map((c) => c.id)), null, storage);
  return saved === null ? null : saved === 'on';
}

/** The system's "reduce motion" setting (prefers-reduced-motion), which the browser reports; null where it has no media queries. */
export function systemReducedMotionQuery(): MediaQueryList | null {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
  } catch {
    return null;
  }
}

/** Whether motion is reduced: the player's pick, or while they have none the system's setting. */
export function effectiveReducedMotion(saved: boolean | null, system: boolean): boolean {
  return saved ?? system;
}

/**
 * The class #app wears for the HUD's CSS animations (style.css, audit M-03 and UI-07): the player's pick, or none while
 * they have not picked, so the stylesheet's `prefers-reduced-motion` rules follow the system live.
 */
export function motionClass(saved: boolean | null): 'reduced-motion' | 'full-motion' | null {
  return saved === null ? null : saved ? 'reduced-motion' : 'full-motion';
}

/** The team colour set (Settings → Accessibility, M18b). */
export function loadTeamColours(storage = browserStorage()): TeamColourSetId {
  return loadChoice('teamColours', TEAM_COLOUR_CHOICES, DEFAULT_TEAM_COLOURS, storage);
}

/** On-screen sound cues (Settings → Accessibility, M18b): off unless the player turned them on. */
export function loadSoundCues(storage = browserStorage()): boolean {
  return loadChoice('soundCues', SOUND_CUE_CHOICES, 'off', storage) === 'on';
}

/** The sound cues' size (Settings → Accessibility, M24): a scale, 1 = as before. */
export function loadSoundCueSize(storage = browserStorage()): number {
  return loadSetting('soundCueSize', numberIn(SOUND_CUE_SIZE.min, SOUND_CUE_SIZE.max), SOUND_CUE_SIZE.default, storage);
}

/** The sound cues' colour (Settings → Accessibility, M24). */
export function loadSoundCueColour(storage = browserStorage()): SoundCueColour {
  return loadChoice('soundCueColour', SOUND_CUE_COLOURS, DEFAULT_SOUND_CUE_COLOUR, storage);
}

/** The scoreboard's size as picked (Settings → HUD, M24): a scale, 1 = its size before M24. */
export function loadScoreboardSize(storage = browserStorage()): number {
  return loadSetting('scoreboardSize', numberIn(SCOREBOARD_SIZE.min, SCOREBOARD_SIZE.max), SCOREBOARD_SIZE.default, storage);
}

/** Whether the hit feed's lines fade or stay (Settings → HUD, M24). */
export function loadHitFeedMode(storage = browserStorage()): HitFeedMode {
  return loadChoice('hitFeed', HIT_FEED_MODES, DEFAULT_HIT_FEED_MODE, storage);
}

/** Whether the "what got you" card shows after a hit (Settings → HUD, M41): Auto (against Pro), On or Off. */
export function loadWhatGotYouMode(storage = browserStorage()): WhatGotYouMode {
  return loadChoice('whatGotYou', WHAT_GOT_YOU_MODES, DEFAULT_WHAT_GOT_YOU_MODE, storage);
}

/** The HUD's size as picked (Settings → HUD, audit UI-04): a scale, 1 = sized for the screen. */
export function loadHudSize(storage = browserStorage()): number {
  return loadSetting('hudSize', numberIn(HUD_SIZE.min, HUD_SIZE.max), HUD_SIZE.default, storage);
}

/**
 * How opaque the HUD's panels are (Settings → HUD, G4): 0.5 to 1. A save from before it, or one holding anything else
 * (out of range, not a number), reads as the default.
 */
export function loadHudOpacity(storage = browserStorage()): number {
  return loadSetting('hudOpacity', numberIn(HUD_OPACITY.min, HUD_OPACITY.max), HUD_OPACITY.default, storage);
}

/** Settings › HUD › Minimap (M83): Rotating (as it always was) unless the player picked Fixed. */
export function loadMinimapTurn(storage = browserStorage()): MinimapTurn {
  return loadSetting('minimapTurn', oneOf(MINIMAP_TURN_CHOICES.map((c) => c.id)), DEFAULT_MINIMAP_TURN, storage);
}

/** Settings › HUD › Feed position (Dev 6 playtest item 32): top right unless the player moved it. */
export function loadFeedCorner(storage = browserStorage()): FeedCorner {
  return loadSetting('feedCorner', oneOf(FEED_CORNERS.map((c) => c.id)), DEFAULT_FEED_CORNER, storage);
}

/** Settings › HUD › Callouts (CL1): on unless the player turned them off. */
export function loadCallouts(storage = browserStorage()): CalloutsMode {
  return loadSetting('callouts', oneOf(CALLOUT_CHOICES.map((c) => c.id)), DEFAULT_CALLOUTS, storage);
}

/** Settings › HUD › Ping markers (PG1): on unless the player turned them off. */
export function loadPingMarkers(storage = browserStorage()): PingMarkersMode {
  return loadSetting('pingMarkers', oneOf(PING_MARKER_CHOICES.map((c) => c.id)), DEFAULT_PING_MARKERS, storage);
}

/** Settings › HUD › Mag hand-off (MG1): on unless the player turned it off. */
export function loadMagPrompts(storage = browserStorage()): MagPromptsMode {
  return loadSetting('magPrompts', oneOf(MAG_PROMPT_CHOICES.map((c) => c.id)), DEFAULT_MAG_PROMPTS, storage);
}

/** Settings › HUD › Ammo counter (AC1): on unless the player turned it off. */
export function loadAmmoCounter(storage = browserStorage()): AmmoCounterMode {
  return loadSetting('ammoCounter', oneOf(AMMO_COUNTER_CHOICES.map((c) => c.id)), DEFAULT_AMMO_COUNTER, storage);
}

/** The saved crosshair, each part falling back to the default on its own. */
export function loadCrosshair(storage = browserStorage()): CrosshairSettings {
  const d = DEFAULT_CROSSHAIR;
  const whole = (r: { min: number; max: number }) => (raw: unknown) => {
    const v = numberIn(r.min, r.max)(raw);
    return v === undefined ? undefined : Math.round(v);
  };
  return {
    shape: loadSetting('crosshair.shape', oneOf(CROSSHAIR_SHAPES.map((o) => o.id)), d.shape, storage),
    size: loadSetting('crosshair.size', whole(CROSSHAIR_RANGES.size), d.size, storage),
    thickness: loadSetting('crosshair.thickness', whole(CROSSHAIR_RANGES.thickness), d.thickness, storage),
    gap: loadSetting('crosshair.gap', whole(CROSSHAIR_RANGES.gap), d.gap, storage),
    color: loadSetting('crosshair.color', oneOf(CROSSHAIR_COLORS.map((o) => o.id)), d.color, storage),
    customColor: loadSetting('crosshair.customColor', hexColour, d.customColor, storage),
    opacity: loadSetting('crosshair.opacity', numberIn(CROSSHAIR_RANGES.opacity.min, CROSSHAIR_RANGES.opacity.max), d.opacity, storage),
    dynamic: loadSetting('crosshair.dynamic', oneOf(CROSSHAIR_DYNAMIC.map((o) => o.id)), d.dynamic, storage),
    outline: loadSetting('crosshair.outline', oneOf(CROSSHAIR_OUTLINES.map((o) => o.id)), d.outline, storage),
  };
}

/** A saved custom colour: `#rrggbb` (lower case), or undefined for anything else (it goes into a style). */
export function hexColour(raw: unknown): string | undefined {
  return typeof raw === 'string' && CROSSHAIR_HEX.test(raw) ? raw.toLowerCase() : undefined;
}

/** The saved hit marker, each part falling back to the default on its own (off on a clean save, M97). */
export function loadHitMarker(storage = browserStorage()): HitMarkerSettings {
  const d = DEFAULT_HIT_MARKER_SETTINGS;
  const t = HIT_MARKER_RANGES.thickness;
  const thickness = (raw: unknown): number | undefined => {
    const v = numberIn(t.min, t.max)(raw);
    return v === undefined ? undefined : Math.round(v);
  };
  return {
    on: loadSetting('hitMarker', oneOf(HIT_MARKER_CHOICES.map((c) => c.id)), DEFAULT_HIT_MARKER ? 'on' : 'off', storage) === 'on',
    scale: loadSetting('hitMarker.scale', numberIn(HIT_MARKER_RANGES.scale.min, HIT_MARKER_RANGES.scale.max), d.scale, storage),
    thickness: loadSetting('hitMarker.thickness', thickness, d.thickness, storage),
    outline: loadSetting('hitMarker.outline', oneOf(HIT_MARKER_OUTLINES.map((o) => o.id)), d.outline, storage),
    color: loadSetting('hitMarker.color', oneOf(HIT_MARKER_COLORS.map((o) => o.id)), d.color, storage),
    customColor: loadSetting('hitMarker.customColor', hexColour, d.customColor, storage),
  };
}
