import { AIM_MODES, CROUCH_MODES, type CrouchMode, type HoldMode, INVERT_MOUSE, MOUSE, MOUSE_DPI, OTHER_SHOOTERS, SPRINT_MODES } from '../config/controls';
import { AIMING } from '../config/optics';
import { cmPer360, sameSensitivityAs, sensitivityForCm } from '../input/sensitivity';
import { saveSetting } from '../settings/storage';
import { el, menuRow, rangeControl } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

export interface ControlsSettingsOptions {
  sensitivity: { initial: number; onChange: (v: number) => void };
  aimSensitivity: { initial: number; onChange: (v: number) => void };
  /** The mouse's DPI as the player entered it (only used for the cm/360 figure). */
  dpi: { initial: number };
  invertMouse: { initial: boolean; onChange: (on: boolean) => void };
  crouch: { initial: CrouchMode; onChange: (m: CrouchMode) => void };
  aim: { initial: HoldMode; onChange: (m: HoldMode) => void };
  sprint: { initial: HoldMode; onChange: (m: HoldMode) => void };
}

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

/** A number box that commits on Enter or leaving it (not on every key, so typing "25" never passes through "2"). */
function numberBox(label: string, range: { min: number; max: number; step: number | 'any' }, value: string, onCommit: (v: number) => void): HTMLInputElement {
  const box = el('input', 'menu-number');
  box.type = 'number';
  box.min = String(range.min);
  box.max = String(range.max);
  box.step = String(range.step);
  box.value = value;
  box.setAttribute('aria-label', label);
  box.addEventListener('change', () => {
    const v = Number(box.value);
    if (box.value.trim() !== '' && Number.isFinite(v)) onCommit(v);
  });
  return box;
}

/**
 * The Controls tab's rows (Settings → Controls; M18 for everything after the sensitivity sliders): the mouse sensitivity
 * and its cm/360 (typed in to match another shooter, worked out from the mouse's DPI), the aiming sensitivity, invert
 * mouse, and hold or toggle for crouch, aim and sprint. Each saves and applies as it changes.
 */
export function controlsSettings(opts: ControlsSettingsOptions): HTMLDivElement[] {
  let sensitivity = opts.sensitivity.initial;
  let dpi = opts.dpi.initial;

  const slider = rangeControl(
    'Mouse sensitivity',
    { min: MOUSE.minSensitivity, max: MOUSE.maxSensitivity, step: MOUSE.sensitivityStep },
    sensitivity,
    (v) => v.toFixed(2),
    'sensitivity',
    (v) => setSensitivity(v, false),
  );
  const sliderInput = slider.querySelector('input')!;
  const sliderOutput = slider.querySelector('output')!;

  const cm = numberBox('Turn distance, cm per 360°', { min: 1, max: 1000, step: 'any' }, '', (v) => {
    const fromCm = clamp(sensitivityForCm(v, dpi), MOUSE.minSensitivity, MOUSE.maxSensitivity);
    saveSetting('sensitivity', fromCm);
    setSensitivity(fromCm, true);
  });
  const dpiBox = numberBox('Mouse DPI', MOUSE_DPI, String(dpi), (v) => {
    dpi = clamp(Math.round(v), MOUSE_DPI.min, MOUSE_DPI.max);
    saveSetting('mouseDpi', dpi);
    refreshTurn();
  });
  const turn = el('div', 'menu-row-control menu-turn');
  turn.append(cm, el('span', '', 'cm at'), dpiBox, el('span', '', 'DPI'));
  const turnRow = menuRow('Turn distance (cm/360)', '', turn);
  const sameAs = el('span', 'menu-row-help');
  turnRow.querySelector('.menu-row-name')!.append(sameAs);

  /** The sensitivity changed: from the slider (already showing it) or from a typed cm/360 (`moveSlider`). */
  function setSensitivity(v: number, moveSlider: boolean): void {
    sensitivity = v;
    if (moveSlider) {
      sliderInput.value = String(v);
      sliderOutput.textContent = v.toFixed(2);
    }
    opts.sensitivity.onChange(v);
    refreshTurn();
  }

  function refreshTurn(): void {
    cm.value = cmPer360(sensitivity, dpi).toFixed(1);
    dpiBox.value = String(dpi);
    sameAs.textContent = `Type another shooter's cm/360 to match it, or use: ${OTHER_SHOOTERS.map((g) => `${g.name} ${sameSensitivityAs(sensitivity, g.degreesPerCount).toFixed(2)}`).join(' · ')}.`;
  }
  refreshTurn();

  return [
    menuRow('Mouse sensitivity', '', slider),
    turnRow,
    // A multiple of the mouse sensitivity, so it follows when that changes.
    menuRow(
      'Aiming sensitivity',
      'While aiming through an optic.',
      rangeControl(
        'Aiming sensitivity',
        { min: AIMING.minSensitivity, max: AIMING.maxSensitivity, step: AIMING.sensitivityStep },
        opts.aimSensitivity.initial,
        (v) => `×${v.toFixed(2)}`,
        'aimSensitivity',
        opts.aimSensitivity.onChange,
      ),
    ),
    menuRow(
      'Invert mouse',
      '',
      new OptionPicker('Invert mouse', INVERT_MOUSE, opts.invertMouse.initial ? 'on' : 'off', 'invertMouse', (v) => opts.invertMouse.onChange(v === 'on')).root,
    ),
    menuRow('Crouch key', '', new OptionPicker('Crouch key', CROUCH_MODES, opts.crouch.initial, 'crouch', opts.crouch.onChange).root),
    menuRow('Aim button', '', new OptionPicker('Aim button', AIM_MODES, opts.aim.initial, 'aimMode', opts.aim.onChange).root),
    menuRow('Sprint key', '', new OptionPicker('Sprint key', SPRINT_MODES, opts.sprint.initial, 'sprintMode', opts.sprint.onChange).root),
  ];
}
