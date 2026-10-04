import { el, hintLine, menuButton, setHint } from './menuParts';

const PAUSE_NOTE_MATCH = 'Quitting ends the match. Loadout, mode and difficulty change between matches.';
const PAUSE_NOTE_RANGE = 'Change your loadout and go straight back to the range where you stood.';

export interface PauseActions {
  onResume: () => void;
  /** The practice range only (M21): open the Loadout. */
  onLoadout: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

/**
 * Esc during a match: the score so far, then Resume, Settings and Quit to title screen. The loadout, mode and
 * difficulty change between matches, so they are not offered here (owner, 2026-10-03). On the practice range (M21)
 * there's no match: the Loadout is offered too, and you go back to the range with what you picked.
 */
export class PauseScreen {
  readonly root: HTMLDivElement;
  private readonly status: HTMLParagraphElement;
  private readonly hint = hintLine();
  private readonly loadout: HTMLButtonElement;
  private readonly note: HTMLParagraphElement;

  constructor(actions: PauseActions) {
    this.root = el('div', 'menu-screen menu-pause');
    this.root.hidden = true;
    const panel = el('div', 'menu-pause-panel');
    const resume = menuButton('Resume', 'primary', actions.onResume);
    resume.dataset.autofocus = '';
    this.status = el('p', 'menu-pause-status');
    this.loadout = menuButton('Loadout', 'secondary', actions.onLoadout);
    this.note = el('p', 'menu-footer-note');
    panel.append(
      el('h1', 'menu-heading', 'Paused'),
      this.status,
      resume,
      this.hint,
      this.loadout,
      menuButton('Settings', 'secondary', actions.onSettings),
      menuButton('Quit to title screen', 'secondary', actions.onQuit),
      this.note,
    );
    this.setRange(false);
    this.root.append(panel);
  }

  /** On the practice range (M21): the Loadout button shows, and the note says what quitting does there. */
  setRange(range: boolean): void {
    this.loadout.hidden = !range;
    this.note.textContent = range ? PAUSE_NOTE_RANGE : PAUSE_NOTE_MATCH;
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  showHint(text: string): void {
    setHint(this.hint, text);
  }
}
