import {
  DEFAULT_SOUND_CUE_COLOUR,
  REDUCED_MOTION_CHOICES,
  SOUND_CUE_CHOICES,
  SOUND_CUE_COLOURS,
  SOUND_CUE_SIZE,
  type SoundCueColour,
} from '../../config/accessibility';
import { DEFAULT_REALISTIC_COLOURS, DEFAULT_ROBOTS, type LookSettings, REALISTIC_COLOUR_CHOICES, ROBOT_CHOICES } from '../../config/look';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, type Difficulty, defaultTeammateDifficulty, TEAMMATE_DIFFICULTIES } from '../../config/bots';
import {
  AIM_MODES,
  CROUCH_MODES,
  type CrouchMode,
  DEFAULT_AIM_MODE,
  DEFAULT_CROUCH_MODE,
  DEFAULT_RAW_INPUT,
  DEFAULT_SPRINT_MODE,
  type HoldMode,
  INVERT_MOUSE,
  MOUSE,
  MOUSE_DPI,
  RAW_INPUT,
  SPRINT_MODES,
} from '../../config/controls';
import {
  DEFAULT_MATCH_RULES,
  DEFAULT_RULESET,
  FIRE_MODE_CHOICES,
  FRIENDLY_FIRE_CHOICES,
  KIT_CHOICES,
  MAGAZINE_CHOICES,
  type MatchRules,
  MINIMAP_HEARD_CHOICES,
  OVERTIME_CHOICES,
  RICOCHETS_COUNT_CHOICES,
  ROUND_TIME_SETTING,
  RULESETS,
  type RulesetId,
  TEAM_SIZE_CHOICES,
  TIME_OUT_CHOICES,
  WINS_NEEDED_CHOICES,
} from '../../config/matchRules';
import { DEFAULT_HIT_FEED_MODE, DEFAULT_WHAT_GOT_YOU_MODE, HIT_FEED_MODES, type HitFeedMode, HUD_OPACITY, HUD_SIZE, RECORDS_KEY, SCOREBOARD_SIZE, WHAT_GOT_YOU_MODES, type WhatGotYouMode } from '../../config/matchInfo';
import { DEFAULT_MODE, MATCH_MODES, type MatchMode } from '../../config/modes';
import { AIMING } from '../../config/optics';
import { frameRateCapFromSaved, GRAPHICS_ROWS, graphicsKey, parseStored, SHOW_FPS_CHOICES, TONE_MAPPING_CHOICES } from '../../config/graphics';
import { FOV_SETTING, type FrameRateCap, type LightingPresetId, QUALITY_CHOICES, type QualityChoice, type QualitySettings, RENDER, TONE_MAPPING, type ToneMappingId } from '../../config/render';
import { DEFAULT_WHEEL_SELECT, WHEEL_SELECT_MODES, type WheelSelect } from '../../config/squad';
import { DEFAULT_TEAM_COLOURS, TEAM_COLOUR_CHOICES, type TeamColourSetId } from '../../config/teams';
import { lightingChoices, parseLightingPick } from '../../map/lightingChoice';
import { DEFAULT_MAP, MAPS, type MapId, mapData, mapLoaded } from '../../map/maps';
import { browserStorage, loadSetting, numberIn, oneOf } from '../../settings/storage';
import { loadChoice } from '../optionPicker';

/** The choices the menus save in the browser, each read back here with its default. */

/** The opponents' bot difficulty (saved as `difficulty`, the one level every bot had before M20). */
export function loadDifficulty(): Difficulty {
  return loadChoice('difficulty', DIFFICULTIES, DEFAULT_DIFFICULTY);
}

/**
 * Your bot teammates' difficulty (M20). Until one is saved it follows the opponents' (`opponents`, the saved
 * `difficulty`) through defaultTeammateDifficulty: the same level, as every bot had before M20, except that Easy
 * opponents give Normal teammates (audit AI-03). Either way a returning player's standard matches still count for the
 * records (countsForRecords treats that default pair as standard).
 */
export function loadTeammateDifficulty(opponents: Difficulty = loadDifficulty()): Difficulty {
  return loadChoice('teammateDifficulty', TEAMMATE_DIFFICULTIES, defaultTeammateDifficulty(opponents));
}

/** Whether a teammate difficulty has been picked and saved (until then it follows the opponents', M20). */
export function hasSavedTeammateDifficulty(): boolean {
  return loadSetting<Difficulty | null>('teammateDifficulty', oneOf(TEAMMATE_DIFFICULTIES.map((d) => d.id)), null) !== null;
}

/**
 * The Match pop-up's rules (M20), each with its default, and Custom's switches (M39; off, as the game always played, until
 * one is saved). Strict marshal is inert and never saved: off here, set only by a ruleset.
 */
export function loadMatchRules(): MatchRules {
  const d = DEFAULT_MATCH_RULES;
  return {
    winsNeeded: Number(loadChoice('winsNeeded', WINS_NEEDED_CHOICES, String(d.winsNeeded))),
    roundTime: loadSetting('roundTime', roundTimeIn, d.roundTime),
    teamSize: Number(loadChoice('teamSize', TEAM_SIZE_CHOICES, String(d.teamSize))),
    friendlyFire: loadChoice('friendlyFire', FRIENDLY_FIRE_CHOICES, d.friendlyFire ? 'on' : 'off') === 'on',
    ricochetsCount: loadChoice('ricochets', RICOCHETS_COUNT_CHOICES, d.ricochetsCount ? 'on' : 'off') === 'on',
    winByTwo: loadChoice('overtime', OVERTIME_CHOICES, d.winByTwo ? 'on' : 'off') === 'on',
    timeOutToMorePlayers: loadChoice('timeOut', TIME_OUT_CHOICES, d.timeOutToMorePlayers ? 'morePlayers' : 'draw') === 'morePlayers',
    heardOnMinimap: loadChoice('minimapHeard', MINIMAP_HEARD_CHOICES, d.heardOnMinimap ? 'on' : 'off') === 'on',
    semiAutoOnly: loadChoice('fireModes', FIRE_MODE_CHOICES, d.semiAutoOnly ? 'semi' : 'any') === 'semi',
    realcap: loadChoice('magazines', MAGAZINE_CHOICES, d.realcap ? 'realcap' : 'carried') === 'realcap',
    factoryKit: loadChoice('matchKit', KIT_CHOICES, d.factoryKit ? 'factory' : 'own') === 'factory',
    strictMarshal: d.strictMarshal,
  };
}

/** The Rules picker's ruleset (M39): Skirmish until another is saved. */
export function loadRuleset(): RulesetId {
  return loadChoice('ruleset', RULESETS, DEFAULT_RULESET);
}

/** A saved round time: in range and on the slider's half-minute steps. */
function roundTimeIn(raw: unknown): number | undefined {
  const v = numberIn(ROUND_TIME_SETTING.min, ROUND_TIME_SETTING.max)(raw);
  return v !== undefined && (v - ROUND_TIME_SETTING.min) % ROUND_TIME_SETTING.step === 0 ? v : undefined;
}

export function loadMode(): MatchMode {
  return loadChoice('mode', MATCH_MODES, DEFAULT_MODE);
}

/** The crouch key's behaviour (toggle or hold). */
export function loadCrouchMode(): CrouchMode {
  return loadChoice('crouch', CROUCH_MODES, DEFAULT_CROUCH_MODE);
}

/** The aim button's behaviour (hold or toggle). */
export function loadAimMode(): HoldMode {
  return loadChoice('aimMode', AIM_MODES, DEFAULT_AIM_MODE);
}

/** The sprint key's behaviour (hold or toggle). */
export function loadSprintMode(): HoldMode {
  return loadChoice('sprintMode', SPRINT_MODES, DEFAULT_SPRINT_MODE);
}

/** How the order wheel gives an order (M23): hover by default. */
export function loadWheelSelect(): WheelSelect {
  return loadChoice('orderWheel', WHEEL_SELECT_MODES, DEFAULT_WHEEL_SELECT);
}

/** Invert mouse: off unless the player turned it on. */
export function loadInvertMouse(): boolean {
  return loadChoice('invertMouse', INVERT_MOUSE, 'off') === 'on';
}

/** The mouse's DPI as the player entered it, for the cm/360 figure. */
export function loadMouseDpi(): number {
  return loadSetting('mouseDpi', numberIn(MOUSE_DPI.min, MOUSE_DPI.max), MOUSE_DPI.default);
}

/** The map picked on New game. */
export function loadMap(): MapId {
  return loadChoice('map', MAPS, DEFAULT_MAP);
}

/**
 * Each map's Day or Night pick (M34d), saved as `lighting.<map id>`: only for maps that offer more than one preset and
 * only a preset the map offers; a map without a saved pick plays its first (MapData.lighting). A dev map whose data
 * isn't loaded yet (M50) keeps any preset saved for it: lightingPicked checks it against the map once it is.
 */
export function loadLightingPicks(storage = browserStorage()): Partial<Record<MapId, LightingPresetId>> {
  const picks: Partial<Record<MapId, LightingPresetId>> = {};
  for (const m of MAPS) {
    const offered = mapLoaded(m.id) ? lightingChoices(mapData(m.id)) : null;
    if (offered && offered.length < 2) continue;
    const pick = loadSetting(`lighting.${m.id}`, parseLightingPick, undefined, storage);
    if (pick !== undefined && (!offered || offered.includes(pick))) picks[m.id] = pick;
  }
  return picks;
}

/** The field of view (horizontal degrees on a 16:9 screen). */
export function loadFov(): number {
  return loadSetting('fov', numberIn(FOV_SETTING.min, FOV_SETTING.max), RENDER.horizontalFov16x9);
}

/**
 * The render quality picked on Settings → Graphics → Quality (M14): a preset or 'custom', or null if none has been
 * saved: then the game picks one for the visit (config/render.ts startingQuality).
 */
export function loadSavedQuality(storage = browserStorage()): QualityChoice | null {
  return loadSetting<QualityChoice | null>('quality', oneOf(QUALITY_CHOICES.map((q) => q.id)), null, storage);
}

/**
 * The Custom rows as saved (`graphics.<field>`, config/graphics.ts): only the fields saved with a value their row
 * offers; config/render.ts resolveQuality fills the rest from High.
 */
export function loadCustomQuality(storage = browserStorage()): Partial<QualitySettings> {
  const custom: Record<string, unknown> = {};
  for (const row of GRAPHICS_ROWS) {
    const v = loadSetting(graphicsKey(row.field), (raw) => parseStored(row, raw), undefined, storage);
    if (v !== undefined) custom[row.field] = v;
  }
  return custom as Partial<QualitySettings>;
}

/**
 * The frame-rate choice (Settings → Graphics; 0 = Unlimited, the default). Every id an earlier build saved reads back as
 * itself, any other number as the nearest choice (G5, config/graphics.ts frameRateCapFromSaved).
 */
export function loadFrameRateCap(storage = browserStorage()): FrameRateCap {
  return loadSetting('frameRateCap', frameRateCapFromSaved, 0, storage);
}

/** Tone mapping (Settings → Graphics; F2): Neutral unless the player picked another (owner decision). */
export function loadToneMapping(): ToneMappingId {
  return loadChoice('toneMapping', TONE_MAPPING_CHOICES, TONE_MAPPING.default);
}

/** The FPS readout (Settings → Graphics): off unless the player turned it on. */
export function loadShowFps(): boolean {
  return loadChoice('showFps', SHOW_FPS_CHOICES, 'off') === 'on';
}

export function loadSensitivity(): number {
  return loadSetting('sensitivity', numberIn(MOUSE.minSensitivity, MOUSE.maxSensitivity), MOUSE.defaultSensitivity);
}

/** Mouse sensitivity while aiming, as a multiple of the normal one. */
export function loadAimSensitivity(): number {
  return loadSetting('aimSensitivity', numberIn(AIMING.minSensitivity, AIMING.maxSensitivity), AIMING.defaultSensitivity);
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
export function loadTeamColours(): TeamColourSetId {
  return loadChoice('teamColours', TEAM_COLOUR_CHOICES, DEFAULT_TEAM_COLOURS);
}

/** Settings › Look (G1): robots mixed in with humans (on unless turned off) and Realistic colours (off unless turned on). */
export function loadLook(): LookSettings {
  return {
    robots: loadChoice('robots', ROBOT_CHOICES, DEFAULT_ROBOTS ? 'on' : 'off') === 'on',
    realisticColours: loadChoice('realisticColours', REALISTIC_COLOUR_CHOICES, DEFAULT_REALISTIC_COLOURS ? 'on' : 'off') === 'on',
  };
}

/** On-screen sound cues (Settings → Accessibility, M18b): off unless the player turned them on. */
export function loadSoundCues(): boolean {
  return loadChoice('soundCues', SOUND_CUE_CHOICES, 'off') === 'on';
}

/** Whether the tutorial was played to the end (M16). */
export function loadTutorialDone(): boolean {
  return loadSetting('tutorialDone', (raw) => (typeof raw === 'boolean' ? raw : undefined), false);
}

/**
 * Whether a first match was started (M100; saved as `matchStarted`, false on a clean save): the title offers the Tutorial
 * only before that. A save from before the flag counts as started when it already holds records, so a returning player
 * isn't pointed at the tutorial again.
 */
export function loadMatchStarted(storage = browserStorage()): boolean {
  if (loadSetting('matchStarted', (raw) => (typeof raw === 'boolean' ? raw : undefined), false, storage)) return true;
  try {
    return storage?.getItem(RECORDS_KEY) != null;
  } catch {
    return false;
  }
}

/**
 * The tutorial's step to resume at (audit POOL-14): its id ('' or nothing saved: from the beginning). A step index
 * saved by the first build of this (a number) is still read, as an index.
 */
export function loadTutorialStep(): string | number {
  return loadSetting<string | number>('tutorialStep', (raw) => (typeof raw === 'string' || (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) ? raw : undefined), '');
}

/** The sound cues' size (Settings → Accessibility, M24): a scale, 1 = as before. */
export function loadSoundCueSize(): number {
  return loadSetting('soundCueSize', numberIn(SOUND_CUE_SIZE.min, SOUND_CUE_SIZE.max), SOUND_CUE_SIZE.default);
}

/** The sound cues' colour (Settings → Accessibility, M24). */
export function loadSoundCueColour(): SoundCueColour {
  return loadChoice('soundCueColour', SOUND_CUE_COLOURS, DEFAULT_SOUND_CUE_COLOUR);
}

/** The scoreboard's size as picked (Settings → HUD, M24): a scale, 1 = its size before M24. */
export function loadScoreboardSize(): number {
  return loadSetting('scoreboardSize', numberIn(SCOREBOARD_SIZE.min, SCOREBOARD_SIZE.max), SCOREBOARD_SIZE.default);
}

/** Whether the hit feed's lines fade or stay (Settings → HUD, M24). */
export function loadHitFeedMode(): HitFeedMode {
  return loadChoice('hitFeed', HIT_FEED_MODES, DEFAULT_HIT_FEED_MODE);
}

/** Whether the "what got you" card shows after a hit (Settings → HUD, M41): Auto (against Pro), On or Off. */
export function loadWhatGotYouMode(): WhatGotYouMode {
  return loadChoice('whatGotYou', WHAT_GOT_YOU_MODES, DEFAULT_WHAT_GOT_YOU_MODE);
}

/** The HUD's size as picked (Settings → HUD, audit UI-04): a scale, 1 = sized for the screen. */
export function loadHudSize(): number {
  return loadSetting('hudSize', numberIn(HUD_SIZE.min, HUD_SIZE.max), HUD_SIZE.default);
}

/**
 * How opaque the HUD's panels are (Settings → HUD, G4): 0.5 to 1. A save from before it, or one holding anything else
 * (out of range, not a number), reads as the default.
 */
export function loadHudOpacity(storage = browserStorage()): number {
  return loadSetting('hudOpacity', numberIn(HUD_OPACITY.min, HUD_OPACITY.max), HUD_OPACITY.default, storage);
}

/** Raw mouse input (Settings → Controls, audit UI-20): on unless the player turned it off. */
export function loadRawInput(): boolean {
  return loadChoice('rawInput', RAW_INPUT, DEFAULT_RAW_INPUT) === 'on';
}
