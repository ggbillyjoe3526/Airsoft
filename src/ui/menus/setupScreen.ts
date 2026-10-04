import { ARMORY_TEXT } from '../../config/menus';
import { SETUP_ICONS } from './icons';
import { backButton, chevron, el, hintLine, menuButton, menuPage, setHint } from './menuParts';

/**
 * One of the New game screen's buttons: a small orange label with its icon, the current choice in large type, a line
 * under it.
 */
class SetupTile {
  readonly root: HTMLButtonElement;
  private readonly value: HTMLSpanElement;
  private readonly detail: HTMLSpanElement;

  constructor(label: string, icon: string, action: string, onClick: () => void, tag = '') {
    this.root = el('button', 'setup-tile');
    this.root.type = 'button';
    this.value = el('span', 'setup-tile-value');
    this.detail = el('span', 'setup-tile-detail');
    const foot = el('span', 'setup-tile-action', action);
    foot.insertAdjacentHTML('beforeend', chevron());
    const head = el('span', 'setup-tile-label', label);
    head.insertAdjacentHTML('afterbegin', icon);
    if (tag) head.append(' ', el('span', 'beta-tag', tag));
    this.root.append(head, this.value, this.detail, foot);
    this.root.addEventListener('click', onClick);
  }

  set(value: string, detail: string): void {
    this.value.textContent = value;
    this.detail.textContent = detail;
  }

  /** Greyed out and inert (the Armory switched off in the Dev settings, M26d). */
  setDisabled(disabled: boolean): void {
    this.root.disabled = disabled;
  }
}

export interface SetupActions {
  onMap: () => void;
  onMode: () => void;
  onMatch: () => void;
  onDifficulty: () => void;
  onLoadout: () => void;
  onArmory: () => void;
  onSettings: () => void;
  onBack: () => void;
  onPlay: () => void;
}

/** New game: Map, Mode, Match, Difficulty, Loadout, Armory and Settings, the rules of the picked match, then Back or Play. */
export class SetupScreen {
  readonly root: HTMLDivElement;
  readonly map: SetupTile;
  readonly mode: SetupTile;
  readonly match: SetupTile;
  readonly difficulty: SetupTile;
  readonly loadout: SetupTile;
  readonly armory: SetupTile;
  private readonly rules: HTMLParagraphElement;
  private readonly hint = hintLine();

  constructor(actions: SetupActions) {
    const page = menuPage('menu-setup', 'New game');
    this.root = page.root;
    this.map = new SetupTile('Map', SETUP_ICONS.map, 'Change', actions.onMap);
    this.mode = new SetupTile('Mode', SETUP_ICONS.mode, 'Change', actions.onMode);
    this.match = new SetupTile('Match', SETUP_ICONS.match, 'Change', actions.onMatch);
    this.difficulty = new SetupTile('Difficulty', SETUP_ICONS.difficulty, 'Change', actions.onDifficulty);
    this.loadout = new SetupTile('Loadout', SETUP_ICONS.loadout, 'Open', actions.onLoadout);
    // Next to the Loadout, marked beta (owner, 2026-10-04).
    this.armory = new SetupTile('Armory', SETUP_ICONS.armory, 'Open', actions.onArmory, ARMORY_TEXT.beta);
    const settings = new SetupTile('Settings', SETUP_ICONS.settings, 'Open', actions.onSettings);
    settings.set('Settings', '');
    const tiles = el('div', 'setup-tiles');
    tiles.append(this.map.root, this.mode.root, this.match.root, this.difficulty.root, this.loadout.root, this.armory.root, settings.root);
    this.rules = el('p', 'setup-rules');
    page.body.append(tiles, this.rules);
    const play = el('div', 'menu-footer-end');
    const playButton = menuButton('Play', 'primary', actions.onPlay, true);
    playButton.dataset.autofocus = '';
    play.append(this.hint, playButton);
    page.footer.append(backButton(actions.onBack), play);
  }

  setRules(text: string): void {
    this.rules.textContent = text;
  }

  showHint(text: string): void {
    setHint(this.hint, text);
  }
}
