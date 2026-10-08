import { ARMORY_TEXT, MENU_TEXT } from '../../config/menus';
import { BACKDROPS, MENU_ART_DIR } from '../../config/menuArt';
import { MENU_ICONS, NAV_ICONS } from './icons';
import { el } from './menuParts';

/**
 * The menus' frame (graphics overhaul G3, M100): the bar across the top of the screens you move between (Match, Loadout,
 * Armory, Settings, with the wallet on the far right), and the backdrop behind them all: one picture, blurred once when
 * it was made, never live. No key prompts are drawn along the bottom; the keys a screen answers to are its `hints`.
 */

/** A place on the top bar. */
export type NavPlace = (typeof MENU_TEXT.nav)[number]['id'];

/** The menus' served pictures (public/menu/), relative to the page like the rest of the build. */
export function menuArt(file: string): string {
  return `${import.meta.env.BASE_URL}${MENU_ART_DIR}/${file}`;
}

/**
 * The top bar: the wordmark (a button back to the title; Back to the pause menu when opened from there), the places
 * (the current one marked) and the wallet at the far right. It carries no version: the title screen has it.
 */
export class TopBar {
  readonly root: HTMLElement;
  private readonly places = new Map<NavPlace, HTMLButtonElement>();
  private readonly mark: HTMLButtonElement;
  private readonly markText: HTMLSpanElement;
  private readonly fc: HTMLSpanElement;
  private readonly tokens: HTMLSpanElement;

  constructor(onPlace: (place: NavPlace) => void, onMark: () => void) {
    this.root = el('header', 'menu-topbar');
    this.mark = el('button', 'menu-mark');
    this.mark.type = 'button';
    this.markText = el('span', '', MENU_TEXT.wordmark);
    this.mark.append(el('i'), this.markText);
    this.mark.title = MENU_TEXT.toTitle;
    this.mark.addEventListener('click', onMark);
    const nav = el('nav', 'menu-nav');
    nav.setAttribute('aria-label', MENU_TEXT.navLabel);
    for (const { id, label } of MENU_TEXT.nav) {
      const b = el('button', 'menu-nav-item');
      b.type = 'button';
      b.insertAdjacentHTML('afterbegin', NAV_ICONS[id]);
      b.append(el('span', '', label));
      b.addEventListener('click', () => onPlace(id));
      nav.append(b);
      this.places.set(id, b);
    }
    const wallet = el('div', 'menu-wallet');
    this.fc = el('span', 'menu-chip menu-chip-fc');
    this.tokens = el('span', 'menu-chip menu-chip-tokens');
    wallet.append(this.fc, this.tokens);
    this.root.append(this.mark, nav, wallet);
  }

  /**
   * Marks `current` as the screen on show. `alone`: opened from the pause menu, where the other places can't be reached
   * (a match is under way), so only the current one shows, and the wordmark button reads Back.
   */
  show(current: NavPlace | null, alone: boolean): void {
    for (const [id, b] of this.places) {
      const on = id === current;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
      b.hidden = alone && !on;
    }
    this.root.classList.toggle('alone', alone);
    this.markText.textContent = alone ? MENU_TEXT.back : MENU_TEXT.wordmark;
    this.mark.title = alone ? MENU_TEXT.back : MENU_TEXT.toTitle;
  }

  /** The wallet: Field Credits and Tokens (null hides it: the Armory is off). `armoryOff` greys the Armory out. */
  setWallet(wallet: { fc: number; tokens: number } | null, armoryOff: boolean): void {
    this.fc.hidden = this.tokens.hidden = wallet === null;
    if (wallet) {
      this.fc.textContent = MENU_TEXT.fc(wallet.fc);
      this.tokens.textContent = MENU_TEXT.tokens(wallet.tokens);
    }
    const armory = this.places.get('armory')!;
    armory.disabled = armoryOff;
    armory.title = armoryOff ? ARMORY_TEXT.off : '';
  }
}

/**
 * A key a screen answers to (M100: no longer drawn along the bottom). `code` is the key (KeyboardEvent.code), handled by
 * the menus while no text box has the keyboard; `run` is what it does. `label` names it for the tests and the docs.
 */
export interface MenuHint {
  keys: readonly string[];
  label: string;
  run?: () => void;
  code?: string;
  /** The key does it only while no control has the keyboard (Space presses a focused button instead). */
  idle?: boolean;
}

/** A numbered section heading: "01 Map" with a rule to the right and `extra` after it. */
export function sectionHead(n: string, title: string, extra?: HTMLElement | string): HTMLDivElement {
  const head = el('div', 'menu-section-head');
  if (n) head.append(el('span', 'menu-section-n', n));
  head.append(el('h2', 'menu-section-title', title), el('span', 'menu-section-rule'));
  if (typeof extra === 'string') head.append(el('span', 'menu-section-extra', extra));
  else if (extra) head.append(extra);
  return head;
}

/** A small tag: acid (good news), dev (content still being built), orange or blue. */
export function tagPill(text: string, kind: '' | 'dev' | 'orange' | 'blue' | 'gold' = ''): HTMLSpanElement {
  return el('span', `tag-pill${kind ? ` tag-${kind}` : ''}`, text);
}

/** A picked tile's round orange tick (shown by the stylesheet on a `.selected` tile); decoration, the tile says it. */
export function optionTick(): HTMLSpanElement {
  const t = el('span', 'option-tick');
  t.setAttribute('aria-hidden', 'true');
  t.insertAdjacentHTML('afterbegin', MENU_ICONS.check);
  return t;
}

/**
 * The ground behind the menus: the title is plain navy (a gradient and a faint angle drawn by the stylesheet, no picture
 * at all, M100); every other screen shares the one pre-blurred picture. The image is loaded once; no screen blurs or
 * redraws anything behind itself.
 */
export class Backdrop {
  readonly root: HTMLDivElement;
  private readonly blurred: HTMLImageElement;

  constructor() {
    this.root = el('div', 'menu-backdrop');
    this.root.setAttribute('aria-hidden', 'true');
    this.blurred = backdropImage(BACKDROPS.blurred.file);
    this.blurred.classList.add('blurred');
    this.root.append(this.blurred);
  }

  /** Which ground shows: the title's plain one or the blurred picture; `even` darkens the picture all over (behind dense screens). */
  show(kind: 'title' | 'blurred', even: boolean): void {
    this.blurred.hidden = kind === 'title';
    this.root.classList.toggle('plain', kind === 'title');
    this.root.classList.toggle('even', even && kind !== 'title');
  }
}

function backdropImage(file: string): HTMLImageElement {
  const img = el('img');
  img.alt = '';
  img.decoding = 'async';
  img.src = menuArt(file);
  return img;
}
