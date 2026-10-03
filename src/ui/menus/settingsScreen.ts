import { CROUCH_MODES, type CrouchMode, MOUSE } from '../../config/controls';
import { SETTINGS_LATER, SETTINGS_TABS, type SettingsTab } from '../../config/menus';
import { AIMING } from '../../config/optics';
import { FOV_SETTING, QUALITY_LABELS, type QualityPreset } from '../../config/render';
import type { KeyBindings } from '../../input/keyBindings';
import { type AudioSettingsOptions, audioSettings } from '../audioSettings';
import { KeySettings } from '../keySettings';
import { OptionPicker } from '../optionPicker';
import type { SettingsOrigin } from './menuNav';
import { backButton, el, laterRow, laterTag, menuPage, menuRow, rangeControl } from './menuParts';

export interface SettingsOptions {
  bindings: KeyBindings;
  sensitivity: { initial: number; onChange: (v: number) => void };
  aimSensitivity: { initial: number; onChange: (v: number) => void };
  crouch: { initial: CrouchMode; onChange: (m: CrouchMode) => void };
  /** Field of view (horizontal degrees on a 16:9 screen), applied at once. */
  fov: { initial: number; onChange: (v: number) => void };
  /** The render preset in use: the Quality picker is held back (LATER), so its row only shows this. */
  quality: QualityPreset;
  /** The volume sliders on the Audio tab (ui/audioSettings.ts). */
  audio: AudioSettingsOptions;
  onBack: () => void;
}

/**
 * The Settings screen: tabs down the left (Controls, Key bindings, Graphics, Audio, and Accessibility, which is still
 * to come), the picked tab's settings on the right. Everything saves as it changes. Reached from New game and from the
 * pause menu; Back returns to whichever opened it.
 */
export class SettingsScreen {
  readonly root: HTMLDivElement;
  private readonly tabs = new Map<SettingsTab, { button: HTMLButtonElement; panel: HTMLDivElement }>();
  private readonly keySettings: KeySettings;
  private tab: SettingsTab = 'controls';
  private origin: SettingsOrigin = 'setup';

  constructor(opts: SettingsOptions) {
    const page = menuPage('menu-settings', 'Settings');
    this.root = page.root;
    this.keySettings = new KeySettings(opts.bindings);

    const tabList = el('div', 'settings-tabs');
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', 'Settings sections');
    const panels = el('div', 'menu-panel settings-panel');
    for (const { id, label, later } of SETTINGS_TABS) {
      const button = el('button', 'settings-tab');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.append(el('span', '', label));
      if (later) button.append(laterTag());
      button.addEventListener('click', () => this.showTab(id));
      if (id === 'controls') button.dataset.autofocus = '';
      const panel = el('div', 'settings-tab-panel');
      panel.setAttribute('role', 'tabpanel');
      panel.append(el('h2', 'menu-panel-title', label));
      this.fillTab(id, panel, opts);
      for (const item of SETTINGS_LATER[id]) panel.append(laterRow(item.label, item.help));
      tabList.append(button);
      panels.append(panel);
      this.tabs.set(id, { button, panel });
    }
    const columns = el('div', 'settings-columns');
    columns.append(tabList, panels);
    page.body.append(columns);
    page.footer.append(backButton(opts.onBack), el('p', 'menu-footer-note', 'Changes save as you make them.'));
    this.showTab('controls');
  }

  /** Called as the screen opens: remembers where Back returns to. */
  openFrom(origin: SettingsOrigin): void {
    this.origin = origin;
    this.keySettings.setVisible(this.tab === 'keys');
  }

  get openedFrom(): SettingsOrigin {
    return this.origin;
  }

  /** Stops waiting for a key press when the screen closes. */
  closed(): void {
    this.keySettings.setVisible(false);
  }

  dispose(): void {
    this.keySettings.dispose();
  }

  private showTab(id: SettingsTab): void {
    this.tab = id;
    for (const [tab, { button, panel }] of this.tabs) {
      const on = tab === id;
      button.classList.toggle('selected', on);
      button.setAttribute('aria-selected', String(on));
      panel.hidden = !on;
    }
    this.keySettings.setVisible(id === 'keys');
  }

  private fillTab(id: SettingsTab, panel: HTMLDivElement, opts: SettingsOptions): void {
    if (id === 'controls') {
      panel.append(
        menuRow(
          'Mouse sensitivity',
          '',
          rangeControl(
            'Mouse sensitivity',
            { min: MOUSE.minSensitivity, max: MOUSE.maxSensitivity, step: MOUSE.sensitivityStep },
            opts.sensitivity.initial,
            (v) => v.toFixed(2),
            'sensitivity',
            opts.sensitivity.onChange,
          ),
        ),
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
        menuRow('Crouch key', '', new OptionPicker('Crouch key', CROUCH_MODES, opts.crouch.initial, 'crouch', opts.crouch.onChange).root),
      );
    } else if (id === 'keys') {
      const mouse = el('p', 'menu-readout settings-mouse');
      mouse.innerHTML =
        '<kbd>Left mouse</kbd> fire · <kbd>Right mouse</kbd> aim (hold, needs an optic) · <kbd>Wheel</kbd> switch · ' +
        '<kbd>Esc</kbd> pause · <kbd>`</kbd> / <kbd>F3</kbd> debug info';
      panel.append(this.keySettings.root, mouse);
    } else if (id === 'graphics') {
      panel.append(
        menuRow(
          'Field of view',
          'How wide you see, across a 16:9 screen. Aiming through an optic zooms in from it.',
          rangeControl('Field of view', FOV_SETTING, opts.fov.initial, (v) => `${Math.round(v)}°`, 'fov', opts.fov.onChange),
        ),
        // Held back until there is real graphics work to scale (owner, 2026-10-03): the game runs on High.
        laterRow('Quality', 'Comes back with the art pass.', QUALITY_LABELS[opts.quality]),
      );
    } else if (id === 'audio') {
      panel.append(...audioSettings(opts.audio));
    }
  }

}
