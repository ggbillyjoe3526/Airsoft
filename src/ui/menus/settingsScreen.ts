import { CROUCH_MODES, type CrouchMode, MOUSE } from '../../config/controls';
import { SETTINGS_LATER, SETTINGS_TABS, type SettingsTab } from '../../config/menus';
import { AIMING } from '../../config/optics';
import { QUALITY_CHOICES, type QualityPreset } from '../../config/render';
import type { KeyBindings } from '../../input/keyBindings';
import { type AudioSettingsOptions, audioSettings } from '../audioSettings';
import { KeySettings } from '../keySettings';
import { OptionPicker } from '../optionPicker';
import type { SettingsOrigin } from './menuNav';
import { backButton, el, laterRow, laterTag, menuButton, menuPage, menuRow, rangeControl } from './menuParts';

export interface SettingsOptions {
  bindings: KeyBindings;
  sensitivity: { initial: number; onChange: (v: number) => void };
  aimSensitivity: { initial: number; onChange: (v: number) => void };
  crouch: { initial: CrouchMode; onChange: (m: CrouchMode) => void };
  /** The preset the game loaded with, and the one saved for next time. */
  quality: { inUse: QualityPreset; saved: QualityPreset; onReload: () => void };
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
  private readonly reloadRow: HTMLDivElement;
  private readonly qualityNote: HTMLParagraphElement;
  private readonly qualityInUse: QualityPreset;
  private qualitySaved: QualityPreset;
  private tab: SettingsTab = 'controls';
  private origin: SettingsOrigin = 'setup';

  constructor(opts: SettingsOptions) {
    const page = menuPage('menu-settings', 'Settings');
    this.root = page.root;
    this.qualityInUse = opts.quality.inUse;
    this.qualitySaved = opts.quality.saved;
    this.keySettings = new KeySettings(opts.bindings);
    this.qualityNote = el('p', 'menu-readout');
    this.reloadRow = el('div', 'settings-reload');
    this.reloadRow.append(this.qualityNote, menuButton('Reload now', 'secondary', opts.quality.onReload));

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

  /** Called as the screen opens: remembers where Back returns to (and so whether a reload would cut a match short). */
  openFrom(origin: SettingsOrigin): void {
    this.origin = origin;
    this.refreshQuality();
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
      const picker = new OptionPicker('Quality', QUALITY_CHOICES, this.qualitySaved, 'quality', (q) => {
        this.qualitySaved = q;
        this.refreshQuality();
      });
      panel.append(menuRow('Quality', 'Lower is smoother on weaker computers.', picker.root), this.reloadRow);
    } else if (id === 'audio') {
      panel.append(...audioSettings(opts.audio));
    }
  }

  /**
   * The quality applies when the game loads (smoothing needs a fresh WebGL context). While the saved preset differs
   * from the one in use, say so, and offer a reload unless a match is in progress (opened from the pause menu).
   */
  private refreshQuality(): void {
    const pending = this.qualitySaved !== this.qualityInUse;
    this.reloadRow.hidden = !pending;
    const reload = this.reloadRow.querySelector('button');
    if (reload) reload.hidden = this.origin === 'pause';
    this.qualityNote.textContent =
      this.origin === 'pause' ? 'Applies the next time the game loads.' : 'Applies when the game reloads (a second or two).';
  }
}
