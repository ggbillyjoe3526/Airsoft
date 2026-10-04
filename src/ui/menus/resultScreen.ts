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
  private readonly headline: HTMLHeadingElement;
  private readonly detail: HTMLParagraphElement;
  private readonly hint = hintLine();

  constructor(actions: ResultActions) {
    this.root = el('div', 'menu-screen menu-result');
    this.root.hidden = true;
    const centre = el('div', 'menu-result-centre');
    this.headline = el('h1', 'menu-result-headline');
    this.detail = el('p', 'menu-result-detail');
    centre.append(el('p', 'menu-kicker', 'Match over'), this.headline, this.detail);
    const buttons = el('div', 'menu-result-buttons');
    const playAgain = menuButton('Play Again', 'primary', actions.onPlayAgain);
    playAgain.dataset.autofocus = '';
    buttons.append(
      playAgain,
      menuButton('New Game', 'secondary', actions.onChangeSetup),
      menuButton('Summary', 'secondary', actions.onSummary),
      menuButton('Quit', 'secondary', actions.onTitle),
    );
    const foot = el('div', 'menu-result-foot');
    foot.append(this.hint, buttons);
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
