import { saveSettingSoon, type SettingField } from '../../settings/storage';
import { moreBelow } from './menuNav';

/** Small DOM builders the menu screens share. Headings and labels are set in capitals by the stylesheet (owner, 2026-10-03). */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const ARROW_RIGHT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export type MenuButtonKind = 'primary' | 'secondary' | 'ghost';

/**
 * A menu button: `primary` is the orange one that moves you on (Play, Resume), `ghost` a quiet one in a line of text
 * (Change), `secondary` everything else; with an arrow when `arrow`.
 */
export function menuButton(label: string, kind: MenuButtonKind, onClick: () => void, arrow = false): HTMLButtonElement {
  const button = el('button', `menu-button menu-button-${kind}`, label);
  button.type = 'button';
  if (arrow) button.insertAdjacentHTML('beforeend', ARROW_RIGHT);
  button.addEventListener('click', onClick);
  return button;
}

/** Puts a static icon (menus/icons.ts) in front of a button's label; the label stays its name. */
export function withIcon(button: HTMLButtonElement, icon: string): HTMLButtonElement {
  button.insertAdjacentHTML('afterbegin', icon);
  return button;
}

/** The close (×) button of a pop-up. */
export function closeButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'menu-close');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.innerHTML = CROSS;
  button.addEventListener('click', onClick);
  return button;
}

/**
 * Marks a screen `more-below` while some of it is out of sight under its pinned key hints (audit UI-18; G3): the
 * stylesheet fades the page into the hints, so a screen that scrolls doesn't read as ending there. The same for each
 * `.menu-scroll` inside it, the part of a page that scrolls while the page stays put (UX1: the Match screen's choices,
 * a Settings tab, the Loadout's numbers). Checked as any of them scrolls and whenever the screen, its first children or
 * a scrolling part changes size (a window resize, another Settings group, the screen shown); never per frame. Returns
 * the function that stops watching (removes the listener, disconnects the observer; M79, audit CORE-07).
 */
export function watchScroll(root: HTMLElement): () => void {
  const mark = (box: Element): void => {
    box.classList.toggle('more-below', moreBelow(box.scrollTop, box.clientHeight, box.scrollHeight));
  };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => update());
  // The scrolling parts are found again each time: the Customise view builds its own when it opens.
  const update = (): void => {
    mark(root);
    for (const box of root.querySelectorAll?.('.menu-scroll') ?? []) {
      mark(box);
      observer?.observe(box);
      for (const child of box.children) observer?.observe(child);
    }
  };
  // Scroll doesn't bubble: caught on its way down, it names the part that scrolled.
  const onScroll = (e?: Event): void => {
    const box = e?.target as Element | undefined;
    if (box && box !== root && box.classList?.contains('menu-scroll')) mark(box);
    else mark(root);
  };
  root.addEventListener('scroll', onScroll, { passive: true, capture: true });
  const stopScroll = (): void => root.removeEventListener('scroll', onScroll, { capture: true });
  if (!observer) return stopScroll;
  observer.observe(root);
  for (const child of root.children) observer.observe(child);
  return () => {
    stopScroll();
    observer.disconnect();
  };
}

/** The "LATER" tag on things not built yet. */
function laterTag(): HTMLSpanElement {
  return el('span', 'menu-later', 'Later');
}

/** A settings or loadout row: a label (with an optional line of help under it) and its control. */
export function menuRow(label: string, help: string, control: HTMLElement | null, later = false): HTMLDivElement {
  const row = el('div', later ? 'menu-row later' : 'menu-row');
  const name = el('div', 'menu-row-name');
  name.append(el('span', 'menu-row-label', label));
  if (help) name.append(el('span', 'menu-row-help', help));
  row.append(name);
  if (control) row.append(control);
  return row;
}

/** A greyed-out row for something not built yet, with its current value if it has one. */
export function laterRow(label: string, help: string, value = ''): HTMLDivElement {
  const control = el('div', 'menu-row-control');
  if (value) control.append(el('span', 'menu-later-value', value));
  control.append(laterTag());
  return menuRow(label, help, control, true);
}

/**
 * A slider for a number setting, with its value shown beside it: applied (`onChange`) as it moves, and saved as `field`
 * once it settles (saveSettingSoon, audit UI-11), not on every pixel of a drag.
 */
export function rangeControl(
  label: string,
  range: { min: number; max: number; step: number },
  initial: number,
  format: (v: number) => string,
  field: SettingField,
  onChange: (v: number) => void,
): HTMLDivElement {
  const root = el('div', 'menu-row-control menu-range');
  const slider = el('input');
  slider.type = 'range';
  slider.min = String(range.min);
  slider.max = String(range.max);
  slider.step = String(range.step);
  slider.value = String(initial);
  slider.setAttribute('aria-label', label);
  // A screen reader reads the value as shown ("65%", "2:30"), not the raw number (bug pass).
  slider.setAttribute('aria-valuetext', format(initial));
  const output = el('output', '', format(initial));
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    output.textContent = format(v);
    slider.setAttribute('aria-valuetext', format(v));
    saveSettingSoon(field, v);
    onChange(v);
  });
  root.append(slider, output);
  return root;
}

/** A line under a play button for messages such as the browser refusing the mouse lock. */
export function hintLine(): HTMLParagraphElement {
  const hint = el('p', 'menu-hint');
  // A status region, so a screen reader reads out a refused mouse lock (audit fixes critic).
  hint.setAttribute('role', 'status');
  hint.hidden = true;
  return hint;
}

export function setHint(hint: HTMLParagraphElement, text: string): void {
  hint.textContent = text;
  hint.hidden = text.length === 0;
}
