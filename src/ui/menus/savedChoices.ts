import { DEFAULT_DIFFICULTY, DIFFICULTIES, type Difficulty } from '../../config/bots';
import { CROUCH_MODES, type CrouchMode, DEFAULT_CROUCH_MODE, MOUSE } from '../../config/controls';
import { DEFAULT_MODE, MATCH_MODES, type MatchMode } from '../../config/modes';
import { AIMING, DEFAULT_OPTIC, OPTIC_CHOICES, type OpticChoice } from '../../config/optics';
import { DEFAULT_QUALITY, QUALITY_CHOICES, type QualityPreset } from '../../config/render';
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

/** The optic for the replica with a rail (the rifle). */
export function loadOptic(): OpticChoice {
  return loadChoice('optic', OPTIC_CHOICES, DEFAULT_OPTIC);
}

/** The render quality preset picked on the Settings screen (a `?quality=` in the address wins for that visit). */
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
