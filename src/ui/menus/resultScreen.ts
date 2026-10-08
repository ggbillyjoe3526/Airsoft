import { SUMMARY_TEXT } from '../../config/menus';
import type { MenuHint } from './chrome';
import { MENU_ICONS } from './icons';
import { el, hintLine, menuButton, setHint } from './menuParts';

export interface ResultActions {
  onPlayAgain: () => void;
  /** Back to the end-of-match summary. */
  onSummary: () => void;
  onChangeSetup: () => void;
  onTitle: () => void;
}

/**
 * The end of a match: who won and the score, then Play Again (same setup), New Game (the New game screen to change
 * it), Summary to look at the numbers again, or Quit (to the title screen). Labels kept to a word or two (owner,
 * 2026-10-04).
 */
export class ResultScreen {
  readonly root: HTMLDivElement;
  readonly hints: readonly MenuHint[];
  private readonly headline: HTMLHeadingElement;
  private readonly detail: HTMLParagraphElement;
  private readonly hint = hintLine();

  constructor(actions: ResultActions) {
    this.root = el('div', 'menu-screen menu-result');
    this.root.hidden = true;
    const centre = el('div', 'menu-result-centre');
    this.headline = el('h1', 'menu-result-headline');
    this.detail = el('p', 'menu-result-detail');
    centre.append(el('p', 'menu-kicker', SUMMARY_TEXT.over), this.headline, this.detail);
    const buttons = el('div', 'menu-result-buttons');
    const playAgain = menuButton('Play again', 'primary', actions.onPlayAgain);
    playAgain.classList.add('menu-button-big');
    playAgain.insertAdjacentHTML('beforeend', MENU_ICONS.arrowRight);
    playAgain.dataset.autofocus = '';
    const more = el('div', 'menu-result-more');
    more.append(
      menuButton('New game', 'secondary', actions.onChangeSetup),
      menuButton('Summary', 'secondary', actions.onSummary),
      menuButton('Quit', 'secondary', actions.onTitle),
    );
    buttons.append(playAgain, more);
    const foot = el('div', 'menu-result-foot');
    foot.append(this.hint, buttons);
    // Enter presses the focused Play again; no key of its own.
    this.hints = [];
    this.root.append(centre, foot);
  }

  set(headline: string, detail: string): void {
    this.headline.textContent = headline;
    this.detail.textContent = detail;
  }

  showHint(text: string): void {
    setHint(this.hint, text);
  }
}
