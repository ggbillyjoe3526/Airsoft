import { HUD } from '../config/renderView';
import { StatsTable } from './statsTable';
import type { TeamBlock } from './statsRows';

/** What the board fits round in a match (BP3): the window's foot, and the replica panel it would otherwise cover. */
export interface BoardFit {
  /** The board's natural height and top (CSS px, before its scale), the window's height and the HUD's scale. */
  height: number;
  top: number;
  viewport: number;
  hudScale: number;
}

/**
 * The board's scale as a share of the HUD's (BP3): 1 while it fits above the window's foot (`HUD.board.bottomGap`),
 * else as much smaller as it must, never under `HUD.board.minFit`. Pure.
 */
export function boardFitScale(f: BoardFit): number {
  const room = f.viewport - f.top - HUD.board.bottomGap;
  if (f.height <= 0 || f.hudScale <= 0) return 1;
  const fit = room / (f.height * f.hudScale);
  return Math.max(HUD.board.minFit, Math.min(1, fit));
}

/** Whether two screen boxes overlap (the board over the replica panel, BP3). Pure. */
export function boxesOverlap(a: { left: number; right: number; top: number; bottom: number }, b: { left: number; right: number; top: number; bottom: number }): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * The scoreboard over the field: the whole match so far while the scoreboard key (Tab) is held, and the round just
 * played between rounds. MatchPresentation says what it shows and when; the DOM is only touched when that changes.
 * In a match (`fitScreen`) it fits the window each time it comes up (BP3): tighter rows past `HUD.board.compactRows`
 * players, a smaller scale when it would still run off the foot, and the replica panel hidden while the board covers
 * it (a class on the container, `board-covers-panel`), so in a small window nothing peeks out half-covered.
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
  /** A line at the foot saying a click moves on, at a round's end (Dev 6 playtest item 33); '' for none. */
  private readonly next: HTMLParagraphElement;
  private shownNext = '';
  /** Measured again on the next `set` while shown (each time it comes up, or the window changes height). */
  private fitDue = true;
  private fittedViewport = -1;
  private shownCompact = false;

  constructor(
    private readonly parent: HTMLElement,
    private readonly fitScreen = false,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'match-board';
    this.root.hidden = true;
    this.heading = document.createElement('h2');
    this.heading.className = 'match-board-heading';
    this.tip = document.createElement('p');
    this.tip.className = 'match-board-tip';
    this.tip.hidden = true;
    this.next = document.createElement('p');
    this.next.className = 'match-board-next';
    this.next.hidden = true;
    this.root.append(this.heading, this.table.root, this.tip, this.next);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return this.shownVisible;
  }

  setVisible(visible: boolean): void {
    if (visible === this.shownVisible) return;
    this.root.hidden = !(this.shownVisible = visible);
    if (visible) this.fitDue = true;
    else if (this.fitScreen) this.parent.classList.remove('board-covers-panel');
  }

  set(heading: string, blocks: readonly TeamBlock[]): void {
    if (heading !== this.shownHeading) this.heading.textContent = this.shownHeading = heading;
    this.table.set(blocks);
    let rows = 0;
    for (const b of blocks) rows += b.rows.length;
    const compact = rows > HUD.board.compactRows;
    if (compact !== this.shownCompact) {
      this.root.classList.toggle('compact', (this.shownCompact = compact));
      this.fitDue = true;
    }
    if (this.fitScreen && this.shownVisible) this.fit();
  }

  /** Fits the window (BP3): read once as the board comes up, or when the window's height changed since. */
  private fit(): void {
    const viewport = this.parent.clientHeight;
    if (!this.fitDue && viewport === this.fittedViewport) return;
    this.fitDue = false;
    this.fittedViewport = viewport;
    const hudScale = Number(this.parent.style.getPropertyValue('--hud-scale')) || 1;
    const scale = boardFitScale({ height: this.root.offsetHeight, top: this.root.offsetTop, viewport, hudScale });
    this.root.style.setProperty('--board-fit', scale.toFixed(3));
    const panel = this.parent.querySelector<HTMLElement>('.hud-replica');
    const covers = panel !== null && boxesOverlap(this.root.getBoundingClientRect(), panel.getBoundingClientRect());
    this.parent.classList.toggle('board-covers-panel', covers);
  }

  /** The tip under the table, or '' to hide it. */
  setTip(text: string): void {
    if (text === this.shownTip) return;
    this.shownTip = text;
    this.tip.textContent = text;
    this.tip.hidden = text === '';
  }

  /** The line saying a click moves on (to the next round, or the results), or '' to hide it. */
  setNext(text: string): void {
    if (text === this.shownNext) return;
    this.shownNext = text;
    this.next.textContent = text;
    this.next.hidden = text === '';
  }

  dispose(): void {
    if (this.fitScreen) this.parent.classList.remove('board-covers-panel');
    this.root.remove();
  }
}
