import { STATS } from '../../config/matchInfo';
import { ARMORY_TEXT, HAUL_TEXT } from '../../config/menus';
import { type Dispensed, type Earnings, rarestFirst } from '../../pool/armory';
import type { Pool } from '../../pool/pool';
import type { ItemRef } from '../../pool/collection';
import type { RecordsView } from '../recordsView';
import { fcText } from './armoryScreen';
import type { TeamBlock } from '../statsRows';
import { haulWhat } from '../runStatus';
import { StatsTable } from '../statsTable';
import { itemTile } from './itemTile';
import { MENU_TEXT, SUMMARY_TEXT } from '../../config/menus';
import { hintsBar, type MenuHint } from './chrome';
import { MENU_ICONS } from './icons';
import { el, menuButton } from './menuParts';

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
  /** Extraction's haul (M44); absent in the other modes. */
  haul?: HaulSummary | null;
}

/** What an Extraction run found and what came of it, for the summary (M44). */
export interface HaulSummary {
  /** The pool the parts come from (their names, tiers and drawings). */
  pool: Pool;
  extracted: boolean;
  /** Everything found this run, and what you got out with. */
  found: { fc: number; items: readonly ItemRef[] };
  out: { fc: number; items: readonly ItemRef[] };
  /** The parts as they went into the collection (new, or a spare), or null when the run kept nothing. */
  kept: readonly Dispensed[] | null;
}

/** Why a match paid no Field Credits: Dev settings changed how it played, the Armory is switched off, or it used dev content (M35). */
export type Unpaid = 'dev' | 'off' | 'devContent';

/**
 * The end-of-match summary (M19): every player's hits, times hit, friendly hits, BBs fired, accuracy and time alive
 * over the match, your line standing out, then your local records. Shown between the last round and the result
 * menu (Continue), and reachable again from it.
 */
export class SummaryScreen {
  readonly root: HTMLDivElement;
  readonly hints: readonly MenuHint[];
  private readonly result: HTMLHeadingElement;
  private readonly outcome = el('span');
  private readonly score = el('span', 'summary-score');
  private readonly table = new StatsTable('summary-table');
  private readonly records: HTMLDivElement;
  private readonly credits: HTMLDivElement;
  private readonly haul: HTMLDivElement;

  constructor(onContinue: () => void) {
    this.root = el('div', 'menu-screen menu-page menu-summary');
    this.root.hidden = true;
    const head = el('header', 'summary-head');
    this.result = el('h1', 'menu-heading summary-result');
    this.result.append(this.outcome, this.score);
    head.append(el('p', 'menu-kicker', SUMMARY_TEXT.kicker), this.result);
    this.records = el('div', 'summary-records menu-card');
    this.credits = el('div', 'summary-credits menu-card');
    this.haul = el('div', 'summary-haul menu-card');
    const main = el('section', 'summary-main menu-card');
    main.setAttribute('aria-label', SUMMARY_TEXT.players);
    main.append(this.table.root);
    const next = menuButton(SUMMARY_TEXT.next, 'primary', onContinue);
    next.classList.add('menu-button-big');
    next.insertAdjacentHTML('beforeend', MENU_ICONS.arrowRight);
    next.dataset.autofocus = '';
    const aside = el('aside', 'summary-aside');
    aside.append(this.credits, this.haul, this.records, next);
    const layout = el('div', 'summary-layout');
    layout.append(main, aside);
    this.hints = [{ keys: ['Enter'], label: SUMMARY_TEXT.next, run: onContinue, echo: true }];
    this.root.append(head, layout, hintsBar(this.hints, MENU_TEXT.free));
  }

  set(summary: MatchSummary): void {
    // "You win!" large, the score after it smaller: one heading, read out as one line.
    const cut = summary.result.indexOf(' · ');
    this.outcome.textContent = cut < 0 ? summary.result : summary.result.slice(0, cut);
    this.score.textContent = cut < 0 ? '' : ` ${summary.result.slice(cut + 3)}`;
    this.table.set(summary.blocks);
    this.records.replaceChildren(...recordsBlock(summary.records));
    const credits = creditsBlock(summary.fieldCredits ?? null, summary.unpaid ?? null);
    this.credits.replaceChildren(...credits);
    this.credits.hidden = credits.length === 0;
    this.haul.replaceChildren(...(summary.haul ? haulBlock(summary.haul) : []));
    this.haul.hidden = !summary.haul;
  }
}

/** The summary's haul from a run's finds (MatchSession.runFinds) and what settling it kept; null outside Extraction. */
export function haulSummary(pool: Pool, finds: Omit<HaulSummary, 'pool' | 'kept'> | null, kept: readonly Dispensed[] | null): HaulSummary | null {
  return finds ? { pool, ...finds, kept } : null;
}

/**
 * The haul's line on the summary (M44): what you got out with and whether it was kept, what you lost, or nothing. Pure,
 * so the wording is tested without a page.
 */
export function haulLine(h: Omit<HaulSummary, 'pool'>): string {
  const outWhat = haulWhat(h.out);
  if (h.extracted && outWhat) return h.kept ? HAUL_TEXT.kept(outWhat, h.out.items.length > 0, h.out.fc > 0) : HAUL_TEXT.notKept(outWhat);
  if (h.extracted) return haulWhat(h.found) ? HAUL_TEXT.leftBehind : HAUL_TEXT.emptyOut;
  const foundWhat = haulWhat(h.found);
  return foundWhat ? HAUL_TEXT.lost(foundWhat) : HAUL_TEXT.nothing;
}

/**
 * Extraction's haul (M44): its line, then the parts revealed as the Armory reveals a Shot (the same tiles in the
 * tiers' colours, the rarest first, staggered in): new or a spare once kept, else marked not kept or lost.
 */
function haulBlock(h: HaulSummary): HTMLElement[] {
  const head = el('p', 'summary-credits-total');
  head.append(el('span', 'menu-kicker', HAUL_TEXT.title));
  const out: HTMLElement[] = [head, el('p', 'menu-readout', haulLine(h))];
  const shown: readonly Dispensed[] = h.kept ?? (h.extracted ? h.out : h.found).items.map((item) => ({ item, isNew: false }));
  if (shown.length === 0) return out;
  const note = (d: Dispensed): string => (h.kept ? (d.isNew ? HAUL_TEXT.new : HAUL_TEXT.spare) : h.extracted ? HAUL_TEXT.notKeptTile : HAUL_TEXT.lostTile);
  const grid = el('div', 'item-grid armory-reveal-grid');
  rarestFirst(h.pool, shown).forEach((d, i) => {
    const tile = itemTile(h.pool, d.item, note(d));
    tile.classList.toggle('is-new', h.kept !== null && d.isNew);
    tile.style.setProperty('--i', String(i));
    grid.append(tile);
  });
  out.push(grid);
  return out;
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
  return unpaid === 'off' ? ARMORY_TEXT.unpaidOff : unpaid === 'devContent' ? ARMORY_TEXT.unpaidDevContent : ARMORY_TEXT.unpaidDev;
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
