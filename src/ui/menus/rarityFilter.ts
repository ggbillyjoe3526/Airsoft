import { loadSetting, saveSetting } from '../../settings/storage';
import { el } from './menuParts';

/**
 * Sort and filter by rarity (M82, owner's 0.1 Dev 4 note 4): the Loadout's replicas and Customise's parts sort by
 * kind (as they always came: each replica or part together, rarest copy first) or by rarity (rarest first), and any
 * rarity tier can be hidden ("only Epic and Legendary"). Each list's choice is saved and read back on the next visit.
 */

/** How a list is ordered: by kind (pool order, each kind's rarest copy first) or by rarity (rarest first, then kind). */
export type RaritySort = 'kind' | 'rarity';

export interface RarityView {
  sort: RaritySort;
  /** Tier ids not shown. */
  hidden: ReadonlySet<string>;
}

/** The lists that keep their own choice: the Loadout's replicas, and Customise's parts (one choice for every part). */
export type RarityList = 'replicas' | 'parts';

export const RARITY_TEXT = {
  group: 'Sort and filter by rarity',
  sort: 'Sort',
  kind: { replicas: 'Replica', parts: 'Part' } as Readonly<Record<RarityList, string>>,
  rarity: 'Rarity',
  show: 'Show',
  /** The chip that shows every tier again, there while one is hidden. */
  all: 'All',
  hiddenCount: (n: number) => `${n} hidden`,
  noneShown: { replicas: 'No replicas in the tiers shown. Pick a tier above to see them.', parts: 'No parts in the tiers shown.' } as Readonly<Record<RarityList, string>>,
  chipTitle: (label: string, shown: boolean) => `${shown ? 'Hide' : 'Show'} ${label}`,
} as const;

/** What a list shows with nothing chosen yet: as it always came, every tier. */
export const DEFAULT_RARITY_VIEW: RarityView = { sort: 'kind', hidden: new Set() };

/**
 * The items to show, in order: those in a hidden tier left out (unless `keep` says it's the one picked, which always
 * shows), sorted rarest first when sorting by rarity (`tiers`: every tier id, commonest first). Stable: items of one
 * tier keep the order they came in. Pure.
 */
export function arrangeByRarity<T>(items: readonly T[], tierOf: (item: T) => string, tiers: readonly string[], view: RarityView, keep: (item: T) => boolean = () => false): T[] {
  const shown = items.filter((item) => !view.hidden.has(tierOf(item)) || keep(item));
  if (view.sort !== 'rarity') return shown;
  const rank = (item: T) => tiers.indexOf(tierOf(item));
  return shown
    .map((item, i) => ({ item, i, r: rank(item) }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map((x) => x.item);
}

/** The saved choice for `list` (`rarity.sort.<list>`, `rarity.hide.<list>`: tier ids, comma-separated); unknown tiers dropped. */
export function loadRarityView(list: RarityList, tiers: readonly string[], storage?: Storage | null): RarityView {
  const sort = loadSetting<RaritySort>(`rarity.sort.${list}`, (raw) => (raw === 'kind' || raw === 'rarity' ? raw : undefined), DEFAULT_RARITY_VIEW.sort, storage);
  const hidden = loadSetting(`rarity.hide.${list}`, (raw) => (typeof raw === 'string' ? raw : undefined), '', storage);
  return { sort, hidden: new Set(hidden.split(',').filter((t) => tiers.includes(t))) };
}

export function saveRarityView(list: RarityList, view: RarityView, tiers: readonly string[], storage?: Storage | null): void {
  saveSetting(`rarity.sort.${list}`, view.sort, storage);
  // In the tiers' own order, so the same choice is always saved the same way.
  saveSetting(`rarity.hide.${list}`, tiers.filter((t) => view.hidden.has(t)).join(','), storage);
}

/**
 * The bar over a list (M82): Sort (by kind or by rarity) and a chip per rarity tier, pressed while that tier shows, in
 * the tier's colour, with All while any is hidden and how many items are hidden. Reports each change; the list
 * arranges itself (arrangeByRarity). Built once per list; the DOM is touched only on a change.
 */
export class RarityBar {
  readonly root: HTMLDivElement;
  private readonly sortButtons: Record<RaritySort, HTMLButtonElement>;
  private readonly chips: HTMLButtonElement[];
  private readonly all: HTMLButtonElement;
  private readonly hiddenNote: HTMLSpanElement;

  constructor(
    list: RarityList,
    private readonly tiers: readonly { id: string; label: string }[],
    private view: RarityView,
    private readonly onChange: (view: RarityView) => void,
  ) {
    this.root = el('div', 'rarity-bar');
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', RARITY_TEXT.group);
    const sort = el('div', 'rarity-sort');
    sort.setAttribute('role', 'group');
    sort.setAttribute('aria-label', RARITY_TEXT.sort);
    this.sortButtons = { kind: this.button('rarity-sort-option', RARITY_TEXT.kind[list]), rarity: this.button('rarity-sort-option', RARITY_TEXT.rarity) };
    for (const id of ['kind', 'rarity'] as const) {
      this.sortButtons[id].addEventListener('click', () => this.set({ sort: id, hidden: this.view.hidden }));
      sort.append(this.sortButtons[id]);
    }
    const show = el('div', 'rarity-tiers');
    show.setAttribute('role', 'group');
    show.setAttribute('aria-label', RARITY_TEXT.show);
    this.chips = tiers.map((t) => {
      const chip = this.button('rarity-chip', t.label);
      chip.dataset.tier = t.id;
      chip.addEventListener('click', () => {
        const hidden = new Set(this.view.hidden);
        if (hidden.has(t.id)) hidden.delete(t.id);
        else hidden.add(t.id);
        this.set({ sort: this.view.sort, hidden });
      });
      return chip;
    });
    this.all = this.button('rarity-chip rarity-all', RARITY_TEXT.all);
    this.all.addEventListener('click', () => {
      // All hides itself once every tier shows: keep the keyboard's place on the first chip (BP3: focus was lost).
      const focused = document.activeElement === this.all;
      this.set({ sort: this.view.sort, hidden: new Set() });
      if (focused) this.chips[0]?.focus();
    });
    this.hiddenNote = el('span', 'rarity-hidden');
    this.hiddenNote.setAttribute('aria-live', 'polite');
    show.append(...this.chips, this.all, this.hiddenNote);
    // Each label stays with its buttons when the bar wraps.
    const part = (label: string, group: HTMLElement) => {
      const p = el('div', 'rarity-part');
      p.append(el('span', 'rarity-label', label), group);
      return p;
    };
    this.root.append(part(RARITY_TEXT.sort, sort), part(RARITY_TEXT.show, show));
    this.draw();
  }

  /** How many items the hidden tiers leave out of the list now ('' at none). */
  setHiddenCount(n: number): void {
    const text = n > 0 ? RARITY_TEXT.hiddenCount(n) : '';
    if (this.hiddenNote.textContent !== text) this.hiddenNote.textContent = text;
  }

  private set(view: RarityView): void {
    this.view = view;
    this.draw();
    this.onChange(view);
  }

  private draw(): void {
    for (const id of ['kind', 'rarity'] as const) this.sortButtons[id].setAttribute('aria-pressed', String(this.view.sort === id));
    this.chips.forEach((chip, i) => {
      const t = this.tiers[i]!;
      const shown = !this.view.hidden.has(t.id);
      chip.setAttribute('aria-pressed', String(shown));
      chip.title = RARITY_TEXT.chipTitle(t.label, shown);
    });
    this.all.hidden = this.view.hidden.size === 0;
  }

  private button(className: string, label: string): HTMLButtonElement {
    const b = el('button', className, label);
    b.type = 'button';
    return b;
  }
}
