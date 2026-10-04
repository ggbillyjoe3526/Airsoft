import { SETTINGS_LATER, SETTINGS_TABS, type SettingsTab } from '../../config/menus';
import { FOV_SETTING, QUALITY_CHOICES, type QualityPreset } from '../../config/render';
import type { KeyBindings } from '../../input/keyBindings';
import { type AccessibilitySettingsOptions, accessibilitySettings } from '../accessibilitySettings';
import { type AudioSettingsOptions, audioSettings } from '../audioSettings';
import { type ControlsSettingsOptions, controlsSettings } from '../controlsSettings';
import { type CrosshairSettingsOptions, crosshairSettings } from '../crosshairSettings';
import { isFullscreen, onFullscreenChange, toggleFullscreen } from '../fullscreen';
import { KeySettings } from '../keySettings';
import { OptionPicker } from '../optionPicker';
import type { SettingsOrigin } from './menuNav';
import { backButton, el, laterRow, laterTag, menuPage, menuRow, rangeControl } from './menuParts';

export interface SettingsOptions {
  bindings: KeyBindings;
  /** The mouse and the stance keys on the Controls tab (ui/controlsSettings.ts). */
  controls: ControlsSettingsOptions;
  /** Field of view (horizontal degrees on a 16:9 screen), applied at once. */
  fov: { initial: number; onChange: (v: number) => void };
  /** The render quality preset (M14): saved, and applied at once (antialiasing from the next load). */
  quality: { initial: QualityPreset; onChange: (q: QualityPreset) => void };
  /** The volume sliders on the Audio tab (ui/audioSettings.ts). */
  audio: AudioSettingsOptions;
  /** The crosshair's look on the Crosshair tab (ui/crosshairSettings.ts). */
  crosshair: CrosshairSettingsOptions;
  /** The Accessibility tab (ui/accessibilitySettings.ts). */
  accessibility: AccessibilitySettingsOptions;
  onBack: () => void;
}

/**
 * The Settings screen: tabs down the left (Controls, Key bindings, Graphics, Crosshair, Audio, Accessibility), the
 * picked tab's settings on the right. Everything saves as it changes. Reached from New game and from the
 * pause menu; Back returns to whichever opened it.
 */
export class SettingsScreen {
  readonly root: HTMLDivElement;
  private readonly tabs = new Map<SettingsTab, { button: HTMLButtonElement; panel: HTMLDivElement }>();
  private readonly keySettings: KeySettings;
  private tab: SettingsTab = 'controls';
  private origin: SettingsOrigin = 'setup';
  /** Stops the Fullscreen button following the page's fullscreen state. */
  private unwatchFullscreen: () => void = () => undefined;

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
    this.unwatchFullscreen();
  }

  /** One button that enters or leaves fullscreen, saying which it will do. */
  private fullscreenButton(): HTMLButtonElement {
    const button = el('button', 'picker-button settings-fullscreen');
    button.type = 'button';
    const show = (on: boolean): void => {
      button.textContent = on ? 'Leave fullscreen' : 'Go fullscreen';
      button.setAttribute('aria-pressed', String(on));
    };
    show(isFullscreen());
    button.addEventListener('click', toggleFullscreen);
    this.unwatchFullscreen = onFullscreenChange(show);
    return button;
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
      panel.append(...controlsSettings(opts.controls));
    } else if (id === 'keys') {
      const mouse = el('p', 'menu-readout settings-mouse');
      mouse.innerHTML = '<kbd>Wheel</kbd> switch replica · <kbd>Esc</kbd> pause · <kbd>`</kbd> / <kbd>F3</kbd> debug info';
      panel.append(this.keySettings.root, mouse);
    } else if (id === 'graphics') {
      panel.append(
        menuRow(
          'Field of view',
          'How wide you see, across a 16:9 screen. Aiming through an optic zooms in from it.',
          rangeControl('Field of view', FOV_SETTING, opts.fov.initial, (v) => `${Math.round(v)}°`, 'fov', opts.fov.onChange),
        ),
        menuRow(
          'Quality',
          'Shadows, sharpness, surface relief and dust in the sunlight. Lower it if the game stutters.',
          new OptionPicker('Quality', QUALITY_CHOICES, opts.quality.initial, 'quality', opts.quality.onChange).root,
        ),
        menuRow('Fullscreen', 'The whole screen for the game. Esc leaves it; in a match the Fullscreen key (Key bindings) turns it on and off.', this.fullscreenButton()),
      );
    } else if (id === 'crosshair') {
      panel.append(...crosshairSettings(opts.crosshair));
    } else if (id === 'audio') {
      panel.append(...audioSettings(opts.audio));
    } else if (id === 'accessibility') {
      panel.append(...accessibilitySettings(opts.accessibility));
    }
  }

}
