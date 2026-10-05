import { ARMORY_TEXT, MENU_TEXT } from '../../config/menus';
import { BACKDROPS, MENU_ART_DIR } from '../../config/menuArt';
import { NAV_ICONS } from './icons';
import { el } from './menuParts';

/**
 * The menus' frame (graphics overhaul G3): the bar across the top of the screens you move between (Play, Loadout,
 * Armory, Range, Settings, with the wallet and the build), the key hints along the bottom of every screen, and the
 * backdrop behind them all: one picture, blurred once when it was made, never live.
 */

/** A place on the top bar. */
export type NavPlace = (typeof MENU_TEXT.nav)[number]['id'];

/** The menus' served pictures (public/menu/), relative to the page like the rest of the build. */
export function menuArt(file: string): string {
  return `${import.meta.env.BASE_URL}${MENU_ART_DIR}/${file}`;
}

/** The top bar: the wordmark, the places (the current one marked), the wallet and the build. */
export class TopBar {
  readonly root: HTMLElement;
  private readonly places = new Map<NavPlace, HTMLButtonElement>();
  private readonly fc: HTMLSpanElement;
  private readonly tokens: HTMLSpanElement;

  constructor(onPlace: (place: NavPlace) => void) {
    this.root = el('header', 'menu-topbar');
    const mark = el('p', 'menu-mark', MENU_TEXT.wordmark);
    mark.prepend(el('i'));
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
    const build = el('span', 'menu-build', __BUILD_VERSION__.label);
    build.title = __BUILD_VERSION__.title;
    wallet.append(this.fc, this.tokens, build);
    this.root.append(mark, nav, wallet);
  }

  /**
   * Marks `current` as the screen on show. `alone`: opened from the pause menu, where the other places can't be reached
   * (a match is under way), so only the current one shows.
   */
  show(current: NavPlace | null, alone: boolean): void {
    for (const [id, b] of this.places) {
      const on = id === current;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
      b.hidden = alone && !on;
    }
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
 * A key hint along the bottom of a screen: the key (or keys) and what it does. With `run` it is a button too, for the
 * mouse (Esc Back is the screen's Back button); `code` is the key that does it (KeyboardEvent.code), handled by the
 * menus while no text box has the keyboard.
 */
export interface MenuHint {
  keys: readonly string[];
  label: string;
  run?: () => void;
  code?: string;
  /** The key does it only while no control has the keyboard (Space presses a focused button instead). */
  idle?: boolean;
  /**
   * The screen has a button of its own for it (Play, Customise, Resume): the hint is then a click target for the mouse
   * only, left out of the tab order and hidden from screen readers, so the action is named once.
   */
  echo?: boolean;
}

/** The row of key hints: `hints`, then a line on the right (`aside`). */
export function hintsBar(hints: readonly MenuHint[], aside = ''): HTMLDivElement {
  const bar = el('div', 'menu-hints');
  for (const h of hints) {
    const item = h.run ? el('button', 'menu-hint-key') : el('span', 'menu-hint-key');
    if (h.run) (item as HTMLButtonElement).type = 'button';
    if (h.run && h.echo) {
      item.tabIndex = -1;
      item.setAttribute('aria-hidden', 'true');
    }
    // The keys are what the hint looks like; its words are its name ("Back"), so a screen reader reads the action.
    for (const k of h.keys) {
      const key = el('kbd', '', k);
      key.setAttribute('aria-hidden', 'true');
      item.append(key);
    }
    item.append(el('span', '', h.label));
    if (h.run) item.addEventListener('click', h.run);
    bar.append(item);
  }
  if (aside) bar.append(el('span', 'menu-hints-aside', aside));
  return bar;
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

/**
 * The backdrop behind the menus: the title's picture, sharp, or the blurred one every other screen shares. Both are
 * plain images, loaded once; no screen blurs or redraws anything behind itself.
 */
export class Backdrop {
  readonly root: HTMLDivElement;
  private readonly title: HTMLImageElement;
  private readonly blurred: HTMLImageElement;

  constructor() {
    this.root = el('div', 'menu-backdrop');
    this.root.setAttribute('aria-hidden', 'true');
    this.title = backdropImage(BACKDROPS.title.file);
    this.blurred = backdropImage(BACKDROPS.blurred.file);
    this.blurred.classList.add('blurred');
    this.root.append(this.title, this.blurred);
  }

  /** Which picture shows: the title's or the blurred one; `even` darkens it all over (behind dense screens). */
  show(kind: 'title' | 'blurred', even: boolean): void {
    this.title.hidden = kind !== 'title';
    this.blurred.hidden = kind === 'title';
    this.root.classList.toggle('even', even);
  }
}

function backdropImage(file: string): HTMLImageElement {
  const img = el('img');
  img.alt = '';
  img.decoding = 'async';
  img.src = menuArt(file);
  return img;
}
