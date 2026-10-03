import { REDUCED_MOTION_CHOICES } from '../../config/accessibility';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, type Difficulty } from '../../config/bots';
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
import { DEFAULT_MODE, MATCH_MODES, type MatchMode } from '../../config/modes';
import { AIMING, DEFAULT_OPTIC, OPTIC_CHOICES, type OpticChoice } from '../../config/optics';
import { FOV_SETTING, RENDER } from '../../config/render';
import { DEFAULT_MAP, MAPS, type MapId } from '../../map/maps';
import { loadSetting, numberIn } from '../../settings/storage';
import { loadChoice } from '../optionPicker';

/** The choices the menus save in the browser, each read back here with its default. */

export function loadDifficulty(): Difficulty {
  return loadChoice('difficulty', DIFFICULTIES, DEFAULT_DIFFICULTY);
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
