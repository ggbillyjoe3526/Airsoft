import {
  DEFAULT_SOUND_CUE_COLOUR,
  REDUCED_MOTION_CHOICES,
  SOUND_CUE_CHOICES,
  SOUND_CUE_COLOURS,
  SOUND_CUE_SIZE,
  type SoundCueColour,
} from '../../config/accessibility';
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
  FRIENDLY_FIRE_CHOICES,
  type MatchRules,
  RICOCHETS_COUNT_CHOICES,
  ROUND_TIME_SETTING,
  TEAM_SIZE_CHOICES,
  WINS_NEEDED_CHOICES,
} from '../../config/matchRules';
import { DEFAULT_HIT_FEED_MODE, HIT_FEED_MODES, type HitFeedMode, HUD_SIZE, SCOREBOARD_SIZE } from '../../config/matchInfo';
import { DEFAULT_MODE, MATCH_MODES, type MatchMode } from '../../config/modes';
import { AIMING } from '../../config/optics';
import { FOV_SETTING, QUALITY_CHOICES, type QualityPreset, RENDER } from '../../config/render';
import { DEFAULT_WHEEL_SELECT, WHEEL_SELECT_MODES, type WheelSelect } from '../../config/squad';
import { DEFAULT_TEAM_COLOURS, TEAM_COLOUR_CHOICES, type TeamColourSetId } from '../../config/teams';
import { DEFAULT_MAP, MAPS, type MapId } from '../../map/maps';
import { loadSetting, numberIn, oneOf } from '../../settings/storage';
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

/** The Match pop-up's rules (M20), each with its default. */
export function loadMatchRules(): MatchRules {
  const d = DEFAULT_MATCH_RULES;
  return {
    winsNeeded: Number(loadChoice('winsNeeded', WINS_NEEDED_CHOICES, String(d.winsNeeded))),
    roundTime: loadSetting('roundTime', roundTimeIn, d.roundTime),
    teamSize: Number(loadChoice('teamSize', TEAM_SIZE_CHOICES, String(d.teamSize))),
    friendlyFire: loadChoice('friendlyFire', FRIENDLY_FIRE_CHOICES, d.friendlyFire ? 'on' : 'off') === 'on',
    ricochetsCount: loadChoice('ricochets', RICOCHETS_COUNT_CHOICES, d.ricochetsCount ? 'on' : 'off') === 'on',
  };
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

/** The field of view (horizontal degrees on a 16:9 screen). */
export function loadFov(): number {
  return loadSetting('fov', numberIn(FOV_SETTING.min, FOV_SETTING.max), RENDER.horizontalFov16x9);
}

/**
 * The render quality preset picked on Settings → Graphics → Quality (M14), or null if none has been saved: then the
 * game picks one for the visit (config/render.ts startingQuality).
 */
export function loadSavedQuality(): QualityPreset | null {
  return loadSetting<QualityPreset | null>('quality', oneOf(QUALITY_CHOICES.map((q) => q.id)), null);
}

export function loadSensitivity(): number {
  return loadSetting('sensitivity', numberIn(MOUSE.minSensitivity, MOUSE.maxSensitivity), MOUSE.defaultSensitivity);
}

/** Mouse sensitivity while aiming, as a multiple of the normal one. */
export function loadAimSensitivity(): number {
  return loadSetting('aimSensitivity', numberIn(AIMING.minSensitivity, AIMING.maxSensitivity), AIMING.defaultSensitivity);
}

/**
 * Reduced motion (Settings → Accessibility). Until the player picks, it follows the system's "reduce motion" setting
 * (prefers-reduced-motion), which the browser reports.
 */
export function loadReducedMotion(): boolean {
  let systemWants = false;
  try {
    systemWants = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    // No media queries (tests): off.
  }
  return loadChoice('reducedMotion', REDUCED_MOTION_CHOICES, systemWants ? 'on' : 'off') === 'on';
}

/** The team colour set (Settings → Accessibility, M18b). */
export function loadTeamColours(): TeamColourSetId {
  return loadChoice('teamColours', TEAM_COLOUR_CHOICES, DEFAULT_TEAM_COLOURS);
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

/** The HUD's size as picked (Settings → HUD, audit UI-04): a scale, 1 = sized for the screen. */
export function loadHudSize(): number {
  return loadSetting('hudSize', numberIn(HUD_SIZE.min, HUD_SIZE.max), HUD_SIZE.default);
}

/** Raw mouse input (Settings → Controls, audit UI-20): on unless the player turned it off. */
export function loadRawInput(): boolean {
  return loadChoice('rawInput', RAW_INPUT, DEFAULT_RAW_INPUT) === 'on';
}
