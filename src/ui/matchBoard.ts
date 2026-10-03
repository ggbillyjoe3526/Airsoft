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

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'match-board';
    this.root.hidden = true;
    this.heading = document.createElement('h2');
    this.heading.className = 'match-board-heading';
    this.root.append(this.heading, this.table.root);
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

  dispose(): void {
    this.root.remove();
  }
}
