import { backButton, chevron, el, hintLine, menuButton, menuPage, setHint } from './menuParts';

/** One of the New game screen's four buttons: a small orange label, the current choice in large type, a line under it. */
class SetupTile {
  readonly root: HTMLButtonElement;
  private readonly value: HTMLSpanElement;
  private readonly detail: HTMLSpanElement;

  constructor(label: string, action: string, onClick: () => void) {
    this.root = el('button', 'setup-tile');
    this.root.type = 'button';
    this.value = el('span', 'setup-tile-value');
    this.detail = el('span', 'setup-tile-detail');
    const foot = el('span', 'setup-tile-action', action);
    foot.insertAdjacentHTML('beforeend', chevron());
    this.root.append(el('span', 'setup-tile-label', label), this.value, this.detail, foot);
    this.root.addEventListener('click', onClick);
  }

  set(value: string, detail: string): void {
    this.value.textContent = value;
    this.detail.textContent = detail;
  }
}

export interface SetupActions {
  onMode: () => void;
  onDifficulty: () => void;
  onLoadout: () => void;
  onSettings: () => void;
  onBack: () => void;
  onPlay: () => void;
}

/** New game: Mode, Difficulty, Loadout and Settings, the rules of the picked mode, then Back or Play. */
export class SetupScreen {
  readonly root: HTMLDivElement;
  readonly mode: SetupTile;
  readonly difficulty: SetupTile;
  readonly loadout: SetupTile;
  private readonly rules: HTMLParagraphElement;
  private readonly hint = hintLine();

  constructor(actions: SetupActions, controls: HTMLElement) {
    const page = menuPage('menu-setup', 'New game');
    this.root = page.root;
    this.mode = new SetupTile('Mode', 'Change', actions.onMode);
    this.difficulty = new SetupTile('Difficulty', 'Change', actions.onDifficulty);
    this.loadout = new SetupTile('Loadout', 'Open loadout', actions.onLoadout);
    const settings = new SetupTile('Settings', 'Open settings', actions.onSettings);
    settings.set('Settings', 'Sensitivity, key bindings, controls, graphics.');
    const tiles = el('div', 'setup-tiles');
    tiles.append(this.mode.root, this.difficulty.root, this.loadout.root, settings.root);
    this.rules = el('p', 'setup-rules');
    page.body.append(tiles, this.rules, controls);
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
