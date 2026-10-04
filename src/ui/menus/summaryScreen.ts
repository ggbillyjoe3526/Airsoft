import { STATS } from '../../config/matchInfo';
import type { RecordsView } from '../recordsView';
import type { TeamBlock } from '../statsRows';
import { StatsTable } from '../statsTable';
import { el, menuButton, menuPage } from './menuParts';

/** What the end-of-match summary shows. */
export interface MatchSummary {
  /** "You win! · Blue 5 – 3 Orange". */
  result: string;
  /** Every player's numbers over the match, your team first. */
  blocks: TeamBlock[];
  records: RecordsView;
}

/**
 * The end-of-match summary (M19): every player's hits, times hit, friendly hits, BBs fired, accuracy and time alive
 * over the match, your line standing out, then your local records. Shown between the last round and the result
 * menu (Continue), and reachable again from it.
 */
export class SummaryScreen {
  readonly root: HTMLDivElement;
  private readonly result: HTMLParagraphElement;
  private readonly table = new StatsTable('summary-table');
  private readonly records: HTMLDivElement;

  constructor(onContinue: () => void) {
    const page = menuPage('menu-summary', 'Match summary');
    this.root = page.root;
    this.result = el('p', 'summary-result');
    this.records = el('div', 'summary-records');
    const panel = el('div', 'menu-panel summary-panel');
    panel.append(this.result, this.table.root, this.records);
    page.body.append(panel);
    const next = menuButton('Continue', 'primary', onContinue, true);
    next.dataset.autofocus = '';
    page.footer.append(next);
  }

  set(summary: MatchSummary): void {
    this.result.textContent = summary.result;
    this.table.set(summary.blocks);
    this.records.replaceChildren(...recordsBlock(summary.records));
  }
}

/** The records: a wins and losses grid (the mode and difficulty just played marked), then the bests. */
function recordsBlock(view: RecordsView): HTMLElement[] {
  const grid = el('table', 'records-grid');
  const head = grid.createTHead().insertRow();
  head.append(el('th', '', 'Your records'), ...view.modes.map((m) => el('th', '', m)));
  const body = grid.createTBody();
  for (const row of view.rows) {
    const tr = body.insertRow();
    tr.append(el('th', '', row.label));
    for (const cell of row.cells) {
      const td = tr.insertCell();
      td.textContent = cell.text;
      if (cell.current) td.className = 'current';
    }
  }
  const bests = el('ul', 'records-bests');
  for (const b of view.bests) {
    const li = el('li');
    li.append(el('span', 'records-best-label', b.label), el('strong', '', b.value));
    if (b.isNew) li.append(el('em', 'records-new', 'New record'));
    bests.append(li);
  }
  const note = el('p', 'menu-footer-note', `Kept in this browser. Best accuracy counts matches with at least ${STATS.minBBsForAccuracyRecord} BBs fired.`);
  if (!view.notCounted) return [grid, bests, note];
  return [el('p', 'records-not-counted', view.notCounted), grid, bests, note];
}
