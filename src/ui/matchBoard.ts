import { StatsTable } from './statsTable';
import type { TeamBlock } from './statsRows';

/**
 * The scoreboard over the field: the whole match so far while the scoreboard key (Tab) is held, and the round just
 * played between rounds. MatchPresentation says what it shows and when; the DOM is only touched when that changes.
 */
export class MatchBoard {
  private readonly root: HTMLDivElement;
  private readonly heading: HTMLHeadingElement;
  private readonly table = new StatsTable();
  private shownVisible = false;
  private shownHeading = '';
  /** A tip under the table (Pro briefing tips, M41); '' for none. */
  private readonly tip: HTMLParagraphElement;
  private shownTip = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'match-board';
    this.root.hidden = true;
    this.heading = document.createElement('h2');
    this.heading.className = 'match-board-heading';
    this.tip = document.createElement('p');
    this.tip.className = 'match-board-tip';
    this.tip.hidden = true;
    this.root.append(this.heading, this.table.root, this.tip);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return this.shownVisible;
  }

  setVisible(visible: boolean): void {
    if (visible !== this.shownVisible) this.root.hidden = !(this.shownVisible = visible);
  }

  set(heading: string, blocks: readonly TeamBlock[]): void {
    if (heading !== this.shownHeading) this.heading.textContent = this.shownHeading = heading;
    this.table.set(blocks);
  }

  /** The tip under the table, or '' to hide it. */
  setTip(text: string): void {
    if (text === this.shownTip) return;
    this.shownTip = text;
    this.tip.textContent = text;
    this.tip.hidden = text === '';
  }

  dispose(): void {
    this.root.remove();
  }
}
