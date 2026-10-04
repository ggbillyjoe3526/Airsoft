import { REDUCED_MOTION_CHOICES, SOUND_CUE_CHOICES } from '../../config/accessibility';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, type Difficulty, TEAMMATE_DIFFICULTIES } from '../../config/bots';
import {
  AIM_MODES,
  CROUCH_MODES,
  type CrouchMode,
  DEFAULT_AIM_MODE,
  DEFAULT_CROUCH_MODE,
  DEFAULT_SPRINT_MODE,
  type HoldMode,
  INVERT_MOUSE,
  MOUSE,
  MOUSE_DPI,
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
import { DEFAULT_MODE, MATCH_MODES, type MatchMode } from '../../config/modes';
import { AIMING, DEFAULT_OPTIC, OPTIC_CHOICES, type OpticChoice } from '../../config/optics';
import { DEFAULT_QUALITY, FOV_SETTING, QUALITY_CHOICES, type QualityPreset, RENDER } from '../../config/render';
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
 * Your bot teammates' difficulty (M20). Until one is saved it is the opponents' (`opponents`, the saved `difficulty`):
 * before M20 every bot played at that one level, so a returning player's teammates stay as they were and their
 * standard matches still count for the records.
 */
export function loadTeammateDifficulty(opponents: Difficulty = loadDifficulty()): Difficulty {
  return loadChoice('teammateDifficulty', TEAMMATE_DIFFICULTIES, opponents);
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

/** Invert mouse: off unless the player turned it on. */
export function loadInvertMouse(): boolean {
  return loadChoice('invertMouse', INVERT_MOUSE, 'off') === 'on';
}

/** The mouse's DPI as the player entered it, for the cm/360 figure. */
export function loadMouseDpi(): number {
  return loadSetting('mouseDpi', numberIn(MOUSE_DPI.min, MOUSE_DPI.max), MOUSE_DPI.default);
}

/** The optic for the replica with a rail (the rifle). */
export function loadOptic(): OpticChoice {
  return loadChoice('optic', OPTIC_CHOICES, DEFAULT_OPTIC);
}

/** The map picked on New game. */
export function loadMap(): MapId {
  return loadChoice('map', MAPS, DEFAULT_MAP);
}

/** The field of view (horizontal degrees on a 16:9 screen). */
export function loadFov(): number {
  return loadSetting('fov', numberIn(FOV_SETTING.min, FOV_SETTING.max), RENDER.horizontalFov16x9);
}

/** The render quality preset (Settings → Graphics → Quality, M14). */
export function loadQuality(): QualityPreset {
  return loadChoice('quality', QUALITY_CHOICES, DEFAULT_QUALITY);
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
