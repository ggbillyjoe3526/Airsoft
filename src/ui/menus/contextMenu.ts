import { el } from './menuParts';

/** One choice in the menu: the visible label, the name a screen reader reads (the label when absent), and what it does. */
export interface ContextChoice {
  label: string;
  name?: string;
  run: () => void;
}

/**
 * A small pop-up menu at the pointer (M100: the Armory's right-click to scrap). Built once, with its buttons, and shown
 * again for whatever is asked: `open` fills the labels and moves it, nothing is created per use and nothing runs per
 * frame. Its listeners on the page (a press outside, a scroll, a resize) are on only while it is open.
 *
 * It closes on Esc (the key stops here, so it never also goes Back), on a press outside it, when focus leaves it, on a
 * scroll or resize, and after a choice. The items are buttons with names; Up, Down, Home and End move between them.
 */
export class ContextMenu {
  readonly root: HTMLDivElement;
  private readonly title: HTMLParagraphElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private choices: readonly ContextChoice[] = [];
  private opener: HTMLElement | null = null;
  private opened = false;

  constructor() {
    this.root = el('div', 'context-menu');
    this.root.hidden = true;
    this.root.setAttribute('role', 'group');
    this.title = el('p', 'context-menu-title');
    this.root.append(this.title);
    // The browser's own menu has no place on top of this one.
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('keydown', (e) => this.onKey(e));
    this.root.addEventListener('focusout', (e) => {
      if (this.opened && !this.root.contains(e.relatedTarget as Node | null)) this.close(false);
    });
  }

  get isOpen(): boolean {
    return this.opened;
  }

  /**
   * Shows `choices` under `title` with its corner at (`x`, `y`) in the window, kept inside it; the keyboard goes to the
   * first. `returnTo` gets the focus back if the menu is dismissed (Esc) without a choice.
   */
  open(title: string, choices: readonly ContextChoice[], x: number, y: number, returnTo: HTMLElement | null = null): void {
    if (choices.length === 0) return;
    this.choices = choices;
    this.opener = returnTo;
    this.title.textContent = title;
    this.root.setAttribute('aria-label', title);
    while (this.buttons.length < choices.length) this.addButton();
    this.buttons.forEach((b, i) => {
      const choice = choices[i];
      b.hidden = !choice;
      if (!choice) return;
      b.textContent = choice.label;
      b.setAttribute('aria-label', choice.name ?? choice.label);
    });
    this.root.hidden = false;
    this.place(x, y);
    if (!this.opened) this.listen(true);
    this.opened = true;
    this.buttons[0]!.focus({ preventScroll: true });
  }

  /** Hides the menu; the focus goes back to where it was opened from unless `restore` is false. */
  close(restore = true): void {
    if (!this.opened) return;
    this.opened = false;
    this.listen(false);
    this.root.hidden = true;
    const back = this.opener;
    this.opener = null;
    if (restore) back?.focus({ preventScroll: true });
  }

  private addButton(): void {
    const i = this.buttons.length;
    const b = el('button', 'context-item');
    b.type = 'button';
    b.addEventListener('click', () => this.choose(i));
    // A held Enter must not choose again on the screen that replaces this one.
    b.addEventListener('keydown', (e) => {
      if (e.repeat) e.preventDefault();
    });
    this.buttons.push(b);
    this.root.append(b);
  }

  /** The menu closes first (the screen redraws and takes the focus itself), then the choice runs. */
  private choose(i: number): void {
    const choice = this.choices[i];
    this.close(false);
    choice?.run();
  }

  /** Puts the corner at the pointer, moved back in if it would run off the window. */
  private place(x: number, y: number): void {
    const win = document.defaultView;
    const edge = 8;
    this.root.style.left = `${Math.round(x)}px`;
    this.root.style.top = `${Math.round(y)}px`;
    if (!win) return;
    const r = this.root.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    this.root.style.left = `${Math.round(Math.max(edge, Math.min(x, win.innerWidth - r.width - edge)))}px`;
    this.root.style.top = `${Math.round(Math.max(edge, Math.min(y, win.innerHeight - r.height - edge)))}px`;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      // Esc closes this and nothing else: the menus' own Esc (Back) never sees it.
      e.preventDefault();
      e.stopPropagation();
      this.close(true);
      return;
    }
    const shown = this.buttons.filter((b) => !b.hidden);
    const at = shown.indexOf(document.activeElement as HTMLButtonElement);
    const to = e.key === 'ArrowDown' ? at + 1 : e.key === 'ArrowUp' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? shown.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    shown[(to + shown.length) % shown.length]?.focus({ preventScroll: true });
  }

  private readonly onPress = (e: Event): void => {
    if (!this.root.contains(e.target as Node | null)) this.close(false);
  };
  private readonly onAway = (): void => this.close(false);

  /** The page-wide listeners, on while the menu is open only. A scroll anywhere (it is fixed in the window) closes it. */
  private listen(on: boolean): void {
    const doc = document;
    const act = on ? 'addEventListener' : 'removeEventListener';
    doc[act]('pointerdown', this.onPress, true);
    doc[act]('scroll', this.onAway, true);
    doc.defaultView?.[act]('resize', this.onAway);
    doc.defaultView?.[act]('blur', this.onAway);
  }
}
