import { PAUSE_ICONS } from './icons';
import { el, hintLine, menuButton, setHint, withIcon } from './menuParts';

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
  private readonly seed: HTMLParagraphElement;

  constructor(actions: PauseActions) {
    this.root = el('div', 'menu-screen menu-pause');
    this.root.hidden = true;
    const panel = el('div', 'menu-pause-panel');
    const resume = withIcon(menuButton('Resume', 'primary', actions.onResume), PAUSE_ICONS.resume);
    resume.dataset.autofocus = '';
    this.status = el('p', 'menu-pause-status');
    this.loadout = withIcon(menuButton('Loadout', 'secondary', actions.onLoadout), PAUSE_ICONS.loadout);
    // The match's seed, small at the bottom, so a bug seen in play can be reported and replayed (bug pass).
    this.seed = el('p', 'menu-pause-seed');
    panel.append(
      el('h1', 'menu-heading', 'Paused'),
      this.status,
      resume,
      this.hint,
      this.loadout,
      withIcon(menuButton('Settings', 'secondary', actions.onSettings), PAUSE_ICONS.settings),
      withIcon(menuButton('Quit', 'secondary', actions.onQuit), PAUSE_ICONS.quit),
      this.seed,
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

  /** The seed of what's in play, for bug reports. */
  setSeed(seed: number): void {
    this.seed.textContent = `Seed ${seed}`;
  }

  showHint(text: string): void {
    setHint(this.hint, text);
  }
}
