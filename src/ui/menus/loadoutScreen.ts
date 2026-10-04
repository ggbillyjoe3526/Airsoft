import { GRIPS, handlingOf, MAGAZINES, type ReplicaParts } from '../../config/attachments';
import { LASERS } from '../../config/lasers';
import { OPTIC_BLURBS } from '../../config/optics';
import { BB_WEIGHT, type FireMode, HOP_UP, type PowerSource, type ReplicaConfig } from '../../config/replicas';
import { LOADOUT_TEXT } from '../../config/menus';
import type { ItemRef } from '../../pool/collection';
import type { FitSlot, KitSlot } from '../../pool/kit';
import { GEAR_SLOTS, type GearSlot, type LoadoutModel } from '../../pool/loadoutModel';
import { replicaOf } from '../../pool/pool';
import {
  bbWeightLabel,
  bbWeightReadout,
  gripReadout,
  hopUpLabel,
  hopUpReadout,
  laserReadout,
  magazineReadout,
  opticReadout,
  powerReadout,
} from '../loadoutChoice';
import { backButton, el, laterRow, menuButton, menuPage, menuRow, rangeControl } from './menuParts';

const FIRE_MODE_WORDS: Readonly<Record<FireMode, string>> = { semi: 'semi', burst: 'burst', auto: 'auto' };
const POWER_WORDS: Readonly<Record<PowerSource, string>> = { electric: 'Electric', gas: 'Gas' };

/**
 * The line under a replica's name: power, fire modes and the fitted magazine, e.g.
 * "Electric · semi, burst, auto · 60 BBs a magazine".
 */
export function replicaSummary(r: ReplicaConfig, parts: ReplicaParts): string {
  return `${POWER_WORDS[r.power]} · ${r.fireModes.map((m) => FIRE_MODE_WORDS[m]).join(', ')} · ${handlingOf(r, parts).magSize} BBs a magazine`;
}

export interface LoadoutOptions {
  model: LoadoutModel;
  /** Something on the loadout changed (it is already saved): New game's Loadout tile and the next Play follow it. */
  onChange: () => void;
  onBack: () => void;
}

/** The gear column's slots: the two replica slots, then Grenades (empty until grenades arrive, v0.3). */
type ColumnSlot = GearSlot | 'grenades';
const COLUMN: readonly ColumnSlot[] = [...GEAR_SLOTS, 'grenades'];

/** The Customise screen's rows that pick an item, top to bottom, with the label each shows for "as it comes". */
const FIT_ROWS: readonly { slot: FitSlot; label: string; none: string | null }[] = [
  { slot: 'optic', label: 'Optic', none: 'Iron Sights' },
  { slot: 'grip', label: 'Grip', none: 'No Grip' },
  { slot: 'laser', label: 'Laser', none: 'No Laser' },
  { slot: 'magazine', label: 'Magazine', none: 'Standard' },
  // Every replica needs a power source: no "none".
  { slot: 'power', label: 'Power Source', none: null },
];

/**
 * The Loadout screen (M26b), after Destiny 2's character screen without the character: a column of three square gear
 * slots (Primary, Secondary, Grenades) on the left; clicking one lists the replicas you own for it on the right (any
 * replica goes in either slot). Right-clicking an equipped replica (or its Customise button) opens its Customise view:
 * the optic, BB weight, hop-up, grip, laser, magazine and power source, showing only items you own that fit it. Every
 * item tile carries its rarity tier's colour. Changes save as they are made; the next Play (or Resume on the range)
 * uses them.
 */
export class LoadoutScreen {
  readonly root: HTMLDivElement;
  private readonly column = new Map<ColumnSlot, { button: HTMLButtonElement; name: HTMLSpanElement; tier: HTMLSpanElement }>();
  private readonly panel: HTMLDivElement;
  private selected: ColumnSlot = 'primary';
  /** The gear slot whose replica is being customised, or null on the item list. */
  private customising: GearSlot | null = null;

  constructor(private readonly opts: LoadoutOptions) {
    const page = menuPage('menu-loadout', 'Loadout');
    this.root = page.root;
    const gear = el('div', 'gear-column');
    for (const slot of COLUMN) {
      const label = el('p', 'menu-kicker gear-label', LOADOUT_TEXT.slots[slot]);
      const button = el('button', 'gear-slot');
      button.type = 'button';
      const name = el('span', 'gear-name');
      const tier = el('span', 'gear-tier');
      button.append(name, tier);
      button.addEventListener('click', () => this.select(slot));
      if (slot !== 'grenades') {
        button.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.customise(slot);
        });
      }
      if (slot === 'primary') button.dataset.autofocus = '';
      gear.append(label, button);
      this.column.set(slot, { button, name, tier });
    }
    gear.append(el('p', 'gear-hint', LOADOUT_TEXT.rightClickHint));
    this.panel = el('div', 'menu-panel loadout-panel');
    const columns = el('div', 'loadout-columns');
    columns.append(gear, this.panel);
    page.body.append(columns);
    page.footer.append(backButton(() => this.back()));
    this.refresh();
  }

  /** Re-reads the loadout (after the Armory unlocked something, say) and shows the item list of the picked slot. */
  refresh(): void {
    this.customising = null;
    this.render();
  }

  /** Esc: the Customise view goes back to the item list (true); on the item list the menus take Esc as Back (false). */
  handleEscape(): boolean {
    if (this.customising === null) return false;
    this.closeCustomise();
    return true;
  }

  private back(): void {
    if (!this.handleEscape()) this.opts.onBack();
  }

  private select(slot: ColumnSlot): void {
    this.selected = slot;
    this.customising = null;
    this.render();
  }

  private customise(slot: GearSlot): void {
    this.selected = slot;
    this.customising = slot;
    this.render();
    this.panel.querySelector<HTMLElement>('.item-tile, .loadout-close')?.focus({ preventScroll: true });
  }

  private closeCustomise(): void {
    const slot = this.customising;
    this.customising = null;
    this.render();
    if (slot) this.column.get(slot)?.button.focus({ preventScroll: true });
  }

  private render(): void {
    this.renderColumn();
    this.panel.replaceChildren();
    if (this.customising) this.renderCustomise(this.customising);
    else if (this.selected === 'grenades') this.renderGrenades();
    else this.renderChoices(this.selected);
  }

  private renderColumn(): void {
    const m = this.opts.model;
    const equipped = m.equipped();
    for (const slot of COLUMN) {
      const parts = this.column.get(slot)!;
      const on = slot === this.selected;
      parts.button.classList.toggle('selected', on);
      parts.button.setAttribute('aria-pressed', String(on));
      const ref = slot === 'grenades' ? null : (equipped[GEAR_SLOTS.indexOf(slot)] ?? null);
      parts.name.textContent = ref ? m.pool.byId.get(ref.asset)!.name : LOADOUT_TEXT.empty;
      parts.tier.textContent = ref ? this.tierLabel(ref) : '';
      setTier(parts.button, ref);
      parts.button.classList.toggle('empty', !ref);
      parts.button.setAttribute('aria-label', `${LOADOUT_TEXT.slots[slot]}: ${ref ? `${parts.name.textContent}, ${parts.tier.textContent}` : LOADOUT_TEXT.empty}`);
    }
  }

  /** The replicas you own for `slot`, the equipped one marked, and the ones in the pool you don't own yet, locked. */
  private renderChoices(slot: GearSlot): void {
    const m = this.opts.model;
    const i = GEAR_SLOTS.indexOf(slot);
    const equipped = m.equipped();
    const current = equipped[i];
    const head = el('div', 'loadout-replica-head');
    head.append(el('h2', 'menu-panel-title', LOADOUT_TEXT.slots[slot]));
    this.panel.append(head);
    const grid = el('div', 'item-grid');
    for (const ref of m.replicaChoices()) {
      const isCurrent = !!current && sameItem(ref, current);
      const elsewhere = equipped.some((r, j) => j !== i && r && sameItem(r, ref));
      const tile = this.itemTile(ref, isCurrent ? LOADOUT_TEXT.equipped : elsewhere ? LOADOUT_TEXT.slots[GEAR_SLOTS[1 - i]!] : '', isCurrent);
      tile.addEventListener('click', () => {
        m.equip(slot, ref);
        this.opts.onChange();
        this.render();
        this.panel.querySelector<HTMLElement>(`[data-item="${key(ref)}"]`)?.focus({ preventScroll: true });
      });
      tile.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        m.equip(slot, ref);
        this.opts.onChange();
        this.customise(slot);
      });
      grid.append(tile);
    }
    // Replicas in the pool you own no copy of: shown locked, so you know what the Armory can give.
    const owned = new Set(m.replicaChoices().map((r) => r.asset));
    for (const a of m.pool.assets) {
      if (a.category !== 'replica' || owned.has(a.id)) continue;
      grid.append(lockedTile(a.name));
    }
    this.panel.append(grid);
    if (current) {
      const customise = menuButton(`${LOADOUT_TEXT.customise} ${m.pool.byId.get(current.asset)!.name}`, 'secondary', () => this.customise(slot), true);
      customise.classList.add('loadout-customise');
      this.panel.append(customise);
    }
  }

  private renderGrenades(): void {
    const head = el('div', 'loadout-replica-head');
    head.append(el('h2', 'menu-panel-title', LOADOUT_TEXT.slots.grenades));
    this.panel.append(head, el('p', 'loadout-note', LOADOUT_TEXT.grenadesLater));
  }

  /** The Customise view: every customisable part of the replica in `slot`, its numbers under each. */
  private renderCustomise(slot: GearSlot): void {
    const m = this.opts.model;
    const ref = m.equipped()[GEAR_SLOTS.indexOf(slot)];
    if (!ref) return this.renderChoices(slot);
    const asset = m.pool.byId.get(ref.asset)!;
    const base = replicaOf(asset);
    const kit = m.slotKit(ref);
    const head = el('div', 'loadout-replica-head');
    const title = el('h2', 'menu-panel-title', `${LOADOUT_TEXT.customise}: ${asset.name}`);
    const tier = el('span', 'tier-tag', this.tierLabel(ref));
    setTier(tier, ref);
    title.append(' ', tier);
    const close = menuButton(LOADOUT_TEXT.backToGear, 'secondary', () => this.closeCustomise());
    close.classList.add('loadout-close');
    head.append(title, close);
    this.panel.append(head, el('p', 'loadout-replica-summary', replicaSummary(kit.replica, kit.parts)));

    const fit = m.fitOf(asset.id);
    let grams = m.bbWeight(base);
    let dial = m.hopUp(base);
    // Readouts that follow the sliders without a full redraw (that would drop the slider being dragged).
    const powerLine = el('p', 'menu-readout');
    const live = (): void => {
      powerLine.textContent = powerReadout(kit, grams);
    };
    for (const row of FIT_ROWS) {
      // No rail for it in the pool (nothing could ever fit): a greyed row. Magazines and power always have a choice.
      if (row.none !== null && row.slot !== 'magazine' && !m.hasSlot(asset.id, row.slot)) {
        this.panel.append(fixedRow(row.label, LOADOUT_TEXT.noMount));
        if (row.slot === 'optic') this.appendBbRows(base, kit.replica, grams, dial, (g, d) => ((grams = g), (dial = d), live()));
        continue;
      }
      const choices = m.fitChoices(asset.id, row.slot);
      const tiles = el('div', 'item-row');
      tiles.setAttribute('role', 'group');
      tiles.setAttribute('aria-label', row.label);
      const pick = (item: ItemRef | null): void => {
        m.setFit(asset.id, row.slot, item);
        this.opts.onChange();
        const focusKey = item ? key(item) : `none:${row.slot}`;
        this.render();
        this.panel.querySelector<HTMLElement>(`[data-item="${focusKey}"]`)?.focus({ preventScroll: true });
      };
      if (row.none !== null) {
        const tile = smallTile(row.none, '', fit[row.slot] === null);
        tile.dataset.item = `none:${row.slot}`;
        tile.addEventListener('click', () => pick(null));
        tiles.append(tile);
      }
      for (const item of choices) {
        const on = !!fit[row.slot] && sameItem(fit[row.slot]!, item);
        const tile = smallTile(m.pool.byId.get(item.asset)!.name, this.tierLabel(item), on);
        tile.dataset.item = key(item);
        setTier(tile, item);
        tile.addEventListener('click', () => pick(item));
        tiles.append(tile);
      }
      const control = el('div', 'menu-row-control');
      control.append(tiles, el('p', 'picker-blurb', this.fitBlurb(row.slot, kit, fit.power)));
      control.append(row.slot === 'power' ? powerLine : el('p', 'menu-readout', this.fitReadout(row.slot, kit)));
      if (choices.length === 0 && row.none !== null) control.append(el('p', 'menu-readout menu-faint', LOADOUT_TEXT.armoryHint));
      this.panel.append(menuRow(row.label, '', control));
      // BB weight and hop-up go after the optic, before the parts that change handling: as you set a replica up at a site.
      if (row.slot === 'optic') this.appendBbRows(base, kit.replica, grams, dial, (g, d) => ((grams = g), (dial = d), live()));
    }
    live();
    this.panel.append(laterRow('Skins', '', LOADOUT_TEXT.skinsLater));
  }

  /** The BB weight slider (free, never pooled) and the hop-up dial, their readouts following each other. */
  private appendBbRows(base: ReplicaConfig, carried: ReplicaConfig, grams0: number, dial0: number, changed: (grams: number, dial: number) => void): void {
    let grams = grams0;
    let dial = dial0;
    const weightLine = el('p', 'menu-readout', bbWeightReadout(carried, grams));
    const hopLine = el('p', 'menu-readout', hopUpReadout(carried, dial, grams));
    const weight = rangeControl(`${carried.name} BB weight`, { min: BB_WEIGHT.min, max: BB_WEIGHT.max, step: BB_WEIGHT.step }, grams, bbWeightLabel, `bbWeight.${base.id}`, (v) => {
      grams = Math.round(v * 100) / 100;
      weightLine.textContent = bbWeightReadout(carried, grams);
      hopLine.textContent = hopUpReadout(carried, dial, grams);
      changed(grams, dial);
      this.opts.onChange();
    });
    weight.append(weightLine);
    const hop = rangeControl(`${carried.name} hop-up`, { min: HOP_UP.minDial, max: HOP_UP.maxDial, step: HOP_UP.dialStep }, dial, hopUpLabel, `hopUp.${base.id}`, (v) => {
      dial = v;
      hopLine.textContent = hopUpReadout(carried, dial, grams);
      changed(grams, dial);
      this.opts.onChange();
    });
    hop.classList.add('loadout-hopup');
    hop.append(hopLine);
    this.panel.append(menuRow('BB Weight', '', weight), menuRow('Hop-Up', '', hop));
  }

  /** What the fitted item (or "as it comes") is, in a line. */
  private fitBlurb(slot: FitSlot, kit: KitSlot, power: ItemRef | null): string {
    if (slot === 'optic') return OPTIC_BLURBS[kit.optic ?? 'none'];
    if (slot === 'grip') return GRIPS[kit.parts.grip].blurb;
    if (slot === 'magazine') return MAGAZINES[kit.parts.magazine].blurb;
    if (slot === 'laser') return kit.parts.laser ? LASERS[kit.parts.laser].blurb : 'No laser: the spread as it comes.';
    const type = power ? this.opts.model.pool.byId.get(power.asset)?.power?.type : undefined;
    return type ? LOADOUT_TEXT.powerBlurb[type] : '';
  }

  private fitReadout(slot: FitSlot, kit: KitSlot): string {
    if (slot === 'optic') return opticReadout(kit);
    if (slot === 'grip') return gripReadout(kit);
    if (slot === 'magazine') return magazineReadout(kit);
    if (slot === 'laser') return laserReadout(kit);
    return '';
  }

  private tierLabel(ref: ItemRef): string {
    return this.opts.model.pool.tiers.find((t) => t.id === ref.tier)?.label ?? ref.tier;
  }

  /** A square tile for an owned item: its name, its tier, and a note (Equipped, or the other slot it is in). */
  private itemTile(ref: ItemRef, note: string, selected: boolean): HTMLButtonElement {
    const tile = el('button', 'item-tile');
    tile.type = 'button';
    tile.dataset.item = key(ref);
    setTier(tile, ref);
    tile.classList.toggle('selected', selected);
    tile.setAttribute('aria-pressed', String(selected));
    const name = this.opts.model.pool.byId.get(ref.asset)!.name;
    tile.append(el('span', 'item-name', name), el('span', 'item-tier', this.tierLabel(ref)));
    if (note) tile.append(el('span', 'item-note', note));
    return tile;
  }
}

function key(ref: ItemRef): string {
  return `${ref.asset}@${ref.tier}`;
}

function sameItem(a: ItemRef, b: ItemRef): boolean {
  return a.asset === b.asset && a.tier === b.tier;
}

/** The tier colour hook for the stylesheet (`data-tier`; a tier the stylesheet doesn't know shows grey). */
function setTier(node: HTMLElement, ref: ItemRef | null): void {
  if (ref) node.dataset.tier = ref.tier;
  else delete node.dataset.tier;
}

function smallTile(name: string, tier: string, selected: boolean): HTMLButtonElement {
  const tile = el('button', 'item-chip');
  tile.type = 'button';
  tile.classList.toggle('selected', selected);
  tile.setAttribute('aria-pressed', String(selected));
  tile.append(el('span', 'item-name', name));
  if (tier) tile.append(el('span', 'item-tier', tier));
  return tile;
}

function lockedTile(name: string): HTMLDivElement {
  const tile = el('div', 'item-tile locked');
  tile.append(el('span', 'item-name', name), el('span', 'item-note', LOADOUT_TEXT.locked));
  return tile;
}

/** A greyed row for a part this replica has no rail or mount for. */
function fixedRow(label: string, value: string): HTMLDivElement {
  const control = el('div', 'menu-row-control');
  control.append(el('span', 'menu-later-value', value));
  return menuRow(label, '', control, true);
}
