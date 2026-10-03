import { el, hintLine, menuButton, setHint } from './menuParts';

export interface PauseActions {
  onResume: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

/**
 * Esc during a match: the score so far, then Resume, Settings and Quit to title screen. The loadout, mode and
 * difficulty change between matches, so they are not offered here (owner, 2026-10-03).
 */
export class PauseScreen {
  readonly root: HTMLDivElement;
  private readonly status: HTMLParagraphElement;
  private readonly hint = hintLine();

  constructor(actions: PauseActions) {
    this.root = el('div', 'menu-screen menu-pause');
    this.root.hidden = true;
    const panel = el('div', 'menu-pause-panel');
    this.status = el('p', 'menu-pause-status');
    panel.append(
      el('h1', 'menu-heading', 'Paused'),
      this.status,
      menuButton('Resume', 'primary', actions.onResume),
      this.hint,
      menuButton('Settings', 'secondary', actions.onSettings),
      menuButton('Quit to title screen', 'secondary', actions.onQuit),
      el('p', 'menu-footer-note', 'Quitting ends the match. Loadout, mode and difficulty change between matches.'),
    );
    this.root.append(panel);
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  showHint(text: string): void {
    setHint(this.hint, text);
  }
}
