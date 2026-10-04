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
  onMap: () => void;
  onMode: () => void;
  onMatch: () => void;
  onDifficulty: () => void;
  onLoadout: () => void;
  onSettings: () => void;
  onBack: () => void;
  onPlay: () => void;
}

/** New game: Map, Mode, Match, Difficulty, Loadout and Settings, the rules of the picked match, then Back or Play. */
export class SetupScreen {
  readonly root: HTMLDivElement;
  readonly map: SetupTile;
  readonly mode: SetupTile;
  readonly match: SetupTile;
  readonly difficulty: SetupTile;
  readonly loadout: SetupTile;
  private readonly rules: HTMLParagraphElement;
  private readonly hint = hintLine();

  constructor(actions: SetupActions) {
    const page = menuPage('menu-setup', 'New game');
    this.root = page.root;
    this.map = new SetupTile('Map', 'Change', actions.onMap);
    this.mode = new SetupTile('Mode', 'Change', actions.onMode);
    this.match = new SetupTile('Match', 'Change', actions.onMatch);
    this.difficulty = new SetupTile('Difficulty', 'Change', actions.onDifficulty);
    this.loadout = new SetupTile('Loadout', 'Open', actions.onLoadout);
    const settings = new SetupTile('Settings', 'Open', actions.onSettings);
    settings.set('Settings', '');
    const tiles = el('div', 'setup-tiles');
    tiles.append(this.map.root, this.mode.root, this.match.root, this.difficulty.root, this.loadout.root, settings.root);
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
