import { STATS } from '../../config/matchInfo';
import { ARMORY_TEXT } from '../../config/menus';
import type { Earnings } from '../../pool/armory';
import type { RecordsView } from '../recordsView';
import { fcText } from './armoryScreen';
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
  /** What the match paid in Field Credits (M26c), or null (Dev settings on, the Armory off). */
  fieldCredits?: Earnings | null;
  /** Why it paid nothing, when it didn't (audit POOL-22). */
  unpaid?: Unpaid | null;
}

/** Why a match paid no Field Credits: Dev settings changed how it played, or the Armory is switched off. */
export type Unpaid = 'dev' | 'off';

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
  private readonly credits: HTMLDivElement;

  constructor(onContinue: () => void) {
    const page = menuPage('menu-summary', 'Match summary');
    this.root = page.root;
    this.result = el('p', 'summary-result');
    this.records = el('div', 'summary-records');
    this.credits = el('div', 'summary-credits');
    const panel = el('div', 'menu-panel summary-panel');
    panel.append(this.result, this.credits, this.table.root, this.records);
    page.body.append(panel);
    const next = menuButton('Continue', 'primary', onContinue, true);
    next.dataset.autofocus = '';
    page.footer.append(next);
  }

  set(summary: MatchSummary): void {
    this.result.textContent = summary.result;
    this.table.set(summary.blocks);
    this.records.replaceChildren(...recordsBlock(summary.records));
    this.credits.replaceChildren(...creditsBlock(summary.fieldCredits ?? null, summary.unpaid ?? null));
  }
}

/** "Field Credits earned +180 FC", then what paid them: "Match played 40 · Match won 60 … · Hard ×1.5". */
function creditsBlock(e: Earnings | null, unpaid: Unpaid | null): HTMLElement[] {
  const none = unpaidLine(e, unpaid);
  if (none) return [el('p', 'menu-readout', none)];
  if (!e) return [];
  const head = el('p', 'summary-credits-total');
  head.append(el('span', 'menu-kicker', ARMORY_TEXT.earned), el('strong', '', `+${fcText(e.total)}`));
  const parts = e.lines.map((l) => `${l.label} ${l.fc}`);
  if (e.multiplier !== 1) parts.push(`difficulty ×${e.multiplier}`);
  return [head, el('p', 'menu-readout', parts.join(' · '))];
}

/** The summary's line when a match paid nothing and why (audit POOL-22), or '' when it paid (or there is no reason). */
export function unpaidLine(e: Earnings | null, unpaid: Unpaid | null): string {
  if (e || !unpaid) return '';
  return unpaid === 'off' ? ARMORY_TEXT.unpaidOff : ARMORY_TEXT.unpaidDev;
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
