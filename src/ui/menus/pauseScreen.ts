import { el, hintLine, menuButton, setHint } from './menuParts';

export interface PauseActions {
  onResume: () => void;
  /** The practice range only (M21): open the Loadout. */
  onLoadout: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

/**
 * Esc during a match: the score so far, then Resume, Settings and Quit (to the title screen). The loadout, mode and
 * difficulty change between matches, so they are not offered here (owner, 2026-10-03). On the practice range (M21)
 * there's no match: the Loadout is offered too, and you go back to the range with what you picked.
 */
export class PauseScreen {
  readonly root: HTMLDivElement;
  private readonly status: HTMLParagraphElement;
  private readonly hint = hintLine();
  private readonly loadout: HTMLButtonElement;

  constructor(actions: PauseActions) {
    this.root = el('div', 'menu-screen menu-pause');
    this.root.hidden = true;
    const panel = el('div', 'menu-pause-panel');
    const resume = menuButton('Resume', 'primary', actions.onResume);
    resume.dataset.autofocus = '';
    this.status = el('p', 'menu-pause-status');
    this.loadout = menuButton('Loadout', 'secondary', actions.onLoadout);
    panel.append(
      el('h1', 'menu-heading', 'Paused'),
      this.status,
      resume,
      this.hint,
      this.loadout,
      menuButton('Settings', 'secondary', actions.onSettings),
      menuButton('Quit', 'secondary', actions.onQuit),
    );
    this.setRange(false);
    this.root.append(panel);
  }

  /** On the practice range (M21): the Loadout button shows. */
  setRange(range: boolean): void {
    this.loadout.hidden = !range;
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  showHint(text: string): void {
    setHint(this.hint, text);
  }
}
