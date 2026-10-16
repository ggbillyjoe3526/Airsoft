import { SAVED_LOADOUTS, SAVED_TEXT } from '../../config/savedLoadouts';
import type { MissingPick } from '../../pool/loadoutModel';
import type { SavedLoadouts } from '../../pool/savedLoadouts';
import type { MenuHint } from './chrome';
import { ConfirmDialog } from './confirmDialog';
import { type ContextChoice, ContextMenu } from './contextMenu';
import { SAVED_ICONS } from './icons';
import { carriesLine } from './loadoutPicker';
import { el, menuButton, withIcon } from './menuParts';

export interface SavedBarOptions {
  saved: SavedLoadouts;
  /** The loadout carried changed (a switch, a new loadout, a delete): the screen shows it and the game follows. */
  onSwitch: () => void;
}

/** A locked pick in words: what it is, why, and what plays instead. */
export function missingText(m: MissingPick): string {
  return SAVED_TEXT.missing(m.wanted.name, m.reason === 'dev', m.instead?.name ?? null, m.level);
}

/**
 * The Loadout's saved loadouts (SL1; a dropdown since MR1, owner 2026-10-16): one button naming the loadout carried (its
 * number, name and what it carries) that opens the saved ones as a list, the last entry a new loadout while a slot is
 * free; beside it Rename, Duplicate, New and Delete for the one carried. Keys 1 to 5 switch. Rename types over the
 * name in place. Under it: the gear the current loadout holds that isn't available now, and what it carries instead.
 * Built once; `update` touches only what changed.
 */
export class SavedLoadoutsBar {
  readonly root: HTMLElement;
  /** Keys 1 to 5: carry that saved loadout (an empty slot does nothing). */
  readonly hints: readonly MenuHint[];
  private readonly pick: HTMLButtonElement;
  private readonly key: HTMLSpanElement;
  private readonly name: HTMLSpanElement;
  private readonly line: HTMLSpanElement;
  private readonly input: HTMLInputElement;
  private readonly actions: { rename: HTMLButtonElement; duplicate: HTMLButtonElement; create: HTMLButtonElement; remove: HTMLButtonElement };
  private readonly lockedBox: HTMLDivElement;
  private readonly locked: HTMLUListElement;
  private readonly menu = new ContextMenu();
  private readonly confirm = new ConfirmDialog();
  /** The slot whose name is being typed, or null. */
  private renaming: number | null = null;

  constructor(private readonly opts: SavedBarOptions) {
    this.root = el('section', 'saved-loadouts');
    this.root.setAttribute('aria-label', SAVED_TEXT.heading);
    const box = el('div', 'saved-pick-box');
    this.pick = el('button', 'saved-pick');
    this.pick.type = 'button';
    this.pick.setAttribute('aria-haspopup', 'true');
    this.key = el('span', 'saved-pick-key');
    this.key.setAttribute('aria-hidden', 'true');
    this.name = el('span', 'saved-pick-name');
    this.line = el('span', 'saved-pick-line');
    const caret = el('span', 'saved-pick-caret');
    caret.innerHTML = SAVED_ICONS.caret;
    this.pick.append(this.key, this.name, this.line, caret);
    this.pick.addEventListener('click', () => this.openList());
    this.pick.addEventListener('keydown', (e) => this.onPickKey(e));
    this.input = el('input', 'saved-pick-input');
    this.input.type = 'text';
    this.input.maxLength = SAVED_LOADOUTS.nameMax;
    this.input.spellcheck = false;
    this.input.autocomplete = 'off';
    this.input.hidden = true;
    this.input.setAttribute('aria-label', SAVED_TEXT.nameLabel);
    this.input.addEventListener('keydown', (e) => {
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
    this.input.addEventListener('blur', () => this.endRename(true, false));
    box.append(this.pick, this.input);
    const action = (label: string, icon: string, run: () => void): HTMLButtonElement => {
      const b = withIcon(menuButton(label, 'secondary', run), icon);
      b.classList.add('saved-action');
      return b;
    };
    this.actions = {
      rename: action(SAVED_TEXT.rename, SAVED_ICONS.rename, () => this.rename(this.current())),
      duplicate: action(SAVED_TEXT.duplicate, SAVED_ICONS.duplicate, () => this.duplicate(this.current())),
      create: action(SAVED_TEXT.newShort, SAVED_ICONS.create, () => this.create()),
      remove: action(SAVED_TEXT.delete, SAVED_ICONS.remove, () => this.askDelete(this.current())),
    };
    const actions = el('div', 'saved-actions');
    actions.append(this.actions.rename, this.actions.duplicate, this.actions.create, this.actions.remove);
    const row = el('div', 'saved-row');
    row.append(box, actions, el('p', 'saved-hint', SAVED_TEXT.hint));
    this.locked = el('ul', 'saved-locked-list');
    this.lockedBox = el('div', 'saved-locked');
    this.lockedBox.append(el('p', 'menu-kicker', SAVED_TEXT.lockedHead), this.locked);
    this.root.append(row, this.lockedBox, this.menu.root, this.confirm.root);
    this.hints = Array.from({ length: SAVED_LOADOUTS.slots }, (_, i) => ({
      keys: [String(i + 1)],
      label: SAVED_TEXT.defaultName(i + 1),
      code: `Digit${i + 1}`,
      run: () => {
        if (this.opts.saved.view(i)) this.use(i);
      },
    }));
    this.update();
  }

  /** Shows the loadout carried and what can be done with it: each text changes only if it changed. */
  update(): void {
    const saved = this.opts.saved;
    const current = saved.current();
    const view = saved.view(current);
    setText(this.key, String(current + 1));
    setText(this.name, view?.name ?? '');
    setText(this.line, view ? carriesLine(view) : '');
    // A name longer than the button is cut with an ellipsis (saved.css): the whole name is the tip, with what it lacks.
    this.pick.title = view ? [view.name, ...view.missing.map(missingText)].join('\n') : '';
    this.pick.classList.toggle('has-locked', (view?.missing.length ?? 0) > 0);
    setAttr(this.pick, 'aria-label', view ? SAVED_TEXT.pickerName(current + 1, view.name, carriesLine(view), view.missing.length) : '');
    const roomy = saved.hasRoom();
    const deletable = saved.canDelete(current);
    setAttr(this.actions.duplicate, 'aria-disabled', String(!roomy));
    this.actions.duplicate.title = roomy ? '' : SAVED_TEXT.full;
    setAttr(this.actions.create, 'aria-disabled', String(!roomy));
    this.actions.create.title = roomy ? SAVED_TEXT.newNote : SAVED_TEXT.full;
    setAttr(this.actions.remove, 'aria-disabled', String(!deletable));
    this.actions.remove.title = deletable ? '' : SAVED_TEXT.onlyOne;
    const lines = (view?.missing ?? []).map(missingText);
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

  /** The list under the button: every saved loadout (the one carried ticked), then a new one while a slot is free. */
  private openList(): void {
    this.endRename(true, false);
    const saved = this.opts.saved;
    const choices: ContextChoice[] = saved.views().flatMap((v) =>
      v
        ? [
            {
              label: `${v.slot + 1} · ${v.name}`,
              detail: carriesLine(v),
              current: v.current,
              name: `${v.name}: ${carriesLine(v)}${v.current ? `, ${SAVED_TEXT.current}` : ''}`,
              run: () => this.use(v.slot),
            },
          ]
        : [],
    );
    if (saved.hasRoom()) choices.push({ label: SAVED_TEXT.newLoadout, detail: SAVED_TEXT.newNote, run: () => this.create() });
    const box = this.pick.getBoundingClientRect();
    this.menu.open(SAVED_TEXT.heading, choices, box.left, box.bottom + 4, this.pick, [box]);
  }

  /** Carry the loadout in `slot`. */
  private use(slot: number): void {
    if (this.opts.saved.use(slot)) this.opts.onSwitch();
  }

  /** A new loadout, a copy of yours, in the first free slot: carried at once, its name ready to type. */
  private create(): void {
    const saved = this.opts.saved;
    const slot = saved.views().findIndex((v) => v === null);
    if (slot < 0 || !saved.create(slot)) return;
    this.opts.onSwitch();
    this.rename(slot);
  }

  private rename(slot: number): void {
    const view = this.opts.saved.view(slot);
    if (!view || slot !== this.current()) return;
    this.endRename(true, false);
    this.renaming = slot;
    this.input.value = view.name;
    this.input.hidden = false;
    this.root.classList.add('is-renaming');
    this.input.focus({ preventScroll: true });
    this.input.select();
  }

  /** Ends the typing: the name kept (`keep`, when it isn't empty) or the old one back; `refocus`: the button gets the keyboard. */
  private endRename(keep: boolean, refocus: boolean): void {
    const slot = this.renaming;
    if (slot === null) return;
    // First, so the blur that hiding the box causes doesn't end it twice.
    this.renaming = null;
    if (keep) this.opts.saved.rename(slot, this.input.value);
    this.input.hidden = true;
    this.root.classList.remove('is-renaming');
    this.update();
    if (refocus) this.pick.focus({ preventScroll: true });
  }

  /** A copy of `slot` in the first free slot, named "… copy", carried and ready to rename. */
  private duplicate(slot: number): void {
    const saved = this.opts.saved;
    const copy = saved.duplicate(slot);
    if (copy < 0) return;
    if (saved.use(copy)) this.opts.onSwitch();
    else this.update();
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
      this.pick.focus({ preventScroll: true });
    });
  }

  /** The button's keys: Down opens the list, F2 renames, Delete deletes. */
  private onPickKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.openList();
    } else if (e.key === 'F2') {
      e.preventDefault();
      this.rename(this.current());
    } else if (e.key === 'Delete') {
      e.preventDefault();
      this.askDelete(this.current());
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
