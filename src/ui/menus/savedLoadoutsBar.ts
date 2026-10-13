import { SAVED_LOADOUTS, SAVED_TEXT } from '../../config/savedLoadouts';
import type { MissingPick } from '../../pool/loadoutModel';
import type { SavedLoadouts } from '../../pool/savedLoadouts';
import type { MenuHint } from './chrome';
import { ConfirmDialog } from './confirmDialog';
import { type ContextChoice, ContextMenu } from './contextMenu';
import { carriesLine } from './loadoutPicker';
import { el, menuButton } from './menuParts';

export interface SavedBarOptions {
  saved: SavedLoadouts;
  /** The loadout carried changed (a switch, a new loadout, a delete): the screen shows it and the game follows. */
  onSwitch: () => void;
}

/** A slot's tab: its button (number, name, what it carries, the Current tag) and the box that renames it. */
interface Tab {
  root: HTMLDivElement;
  button: HTMLButtonElement;
  name: HTMLSpanElement;
  line: HTMLSpanElement;
  tag: HTMLSpanElement;
  input: HTMLInputElement;
}

/** A locked pick in words: what it is, why, and what plays instead. */
export function missingText(m: MissingPick): string {
  return SAVED_TEXT.missing(m.wanted.name, m.reason === 'dev', m.instead?.name ?? null);
}

/**
 * The Loadout's saved loadouts (SL1): a tab per slot along the top, numbered 1 to 5 (the keys switch), the current one
 * marked. A tab switches to its loadout; an empty one starts a new loadout, a copy of yours, and asks its name. Rename,
 * Duplicate and Delete act on the current one; a right-click (or the Menu key, Shift+F10) on any tab offers them for that
 * one, with Use and Replace with yours. Under the tabs: the gear the current loadout holds that isn't available now, and
 * what it carries instead. Built once; `update` touches only what changed.
 */
export class SavedLoadoutsBar {
  readonly root: HTMLElement;
  /** Keys 1 to 5: carry that saved loadout (an empty slot does nothing). */
  readonly hints: readonly MenuHint[];
  private readonly tabs: Tab[];
  private readonly actions: { rename: HTMLButtonElement; duplicate: HTMLButtonElement; remove: HTMLButtonElement };
  private readonly lockedBox: HTMLDivElement;
  private readonly locked: HTMLUListElement;
  private readonly menu = new ContextMenu();
  private readonly confirm = new ConfirmDialog();
  /** The slot whose name is being typed, or null. */
  private renaming: number | null = null;

  constructor(private readonly opts: SavedBarOptions) {
    this.root = el('section', 'saved-loadouts');
    this.root.setAttribute('aria-label', SAVED_TEXT.heading);
    const head = el('div', 'saved-head');
    this.actions = {
      rename: menuButton(SAVED_TEXT.rename, 'ghost', () => this.rename(this.current())),
      duplicate: menuButton(SAVED_TEXT.duplicate, 'ghost', () => this.duplicate(this.current())),
      remove: menuButton(SAVED_TEXT.delete, 'ghost', () => this.askDelete(this.current())),
    };
    const actions = el('div', 'saved-actions');
    actions.append(this.actions.rename, this.actions.duplicate, this.actions.remove);
    head.append(el('p', 'menu-kicker', SAVED_TEXT.heading), actions);
    const list = el('div', 'saved-tabs');
    this.tabs = Array.from({ length: SAVED_LOADOUTS.slots }, (_, i) => this.tab(i));
    list.append(...this.tabs.map((t) => t.root));
    this.locked = el('ul', 'saved-locked-list');
    this.lockedBox = el('div', 'saved-locked');
    this.lockedBox.append(el('p', 'menu-kicker', SAVED_TEXT.lockedHead), this.locked);
    this.root.append(head, list, this.lockedBox, el('p', 'saved-hint', SAVED_TEXT.hint), this.menu.root, this.confirm.root);
    this.hints = this.tabs.map((_, i) => ({
      keys: [String(i + 1)],
      label: SAVED_TEXT.defaultName(i + 1),
      code: `Digit${i + 1}`,
      run: () => {
        if (this.opts.saved.view(i)) this.pick(i);
      },
    }));
    this.update();
  }

  /** Shows the slots as they are now: each tab's text changes only if it changed. */
  update(): void {
    const saved = this.opts.saved;
    const views = saved.views();
    views.forEach((v, i) => {
      const tab = this.tabs[i]!;
      tab.root.classList.toggle('is-empty', !v);
      tab.root.classList.toggle('is-current', !!v?.current);
      tab.root.classList.toggle('has-locked', (v?.missing.length ?? 0) > 0);
      setText(tab.name, v ? v.name : SAVED_TEXT.newLoadout);
      // A name longer than the tab is cut with an ellipsis (saved.css): the whole name is the tip.
      tab.name.title = v ? v.name : '';
      setText(tab.line, v ? carriesLine(v) : SAVED_TEXT.newNote);
      setText(tab.tag, v?.current ? SAVED_TEXT.current : '');
      setAttr(tab.button, 'aria-label', v ? SAVED_TEXT.tabName(i + 1, v.name, carriesLine(v), v.current, v.missing.length) : SAVED_TEXT.emptyTabName(i + 1));
      if (v?.current) setAttr(tab.button, 'aria-current', 'true');
      else tab.button.removeAttribute('aria-current');
      tab.button.title = v ? v.missing.map(missingText).join('\n') : '';
    });
    const current = saved.current();
    const roomy = saved.hasRoom();
    const deletable = saved.canDelete(current);
    setAttr(this.actions.duplicate, 'aria-disabled', String(!roomy));
    this.actions.duplicate.title = roomy ? '' : SAVED_TEXT.full;
    setAttr(this.actions.remove, 'aria-disabled', String(!deletable));
    this.actions.remove.title = deletable ? '' : SAVED_TEXT.onlyOne;
    const lines = (views[current]?.missing ?? []).map(missingText);
    const signature = lines.join('\n');
    if (this.locked.dataset.lines !== signature) {
      this.locked.dataset.lines = signature;
      this.locked.replaceChildren(...lines.map((line) => el('li', '', line)));
    }
    this.lockedBox.hidden = lines.length === 0;
  }

  private current(): number {
    return this.opts.saved.current();
  }

  private tab(slot: number): Tab {
    const root = el('div', 'saved-tab');
    const button = el('button', 'saved-tab-button');
    button.type = 'button';
    const key = el('span', 'saved-tab-key', String(slot + 1));
    key.setAttribute('aria-hidden', 'true');
    const words = el('span', 'saved-tab-words');
    const top = el('span', 'saved-tab-top');
    const name = el('span', 'saved-tab-name');
    const tag = el('span', 'saved-tab-tag');
    top.append(name, tag);
    const line = el('span', 'saved-tab-line');
    words.append(top, line);
    button.append(key, words);
    button.addEventListener('click', () => this.pick(slot));
    button.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.openMenu(slot, e.clientX + 2, e.clientY + 2);
    });
    button.addEventListener('keydown', (e) => this.onTabKey(e, slot));
    const input = el('input', 'saved-tab-input');
    input.type = 'text';
    input.maxLength = SAVED_LOADOUTS.nameMax;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.hidden = true;
    input.setAttribute('aria-label', SAVED_TEXT.nameLabel);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.endRename(true, true);
      } else if (e.key === 'Escape') {
        // The old name back; the menus never see this Esc (it would be Back).
        e.preventDefault();
        e.stopPropagation();
        this.endRename(false, true);
      }
    });
    // Clicking away keeps the name typed; the keyboard goes where the click sent it.
    input.addEventListener('blur', () => this.endRename(true, false));
    root.append(button, input);
    return { root, button, name, line, tag, input };
  }

  /** A tab pressed (or its key): carry that loadout, or in an empty slot start a new one and ask its name. */
  private pick(slot: number): void {
    const saved = this.opts.saved;
    if (saved.view(slot)) {
      if (saved.use(slot)) this.opts.onSwitch();
      return;
    }
    if (!saved.create(slot)) return;
    this.opts.onSwitch();
    this.rename(slot);
  }

  private rename(slot: number): void {
    const view = this.opts.saved.view(slot);
    if (!view) return;
    this.endRename(true, false);
    const tab = this.tabs[slot]!;
    this.renaming = slot;
    tab.input.value = view.name;
    tab.input.hidden = false;
    tab.root.classList.add('is-renaming');
    tab.input.focus({ preventScroll: true });
    tab.input.select();
  }

  /** Ends the typing: the name kept (`keep`, when it isn't empty) or the old one back; `refocus`: the tab gets the keyboard. */
  private endRename(keep: boolean, refocus: boolean): void {
    const slot = this.renaming;
    if (slot === null) return;
    // First, so the blur that hiding the box causes doesn't end it twice.
    this.renaming = null;
    const tab = this.tabs[slot]!;
    if (keep) this.opts.saved.rename(slot, tab.input.value);
    tab.input.hidden = true;
    tab.root.classList.remove('is-renaming');
    this.update();
    if (refocus) tab.button.focus({ preventScroll: true });
  }

  /** A copy of `slot` in the first free slot, named "… copy" and ready to rename. */
  private duplicate(slot: number): void {
    const copy = this.opts.saved.duplicate(slot);
    if (copy < 0) return;
    this.update();
    this.rename(copy);
  }

  private askDelete(slot: number): void {
    const saved = this.opts.saved;
    const view = saved.view(slot);
    if (!view || !saved.canDelete(slot)) return;
    const next = view.current ? saved.view(saved.nextAfter(slot)) : null;
    this.confirm.ask(SAVED_TEXT.deleteTitle(view.name), next ? SAVED_TEXT.deleteCurrentBody(next.name) : SAVED_TEXT.deleteBody, SAVED_TEXT.delete, () => {
      if (!saved.remove(slot)) return;
      if (view.current) this.opts.onSwitch();
      else this.update();
      this.tabs[saved.current()]!.button.focus({ preventScroll: true });
    });
  }

  private askReplace(slot: number): void {
    const saved = this.opts.saved;
    const view = saved.view(slot);
    if (!view || view.current) return;
    this.confirm.ask(SAVED_TEXT.replaceTitle(view.name), SAVED_TEXT.replaceBody(view.name), SAVED_TEXT.replace, () => {
      if (saved.replace(slot)) this.update();
      this.tabs[slot]!.button.focus({ preventScroll: true });
    });
  }

  /** The tab's menu at (`x`, `y`): what can be done with that slot, clear of its name. */
  private openMenu(slot: number, x: number, y: number): void {
    this.endRename(true, false);
    const saved = this.opts.saved;
    const view = saved.view(slot);
    const tab = this.tabs[slot]!;
    const choices: ContextChoice[] = [];
    if (!view) choices.push({ label: SAVED_TEXT.newLoadout, run: () => this.pick(slot) });
    else {
      if (!view.current) choices.push({ label: SAVED_TEXT.use, run: () => this.pick(slot) });
      choices.push({ label: SAVED_TEXT.rename, run: () => this.rename(slot) });
      if (saved.hasRoom()) choices.push({ label: SAVED_TEXT.duplicate, run: () => this.duplicate(slot) });
      if (!view.current) choices.push({ label: SAVED_TEXT.replace, run: () => this.askReplace(slot) });
      if (saved.canDelete(slot)) choices.push({ label: SAVED_TEXT.delete, run: () => this.askDelete(slot) });
    }
    this.menu.open(view?.name ?? SAVED_TEXT.defaultName(slot + 1), choices, x, y, tab.button, [tab.name.getBoundingClientRect()]);
  }

  /** The tabs' keys: the Menu key or Shift+F10 opens its menu, F2 renames, Delete deletes, Left and Right move along. */
  private onTabKey(e: KeyboardEvent, slot: number): void {
    if (e.repeat) return;
    const n = this.tabs.length;
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault();
      const box = this.tabs[slot]!.button.getBoundingClientRect();
      this.openMenu(slot, box.left + 12, box.bottom - 8);
    } else if (e.key === 'F2') {
      e.preventDefault();
      this.rename(slot);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      this.askDelete(slot);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      this.tabs[(slot + (e.key === 'ArrowRight' ? 1 : n - 1)) % n]!.button.focus({ preventScroll: true });
    }
  }
}

/** Sets a node's text only when it changes. */
function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

function setAttr(node: HTMLElement, name: string, value: string): void {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}
