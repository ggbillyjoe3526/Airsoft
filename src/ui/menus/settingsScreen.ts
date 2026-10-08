import { devIntro } from '../../config/dev';
import { DEV_TOGGLE_LABEL, MENU_TEXT, SETTINGS_LATER, SETTINGS_TABS, SETTINGS_TEXT, type SettingsTab } from '../../config/menus';
import { FOV_SETTING, type QualityChoice, type QualitySettings } from '../../config/render';
import type { KeyBindings } from '../../input/keyBindings';
import { DEV_ENABLED_FIELD } from '../../settings/dev';
import { saveSetting } from '../../settings/storage';
import { type AccessibilitySettingsOptions, accessibilitySettings } from '../accessibilitySettings';
import { type AudioSettingsOptions, audioSettings } from '../audioSettings';
import { type ControlsSettingsOptions, controlsSettings } from '../controlsSettings';
import { type CrosshairSettingsOptions, crosshairSettings } from '../crosshairSettings';
import { type DevSettingsOptions, devSettings } from '../devSettings';
import { isFullscreen, onFullscreenChange, toggleFullscreen } from '../fullscreen';
import { GraphicsSettings, type GraphicsSettingsOptions } from '../graphicsSettings';
import { type HudSettingsOptions, hudSettings } from '../hudSettings';
import { KeySettings } from '../keySettings';
import { type LookSettingsOptions, lookSettings } from '../lookSettings';
import { SaveSettings } from '../saveSettings';
import type { SaveManager } from '../../save/saveManager';
import type { MenuHint } from './chrome';
import { MENU_ICONS, SETTINGS_TAB_ICONS } from './icons';
import { type SettingsOrigin, tabAfterKey } from './menuNav';
import { el, laterRow, menuRow, rangeControl } from './menuParts';

export interface SettingsOptions {
  bindings: KeyBindings;
  /** The mouse and the stance keys on the Controls group (ui/controlsSettings.ts). */
  controls: ControlsSettingsOptions;
  /** Field of view (horizontal degrees on a 16:9 screen), applied at once. */
  fov: { initial: number; onChange: (v: number) => void };
  /** The quality preset or Custom mix, the frame-rate cap, the FPS readout and tone mapping (ui/graphicsSettings.ts). */
  graphics: GraphicsSettingsOptions;
  /** The volume sliders on the Audio group (ui/audioSettings.ts). */
  audio: AudioSettingsOptions;
  /** The crosshair's look, under Gameplay (ui/crosshairSettings.ts). */
  crosshair: CrosshairSettingsOptions;
  /** The Accessibility group (ui/accessibilitySettings.ts). */
  accessibility: AccessibilitySettingsOptions;
  /** The HUD rows, under Gameplay (ui/hudSettings.ts, M24). */
  hud: HudSettingsOptions;
  /** The Look group (ui/lookSettings.ts, G1): robots and Realistic colours. */
  look: LookSettingsOptions;
  /** The hidden Dev group (ui/devSettings.ts, M24): `enabled`, the box under the groups is ticked and the group shown. */
  dev: DevSettingsOptions & { enabled: boolean; onEnabled: (on: boolean) => void };
  /** The save (M31), for the Save group: download, load, restore points. */
  save: SaveManager;
}

/** Whether a setting's words hold every word of a search (any order, any case). Pure. */
export function matchesSearch(text: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = text.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * The Settings screen (G3: William's groups): Graphics, Display, Audio, Controls, Gameplay, Accessibility and Look down
 * the left, then the save and, once the box under them is ticked, Dev; a search box over them finds a setting in any
 * group. The picked group's rows fill the middle, each with a line on what it does; the side panel says more about the
 * row pointed at. Everything saves as it changes. Back returns to whichever screen opened it.
 */
export class SettingsScreen {
  readonly root: HTMLDivElement;
  readonly hints: readonly MenuHint[];
  private readonly tabs = new Map<SettingsTab, { button: HTMLButtonElement; panel: HTMLDivElement }>();
  private readonly keySettings: KeySettings;
  private readonly saveSettings: SaveSettings;
  private readonly search: HTMLInputElement;
  private readonly searchNote: HTMLParagraphElement;
  private readonly panels: HTMLDivElement;
  private readonly about: { title: HTMLHeadingElement; text: HTMLParagraphElement; cost: HTMLParagraphElement };
  private readonly stutters: HTMLElement;
  private tab: SettingsTab = 'graphics';
  private origin: SettingsOrigin = 'setup';
  /** Stops the Fullscreen button following the page's fullscreen state. */
  private unwatchFullscreen: () => void = () => undefined;
  /** The Graphics group's quality rows. */
  private readonly graphics: GraphicsSettings;

  constructor(private readonly opts: SettingsOptions) {
    this.root = el('div', 'menu-screen menu-page menu-settings menu-hub');
    this.root.hidden = true;
    this.keySettings = new KeySettings(opts.bindings);
    this.saveSettings = new SaveSettings(opts.save);
    this.graphics = new GraphicsSettings(opts.graphics);

    // The search box finds a setting in any group (G3); "/" puts the keyboard in it.
    const searchBox = el('label', 'settings-search');
    searchBox.insertAdjacentHTML('afterbegin', MENU_ICONS.search);
    this.search = el('input');
    this.search.type = 'search';
    this.search.placeholder = SETTINGS_TEXT.search;
    this.search.setAttribute('aria-label', SETTINGS_TEXT.search);
    this.search.addEventListener('input', () => this.applySearch());
    // Esc clears a search first; only an empty box lets it through as Back.
    this.search.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || this.search.value === '') return;
      e.preventDefault();
      e.stopPropagation();
      this.search.value = '';
      this.applySearch();
    });
    const slash = el('kbd', '', '/');
    slash.setAttribute('aria-hidden', 'true');
    searchBox.append(this.search, slash);
    this.searchNote = el('p', 'settings-search-note');
    this.searchNote.setAttribute('role', 'status');

    // The WAI-ARIA tabs pattern (audit L-31): only the picked group is in the Tab order; the arrows, Home and End move
    // between groups (each shows its rows as it takes the focus).
    const tabList = el('div', 'settings-tabs');
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', 'Settings groups');
    tabList.setAttribute('aria-orientation', 'vertical');
    tabList.addEventListener('keydown', (e) => this.onTabKey(e));
    this.panels = el('div', 'settings-panels');
    for (const { id, label, blurb, hidden } of SETTINGS_TABS) {
      const button = el('button', `settings-tab settings-tab-${id}`);
      button.type = 'button';
      button.id = `settings-tab-${id}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `settings-panel-${id}`);
      // The group's icon, decoration beside its name; the line under the name is a summary, not part of the name.
      button.insertAdjacentHTML('afterbegin', SETTINGS_TAB_ICONS[id]);
      const words = el('span', 'settings-tab-words');
      const sub = el('span', 'settings-tab-blurb', blurb);
      sub.setAttribute('aria-hidden', 'true');
      words.append(el('span', 'settings-tab-name', label), sub);
      button.append(words);
      button.hidden = hidden === true && !opts.dev.enabled;
      button.addEventListener('click', () => this.showTab(id));
      const panel = el('div', 'settings-tab-panel');
      panel.id = `settings-panel-${id}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      const head = el('div', 'settings-panel-head');
      head.append(el('h2', 'settings-panel-title', label), el('p', 'settings-panel-blurb', blurb));
      panel.append(head);
      this.fillTab(id, panel);
      for (const item of SETTINGS_LATER[id]) panel.append(laterRow(item.label, item.help));
      tabList.append(button);
      this.panels.append(panel);
      this.tabs.set(id, { button, panel });
    }
    const nav = el('div', 'settings-side');
    nav.append(searchBox, this.searchNote, tabList, this.devToggle(opts.dev));

    // The side panel: what the row pointed at (or focused) does, and what it costs.
    const about = el('aside', 'settings-about menu-card');
    about.setAttribute('aria-label', SETTINGS_TEXT.about);
    this.about = { title: el('h3', 'settings-about-title'), text: el('p', 'settings-about-text', SETTINGS_TEXT.aboutHint), cost: el('p', 'settings-about-cost') };
    this.about.cost.hidden = true;
    this.stutters = el('p', 'settings-tip');
    this.stutters.append(el('b', '', SETTINGS_TEXT.stutters), ` ${SETTINGS_TEXT.stuttersTip}`);
    about.append(el('p', 'menu-kicker', SETTINGS_TEXT.about), this.about.title, this.about.text, this.about.cost, this.stutters);
    const follow = (e: Event): void => {
      const row = (e.target as HTMLElement | null)?.closest?.('.menu-row');
      if (row instanceof HTMLElement) this.describe(row);
    };
    this.panels.addEventListener('focusin', follow);
    this.panels.addEventListener('mouseover', follow);

    const columns = el('div', 'settings-columns');
    columns.append(nav, this.panels, about);
    // / jumps to the search box (the box is on the page for the mouse); Esc is Back, handled by the menus.
    this.hints = [{ keys: ['/'], label: MENU_TEXT.hints.search, run: () => this.search.focus(), code: 'Slash' }];
    this.root.append(el('h1', 'menu-heading sr-only', 'Settings'), columns);
    // The Save group's pop-up lives in the page: a dialog inside a hidden panel can't show.
    this.root.append(this.saveSettings.dialog.root);
    this.showTab('graphics');
  }

  /** Called as the screen opens: remembers where Back returns to. */
  openFrom(origin: SettingsOrigin): void {
    this.origin = origin;
    this.keySettings.setVisible(this.tab === 'controls');
    // A save can't be loaded mid-match (owner's default, 2026-10-04).
    this.saveSettings.setInMatch(origin === 'pause');
  }

  get openedFrom(): SettingsOrigin {
    return this.origin;
  }

  /** Shows a quality choice and its settings on the Graphics group without saving them (the game's own step-down). */
  showQuality(choice: QualityChoice, settings: QualitySettings): void {
    this.graphics.show(choice, settings);
  }

  /** Stops waiting for a key press when the screen closes. */
  closed(): void {
    this.keySettings.setVisible(false);
  }

  dispose(): void {
    this.keySettings.dispose();
    this.saveSettings.dispose();
    this.unwatchFullscreen();
  }

  /**
   * The "Dev settings" box under the groups (owner, 2026-10-04: one click to reach them): ticked, the Dev group shows
   * and its settings apply; unticked, it hides and they all go back to normal (kept for next time).
   */
  private devToggle(dev: SettingsOptions['dev']): HTMLLabelElement {
    const label = el('label', 'settings-dev-toggle');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = dev.enabled;
    box.addEventListener('change', () => {
      const tab = this.tabs.get('dev')!;
      tab.button.hidden = !box.checked;
      saveSetting(DEV_ENABLED_FIELD, box.checked);
      dev.onEnabled(box.checked);
      if (box.checked) this.showTab('dev');
      else if (this.tab === 'dev') this.showTab('graphics');
    });
    label.append(box, el('span', 'toggle-track'), el('span', '', DEV_TOGGLE_LABEL));
    return label;
  }

  /** One button that enters or leaves fullscreen, saying which it will do. */
  private fullscreenButton(): HTMLButtonElement {
    const button = el('button', 'picker-button settings-fullscreen');
    button.type = 'button';
    const show = (on: boolean): void => {
      button.textContent = on ? 'Exit Fullscreen' : 'Enter Fullscreen';
      button.setAttribute('aria-pressed', String(on));
    };
    show(isFullscreen());
    button.addEventListener('click', toggleFullscreen);
    this.unwatchFullscreen = onFullscreenChange(show);
    return button;
  }

  private showTab(id: SettingsTab): void {
    this.tab = id;
    for (const [tab, { button }] of this.tabs) {
      const on = tab === id;
      button.classList.toggle('selected', on);
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      // The screen opens with the focus on the picked group.
      if (on) button.dataset.autofocus = '';
      else delete button.dataset.autofocus;
    }
    this.keySettings.setVisible(id === 'controls');
    this.stutters.hidden = id !== 'graphics';
    // "Last saved 5 min ago" is worked out as the group shows.
    if (id === 'save') this.saveSettings.refresh();
    this.applySearch();
  }

  /** Arrow Up / Down, Home and End on the group list move to another group (of those shown) and show it. */
  private onTabKey(e: KeyboardEvent): void {
    const ids = [...this.tabs].filter(([, t]) => !t.button.hidden).map(([id]) => id);
    const next = tabAfterKey(e.key, ids.indexOf(this.tab), ids.length);
    if (next === null) return;
    e.preventDefault();
    const id = ids[next]!;
    this.showTab(id);
    this.tabs.get(id)!.button.focus();
  }

  /**
   * The rows on show: the picked group's, or while something is typed in the search box every group's rows that match
   * it (each group's heading over its matches, groups with none hidden).
   */
  private applySearch(): void {
    const query = this.search.value.trim();
    let found = 0;
    for (const [id, { button, panel }] of this.tabs) {
      if (query === '') {
        panel.hidden = id !== this.tab;
        for (const row of panel.querySelectorAll<HTMLElement>('.menu-row, .key-row')) row.classList.remove('search-miss');
        continue;
      }
      let matches = 0;
      for (const row of panel.querySelectorAll<HTMLElement>('.menu-row, .key-row')) {
        const hit = matchesSearch(row.textContent ?? '', query);
        row.classList.toggle('search-miss', !hit);
        if (hit) matches++;
      }
      // A match inside the Custom graphics block opens it.
      if (matches > 0) for (const d of panel.querySelectorAll('details')) if (d.querySelector('.menu-row:not(.search-miss)')) d.open = true;
      panel.hidden = matches === 0 || button.hidden;
      if (!panel.hidden) found += matches;
    }
    this.panels.classList.toggle('searching', query !== '');
    this.searchNote.textContent = query === '' ? '' : found === 0 ? SETTINGS_TEXT.noMatch(query) : SETTINGS_TEXT.results(found);
  }

  /** The side panel: the row's name, its line, and what it costs (a Custom graphics row). */
  private describe(row: HTMLElement): void {
    this.about.title.textContent = row.querySelector('.menu-row-label')?.textContent ?? '';
    const help = row.querySelector('.menu-row-help')?.textContent ?? '';
    const blurb = row.querySelector('.picker-blurb')?.textContent ?? '';
    this.about.text.textContent = [help, blurb].filter(Boolean).join(' ');
    const cost = row.querySelector('.menu-row-cost')?.textContent ?? '';
    this.about.cost.textContent = cost ? `${SETTINGS_TEXT.cost}: ${cost}` : '';
    this.about.cost.hidden = cost === '';
  }

  private fillTab(id: SettingsTab, panel: HTMLDivElement): void {
    const opts = this.opts;
    const sub = (text: string): HTMLHeadingElement => el('h3', 'settings-subhead', text);
    if (id === 'graphics') {
      const renderer = this.graphics.rendererRow;
      panel.append(this.graphics.qualityRow, this.graphics.frameRateRow, ...(renderer ? [renderer] : []), this.graphics.customBlock);
    } else if (id === 'display') {
      panel.append(
        menuRow('Fullscreen', 'The whole screen for the game. Esc leaves it; in a match the Fullscreen key turns it on and off.', this.fullscreenButton()),
        menuRow(
          'Field of view',
          'How wide you see, across a 16:9 screen. Aiming through an optic zooms in from it.',
          rangeControl('Field of view', FOV_SETTING, opts.fov.initial, (v) => `${Math.round(v)}°`, 'fov', opts.fov.onChange),
        ),
        this.graphics.toneMappingRow,
        this.graphics.showFpsRow,
      );
    } else if (id === 'controls') {
      const keys = el('div', 'settings-keys');
      keys.append(this.keySettings.root, el('p', 'menu-readout settings-mouse', SETTINGS_TEXT.fixedKeys));
      panel.append(...controlsSettings(opts.controls), sub(SETTINGS_TEXT.keysHeading), keys);
    } else if (id === 'gameplay') {
      panel.append(sub(SETTINGS_TEXT.crosshairHeading), ...crosshairSettings(opts.crosshair), sub(SETTINGS_TEXT.hudHeading), ...hudSettings(opts.hud));
    } else if (id === 'audio') {
      panel.append(...audioSettings(opts.audio));
    } else if (id === 'accessibility') {
      panel.append(...accessibilitySettings(opts.accessibility));
    } else if (id === 'look') {
      panel.append(...lookSettings(opts.look));
    } else if (id === 'save') {
      panel.append(...this.saveSettings.rows);
      this.saveSettings.acceptDrops(panel);
    } else if (id === 'dev') {
      panel.append(el('p', 'menu-readout', devIntro()), ...devSettings(opts.dev));
    }
  }
}
