import { el, hintLine, menuButton, setHint } from './menuParts';

export interface ResultActions {
  onPlayAgain: () => void;
  onChangeSetup: () => void;
  onTitle: () => void;
}

/** The end of a match: who won and the score, then Play Again (same setup), Change setup (New game) or Title screen. */
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
    buttons.append(
      menuButton('Play Again', 'primary', actions.onPlayAgain),
      menuButton('Change setup', 'secondary', actions.onChangeSetup),
      menuButton('Title screen', 'secondary', actions.onTitle),
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
