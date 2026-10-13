import { DIFFICULTIES } from '../../config/bots';
import { isAvailable } from '../../config/content';
import { ARMORY_TEXT } from '../../config/menus';
import type { Pool } from '../../pool/pool';
import type { LevelTable } from '../../progress/levels';
import type { Progress } from '../../progress/progress';
import { levelTrack, type Track, type TrackLevel } from '../../progress/track';
import { type MenuHint, tagPill } from './chrome';
import { itemPicture, KIND_LABELS } from './itemTile';
import type { PictureContext } from './kitStrip';
import { el } from './menuParts';

export interface ArmoryOptions {
  /** The pool as offered now (M35: dev gear only with Dev content on). */
  pool: () => Pool;
  /** The levels (levels.md). */
  levels: LevelTable;
  /** The player's progress, read fresh (another tab's newer save first). */
  progress: () => Progress;
  /** Dev settings › Disable levelling: everything unlocked, no XP. */
  levellingOff: () => boolean;
  /** Dev content is on (M35): the XP note names the dev difficulties too. */
  devContent: () => boolean;
  /** Where the items' pictures come from (G3); without, each item shows its drawing. */
  context?: PictureContext;
}

/**
 * The Armory (LV1, in place of M26c's Shots): your level and what it unlocked. The left card holds your level, the XP
 * into the next one and how XP is earned; the middle what the next level unlocks; the right every level from the
 * starting kit to the cap, each with its items, reached ones lit. Nothing here changes anything: matches give the XP.
 */
export class ArmoryScreen {
  readonly root: HTMLDivElement;
  /** No keys of its own: Esc is Back, handled by the menus. */
  readonly hints: readonly MenuHint[] = [];
  private readonly standing: HTMLDivElement;
  private readonly next: HTMLElement;
  private readonly track: HTMLOListElement;
  private readonly count: HTMLSpanElement;
  private readonly earn: HTMLElement;

  constructor(private readonly opts: ArmoryOptions) {
    this.root = el('div', 'menu-screen menu-page menu-armory menu-hub');
    this.root.hidden = true;
    const left = el('section', 'armory-left menu-card');
    const heading = el('h1', 'menu-heading', ARMORY_TEXT.heading);
    // The keyboard lands on the heading as the screen opens: nothing here is a control.
    heading.tabIndex = -1;
    heading.dataset.autofocus = '';
    this.standing = el('div', 'armory-standing');
    // Read out when it changes (a Dev button's XP, say) for a screen reader.
    this.standing.setAttribute('aria-live', 'polite');
    this.earn = el('section', 'armory-earn');
    left.append(heading, this.standing, this.earn);
    this.next = el('section', 'armory-next menu-card');
    this.next.setAttribute('aria-label', ARMORY_TEXT.next);
    const levels = el('section', 'armory-track menu-card');
    const head = el('div', 'armory-track-head');
    this.count = el('span', 'armory-count');
    head.append(el('h2', 'menu-panel-title', ARMORY_TEXT.levels), this.count);
    this.track = el('ol', 'armory-levels');
    levels.append(head, this.track);
    const columns = el('div', 'armory-columns');
    columns.append(left, this.next, levels);
    this.root.append(columns);
    this.refresh();
  }

  /** Reads the progress again (after a match gave XP, say) and redraws. */
  refresh(): void {
    const pool = this.opts.pool();
    const t = levelTrack(this.opts.levels, this.opts.progress(), (id) => pool.byId.has(id), this.opts.levellingOff());
    this.renderStanding(t);
    this.renderEarn();
    this.renderNext(t, pool);
    this.renderTrack(t, pool);
  }

  /** Your level, the bar into the next one and the lines under it. */
  private renderStanding(t: Track): void {
    const s = t.standing;
    const badge = el('p', 'armory-level');
    badge.append(el('span', 'armory-level-n', ARMORY_TEXT.level(s.level)), el('span', 'armory-level-cap', ARMORY_TEXT.ofCap(t.cap)));
    const lines: HTMLElement[] = [badge];
    if (t.off) {
      lines.push(el('p', 'armory-off', ARMORY_TEXT.off));
    } else {
      const bar = el('div', 'armory-xp');
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(s.next ?? 1));
      bar.setAttribute('aria-valuenow', String(s.next === null ? 1 : s.into));
      bar.style.setProperty('--xp', String(s.next ? Math.min(1, s.into / s.next) : 1));
      bar.append(el('i'));
      lines.push(bar);
      if (s.next === null) lines.push(el('p', 'armory-xp-line', ARMORY_TEXT.atCap));
      else lines.push(el('p', 'armory-xp-line', ARMORY_TEXT.xpInto(s.into, s.next)), el('p', 'armory-to-next', ARMORY_TEXT.toNext(s.next - s.into, s.level + 1)));
      lines.push(el('p', 'armory-total', ARMORY_TEXT.totalXp(s.xp)));
    }
    this.standing.replaceChildren(...lines);
    this.count.textContent = ARMORY_TEXT.unlocked(t.unlocked, t.total);
  }

  /** How a match gives XP, from levels.md's numbers, naming the difficulties offered now. */
  private renderEarn(): void {
    const rules = this.opts.levels.xp;
    const list = el('ul', 'armory-earn-list');
    for (const line of ARMORY_TEXT.earnLines(rules.earn)) list.append(el('li', '', line));
    const offered = DIFFICULTIES.filter((d) => isAvailable(d.tag, this.opts.devContent()));
    const difficulty = el('p', 'armory-earn-note', ARMORY_TEXT.difficulty(offered.map((d) => `${d.label} ×${rules.difficulty[d.id]}`)));
    this.earn.replaceChildren(el('h2', 'menu-kicker', ARMORY_TEXT.earn), list, difficulty, el('p', 'armory-earn-note menu-faint', ARMORY_TEXT.noXp));
  }

  /** What the next level unlocks, as big cards; or that there is nothing left (or levelling is off). */
  private renderNext(t: Track, pool: Pool): void {
    const head = el('div', 'armory-next-head');
    head.append(el('h2', 'menu-panel-title', ARMORY_TEXT.next));
    if (!t.next) {
      this.next.replaceChildren(head, el('p', 'armory-next-none', t.off ? ARMORY_TEXT.off : ARMORY_TEXT.allUnlocked));
      return;
    }
    head.append(tagPill(ARMORY_TEXT.nextAt(t.next.level), 'orange'));
    const grid = el('div', 'armory-next-grid');
    for (const id of t.next.items) grid.append(this.itemCard(pool, id, 'armory-next-item', 'armory-next-pic'));
    this.next.replaceChildren(head, grid);
  }

  /** Every level, the starting kit first, each with what it unlocks. */
  private renderTrack(t: Track, pool: Pool): void {
    this.track.replaceChildren(...t.levels.map((l) => this.levelRow(l, pool)));
  }

  private levelRow(l: TrackLevel, pool: Pool): HTMLLIElement {
    const row = el('li', 'armory-level-row');
    row.dataset.state = l.state;
    const head = el('div', 'armory-level-head');
    head.append(el('span', 'armory-level-name', l.level === 0 ? ARMORY_TEXT.start : ARMORY_TEXT.level(l.level)));
    if (l.level > 0) head.append(el('span', 'armory-level-xp', ARMORY_TEXT.levelXp(l.total)));
    head.append(el('span', 'armory-level-state', ARMORY_TEXT.state[l.state]));
    const items = el('div', 'armory-level-items');
    if (l.items.length === 0) items.append(el('span', 'armory-level-empty menu-faint', ARMORY_TEXT.nothingYet));
    for (const id of l.items) items.append(this.itemCard(pool, id, 'armory-item', 'armory-item-pic'));
    row.append(head, items);
    return row;
  }

  /** An item: its picture (G3), its kind and its name. */
  private itemCard(pool: Pool, id: string, className: string, picClass: string): HTMLDivElement {
    const asset = pool.byId.get(id)!;
    const card = el('div', className);
    card.dataset.kind = asset.category;
    const words = el('span', 'armory-item-words');
    words.append(el('span', 'item-note item-kind', KIND_LABELS[asset.category]), el('span', 'item-name', asset.name));
    card.append(itemPicture(asset, this.opts.context, picClass).root, words);
    return card;
  }
}
