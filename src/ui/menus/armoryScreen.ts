import { ARMORY_TEXT, MENU_TEXT } from '../../config/menus';
import {
  buyTokens,
  canTakeShots,
  chaseChances,
  cheapestSpare,
  collectionRows,
  type CollectionRow,
  type Dispensed,
  pityLeft,
  rarestFirst,
  revealSummary,
  scrapAllSpares,
  scrapSpares,
  shotAssets,
  shotFcPrice,
  shotPrice,
  type ShotCount,
  sparesValue,
  takeShots,
  tierChances,
} from '../../pool/armory';
import type { Collection, ItemRef } from '../../pool/collection';
import { type Asset, comesIn, fcPerToken, isChase, type Pool } from '../../pool/pool';
import { ConfirmDialog, noKeyRepeat } from './confirmDialog';
import { type ContextChoice, ContextMenu } from './contextMenu';
import { tierLine } from '../performanceSheet';
import { type MenuHint, sectionHead, tagPill } from './chrome';
import { MENU_ICONS } from './icons';
import { CATEGORY_LABELS, itemPicture, itemTile, tierLabel } from './itemTile';
import type { PictureContext } from './kitStrip';
import { el, menuButton } from './menuParts';

export interface ArmoryOptions {
  /** The pool as offered now (M35: dev gear only with Dev content on). */
  pool: () => Pool;
  /** The player's collection, changed in place. */
  collection: () => Collection;
  /** Every item you carry (the replicas and what is fitted to them), to say when a Shot's item became one of them. */
  equipped: () => readonly (ItemRef | null)[];
  /**
   * Something was bought, dispensed or scrapped: save the collection, and the Loadout follows it. True if another tab
   * had saved first, so the collection was reloaded from its save and the change was not kept (M70, audit POOL-05).
   */
  onChange: () => boolean | void;
  /** Where the items' pictures come from (G3); without, each item shows its drawing. */
  context?: PictureContext;
}

/** "1,600 FC". */
export function fcText(fc: number): string {
  return `${fc.toLocaleString('en-GB')} FC`;
}

function tokensText(n: number): string {
  return `${n} ${n === 1 ? 'Token' : 'Tokens'}`;
}

/**
 * The Armory (M26c, beta): completely free. Field Credits earned in matches buy Tokens; a Token takes a Shot, which
 * dispenses three random assets at random rarity tiers into the collection; spare copies scrap back into FC. The left
 * column holds the balance, the exchange, the Shots, what pity guarantees and the odds; the right shows the last Shot's
 * assets, rarest first, and the catalogue: every asset Shots can give, with the copies owned at each tier and the
 * spares to scrap (audit POOL-04). Ten Shots and Scrap all spares ask first (audit POOL-03).
 */
export class ArmoryScreen {
  readonly root: HTMLDivElement;
  readonly hints: readonly MenuHint[];
  private readonly side: HTMLDivElement;
  private readonly reveal: HTMLDivElement;
  private readonly odds: HTMLDivElement;
  private readonly owned: HTMLDivElement;
  private readonly confirm = new ConfirmDialog();
  /** The scrap choices of a collection card (M100): one menu, built once and shown for whichever card is asked. */
  private readonly menu = new ContextMenu();
  private last: Dispensed[] = [];
  /** The last Shot's items you now carry without picking them (a rarer copy of a replica or part left on its default). */
  private nowEquipped = new Set<string>();
  /** Says once that the last change was not kept (M70, audit POOL-05); empty otherwise. */
  private readonly notice = el('p', 'menu-readout armory-notice');
  /** Where the keyboard goes when no action is left to take (the heading, which the page always has). */
  private readonly fallbackFocus: HTMLElement;

  constructor(private readonly opts: ArmoryOptions) {
    this.root = el('div', 'menu-screen menu-page menu-armory menu-hub');
    this.root.hidden = true;
    // Always in the page, so a screen reader reads it out when it is filled.
    this.notice.setAttribute('role', 'status');
    // The left column: the heading, the balance, the exchange and the Shots (renderSide fills the part under the heading).
    const left = el('div', 'armory-left menu-card');
    const heading = el('h1', 'menu-heading', 'Armory');
    heading.tabIndex = -1;
    this.fallbackFocus = heading;
    heading.append(' ', el('span', 'beta-tag', ARMORY_TEXT.beta));
    const head = el('div', 'armory-head');
    head.append(heading, tagPill(ARMORY_TEXT.freeTag));
    this.side = el('div', 'armory-side');
    left.append(head, el('p', 'armory-free', ARMORY_TEXT.free), this.notice, this.side);
    // The middle: the last Shot, then the odds.
    const main = el('div', 'armory-main');
    this.reveal = el('div', 'armory-reveal');
    // Live from the start, so the first Shot is read out too (audit POOL-11).
    this.reveal.setAttribute('aria-live', 'polite');
    this.reveal.setAttribute('aria-atomic', 'true');
    this.odds = el('div', 'armory-odds-box');
    main.append(this.reveal, this.odds);
    // The right: the collection.
    this.owned = el('div', 'armory-owned menu-card');
    const columns = el('div', 'armory-columns');
    columns.append(left, main, this.owned);
    // Space takes a Shot (the 1 Shot button does it for the mouse); Esc is Back, handled by the menus.
    this.hints = [{ keys: ['Space'], label: MENU_TEXT.hints.shot, run: () => this.shotOne(), code: 'Space', idle: true }];
    this.root.append(columns, this.confirm.root, this.menu.root);
    this.refresh();
  }

  /** Re-reads the collection (after a match paid FC, say), forgetting the last Shot. */
  refresh(): void {
    this.confirm.close();
    this.last = [];
    this.nowEquipped.clear();
    this.notice.textContent = '';
    this.render();
  }

  private get pool(): Pool {
    return this.opts.pool();
  }

  /**
   * Saves and redraws; the focus goes to what `focus` finds in the new screen, else the first of `actions`
   * (data-action names) still there and enabled, else Back.
   */
  private changed(actions: readonly string[], focus?: () => HTMLElement | null): void {
    const reloaded = this.opts.onChange() === true;
    // The Shot's items are not in the collection now, so they are not shown as if they were.
    if (reloaded) {
      this.last = [];
      this.nowEquipped.clear();
    }
    this.notice.textContent = reloaded ? ARMORY_TEXT.reloaded : '';
    this.render();
    (focus?.() ?? this.firstEnabled([...actions, 'shot-1', 'buy-1'])).focus({ preventScroll: true });
  }

  /** Space: one Shot, when one can be taken (else nothing: the key never leaves the screen). */
  private shotOne(): void {
    const b = this.root.querySelector<HTMLButtonElement>('[data-action="shot-1"]');
    if (b && !b.disabled) b.click();
  }

  /** The first of these actions on screen and enabled, else the heading (always there). */
  private firstEnabled(actions: readonly string[]): HTMLElement {
    for (const action of actions) {
      const b = this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
      if (b && !b.disabled) return b;
    }
    return this.fallbackFocus;
  }

  private render(): void {
    this.menu.close(false);
    // Read (and synced with another tab's save) once per redraw; each action reads it again before it changes it.
    const c = this.opts.collection();
    this.renderSide(c);
    this.renderReveal();
    this.renderOdds();
    this.renderOwned(c);
    // Opening the screen puts the keyboard on a Shot (or a Token to buy, or Back when there is nothing to afford).
    for (const node of this.root.querySelectorAll<HTMLElement>('[data-autofocus]')) delete node.dataset.autofocus;
    this.firstEnabled(['shot-1', 'buy-1']).dataset.autofocus = '';
  }

  private renderSide(c: Collection): void {
    const e = this.pool.economy;
    const rate = fcPerToken(e);
    const balance = el('div', 'armory-balance');
    balance.setAttribute('role', 'status');
    balance.append(this.figure(ARMORY_TEXT.fc, fcText(c.fc)), this.figure(ARMORY_TEXT.tokens, String(c.tokens)));

    const exchange = el('div', 'armory-actions');
    for (const n of [1, 10]) {
      const b = this.actionButton(`buy-${n}`, `${ARMORY_TEXT.buy} ${tokensText(n)}`, fcText(n * rate), n * rate <= c.fc, () => {
        if (buyTokens(e, this.opts.collection(), n)) this.changed([`buy-${n}`]);
      });
      exchange.append(b);
    }

    const shots = el('div', 'armory-actions');
    for (const n of [1, 10] as ShotCount[]) {
      const price = shotPrice(e, c, n);
      // The FC price on the button (audit POOL-13); how it is paid under it when Tokens cover some.
      const paid = [price.tokens > 0 ? tokensText(price.tokens) : '', price.fc > 0 ? fcText(price.fc) : ''].filter(Boolean).join(' + ');
      const note = price.tokens > 0 ? ARMORY_TEXT.paidWith(paid) : ARMORY_TEXT.paidInFc;
      const label = `${n === 1 ? ARMORY_TEXT.oneShot : ARMORY_TEXT.tenShots} · ${fcText(shotFcPrice(e, n))}`;
      const b = this.actionButton(`shot-${n}`, label, note, canTakeShots(e, c, n), () => {
        if (n === 1) return this.takeShots(n);
        this.confirm.ask(ARMORY_TEXT.confirmTenTitle, ARMORY_TEXT.confirmTen(paid), ARMORY_TEXT.confirmTenYes, () => this.takeShots(n));
      });
      b.classList.add('armory-shot');
      shots.append(b);
    }

    const guarantee = e.tenShotGuarantee ? this.pool.tiers.find((t) => t.id === e.tenShotGuarantee) : undefined;
    const notes = [ARMORY_TEXT.perShot(e.assetsPerShot)];
    if (guarantee) notes.push(ARMORY_TEXT.guarantee(guarantee.label));
    const pity = el('ul', 'armory-pity');
    // The nearest guarantee first.
    for (const p of pityLeft(this.pool, c).sort((x, y) => x.shots - y.shots)) {
      const line = el('li', '', ARMORY_TEXT.pity(p.tier.label, p.shots));
      line.dataset.tier = p.tier.id;
      pity.append(line);
    }
    const parts: HTMLElement[] = [
      balance,
      el('p', 'menu-kicker', ARMORY_TEXT.exchange),
      el('p', 'menu-readout', ARMORY_TEXT.rate(rate)),
      exchange,
      el('h2', 'armory-shots-title', ARMORY_TEXT.shots),
      el('p', 'menu-readout', notes.join(' ')),
      shots,
      ...(pity.children.length > 0 ? [el('p', 'menu-kicker', ARMORY_TEXT.pityKicker), pity] : []),
    ];
    this.side.replaceChildren(...parts);
  }

  /** The odds: each tier's share as a bar and a table, how an asset is picked, and the chase items' own lines. */
  private renderOdds(): void {
    const e = this.pool.economy;
    const odds = el('table', 'armory-odds');
    // The section head says it on screen; the caption names the table for a screen reader.
    const caption = odds.createCaption();
    caption.textContent = ARMORY_TEXT.odds;
    caption.className = 'sr-only';
    const body = odds.createTBody();
    for (const { tier, percent } of tierChances(this.pool)) {
      const row = body.insertRow();
      const name = el('th', 'item-tier', tier.label);
      name.scope = 'row';
      name.dataset.tier = tier.id;
      row.append(name, el('td', '', `${percentText(percent)}%`), el('td', 'armory-odds-scrap', `${ARMORY_TEXT.scrap} ${fcText(tier.scrapFc)}`));
    }
    // Chase items (M32) are drawn apart, each on its own chance: a line each, and the rest are picked among themselves.
    const chase = chaseChances(this.pool).map(({ asset, chance, tiers }) => {
      const line = el('p', 'menu-readout armory-chase', ARMORY_TEXT.chase(asset.name, tiers.map((t) => t.label).join(', '), String(Math.round(chance * 10000) / 100), Math.round(1 / Math.max(chance, 1e-9))));
      line.dataset.tier = tiers.at(-1)!.id;
      return line;
    });
    const n = shotAssets(this.pool).filter((a) => !isChase(a)).length;
    const rarest = tierChances(this.pool).filter((t) => t.percent > 0).at(-1);
    const perAsset = n > 0 && rarest ? el('p', 'menu-readout armory-per-asset', ARMORY_TEXT.perAsset(n, e.unownedWeight, rarest.tier.label, Math.round((n * 100) / rarest.percent))) : null;

    const strip = el('div', 'armory-odds-strip');
    strip.setAttribute('aria-hidden', 'true');
    for (const { tier, percent } of tierChances(this.pool)) {
      const part = el('span');
      part.dataset.tier = tier.id;
      part.style.setProperty('--share', String(percent));
      strip.append(part);
    }
    const parts: (HTMLElement | null)[] = [
      sectionHead('', ARMORY_TEXT.oddsTitle, ARMORY_TEXT.oddsNote),
      strip,
      odds,
      perAsset,
      ...(chase.length > 0 ? [el('p', 'menu-kicker', ARMORY_TEXT.chaseKicker), ...chase] : []),
      this.steps(),
    ];
    this.odds.replaceChildren(...parts.filter((x): x is HTMLElement => x !== null));
  }

  /** How it works: play, swap, take a Shot, each a card with its sign. */
  private steps(): HTMLElement {
    const e = this.pool.economy;
    const { play, swap, shot } = ARMORY_TEXT.steps;
    const list = el('ol', 'armory-steps');
    list.setAttribute('aria-label', ARMORY_TEXT.stepsLabel);
    const step = (icon: string, title: string, text: string): HTMLLIElement => {
      const li = el('li', 'armory-step');
      const head = el('span', 'armory-step-head');
      head.insertAdjacentHTML('beforeend', icon);
      li.append(head, el('strong', 'armory-step-title', title), el('span', 'armory-step-text', text));
      return li;
    };
    list.append(
      step(MENU_ICONS.trophy, play.title, play.text),
      step(MENU_ICONS.crate, swap.title, swap.text(fcPerToken(e))),
      step(MENU_ICONS.dice, shot.title, shot.text(e.assetsPerShot)),
    );
    return list;
  }

  private takeShots(n: ShotCount): void {
    const before = new Set(this.opts.equipped().map((r) => r && `${r.asset}@${r.tier}`));
    const got = takeShots(this.pool, this.opts.collection(), n);
    if (!got) return;
    this.last = got;
    this.nowEquipped = new Set(this.opts.equipped().flatMap((r) => (r && !before.has(`${r.asset}@${r.tier}`) ? [`${r.asset}@${r.tier}`] : [])));
    // The keyboard goes to what came out, not back to the Shot button (audit POOL-03).
    this.changed([`shot-${n}`], () => this.reveal.querySelector<HTMLElement>('h2'));
  }

  private renderReveal(): void {
    this.reveal.replaceChildren();
    if (this.last.length === 0) return;
    const grid = el('div', 'item-grid armory-reveal-grid');
    rarestFirst(this.pool, this.last).forEach((d, i) => {
      const equipped = this.nowEquipped.has(`${d.item.asset}@${d.item.tier}`);
      const tile = this.tile(d.item, d.isNew ? (equipped ? `${ARMORY_TEXT.new} · ${ARMORY_TEXT.nowEquipped}` : ARMORY_TEXT.new) : ARMORY_TEXT.spare);
      tile.classList.toggle('is-new', d.isNew);
      // A chase item (M32) gets a reveal of its own.
      tile.classList.toggle('is-chase', isChase(this.pool.byId.get(d.item.asset)!));
      // Staggered in (style.css; none with reduced motion), the rarest first.
      tile.style.setProperty('--i', String(i));
      grid.append(tile);
    });
    // A section head like the odds'; its heading takes the keyboard after a Shot.
    const head = el('div', 'menu-section-head');
    const title = el('h2', 'menu-section-title', ARMORY_TEXT.dispensed);
    title.tabIndex = -1;
    head.append(title, el('span', 'menu-section-rule'));
    this.reveal.append(head, el('p', 'menu-readout armory-reveal-summary', revealSummary(this.pool, this.last)), grid);
  }

  private renderOwned(c: Collection): void {
    const catalogue = collectionRows(this.pool, c);
    const head = el('div', 'loadout-replica-head');
    const title = el('h2', 'menu-panel-title', ARMORY_TEXT.collection);
    title.append(' ', el('span', 'armory-completion', ARMORY_TEXT.completion(catalogue.owned, catalogue.total)));
    head.append(title);
    const total = sparesValue(this.pool, c);
    if (total > 0) {
      const count = catalogue.rows.reduce((sum, r) => sum + r.spares, 0);
      const all = noKeyRepeat(
        menuButton(`${ARMORY_TEXT.scrapAll} (+${fcText(total)})`, 'secondary', () =>
          this.confirm.ask(ARMORY_TEXT.confirmScrapTitle, ARMORY_TEXT.confirmScrap(count, fcText(total)), ARMORY_TEXT.confirmScrapYes, () => {
            scrapAllSpares(this.pool, this.opts.collection());
            this.changed(['buy-1']);
          }),
        ),
      );
      all.dataset.action = 'scrap-all';
      head.append(all);
    }
    // Each kind in its own column (M100): replicas, power sources, optics and the rest, a heading over its assets.
    const list = el('div', 'armory-list');
    let category: Asset['category'] | null = null;
    let column: HTMLElement | null = null;
    for (const row of catalogue.rows) {
      if (!column || row.asset.category !== category) {
        category = row.asset.category;
        column = el('section', 'armory-kind');
        column.dataset.kind = category;
        column.setAttribute('aria-label', CATEGORY_LABELS[category]);
        column.append(el('h3', 'menu-kicker armory-category', CATEGORY_LABELS[category]));
        list.append(column);
      }
      column.append(this.assetRow(row, c));
    }
    this.owned.replaceChildren(head, el('p', 'menu-readout armory-scrap-hint', ARMORY_TEXT.scrapHint), el('p', 'menu-readout', ARMORY_TEXT.keepOne), list);
  }

  /** One asset of the catalogue: its name, a pip per tier (copies owned, or a dash), and its spares to scrap. */
  private assetRow(r: CollectionRow, c: Collection): HTMLDivElement {
    const row = el('div', 'armory-row');
    row.append(itemPicture(r.asset, this.opts.context, 'collection-pic').root);
    let best = -1;
    r.counts.forEach((n, t) => (best = n > 0 ? t : best));
    if (best >= 0) row.dataset.tier = this.pool.tiers[best]!.id;
    else row.classList.add('is-unowned');
    row.append(el('span', 'armory-row-name', r.asset.name));
    const pips = el('span', 'armory-pips');
    r.counts.forEach((n, t) => {
      const tier = this.pool.tiers[t]!;
      // A tier it never comes in (M32: the Cyber Pistol below Legendary) keeps its column, empty.
      const comes = comesIn(r.asset, tier.id) || n > 0;
      // A bar in the tier's colour when owned; the count is its name (and its tooltip), read out per tier.
      const pip = el('span', `armory-pip${n > 0 ? ' is-owned' : ''}${comes ? '' : ' is-na'}`);
      pip.dataset.tier = tier.id;
      pip.title = `${tier.label}: ${n > 0 ? `×${n}` : comes ? ARMORY_TEXT.notOwned : ARMORY_TEXT.notInTier}`;
      pip.setAttribute('role', 'img');
      pip.setAttribute('aria-label', pip.title);
      pips.append(pip);
    });
    row.append(pips);
    if (best >= 0) {
      const adds = tierLine(this.pool, { asset: r.asset.id, tier: this.pool.tiers[best]!.id });
      if (adds) row.append(el('span', 'armory-row-adds', adds));
    }
    this.scrapMenu(row, r, c);
    return row;
  }

  /**
   * The card's scrap choices (M100, in place of buttons on every card): a right-click opens them at the pointer, and
   * the Menu key or Shift+F10 on the focused card opens them beside it. Only a card with a spare has any.
   */
  private scrapMenu(row: HTMLDivElement, r: CollectionRow, c: Collection): void {
    const one = cheapestSpare(this.pool, c, r.asset.id);
    if (!one) return;
    const oneFc = this.pool.tiers.find((t) => t.id === one.tier)!.scrapFc;
    const choices: ContextChoice[] = [
      {
        label: `${ARMORY_TEXT.scrapOne} (+${fcText(oneFc)})`,
        name: `${ARMORY_TEXT.scrapOne} ${tierLabel(this.pool, one)} ${r.asset.name} for ${fcText(oneFc)}`,
        run: () => {
          scrapSpares(this.pool, this.opts.collection(), one, 1);
          this.changed([`spares-${r.asset.id}`, 'scrap-all', 'buy-1']);
        },
      },
    ];
    if (r.spares > 1) {
      choices.push({
        label: `${ARMORY_TEXT.scrap} ${r.spares} (+${fcText(r.spareFc)})`,
        name: `${ARMORY_TEXT.scrap} ${r.spares} spare ${r.asset.name} for ${fcText(r.spareFc)}`,
        run: () => {
          const c = this.opts.collection();
          for (let t = this.pool.tiers.length - 1; t >= 0; t--) scrapSpares(this.pool, c, { asset: r.asset.id, tier: this.pool.tiers[t]!.id });
          this.changed(['scrap-all', 'buy-1']);
        },
      });
    }
    // Reachable from the keyboard, and named for a screen reader as a card with a menu.
    row.tabIndex = 0;
    row.dataset.action = `spares-${r.asset.id}`;
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', ARMORY_TEXT.rowMenuHint(r.asset.name, r.spares));
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.menu.open(r.asset.name, choices, e.clientX + 2, e.clientY + 2, row);
    });
    row.addEventListener('keydown', (e) => {
      if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
      e.preventDefault();
      const box = row.getBoundingClientRect();
      this.menu.open(r.asset.name, choices, box.left + 12, box.top + 24, row);
    });
  }

  private figure(label: string, value: string): HTMLDivElement {
    const f = el('div', 'armory-figure');
    f.append(el('span', 'menu-kicker', label), el('span', 'armory-figure-value', value));
    return f;
  }

  private actionButton(action: string, label: string, cost: string, enabled: boolean, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'item-chip armory-action');
    b.type = 'button';
    b.dataset.action = action;
    b.disabled = !enabled;
    b.append(el('span', 'item-name', label), el('span', 'item-note', cost));
    b.addEventListener('click', onClick);
    return noKeyRepeat(b);
  }

  private tile(item: ItemRef, note: string): HTMLDivElement {
    return itemTile(this.pool, item, note, this.opts.context);
  }
}

function percentText(percent: number): string {
  return percent < 10 ? percent.toFixed(1) : String(Math.round(percent));
}
