import { noKeyRepeat } from './confirmDialog';
import { el, menuButton } from './menuParts';

export interface TutorialCompleteActions {
  /** Back on the range, free practice from where you stood. */
  onPractice: () => void;
  /** Leave the range for the Match screen, to start a match. */
  onMenu: () => void;
}

/** The pop-up's words (M80). */
export const TUTORIAL_COMPLETE_TEXT = {
  title: 'Tutorial complete',
  body: "Nice work: you know the basics. Keep practising here on the range, or go to the menu to pick a map and mode and start a match.",
  practice: 'Practice range',
  menu: 'Menu',
} as const;

/**
 * The pop-up when the tutorial is played to its end (M80, owner's 0.1 Dev 4 note 1): "Tutorial complete", and two
 * choices, the practice range (the keyboard starts there: Enter keeps practising) or the menu. Over the range's pause
 * menu: Esc or a click outside closes it and leaves the pause menu, so nothing is chosen by accident.
 */
export class TutorialCompleteDialog {
  readonly root: HTMLDialogElement;
  private readonly practice: HTMLButtonElement;

  constructor(actions: TutorialCompleteActions) {
    const t = TUTORIAL_COMPLETE_TEXT;
    this.root = el('dialog', 'menu-dialog confirm-dialog tutorial-complete');
    this.root.setAttribute('aria-label', t.title);
    const head = el('div', 'menu-dialog-head');
    head.append(el('h2', 'menu-dialog-title', t.title));
    const choose = (go: () => void) => () => {
      this.close();
      go();
    };
    this.practice = noKeyRepeat(menuButton(t.practice, 'primary', choose(actions.onPractice)));
    const menu = noKeyRepeat(menuButton(t.menu, 'secondary', choose(actions.onMenu)));
    const row = el('div', 'confirm-actions');
    row.append(this.practice, menu);
    this.root.append(head, el('p', 'confirm-text', t.body), row);
    this.root.addEventListener('click', (e) => {
      const r = this.root.getBoundingClientRect();
      if (e.target === this.root && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) this.close();
    });
  }

  open(): void {
    if (!this.root.open) this.root.showModal();
    this.practice.focus();
  }

  close(): void {
    if (this.root.open) this.root.close();
  }
}
