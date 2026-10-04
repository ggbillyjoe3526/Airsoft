import { saveSetting, type SettingField } from '../../settings/storage';

/** Small DOM builders the menu screens share. Headings and labels are set in capitals by the stylesheet (owner, 2026-10-03). */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const ARROW_RIGHT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const ARROW_LEFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';
const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export type MenuButtonKind = 'primary' | 'secondary';

/** A menu button: `primary` is the orange one that moves you on (Start, Play, Resume), with an arrow when `arrow`. */
export function menuButton(label: string, kind: MenuButtonKind, onClick: () => void, arrow = false): HTMLButtonElement {
  const button = el('button', `menu-button menu-button-${kind}`, label);
  button.type = 'button';
  if (arrow) button.insertAdjacentHTML('beforeend', ARROW_RIGHT);
  button.addEventListener('click', onClick);
  return button;
}

export function backButton(onClick: () => void): HTMLButtonElement {
  const button = menuButton('Back', 'secondary', onClick);
  button.insertAdjacentHTML('afterbegin', ARROW_LEFT);
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

export function chevron(): string {
  return CHEVRON;
}

/** "AIRSOFT." with the orange full stop. */
export function wordmark(className: string, tag: 'h1' | 'p' = 'p'): HTMLElement {
  const node = el(tag, className, 'AIRSOFT');
  node.append(el('span', '', '.'));
  return node;
}

/** A full-screen menu page: the small wordmark, a heading, a body and a footer (Back on the left). */
export interface MenuPage {
  root: HTMLDivElement;
  body: HTMLDivElement;
  footer: HTMLDivElement;
}

export function menuPage(className: string, heading: string): MenuPage {
  const root = el('div', `menu-screen menu-page ${className}`);
  root.hidden = true;
  const body = el('div', 'menu-page-body');
  const footer = el('div', 'menu-footer');
  root.append(wordmark('menu-wordmark'), el('h1', 'menu-heading', heading), body, footer);
  return { root, body, footer };
}

/** The "LATER" tag on things not built yet. */
export function laterTag(): HTMLSpanElement {
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

/** A slider for a number setting, saved as `field` on every change, with its value shown beside it. */
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
  const output = el('output', '', format(initial));
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    output.textContent = format(v);
    saveSetting(field, v);
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
