import { HOP_UP } from '../../config/replicas';
import { GEAR_TEXT, LOADOUT_TEXT, MENU_TEXT } from '../../config/menus';
import { defaultScheme, SCHEMES, hasFixedColours, FAMILIES } from '../../config/schemes';
import { type ItemRef, itemKey } from '../../pool/item';
import { GEAR_SLOTS, type GearSlot, type LoadoutModel } from '../../pool/loadoutModel';
import { type Asset, replicaOf } from '../../pool/pool';
import { gearLine, performanceOf, sheetRows } from '../performanceSheet';
import { type MenuHint, optionTick, sectionHead } from './chrome';
import { CustomiseView } from './customiseView';
import { ITEM_ICONS, itemIcon, MENU_ICONS } from './icons';
import type { PictureContext } from './kitStrip';
import { el, menuButton } from './menuParts';
import { partSubject, PictureSlot, replicaSubject } from './menuPictures';
import { perfRows, perfSheet } from './perfBars';

export { fixedValue, replicaSummary } from './customiseView';

export interface LoadoutOptions {
  model: LoadoutModel;
  context: PictureContext;
  /** Something on the loadout changed (it is already saved): the Play screen and the next Play follow it. */
  onChange: () => void;
}

/** A carried replica's card: its slot's button (the picture, name, colour and stat line) and its Customise button. */
interface CarriedCard {
  root: HTMLDivElement;
  button: HTMLButtonElement;
  pic: PictureSlot;
  name: HTMLSpanElement;
  colour: HTMLSpanElement;
  stats: HTMLSpanElement;
  chips: HTMLDivElement;
  customise: HTMLButtonElement;
}

/** A replica you have unlocked, as a tile in the grid. */
interface ReplicaTile {
  ref: ItemRef;
  button: HTMLButtonElement;
  pic: PictureSlot;
  note: HTMLSpanElement;
}

/**
 * The Loadout screen (M26b; G3 layout): what you carry on the left (Primary and Secondary as big picture cards with
 * their fitted parts, then Grenades, empty until they arrive), the replicas you have unlocked in the middle (any goes in
 * either slot, LV1: the ones still to unlock after them, locked, with their levels) and the selected slot's numbers on
 * the right. Right-click an equipped replica, its Customise button or C opens
 * Customise. A pick changes only the tiles it touches; nothing here redraws on its own.
 */
export class LoadoutScreen {
  readonly root: HTMLDivElement;
  private readonly gearView: HTMLDivElement;
  private readonly cards = new Map<GearSlot, CarriedCard>();
  private readonly grid: HTMLDivElement;
  /** "Level up to unlock more": hidden while levelling is off (LV1). */
  private readonly levelNote: HTMLParagraphElement;
  private tiles: ReplicaTile[] = [];
  private locked: HTMLElement[] = [];
  private readonly selectedName: HTMLHeadingElement;
  private readonly selectedLine: HTMLParagraphElement;
  private readonly sheet = perfSheet('loadout-perf');
  private readonly customiseBox: HTMLDivElement;
  private readonly gearHints: readonly MenuHint[];
  private selected: GearSlot = 'primary';
  /** The Customise view while it is open, and the slot whose replica it customises. */
  private view: CustomiseView | null = null;
  private customising: GearSlot | null = null;

  constructor(private readonly opts: LoadoutOptions) {
    this.root = el('div', 'menu-screen menu-page menu-loadout menu-hub');
    this.root.hidden = true;
    this.gearView = el('div', 'loadout-view');

    const carried = el('section', 'loadout-carried');
    carried.append(sectionHead('01', GEAR_TEXT.carried));
    for (const slot of GEAR_SLOTS) {
      const card = this.carriedCard(slot);
      this.cards.set(slot, card);
      carried.append(card.root);
    }
    const grenades = el('button', 'gear-slot gear-grenades empty');
    grenades.type = 'button';
    grenades.setAttribute('aria-disabled', 'true');
    grenades.setAttribute('aria-label', `${LOADOUT_TEXT.slots.grenades}: ${LOADOUT_TEXT.empty}`);
    const lock = el('span', 'gear-lock');
    lock.innerHTML = MENU_ICONS.lock;
    const words = el('span', 'gear-words');
    words.append(el('span', 'menu-kicker', LOADOUT_TEXT.slots.grenades), el('span', 'gear-note', LOADOUT_TEXT.grenadesLater));
    grenades.append(el('span', 'stripes'), lock, words);
    carried.append(grenades);

    const owned = el('section', 'loadout-replicas');
    owned.append(sectionHead('02', GEAR_TEXT.replicas));
    this.grid = el('div', 'item-grid replica-grid');
    this.levelNote = el('p', 'loadout-note', GEAR_TEXT.unlockMore);
    owned.append(this.grid, this.levelNote);

    const aside = el('aside', 'loadout-selected menu-card');
    aside.setAttribute('aria-label', GEAR_TEXT.selected);
    this.selectedName = el('h2', 'selected-name');
    this.selectedLine = el('p', 'selected-line');
    this.sheet.root.classList.add('selected-sheet');
    aside.append(el('p', 'menu-kicker', GEAR_TEXT.selected), this.selectedName, this.selectedLine, this.sheet.root, el('p', 'gear-hint', LOADOUT_TEXT.rightClickHint));

    this.gearView.append(carried, owned, aside);
    this.customiseBox = el('div', 'customise-box');
    this.customiseBox.hidden = true;
    // C customises the selected replica (the Customise button and a right-click do it for the mouse); Esc is Back.
    this.gearHints = [{ keys: ['C'], label: MENU_TEXT.hints.customise, run: () => this.customise(this.selected), code: 'KeyC' }];
    this.root.append(el('h1', 'menu-heading sr-only', 'Loadout'), this.gearView, this.customiseBox);
    // Right-click means Customise here: never the browser's menu, even off a replica.
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.refresh();
  }

  /** The key hints on show now: the gear's, or Customise's. */
  get hints(): readonly MenuHint[] {
    return this.view?.hints ?? this.gearHints;
  }

  /** Re-reads the loadout (after a level unlocked something, say) and shows the gear. */
  refresh(): void {
    this.closeView();
    this.buildGrid();
    this.update();
  }

  /** Esc: Customise goes back to the gear (true); on the gear the menus take Esc as Back (false). */
  handleEscape(): boolean {
    if (this.customising === null) return false;
    this.closeCustomise();
    return true;
  }

  private carriedCard(slot: GearSlot): CarriedCard {
    const root = el('div', `carried-card carried-${slot}`);
    const button = el('button', 'gear-slot');
    button.type = 'button';
    const pic = new PictureSlot('carried-pic');
    const name = el('span', 'gear-name');
    const colour = el('span', 'gear-colour');
    const stats = el('span', 'gear-stats');
    const words = el('span', 'gear-words');
    words.append(el('span', 'menu-kicker', LOADOUT_TEXT.slots[slot]), name, colour, stats);
    const chips = el('div', 'part-chips');
    button.append(pic.root, words, chips);
    button.addEventListener('click', () => this.select(slot));
    button.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.customise(slot);
    });
    if (slot === 'primary') button.dataset.autofocus = '';
    const customise = menuButton(LOADOUT_TEXT.customise, 'primary', () => this.customise(slot));
    customise.classList.add('carried-customise');
    root.append(button, customise);
    return { root, button, pic, name, colour, stats, chips, customise };
  }

  /**
   * The replicas you have unlocked, a tile each, then the ones still to unlock, locked, with their levels (LV1; none
   * while levelling is off). Made again only when what you have may have changed.
   */
  private buildGrid(): void {
    const m = this.opts.model;
    this.tiles = m.replicaChoices().map((ref) => {
      const asset = m.pool.byId.get(ref.asset)!;
      const button = el('button', 'item-tile replica-tile');
      button.type = 'button';
      button.dataset.item = itemKey(ref);
      const pic = new PictureSlot('tile-pic');
      const note = el('span', 'item-note');
      const words = el('span', 'item-words');
      words.append(el('span', 'item-name', asset.name));
      button.append(pic.root, words, note, optionTick());
      button.addEventListener('click', () => this.equip(ref));
      // Right-click customises the equipped replica only: a misplaced right-click never swaps what you carry.
      button.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const i = GEAR_SLOTS.indexOf(this.selected);
        const current = m.equipped()[i];
        if (current && sameItem(current, ref)) this.customise(this.selected);
      });
      return { ref, button, pic, note };
    });
    const levelling = this.opts.context.levelling?.() !== false;
    this.locked = levelling ? m.lockedReplicas().map(({ item, level }) => lockedTile(m.pool.byId.get(item.asset)!, level, this.opts.context)) : [];
    this.levelNote.hidden = !levelling;
    this.grid.replaceChildren(...this.tiles.map((t) => t.button), ...this.locked);
  }

  private select(slot: GearSlot): void {
    this.selected = slot;
    this.update();
  }

  private equip(ref: ItemRef): void {
    const m = this.opts.model;
    m.equip(this.selected, ref);
    this.opts.onChange();
    this.update();
  }

  /**
   * Shows the loadout as it is now. Each element changes only if what it shows changed, so picking a replica touches its
   * tile, the one it replaced, the slot's card and the numbers, and the pictures already drawn stay.
   */
  private update(): void {
    const m = this.opts.model;
    const equipped = m.equipped();
    const realistic = this.opts.context.realistic();
    for (const [slot, card] of this.cards) {
      const ref = equipped[GEAR_SLOTS.indexOf(slot)] ?? null;
      const on = slot === this.selected;
      card.button.classList.toggle('selected', on);
      setAttr(card.button, 'aria-pressed', String(on));
      card.root.classList.toggle('selected', on);
      const asset = ref ? m.pool.byId.get(ref.asset)! : null;
      setText(card.name, asset ? asset.name : LOADOUT_TEXT.empty);
      const colour = asset && !hasFixedColours(replicaOf(asset)) ? this.schemeName(asset) : '';
      setText(card.colour, colour);
      setText(card.stats, ref ? gearLine(m.slotKit(ref), m.bbWeight(ref.asset)) : '');
      card.root.classList.toggle('empty', !ref);
      setAttr(card.button, 'aria-label', `${LOADOUT_TEXT.slots[slot]}: ${asset ? `${asset.name}${colour ? `, ${colour}` : ''}` : LOADOUT_TEXT.empty}`);
      card.customise.hidden = !ref;
      if (asset) setAttr(card.customise, 'aria-label', `${LOADOUT_TEXT.customise} ${asset.name}`);
      card.pic.show(this.opts.context.pictures, ref && asset ? replicaSubject(asset, m.scheme(asset.id), realistic, m.slotKit(ref)) : null, asset ? itemIcon(asset) : ITEM_ICONS.aeg);
      this.updateChips(card, ref);
    }
    const i = GEAR_SLOTS.indexOf(this.selected);
    const current = equipped[i] ?? null;
    for (const t of this.tiles) {
      const isCurrent = !!current && sameItem(t.ref, current);
      const elsewhere = equipped.some((r, j) => j !== i && r && sameItem(r, t.ref));
      t.button.classList.toggle('selected', isCurrent);
      setAttr(t.button, 'aria-pressed', String(isCurrent));
      setText(t.note, isCurrent ? LOADOUT_TEXT.equipped : elsewhere ? LOADOUT_TEXT.slots[GEAR_SLOTS[1 - i]!] : '');
      const asset = m.pool.byId.get(t.ref.asset)!;
      t.pic.show(this.opts.context.pictures, replicaSubject(asset, m.scheme(asset.id), realistic, m.slotKit(t.ref)), itemIcon(asset));
    }
    this.updateSelected(current);
  }

  /** The parts fitted to a carried replica, as small pictures under its name. */
  private updateChips(card: CarriedCard, ref: ItemRef | null): void {
    const m = this.opts.model;
    const fit = ref ? m.fitOf(ref.asset) : null;
    const items = fit ? (['optic', 'grip', 'laser', 'barrel', 'muzzle', 'magazine', 'light'] as const).flatMap((s) => (fit[s] ? [m.pool.byId.get(fit[s]!.asset)!] : [])) : [];
    const signature = items.map((a) => a.id).join(',');
    if (card.chips.dataset.items === signature) return;
    card.chips.dataset.items = signature;
    card.chips.replaceChildren(
      ...items.map((a) => {
        const chip = el('span', 'part-chip');
        const pic = new PictureSlot('chip-pic');
        pic.show(this.opts.context.pictures, partSubject(a, this.opts.context.realistic()), itemIcon(a));
        chip.append(pic.root, el('span', '', a.name));
        return chip;
      }),
    );
  }

  /** The Selected panel: the selected slot's replica as carried, its numbers against the replica as it comes. */
  private updateSelected(ref: ItemRef | null): void {
    const m = this.opts.model;
    if (!ref) {
      setText(this.selectedName, LOADOUT_TEXT.empty);
      this.selectedLine.replaceChildren();
      this.sheet.rows.replaceChildren();
      return;
    }
    const asset = m.pool.byId.get(ref.asset)!;
    const base = replicaOf(asset);
    setText(this.selectedName, asset.name);
    setText(this.selectedLine, hasFixedColours(base) ? GEAR_TEXT.asCarried : `${this.schemeName(asset)} · ${GEAR_TEXT.asCarried}`);
    const factory = performanceOf(m.asItComes(asset.id), base.bbWeight, base.hopUpDial);
    const now = performanceOf(m.slotKit(ref), m.bbWeight(asset.id), m.hopUp(asset.id), m.capped(ref));
    this.sheet.rows.replaceChildren(...perfRows(sheetRows(now, factory, HOP_UP.readoutRange)));
  }

  private customise(slot: GearSlot): void {
    const ref = this.opts.model.equipped()[GEAR_SLOTS.indexOf(slot)];
    if (!ref) return;
    this.closeView();
    this.selected = slot;
    this.customising = slot;
    this.view = new CustomiseView({ model: this.opts.model, context: this.opts.context, onChange: () => this.opts.onChange(), onBack: () => this.closeCustomise() }, ref);
    this.customiseBox.replaceChildren(this.view.root);
    this.customiseBox.hidden = false;
    this.gearView.hidden = true;
    this.view.focus();
  }

  private closeCustomise(): void {
    const slot = this.customising;
    this.closeView();
    this.update();
    if (slot) this.cards.get(slot)?.button.focus({ preventScroll: true });
  }

  private closeView(): void {
    if (!this.view) return;
    this.view = null;
    this.customising = null;
    this.customiseBox.replaceChildren();
    this.customiseBox.hidden = true;
    this.gearView.hidden = false;
  }

  private schemeName(asset: Asset): string {
    const scheme = this.opts.model.scheme(asset.id);
    return this.opts.context.realistic() ? FAMILIES[SCHEMES[scheme].family].name : SCHEMES[scheme].name;
  }
}

function sameItem(a: ItemRef, b: ItemRef): boolean {
  return a.asset === b.asset;
}

/**
 * A replica still to unlock (LV1): its picture, its name and the level that unlocks it, greyed and out of reach (no
 * button: nothing to pick yet). The Armory shows the whole track.
 */
function lockedTile(asset: Asset, level: number, context: PictureContext): HTMLDivElement {
  const tile = el('div', 'item-tile replica-tile is-locked');
  tile.dataset.item = asset.id;
  const pic = new PictureSlot('tile-pic');
  pic.show(context.pictures, replicaSubject(asset, defaultScheme(replicaOf(asset)), context.realistic()), itemIcon(asset));
  const lock = el('span', 'item-lock');
  lock.setAttribute('aria-hidden', 'true');
  lock.innerHTML = MENU_ICONS.lock;
  const words = el('span', 'item-words');
  words.append(el('span', 'item-name', asset.name));
  tile.append(pic.root, words, el('span', 'item-note item-level', LOADOUT_TEXT.lockedAt(level)), lock);
  return tile;
}

/** Sets a node's text only when it changes, so an unchanged tile isn't touched. */
function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

function setAttr(node: HTMLElement, name: string, value: string): void {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}
