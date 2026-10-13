import { STATS } from '../../config/matchInfo';
import { ARMORY_TEXT, HAUL_TEXT } from '../../config/menus';
import type { LevelUp } from '../../progress/progress';
import type { XpEarned } from '../../progress/xp';
import type { NoXp } from '../../stats/settleMatch';
import type { RecordsView } from '../recordsView';
import type { TeamBlock } from '../statsRows';
import { haulWhat } from '../runStatus';
import { StatsTable } from '../statsTable';
import { SUMMARY_TEXT } from '../../config/menus';
import type { MenuHint } from './chrome';
import { MENU_ICONS } from './icons';
import { el, menuButton } from './menuParts';

/** What the end-of-match summary shows. */
export interface MatchSummary {
  /** "You win! · Alpha 5 – 3 Beta". */
  result: string;
  /** Every player's numbers over the match, your team first. */
  blocks: TeamBlock[];
  records: RecordsView;
  /** What the match gave in XP and where it left your level (LV1), or null (none given). */
  xp?: XpSummary | null;
  /** Why it gave none, when it didn't (audit POOL-22). */
  noXp?: NoXp | null;
  /** Extraction's haul (M44); absent in the other modes. */
  haul?: HaulSummary | null;
}

/** A match's XP for the summary (LV1): its lines, your level after it, and what the levels it reached unlocked. */
export interface XpSummary {
  earned: XpEarned;
  /** Your level now, the XP into it and what the next one takes (null at the cap). */
  level: number;
  into: number;
  next: number | null;
  /** The levels it raised you to and the names of what they unlocked; null when it raised none. */
  levelUp: { to: number; unlocked: readonly string[] } | null;
}

/** The summary's XP from what settling the match gave and changed; null when it gave none. */
export function xpSummary(earned: XpEarned | null, up: LevelUp | null, now: { level: number; into: number; next: number | null }, name: (id: string) => string): XpSummary | null {
  if (!earned) return null;
  return { earned, ...now, levelUp: up && up.to > up.from ? { to: up.to, unlocked: up.unlocked.map(name) } : null };
}

/** What an Extraction run found and what came of it, for the summary (M44). */
export interface HaulSummary {
  extracted: boolean;
  /** Everything found this run, and what you got out with. */
  found: { xp: number };
  out: { xp: number };
  /** The run gave its XP (it did unless it gave none at all: Dev settings, dev content). */
  kept: boolean;
}

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
  private readonly xp: HTMLDivElement;
  private readonly haul: HTMLDivElement;

  constructor(onContinue: () => void) {
    this.root = el('div', 'menu-screen menu-page menu-summary');
    this.root.hidden = true;
    const head = el('header', 'summary-head');
    this.result = el('h1', 'menu-heading summary-result');
    this.result.append(this.outcome, this.score);
    head.append(el('p', 'menu-kicker', SUMMARY_TEXT.kicker), this.result);
    this.records = el('div', 'summary-records menu-card');
    this.xp = el('div', 'summary-xp menu-card');
    this.haul = el('div', 'summary-haul menu-card');
    const main = el('section', 'summary-main menu-card');
    main.setAttribute('aria-label', SUMMARY_TEXT.players);
    main.append(this.table.root);
    const next = menuButton(SUMMARY_TEXT.next, 'primary', onContinue);
    next.classList.add('menu-button-big');
    next.insertAdjacentHTML('beforeend', MENU_ICONS.arrowRight);
    next.dataset.autofocus = '';
    const aside = el('aside', 'summary-aside');
    aside.append(this.xp, this.haul, this.records, next);
    const layout = el('div', 'summary-layout');
    layout.append(main, aside);
    // Enter presses the focused Continue; no key of its own.
    this.hints = [];
    this.root.append(head, layout);
  }

  set(summary: MatchSummary): void {
    // "You win!" large, the score after it smaller: one heading, read out as one line.
    const cut = summary.result.indexOf(' · ');
    this.outcome.textContent = cut < 0 ? summary.result : summary.result.slice(0, cut);
    this.score.textContent = cut < 0 ? '' : ` ${summary.result.slice(cut + 3)}`;
    this.table.set(summary.blocks);
    this.records.replaceChildren(...recordsBlock(summary.records));
    const xp = xpBlock(summary.xp ?? null, summary.noXp ?? null);
    this.xp.replaceChildren(...xp);
    this.xp.hidden = xp.length === 0;
    this.haul.replaceChildren(...(summary.haul ? haulBlock(summary.haul) : []));
    this.haul.hidden = !summary.haul;
  }
}

/** The summary's haul from a run's finds (MatchSession.runFinds) and whether the run gave its XP; null outside Extraction. */
export function haulSummary(finds: Omit<HaulSummary, 'kept'> | null, kept: boolean): HaulSummary | null {
  return finds ? { ...finds, kept } : null;
}

/**
 * The haul's line on the summary (M44): what you got out with and whether it was kept, what you lost, or nothing. Pure,
 * so the wording is tested without a page.
 */
export function haulLine(h: HaulSummary): string {
  const outWhat = haulWhat(h.out);
  if (h.extracted && outWhat) return h.kept ? HAUL_TEXT.kept(outWhat) : HAUL_TEXT.notKept(outWhat);
  if (h.extracted) return haulWhat(h.found) ? HAUL_TEXT.leftBehind : HAUL_TEXT.emptyOut;
  const foundWhat = haulWhat(h.found);
  return foundWhat ? HAUL_TEXT.lost(foundWhat) : HAUL_TEXT.nothing;
}

/** Extraction's haul (M44): its heading and its line. */
function haulBlock(h: HaulSummary): HTMLElement[] {
  const head = el('p', 'summary-xp-total');
  head.append(el('span', 'menu-kicker', HAUL_TEXT.title));
  return [head, el('p', 'menu-readout', haulLine(h))];
}

/**
 * "XP earned +250 XP", then what gave it ("Match played 100 · Match won 100 … · difficulty ×1.5"), your level after it
 * with a bar into the next, and on a level up the new level and what it unlocked (LV1).
 */
function xpBlock(x: XpSummary | null, noXp: NoXp | null): HTMLElement[] {
  const none = noXpLine(x, noXp);
  if (none) return [el('p', 'menu-readout', none)];
  if (!x) return [];
  const e = x.earned;
  const head = el('p', 'summary-xp-total');
  head.append(el('span', 'menu-kicker', ARMORY_TEXT.earned), el('strong', '', `+${HAUL_TEXT.xp(e.total)}`));
  const parts = e.lines.map((l) => `${l.label} ${l.xp}`);
  if (e.multiplier !== 1) parts.push(`difficulty ×${e.multiplier}`);
  const out: HTMLElement[] = [head, el('p', 'menu-readout', parts.join(' · '))];
  if (x.levelUp) {
    const up = el('p', 'summary-level-up');
    up.append(el('strong', '', ARMORY_TEXT.levelUp(x.levelUp.to)));
    if (x.levelUp.unlocked.length > 0) up.append(el('span', '', ` ${ARMORY_TEXT.unlockedNow}: ${x.levelUp.unlocked.join(', ')}`));
    out.push(up);
  }
  const bar = el('div', 'armory-xp summary-level-bar');
  bar.setAttribute('aria-hidden', 'true');
  bar.style.setProperty('--xp', String(x.next ? Math.min(1, x.into / x.next) : 1));
  bar.append(el('i'));
  out.push(el('p', 'menu-readout summary-level', ARMORY_TEXT.levelLine(x.level, x.next === null ? ARMORY_TEXT.atCap : ARMORY_TEXT.xpInto(x.into, x.next))), bar);
  return out;
}

/** The summary's line when a match gave no XP and why (audit POOL-22), or '' when it gave some (or there is no reason). */
export function noXpLine(x: XpSummary | null, noXp: NoXp | null): string {
  if (x || !noXp) return '';
  return noXp === 'devContent' ? ARMORY_TEXT.noXpDevContent : ARMORY_TEXT.noXpDev;
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
