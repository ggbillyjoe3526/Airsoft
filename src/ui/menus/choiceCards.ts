import { availableChoice, isAvailable, type Tagged } from '../../config/content';
import { saveSetting, type SettingField } from '../../settings/storage';
import type { PickerOption } from '../optionPicker';
import { tagPill } from './chrome';
import { MENU_ICONS } from './icons';
import { el } from './menuParts';

/**
 * An entry shown greyed out after the cards with a tag (a map still being built): never picked. Dev content (M35):
 * listed only while Dev content is on.
 */
export interface SoonEntry extends Tagged {
  label: string;
  blurb: string;
}

/**
 * The sides of an option's switch (M34d): `of` lists them (fewer than two: no switch), `picked` says which is on, and
 * `onPick` reports a side picked. Picking a side picks its option too.
 */
export interface ChoiceVariants<T extends string> {
  label: string;
  of: (id: T) => readonly { id: string; label: string }[];
  picked: (id: T) => string;
  onPick: (id: T, variant: string) => void;
}

/** How the cards show their options and the entries after them. */
export interface ChoiceCardsExtras<T extends string> {
  /** Entries after the options, greyed out and disabled, each with `soonTag` on it. */
  soon?: readonly SoonEntry[];
  soonTag?: string;
  /** What a dev pick plays as while Dev content is off (the list's default; else its first option). */
  fallback?: T;
  /** A switch on the cards that have more than one side (M34d: Day | Night on a map). */
  variants?: ChoiceVariants<T>;
  /** The card's picture (a served image's URL; it may change with the side picked), or null for none. */
  picture?: (id: T) => string | null;
  /** A drawing on the card (the mode's sign). */
  icon?: (id: T) => string;
  /** A tag on an option of a single side, e.g. "Night" on a map played only at night; '' for none. */
  sideTag?: (id: T) => string;
  /** The tag on dev options (shown only while they are offered). */
  devTag?: string;
}

interface Card<T extends string> {
  option: PickerOption<T>;
  wrap: HTMLDivElement;
  button: HTMLButtonElement;
  img: HTMLImageElement | null;
  note: HTMLElement;
  sides: { root: HTMLElement; buttons: { id: string; button: HTMLButtonElement }[] } | null;
}

/**
 * One choice as a row of picture cards (G3: the Play screen's Map and Mode, which were pop-ups): a group named `label`,
 * each option a pressed-or-not button with its picture, name and line. Picking one saves it as `field` and reports it.
 * Dev options and entries (M35) are listed only after setDevContent(true), looking like the rest with a Dev tag; a saved
 * dev pick shows as the fallback until then, and stays saved. `limit` hides options the context doesn't offer.
 */
export class ChoiceCards<T extends string> {
  readonly root: HTMLDivElement;
  private readonly cards = new Map<T, Card<T>>();
  private readonly soonCards: { entry: SoonEntry; wrap: HTMLDivElement }[] = [];
  private readonly fallback: T;
  private current: T;
  private devContent = false;
  /** Which options the current context offers (`limit`); the others are hidden and play as the fallback. */
  private offered: (id: T) => boolean = () => true;

  constructor(
    label: string,
    private readonly options: readonly PickerOption<T>[],
    initial: T,
    private readonly field: SettingField,
    private readonly onChange: (value: T) => void,
    private readonly extras: ChoiceCardsExtras<T> = {},
  ) {
    this.current = initial;
    this.fallback = extras.fallback ?? options[0]!.id;
    this.root = el('div', 'choice-cards');
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', label);
    for (const option of options) this.root.append(this.card(option).wrap);
    for (const entry of extras.soon ?? []) {
      const button = el('button', 'choice-card soon');
      button.type = 'button';
      button.disabled = true;
      button.append(this.text(entry.label, entry.blurb), tagPill(extras.soonTag ?? ''));
      const wrap = el('div', 'choice-card-wrap');
      wrap.append(button);
      this.root.append(wrap);
      this.soonCards.push({ entry, wrap });
    }
    this.refresh();
  }

  /** Dev content on or off (Settings › Dev, M35): dev options and entries listed, or not shown at all. */
  setDevContent(on: boolean): void {
    if (on === this.devContent) return;
    this.devContent = on;
    this.refresh();
  }

  /**
   * Offers only the options `offered` allows (Extraction only on a map with its data, M43), like OptionPicker.limit: the
   * others are hidden, and a saved pick among them plays as the fallback but stays saved.
   */
  limit(offered: (id: T) => boolean): void {
    this.offered = offered;
    this.refresh();
  }

  /** A line under option `id`'s description (M49: the supply event on), or none (null). */
  setNote(id: T, text: string | null): void {
    const card = this.cards.get(id);
    if (!card) return;
    card.note.textContent = text ?? '';
    card.note.hidden = text === null;
  }

  /** What is picked, as it plays: a dev pick is the fallback while Dev content is off, as is one not offered here. */
  get value(): T {
    const v = availableChoice(this.options, this.current, this.devContent, this.fallback);
    return this.offered(v) ? v : this.fallback;
  }

  /** The cards again (a side picked elsewhere, a dev map's data arrived): the pictures and switches follow. */
  refresh(): void {
    const picked = this.value;
    for (const card of this.cards.values()) {
      const { option, button, wrap } = card;
      const on = option.id === picked;
      button.classList.toggle('selected', on);
      button.setAttribute('aria-pressed', String(on));
      wrap.classList.toggle('selected', on);
      wrap.hidden = button.disabled = !isAvailable(option.tag, this.devContent) || !this.offered(option.id);
      const sides = wrap.hidden ? card.sides : this.sidesOf(card);
      if (sides) {
        const side = this.extras.variants!.picked(option.id);
        for (const { id, button: b } of sides.buttons) b.setAttribute('aria-pressed', String(id === side));
      }
      const url = this.extras.picture?.(option.id) ?? null;
      if (card.img && url && card.img.getAttribute('src') !== url) card.img.src = url;
    }
    for (const { entry, wrap } of this.soonCards) wrap.hidden = !isAvailable(entry.tag, this.devContent);
  }

  private card(option: PickerOption<T>): Card<T> {
    const wrap = el('div', 'choice-card-wrap');
    const button = el('button', 'choice-card');
    button.type = 'button';
    let img: HTMLImageElement | null = null;
    if (this.extras.picture) {
      const frame = el('span', 'choice-card-pic');
      img = el('img');
      img.alt = '';
      img.decoding = 'async';
      frame.append(img);
      button.append(frame);
    }
    const icon = this.extras.icon?.(option.id);
    if (icon) button.insertAdjacentHTML('beforeend', `<span class="choice-card-icon">${icon}</span>`);
    const note = el('span', 'choice-note');
    note.hidden = true;
    const text = this.text(option.label, option.blurb);
    text.append(note);
    button.append(text);
    const tags = el('span', 'choice-card-tags');
    if (option.tag === 'dev' && this.extras.devTag) tags.append(tagPill(this.extras.devTag, 'dev'));
    const side = this.extras.sideTag?.(option.id);
    if (side) tags.append(tagPill(side, 'blue'));
    button.append(tags);
    button.insertAdjacentHTML('beforeend', `<span class="choice-tick">${MENU_ICONS.check}</span>`);
    button.addEventListener('click', () => this.pick(option.id));
    wrap.append(button);
    const card: Card<T> = { option, wrap, button, img, note, sides: null };
    this.cards.set(option.id, card);
    return card;
  }

  private text(name: string, blurb: string): HTMLSpanElement {
    const text = el('span', 'choice-text');
    text.append(el('span', 'choice-name', name), el('span', 'choice-blurb', blurb));
    return text;
  }

  private pick(id: T): void {
    if (id !== this.current) {
      this.current = id;
      saveSetting(this.field, id);
      this.onChange(id);
    }
    this.refresh();
  }

  /**
   * An option's switch (M34d), on its card, once its sides number two or more: made when first shown, so a dev map's
   * Day | Night switch appears once its data has loaded (M50, map/maps.ts loadDevMaps). A sibling of the card's button
   * (a button can't hold buttons), drawn over the picture.
   */
  private sidesOf(card: Card<T>): Card<T>['sides'] {
    if (card.sides || !this.extras.variants) return card.sides;
    const variants = this.extras.variants;
    const id = card.option.id;
    const of = variants.of(id);
    if (of.length < 2) return null;
    const group = el('div', 'choice-variants');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `${card.option.label}: ${variants.label}`);
    const buttons = of.map((side) => {
      const b = el('button', 'choice-variant');
      b.type = 'button';
      const sign = side.id === 'night' ? MENU_ICONS.moon : side.id === 'day' ? MENU_ICONS.sun : '';
      if (sign) b.insertAdjacentHTML('afterbegin', sign);
      b.append(el('span', '', side.label));
      b.addEventListener('click', () => {
        variants.onPick(id, side.id);
        this.pick(id);
      });
      group.append(b);
      return { id: side.id, button: b };
    });
    card.wrap.classList.add('has-variants');
    card.wrap.append(group);
    card.sides = { root: group, buttons };
    return card.sides;
  }
}
