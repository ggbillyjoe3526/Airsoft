import { ARMORY_TEXT } from '../../config/menus';
import { canTakeShots, type Dispensed, scrapAllSpares, scrapSpares, scrapValue, shotPrice, type ShotCount, spares, takeShots, tierChances, buyTokens } from '../../pool/armory';
import { type Collection, type ItemRef, ownedItems } from '../../pool/collection';
import { type Asset, fcPerToken, type Pool } from '../../pool/pool';
import { backButton, el, menuButton, menuPage } from './menuParts';

export interface ArmoryOptions {
  pool: Pool;
  /** The player's collection, changed in place. */
  collection: () => Collection;
  /** Something was bought, dispensed or scrapped: save the collection, and the Loadout follows it. */
  onChange: () => void;
  onBack: () => void;
}

/** The category names the collection list groups items under, in the pool's order. */
const CATEGORY_LABELS: Readonly<Record<Asset['category'], string>> = {
  replica: 'Replicas',
  power: 'Power sources',
  optic: 'Optics',
  grip: 'Grips',
  laser: 'Lasers',
  magazine: 'Magazines',
  grenade: 'Grenades',
};

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
 * column holds the balance, the exchange, the Shots and the odds; the right shows the last Shot's assets and everything
 * owned, with each item's spares to scrap.
 */
export class ArmoryScreen {
  readonly root: HTMLDivElement;
  private readonly side: HTMLDivElement;
  private readonly reveal: HTMLDivElement;
  private readonly owned: HTMLDivElement;
  private last: Dispensed[] = [];

  constructor(private readonly opts: ArmoryOptions) {
    const page = menuPage('menu-armory', 'Armory');
    this.root = page.root;
    page.root.querySelector('.menu-heading')?.append(' ', el('span', 'beta-tag', ARMORY_TEXT.beta));
    page.body.append(el('p', 'armory-free', ARMORY_TEXT.free));
    this.side = el('div', 'menu-panel armory-side');
    const main = el('div', 'menu-panel armory-main');
    this.reveal = el('div', 'armory-reveal');
    this.owned = el('div', 'armory-owned');
    main.append(this.reveal, this.owned);
    const columns = el('div', 'loadout-columns armory-columns');
    columns.append(this.side, main);
    page.body.append(columns);
    page.footer.append(backButton(opts.onBack));
    this.refresh();
  }

  /** Re-reads the collection (after a match paid FC, say), forgetting the last Shot. */
  refresh(): void {
    this.last = [];
    this.render();
  }

  private get pool(): Pool {
    return this.opts.pool;
  }

  /** Saves and redraws; the focus goes to the first of `focus` (data-action names) still there and enabled. */
  private changed(...focus: string[]): void {
    this.opts.onChange();
    this.render();
    for (const action of [...focus, 'shot-1']) {
      const b = this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
      if (b && !b.disabled) return void b.focus({ preventScroll: true });
    }
  }

  private render(): void {
    this.renderSide();
    this.renderReveal();
    this.renderOwned();
  }

  private renderSide(): void {
    const c = this.opts.collection();
    const e = this.pool.economy;
    const rate = fcPerToken(e);
    const balance = el('div', 'armory-balance');
    balance.setAttribute('role', 'status');
    balance.append(this.figure(ARMORY_TEXT.fc, fcText(c.fc)), this.figure(ARMORY_TEXT.tokens, String(c.tokens)));

    const exchange = el('div', 'armory-actions');
    for (const n of [1, 10]) {
      const b = this.actionButton(`buy-${n}`, `${ARMORY_TEXT.buy} ${tokensText(n)}`, fcText(n * rate), n * rate <= c.fc, () => {
        if (buyTokens(e, this.opts.collection(), n)) this.changed(`buy-${n}`);
      });
      exchange.append(b);
    }

    const shots = el('div', 'armory-actions');
    for (const n of [1, 10] as ShotCount[]) {
      const price = shotPrice(e, c, n);
      const cost = [price.tokens > 0 ? tokensText(price.tokens) : '', price.fc > 0 ? fcText(price.fc) : ''].filter(Boolean).join(' + ');
      const b = this.actionButton(`shot-${n}`, n === 1 ? ARMORY_TEXT.oneShot : ARMORY_TEXT.tenShots, cost, canTakeShots(e, c, n), () => {
        const got = takeShots(this.pool, this.opts.collection(), n);
        if (!got) return;
        this.last = got;
        this.changed(`shot-${n}`);
      });
      b.classList.add('armory-shot');
      shots.append(b);
    }

    const odds = el('table', 'armory-odds');
    odds.createCaption().textContent = ARMORY_TEXT.odds;
    const body = odds.createTBody();
    for (const { tier, percent } of tierChances(this.pool)) {
      const row = body.insertRow();
      const name = el('th', 'item-tier', tier.label);
      name.scope = 'row';
      name.dataset.tier = tier.id;
      row.append(name, el('td', '', `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`), el('td', 'armory-odds-scrap', `${ARMORY_TEXT.scrap} ${fcText(tier.scrapFc)}`));
    }
    const guarantee = e.tenShotGuarantee ? this.pool.tiers.find((t) => t.id === e.tenShotGuarantee) : undefined;
    const notes = [ARMORY_TEXT.perShot(e.assetsPerShot)];
    if (guarantee) notes.push(ARMORY_TEXT.guarantee(guarantee.label));

    this.side.replaceChildren(
      balance,
      el('p', 'menu-kicker', ARMORY_TEXT.exchange),
      el('p', 'menu-readout', ARMORY_TEXT.rate(rate)),
      exchange,
      el('p', 'menu-kicker', ARMORY_TEXT.shots),
      el('p', 'menu-readout', notes.join(' ')),
      shots,
      odds,
    );
  }

  private renderReveal(): void {
    this.reveal.replaceChildren();
    if (this.last.length === 0) return;
    const grid = el('div', 'item-grid armory-reveal-grid');
    for (const d of this.last) {
      const tile = this.tile(d.item, d.isNew ? ARMORY_TEXT.new : ARMORY_TEXT.spare);
      tile.classList.toggle('is-new', d.isNew);
      grid.append(tile);
    }
    const head = el('h2', 'menu-panel-title', ARMORY_TEXT.dispensed);
    this.reveal.append(head, grid);
    this.reveal.setAttribute('aria-live', 'polite');
  }

  private renderOwned(): void {
    const c = this.opts.collection();
    const head = el('div', 'loadout-replica-head');
    head.append(el('h2', 'menu-panel-title', ARMORY_TEXT.collection));
    const items = ownedItems(c, this.pool);
    const total = items.reduce((sum, item) => sum + spares(c, item) * scrapValue(this.pool, item), 0);
    if (total > 0) {
      const all = menuButton(`${ARMORY_TEXT.scrapAll} (+${fcText(total)})`, 'secondary', () => {
        scrapAllSpares(this.pool, this.opts.collection());
        this.changed('buy-1');
      });
      all.dataset.action = 'scrap-all';
      head.append(all);
    }
    const list = el('div', 'armory-list');
    let category: Asset['category'] | null = null;
    // Rarest first within each asset, as the Loadout lists them.
    const ordered = [...items].sort((a, b) => this.assetIndex(a) - this.assetIndex(b) || this.tierIndex(b) - this.tierIndex(a));
    for (const item of ordered) {
      const asset = this.pool.byId.get(item.asset)!;
      if (asset.category !== category) {
        category = asset.category;
        list.append(el('p', 'menu-kicker armory-category', CATEGORY_LABELS[category]));
      }
      list.append(this.ownedRow(item, asset));
    }
    this.owned.replaceChildren(head, el('p', 'menu-readout', ARMORY_TEXT.keepOne), list);
  }

  private ownedRow(item: ItemRef, asset: Asset): HTMLDivElement {
    const c = this.opts.collection();
    const row = el('div', 'armory-row');
    row.dataset.tier = item.tier;
    const n = spares(c, item) + 1;
    const name = el('span', 'armory-row-name', asset.name);
    row.append(name, el('span', 'item-tier', this.tierLabel(item)), el('span', 'armory-row-count', `×${n}`));
    const extra = n - 1;
    if (extra > 0) {
      const key = `scrap-${item.asset}-${item.tier}`;
      const b = menuButton(`${ARMORY_TEXT.scrap} ${extra} (+${fcText(extra * scrapValue(this.pool, item))})`, 'secondary', () => {
        scrapSpares(this.pool, this.opts.collection(), item);
        this.changed('scrap-all', 'buy-1');
      });
      b.dataset.action = key;
      b.setAttribute('aria-label', `${ARMORY_TEXT.scrap} ${extra} spare ${asset.name}, ${this.tierLabel(item)}, for ${fcText(extra * scrapValue(this.pool, item))}`);
      row.append(b);
    }
    return row;
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
    return b;
  }

  private tile(item: ItemRef, note: string): HTMLDivElement {
    const asset = this.pool.byId.get(item.asset)!;
    const tile = el('div', 'item-tile armory-tile');
    tile.dataset.tier = item.tier;
    tile.append(el('span', 'item-note', CATEGORY_LABELS[asset.category]), el('span', 'item-name', asset.name), el('span', 'item-tier', this.tierLabel(item)), el('span', 'item-note', note));
    return tile;
  }

  private tierLabel(item: ItemRef): string {
    return this.pool.tiers.find((t) => t.id === item.tier)?.label ?? item.tier;
  }

  private assetIndex(item: ItemRef): number {
    return this.pool.assets.findIndex((a) => a.id === item.asset);
  }

  private tierIndex(item: ItemRef): number {
    return this.pool.tiers.findIndex((t) => t.id === item.tier);
  }
}
