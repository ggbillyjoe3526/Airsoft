import { BARRELS, GRIPS, handlingOf, MAGAZINES, MUZZLES, type ReplicaParts } from '../../config/attachments';
import { GLOW_BB_CHOICES } from '../../config/glowBBs';
import { LASERS } from '../../config/lasers';
import { GEAR_TEXT, LOADOUT_TEXT, MENU_TEXT } from '../../config/menus';
import { OPTIC_BLURBS } from '../../config/optics';
import { BB_WEIGHT, type FireMode, HOP_UP, type PowerSource, type ReplicaConfig } from '../../config/replicas';
import { FAMILY_IDS, hasFixedColours, type PaintId, paintColours, paintName } from '../../config/schemes';
import { TORCHES } from '../../config/torches';
import { type ItemRef, itemKey } from '../../pool/item';
import type { FitSlot, KitSlot } from '../../pool/kit';
import type { LoadoutModel } from '../../pool/loadoutModel';
import { type Asset, hasBuiltInPower, replicaOf } from '../../pool/pool';
import {
  barrelReadout,
  bbWeightLabel,
  bbWeightReadout,
  gripReadout,
  hopUpLabel,
  hopUpReadout,
  laserReadout,
  lightReadout,
  magazineReadout,
  muzzleReadout,
  opticReadout,
  powerReadout,
} from '../loadoutChoice';
import { OptionPicker } from '../optionPicker';
import { performanceOf, sheetRows } from '../performanceSheet';
import { type MenuHint, optionTick } from './chrome';
import { itemIcon, MENU_ICONS } from './icons';
import type { PictureContext } from './kitStrip';
import { tabAfterKey } from './menuNav';
import { el, menuButton, menuRow, rangeControl, withIcon } from './menuParts';
import { partSubject, PictureSlot, replicaSubject } from './menuPictures';
import { perfRows, perfSheet } from './perfBars';

const FIRE_MODE_WORDS: Readonly<Record<FireMode, string>> = { semi: 'semi', burst: 'burst', auto: 'auto' };
const POWER_WORDS: Readonly<Record<PowerSource, string>> = { electric: 'Electric', gas: 'Gas' };

/**
 * The line under a replica's name: power, fire modes and the fitted magazine, e.g.
 * "Electric · semi, burst, auto · 60 BBs a magazine".
 */
export function replicaSummary(r: ReplicaConfig, parts: ReplicaParts): string {
  return `${POWER_WORDS[r.power]} · ${r.fireModes.map((m) => FIRE_MODE_WORDS[m]).join(', ')} · ${handlingOf(r, parts).magSize} BBs a magazine`;
}

/** What a part row says when nothing can be fitted there. */
export function fixedValue(slot: FitSlot, kit: KitSlot): string {
  if (slot === 'barrel') return LOADOUT_TEXT.fixedBarrel;
  if (slot === 'muzzle') return LOADOUT_TEXT.noThread;
  if (slot === 'magazine') return LOADOUT_TEXT.ownMagazine(handlingOf(kit.replica, kit.parts).magSize);
  if (slot === 'power') return LOADOUT_TEXT.builtInBattery;
  return LOADOUT_TEXT.noMount;
}

/** The parts that pick an item, in the list's order, with the label each shows for "as it comes" (null: no "none"). */
const FIT_ROWS: readonly { slot: FitSlot; label: string; none: string | null }[] = [
  { slot: 'optic', label: 'Optic', none: 'Iron Sights' },
  { slot: 'grip', label: 'Grip', none: 'No Grip' },
  { slot: 'laser', label: 'Laser', none: 'No Laser' },
  { slot: 'barrel', label: 'Barrel', none: 'Standard' },
  { slot: 'muzzle', label: 'Muzzle', none: 'None' },
  { slot: 'magazine', label: 'Magazine', none: 'Standard' },
  // M33h: the weapon torch, switched in play with the Weapon torch key.
  { slot: 'light', label: 'Light', none: 'No Light' },
  // Every replica needs a power source: no "none".
  { slot: 'power', label: 'Power Source', none: null },
];

type PartId = 'colour' | FitSlot | 'bbs';

/** One row of the part list: its tab, what it shows now, and its panel (made when first shown). */
interface Part {
  id: PartId;
  tab: HTMLButtonElement;
  value: HTMLSpanElement;
  pic: PictureSlot | null;
  swatch: HTMLSpanElement | null;
  panel: HTMLDivElement | null;
  build: () => HTMLElement[];
  /** Follows a change: the tab's line and picture, and (once made) its panel. */
  update: () => void;
}

export interface CustomiseOptions {
  model: LoadoutModel;
  context: PictureContext;
  /** Something changed (it is already saved): the Loadout and the Play screen follow it. */
  onChange: () => void;
  /** Back to the gear (Esc, the Back button). */
  onBack: () => void;
}

/**
 * Customise (M26b, M29; G3 layout; MR1): a Back button over one replica's parts down the left, Colour first (William:
 * the colour is picked per replica here, a bold scheme or a realistic plain colour), then each part with what is fitted
 * and the BBs (Skins left, MR1: outfits get their own place later); the picked part's options as picture tiles in the
 * middle under the replica's own picture; the Performance sheet on the right, or on Colour the other replica's colour.
 * Built when it opens; a pick changes only what it touches.
 */
export class CustomiseView {
  readonly root: HTMLDivElement;
  readonly hints: readonly MenuHint[];
  private readonly parts: Part[] = [];
  private readonly asset: Asset;
  private readonly base: ReplicaConfig;
  private kit: KitSlot;
  private grams: number;
  private dial: number;
  private readonly hero = new PictureSlot('customise-hero');
  private readonly titleLine: HTMLParagraphElement;
  private readonly summary: HTMLParagraphElement;
  private readonly panels: HTMLDivElement;
  private readonly perf = perfSheet('customise-perf');
  private readonly colourAside: HTMLElement;
  private current: PartId;

  constructor(
    private readonly opts: CustomiseOptions,
    private readonly ref: ItemRef,
  ) {
    const m = opts.model;
    this.asset = m.pool.byId.get(ref.asset)!;
    this.base = replicaOf(this.asset);
    this.kit = m.slotKit(ref);
    this.grams = m.bbWeight(this.asset.id);
    this.dial = m.hopUp(this.asset.id);
    this.root = el('div', 'customise');

    // A Back button (MR1, owner 2026-10-16): the way back to the Loadout, with Esc; the trail beside it is only words.
    const bar = el('div', 'customise-bar');
    const back = withIcon(menuButton(MENU_TEXT.hints.back, 'secondary', opts.onBack), MENU_ICONS.arrowLeft);
    back.classList.add('customise-back');
    const crumbs = el('p', 'customise-crumbs');
    crumbs.append(el('span', '', `${GEAR_TEXT.breadcrumb} › ${this.asset.name} › `), el('b', '', LOADOUT_TEXT.customise));
    bar.append(back, crumbs);

    const list = el('div', 'customise-parts');
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', GEAR_TEXT.parts);
    list.setAttribute('aria-orientation', 'vertical');
    list.addEventListener('keydown', (e) => this.onTabKey(e));
    this.makeParts();
    for (const p of this.parts) list.append(p.tab);

    const centre = el('div', 'customise-centre');
    const head = el('div', 'customise-head');
    const title = el('h2', 'customise-title');
    title.append(el('span', 'sr-only', `${LOADOUT_TEXT.customise}: `), this.asset.name);
    this.titleLine = el('p', 'customise-line');
    this.summary = el('p', 'customise-summary');
    head.append(title, this.titleLine, this.summary);
    if (hasFixedColours(this.base)) head.append(el('p', 'customise-note', GEAR_TEXT.fixedColours));
    const stage = el('div', 'customise-stage');
    stage.append(this.hero.root, head);
    this.panels = el('div', 'customise-panels');
    centre.append(stage, this.panels);

    this.colourAside = el('aside', 'colour-aside menu-card');
    this.colourAside.setAttribute('aria-label', GEAR_TEXT.colour);
    const side = el('div', 'customise-side');
    this.perf.root.classList.add('menu-card');
    side.append(this.perf.root, this.colourAside);

    const layout = el('div', 'customise-layout');
    layout.append(list, centre, side);
    // Esc goes back to the gear (the Loadout handles it; the Back button does it for the mouse); ↑ ↓ move between parts.
    this.hints = [];
    this.root.append(bar, layout);
    this.refreshHead();
    this.livePerformance();
    this.current = this.parts[0]!.id;
    this.show(this.current);
  }

  /** The keyboard on the part shown (opening the view). */
  focus(): void {
    this.part(this.current).tab.focus({ preventScroll: true });
  }

  private part(id: PartId): Part {
    return this.parts.find((p) => p.id === id)!;
  }

  /** The part list, Colour first (none for a replica that keeps its own colours). */
  private makeParts(): void {
    const m = this.opts.model;
    if (!hasFixedColours(this.base)) this.addPart('colour', GEAR_TEXT.colour, 'swatch', () => this.colourPanel(), () => this.colourTab());
    for (const row of FIT_ROWS) {
      // A light (M33h) is dev content while it is built: no row at all unless one is offered for this replica.
      if (row.slot === 'light' && !m.hasSlot(this.asset.id, row.slot)) continue;
      // No rail for it in the pool (nothing could ever fit): a greyed row. Magazines and power have a choice unless the
      // replica takes nothing but its own (the Cyber Pistol, M32).
      const fixed = !m.hasSlot(this.asset.id, row.slot) && (row.none !== null || hasBuiltInPower(this.asset));
      if (fixed) {
        const p = this.addPart(row.slot, row.label, 'none', () => [menuRow(row.label, GEAR_TEXT.none, fixedControl(fixedValue(row.slot, this.kit)), true)], () => (p.value.textContent = fixedValue(row.slot, this.kit)));
        p.tab.setAttribute('aria-disabled', 'true');
        p.tab.classList.add('fixed');
        continue;
      }
      const p = this.addPart(row.slot, row.label, 'pic', () => this.fitPanel(row), () => this.fitTab(row, p));
    }
    this.addPart('bbs', GEAR_TEXT.ammo, 'none', () => this.bbRows(), () => {
      this.part('bbs').value.textContent = `${bbWeightLabel(this.grams)} · ${hopUpLabel(this.dial)}`;
    });
    for (const p of this.parts) p.update();
  }

  private addPart(id: PartId, label: string, look: 'pic' | 'swatch' | 'none', build: () => HTMLElement[], update: () => void): Part {
    const tab = el('button', 'customise-part');
    tab.type = 'button';
    tab.id = `customise-tab-${id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `customise-panel-${id}`);
    const pic = look === 'pic' ? new PictureSlot('part-pic') : null;
    const swatch = look === 'swatch' ? el('span', 'part-swatch') : null;
    const value = el('span', 'customise-part-value');
    const words = el('span', 'customise-part-words');
    words.append(el('span', 'customise-part-name', label), value);
    tab.append(pic?.root ?? swatch ?? el('span', 'part-blank'), words);
    tab.addEventListener('click', () => this.show(id));
    const part: Part = { id, tab, value, pic, swatch, panel: null, build, update };
    this.parts.push(part);
    return part;
  }

  /** Shows part `id`'s panel (made the first time), and on Colour the colour's side panel instead of Performance. */
  private show(id: PartId): void {
    this.current = id;
    for (const p of this.parts) {
      const on = p.id === id;
      p.tab.classList.toggle('selected', on);
      p.tab.setAttribute('aria-selected', String(on));
      p.tab.tabIndex = on ? 0 : -1;
      if (on && !p.panel) {
        p.panel = el('div', 'customise-panel');
        p.panel.id = `customise-panel-${p.id}`;
        p.panel.setAttribute('role', 'tabpanel');
        p.panel.setAttribute('aria-labelledby', p.tab.id);
        p.panel.append(...p.build());
        this.panels.append(p.panel);
        p.update();
      }
      if (p.panel) p.panel.hidden = !on;
    }
    const colour = id === 'colour';
    this.perf.root.hidden = colour;
    this.colourAside.hidden = !colour;
    if (colour) this.fillColourAside();
  }

  private onTabKey(e: KeyboardEvent): void {
    const i = this.parts.findIndex((p) => p.id === this.current);
    const next = tabAfterKey(e.key, i, this.parts.length);
    if (next === null) return;
    e.preventDefault();
    const p = this.parts[next]!;
    this.show(p.id);
    p.tab.focus();
  }

  /** After a pick: the kit again, and everything that shows it (the heading, the picture, the numbers, the part list). */
  private changed(): void {
    this.opts.onChange();
    this.kit = this.opts.model.slotKit(this.ref);
    this.refreshHead();
    this.livePerformance();
    for (const p of this.parts) p.update();
    if (this.current === 'colour') this.fillColourAside();
  }

  private refreshHead(): void {
    const m = this.opts.model;
    const scheme = m.scheme(this.asset.id);
    const fitted = (['optic', 'grip', 'laser', 'barrel', 'muzzle', 'light'] as const).filter((k) => (k === 'optic' ? this.kit.optic : k === 'grip' ? this.kit.parts.grip !== 'none' : this.kit.parts[k])).length + (this.kit.parts.magazine !== 'standard' ? 1 : 0);
    const colour = hasFixedColours(this.base) ? '' : `${paintName(scheme, this.opts.context.realistic())} · `;
    this.titleLine.textContent = `${colour}${GEAR_TEXT.partsFitted(fitted)}`;
    this.summary.textContent = `${replicaSummary(this.kit.replica, this.kit.parts)}.`;
    this.hero.show(this.opts.context.pictures, replicaSubject(this.asset, scheme, this.opts.context.realistic(), this.kit), itemIcon(this.asset));
  }

  private livePerformance(): void {
    const m = this.opts.model;
    const factory = performanceOf(m.asItComes(this.asset.id), this.base.bbWeight, this.base.hopUpDial);
    const now = performanceOf(this.kit, this.grams, this.dial, m.capped(this.ref));
    this.perf.rows.replaceChildren(...perfRows(sheetRows(now, factory, HOP_UP.readoutRange)));
  }

  // Colour (G3; MR1: bold schemes and realistic plain colours, picked per replica) ----------------------------------

  private colourTab(): void {
    const p = this.part('colour');
    const paint = this.opts.model.scheme(this.asset.id);
    const realistic = this.opts.context.realistic();
    p.value.textContent = paintName(paint, realistic);
    const c = paintColours(paint, realistic);
    p.swatch!.style.setProperty('--a', hex(c.furniture));
    p.swatch!.style.setProperty('--b', hex(c.body));
    if (p.panel) {
      for (const b of p.panel.querySelectorAll<HTMLButtonElement>('.scheme-tile')) {
        const on = b.dataset.scheme === paint;
        b.classList.toggle('selected', on);
        b.setAttribute('aria-pressed', String(on));
      }
      for (const [id, slot] of this.schemeSlots) slot.show(this.opts.context.pictures, replicaSubject(this.asset, id, realistic, this.kit, 'wide'), itemIcon(this.asset));
    }
  }

  private readonly schemeSlots = new Map<PaintId, PictureSlot>();

  /**
   * The colours as pictures of this replica in each: the bold schemes offered (CT4: dev ones with Dev content on; under
   * the Realistic colours setting each shows its family), then the four realistic plain colours (MR1).
   */
  private colourPanel(): HTMLElement[] {
    const realistic = this.opts.context.realistic();
    const bold = this.opts.model.schemes();
    const group = (title: string, note: string, ids: readonly PaintId[], line: (id: PaintId) => string): HTMLElement => {
      const box = el('div', 'colour-group');
      const sub = el('div', 'colour-group-head');
      sub.append(el('h4', 'colour-group-title', title), el('p', 'colour-group-note', note));
      const grid = el('div', 'scheme-grid');
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', `${GEAR_TEXT.colour}: ${title}`);
      for (const id of ids) grid.append(this.colourTile(id, line(id)));
      box.append(sub, grid);
      return box;
    };
    return [
      group(GEAR_TEXT.bold, GEAR_TEXT.boldNote, bold, (id) => (realistic ? GEAR_TEXT.showsAs(paintName(id, true)) : '')),
      group(GEAR_TEXT.realistic, GEAR_TEXT.realisticNote, FAMILY_IDS, () => ''),
    ];
  }

  private colourTile(id: PaintId, line: string): HTMLButtonElement {
    const b = el('button', 'scheme-tile option-tile');
    b.type = 'button';
    b.dataset.scheme = id;
    const slot = new PictureSlot('option-pic');
    this.schemeSlots.set(id, slot);
    const words = el('span', 'option-words');
    words.append(el('span', 'option-name', paintName(id, false)));
    if (line) words.append(el('span', 'option-line', line));
    b.append(slot.root, words, optionTick());
    b.addEventListener('click', () => {
      if (this.opts.model.scheme(this.asset.id) === id) return;
      this.opts.model.setScheme(this.asset.id, id);
      this.changed();
    });
    return b;
  }

  /** The Colour side panel: the colour picked, that it is this replica's own, and the other replica's colour. */
  private fillColourAside(): void {
    const m = this.opts.model;
    const realistic = this.opts.context.realistic();
    const paint = m.scheme(this.asset.id);
    const other = m.equipped().find((r): r is ItemRef => r !== null && r.asset !== this.asset.id);
    const parts: HTMLElement[] = [el('p', 'menu-kicker', GEAR_TEXT.colour), el('h3', 'colour-applies', paintName(paint, realistic)), el('p', 'colour-note', GEAR_TEXT.ownColourNote)];
    if (other) {
      const otherAsset = m.pool.byId.get(other.asset)!;
      const otherFixed = hasFixedColours(replicaOf(otherAsset));
      const card = el('div', 'colour-other-card');
      const pic = new PictureSlot('colour-other');
      pic.show(this.opts.context.pictures, replicaSubject(otherAsset, m.scheme(otherAsset.id), realistic, m.slotKit(other)), itemIcon(otherAsset));
      const words = el('div', 'colour-other-words');
      words.append(el('b', '', otherAsset.name), el('span', '', otherFixed ? GEAR_TEXT.ownColours : paintName(m.scheme(otherAsset.id), realistic)));
      card.append(pic.root, words);
      parts.push(card);
    }
    this.colourAside.replaceChildren(...parts);
  }

  // Parts ----------------------------------------------------------------------------------------------------------

  private fitTab(row: (typeof FIT_ROWS)[number], p: Part): void {
    const m = this.opts.model;
    const item = m.fitOf(this.asset.id)[row.slot];
    const asset = item ? m.pool.byId.get(item.asset)! : null;
    p.value.textContent = asset ? asset.name : (row.none ?? '');
    p.tab.classList.toggle('empty', !asset);
    p.pic!.show(this.opts.context.pictures, asset ? partSubject(asset, this.opts.context.realistic()) : null, asset ? itemIcon(asset) : '');
    if (!p.panel) return;
    for (const b of p.panel.querySelectorAll<HTMLButtonElement>('.option-tile')) {
      const on = b.dataset.item === (item ? itemKey(item) : `none:${row.slot}`);
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', String(on));
    }
    const blurb = p.panel.querySelector('.picker-blurb');
    if (blurb) blurb.textContent = this.fitBlurb(row.slot, m.fitOf(this.asset.id).power);
    const readout = p.panel.querySelector('.fit-readout');
    if (readout) readout.textContent = row.slot === 'power' ? powerReadout(this.kit, this.grams) : this.fitReadout(row.slot);
  }

  /**
   * A part's options as picture tiles: "as it comes" first, then each unlocked item that fits, then (LV1) the ones still
   * to unlock, greyed with their levels, and a line saying how to get them.
   */
  private fitPanel(row: (typeof FIT_ROWS)[number]): HTMLElement[] {
    const m = this.opts.model;
    const choices = m.fitChoices(this.asset.id, row.slot);
    const locked = this.opts.context.levelling?.() === false ? [] : m.lockedFitChoices(this.asset.id, row.slot);
    const count = choices.length + (row.none !== null ? 1 : 0);
    const head = el('div', 'customise-panel-head');
    head.append(el('h3', 'customise-panel-title', `${row.label} · ${GEAR_TEXT.options(count)}`));
    const tiles = el('div', 'option-grid');
    tiles.setAttribute('role', 'group');
    tiles.setAttribute('aria-label', row.label);
    const pick = (item: ItemRef | null): void => {
      m.setFit(this.asset.id, row.slot, item);
      this.changed();
    };
    if (row.none !== null) {
      const tile = optionTile(row.none, '', null);
      tile.dataset.item = `none:${row.slot}`;
      tile.addEventListener('click', () => pick(null));
      tiles.append(tile);
    }
    for (const item of choices) {
      const asset = m.pool.byId.get(item.asset)!;
      const tile = optionTile(asset.name, '', this.partPicture(asset));
      tile.dataset.item = itemKey(item);
      tile.addEventListener('click', () => pick(item));
      tiles.append(tile);
    }
    for (const { item, level } of locked) tiles.append(lockedOption(m.pool.byId.get(item.asset)!.name, level, this.partPicture(m.pool.byId.get(item.asset)!)));
    const control = el('div', 'menu-row-control');
    control.append(tiles, el('p', 'picker-blurb'), el('p', 'menu-readout fit-readout'));
    if (locked.length > 0) control.append(el('p', 'menu-readout menu-faint', LOADOUT_TEXT.lockedHint));
    const r = menuRow(row.label, '', control);
    r.classList.add('fit-row');
    return [head, r];
  }

  /** A part's picture (G3), or its drawing. */
  private partPicture(asset: Asset): PictureSlot {
    const slot = new PictureSlot('option-pic');
    slot.show(this.opts.context.pictures, partSubject(asset, this.opts.context.realistic()), itemIcon(asset));
    return slot;
  }

  /** What the fitted item (or "as it comes") is, in a line. */
  private fitBlurb(slot: FitSlot, power: ItemRef | null): string {
    const kit = this.kit;
    if (slot === 'optic') return OPTIC_BLURBS[kit.optic ?? 'none'];
    if (slot === 'grip') return GRIPS[kit.parts.grip].blurb;
    if (slot === 'magazine') return MAGAZINES[kit.parts.magazine].blurb;
    if (slot === 'laser') return kit.parts.laser ? LASERS[kit.parts.laser].blurb : 'No laser: the spread as it comes.';
    if (slot === 'barrel') return kit.parts.barrel ? BARRELS[kit.parts.barrel].blurb : LOADOUT_TEXT.standardBarrel;
    if (slot === 'muzzle') return kit.parts.muzzle ? MUZZLES[kit.parts.muzzle].blurb : LOADOUT_TEXT.noMuzzle;
    if (slot === 'light') return kit.parts.light ? TORCHES[kit.parts.light].blurb : LOADOUT_TEXT.noLight;
    const type = power ? this.opts.model.pool.byId.get(power.asset)?.power?.type : undefined;
    return type ? LOADOUT_TEXT.powerBlurb[type] : '';
  }

  private fitReadout(slot: FitSlot): string {
    const kit = this.kit;
    if (slot === 'optic') return opticReadout(kit);
    if (slot === 'grip') return gripReadout(kit);
    if (slot === 'magazine') return magazineReadout(kit);
    if (slot === 'laser') return laserReadout(kit);
    if (slot === 'barrel') return barrelReadout(kit);
    if (slot === 'muzzle') return muzzleReadout(kit);
    if (slot === 'light') return lightReadout(kit);
    return '';
  }

  /**
   * The BB weight slider (free, never pooled) and the hop-up dial, their readouts following each other, then the Glowing
   * BBs choice (M33b; free too).
   */
  private bbRows(): HTMLElement[] {
    const m = this.opts.model;
    const carried = this.kit.replica;
    const weightLine = el('p', 'menu-readout', bbWeightReadout(carried, this.grams));
    const hopLine = el('p', 'menu-readout', hopUpReadout(carried, this.dial, this.grams));
    // A slider fires an input event for every step dragged over: the readouts (each a few flight simulations), the
    // numbers and the Play screen follow once a frame at most.
    let queued = 0;
    const update = (): void => {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        weightLine.textContent = bbWeightReadout(carried, this.grams);
        hopLine.textContent = hopUpReadout(carried, this.dial, this.grams);
        this.livePerformance();
        this.part('bbs').update();
        const power = this.parts.find((p) => p.id === 'power');
        power?.update();
        this.opts.onChange();
      });
    };
    const weight = rangeControl(`${carried.name} BB weight`, { min: BB_WEIGHT.min, max: BB_WEIGHT.max, step: BB_WEIGHT.step }, this.grams, bbWeightLabel, m.dialField('bbWeight', this.asset.id), (v) => {
      this.grams = Math.round(v * 100) / 100;
      update();
    });
    weight.append(weightLine);
    const hop = rangeControl(`${carried.name} hop-up`, { min: HOP_UP.minDial, max: HOP_UP.maxDial, step: HOP_UP.dialStep }, this.dial, hopUpLabel, m.dialField('hopUp', this.asset.id), (v) => {
      this.dial = v;
      update();
    });
    hop.classList.add('loadout-hopup');
    hop.append(hopLine);
    const glow = new OptionPicker('Glowing BBs', GLOW_BB_CHOICES, m.glowBBs(this.asset.id), m.glowField(this.asset.id), () => this.opts.onChange());
    const head = el('div', 'customise-panel-head');
    head.append(el('h3', 'customise-panel-title', GEAR_TEXT.ammo));
    return [
      head,
      menuRow('BB Weight', 'Heavier BBs carry further and hit harder, a little slower out of the barrel.', weight),
      menuRow('Hop-Up', 'Backspin that lifts the BB: more reaches further, too much and it climbs.', hop),
      menuRow('Glowing BBs', 'Tracer BBs that glow, for seeing where your shots go in the dark.', glow.root),
    ];
  }
}

/** An option's tile: its picture (or "None"), its name and a note under it. */
function optionTile(name: string, note: string, pic: PictureSlot | null): HTMLButtonElement {
  const tile = el('button', 'option-tile');
  tile.type = 'button';
  const words = el('span', 'option-words');
  words.append(el('span', 'option-name', name));
  if (note) words.append(el('span', 'option-note', note));
  tile.append(pic?.root ?? el('span', 'option-none', GEAR_TEXT.none), words, optionTick());
  return tile;
}

/** An option still to unlock (LV1): greyed, with a lock and the level that unlocks it; not a button, nothing to pick. */
function lockedOption(name: string, level: number, pic: PictureSlot): HTMLDivElement {
  const tile = el('div', 'option-locked');
  const words = el('span', 'option-words');
  words.append(el('span', 'option-name', name), el('span', 'option-note', LOADOUT_TEXT.lockedAt(level)));
  const lock = el('span', 'option-lock');
  lock.setAttribute('aria-hidden', 'true');
  lock.innerHTML = MENU_ICONS.lock;
  tile.append(pic.root, words, lock);
  return tile;
}

/** What a part row shows when nothing fits the replica there. */
function fixedControl(value: string): HTMLDivElement {
  const control = el('div', 'menu-row-control');
  control.append(el('span', 'menu-later-value', value));
  return control;
}

/** "#2f6fd6". */
function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}
