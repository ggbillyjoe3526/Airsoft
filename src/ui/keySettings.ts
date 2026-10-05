import { type Action, BROWSER_KEYS, KEY_SETTINGS, KEY_SLOTS, REBINDABLE, WHEEL_CODES } from '../config/controls';
import { bindable, type KeyBindings, mouseButtonCode } from '../input/keyBindings';
import {
  CTRL_WARNING,
  DOUBLE_CLICK_NOTE,
  essentialNote,
  LISTENING_NOTE,
  RESET_CONFIRM_LABEL,
  refusedNote,
  strandNote,
  swapNote,
  US_LAYOUT_NOTE,
} from './keyNotes';
import { restartAnimation } from './restartAnimation';

/** A key box: which action and which of its keys (0 the main key, 1 the second). */
interface Box {
  action: Action;
  slot: number;
}

const RESET_LABEL = 'Reset all';
const SLOT_NAMES = ['main key', 'second key'] as const;

/**
 * Key-binding settings: one row per rebindable action, with a box for its main key and one for a second key (audit
 * UI-05). Click a box, then press the new key, click the box again with the mouse button wanted (left, right, middle
 * or a side button; M18) or turn the wheel; Backspace or Delete clears it, Esc or a click elsewhere cancels. Taking a
 * key another action uses swaps the two, and the line under the list says so. Key names follow the player's keyboard
 * layout where the browser tells it (audit UI-01). Lives on the Settings screen (Key Bindings tab).
 */
export class KeySettings {
  readonly root: HTMLDivElement;
  private readonly rows = new Map<Action, { row: HTMLDivElement; boxes: HTMLButtonElement[]; label: string }>();
  private readonly note: HTMLParagraphElement;
  private readonly layoutNote: HTMLParagraphElement;
  private readonly resetButton: HTMLButtonElement;
  private waiting: Box | null = null;
  /**
   * The box waiting for a key press, if any. The wheel listener (capturing, so it must be non-passive to stop the page
   * scrolling) lives only while a box waits: on `window` for the page's whole life it would hold up every scroll of a
   * long Settings page or the Armory list (M64, audit UI-14).
   */
  private get listening(): Box | null {
    return this.waiting;
  }

  private set listening(box: Box | null) {
    if ((box === null) !== (this.waiting === null)) {
      if (box === null) window.removeEventListener('wheel', this.onWheel, true);
      else window.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    }
    this.waiting = box;
  }
  /**
   * The mouse button just bound (until the next press): its click, menu or browser navigation (the side buttons go back
   * and forward) must not follow.
   */
  private boundButton: number | null = null;
  /**
   * The key just bound from the keyboard, until it is let go of: its release and the click a Space or Enter would make
   * on the focused box are swallowed, so the focus can stay on the box (audit UI-08).
   */
  private boundKey: string | null = null;
  /** "Reset All" was clicked once: a second click before this timer ends resets (audit UI-17). */
  private resetArmed: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly bindings: KeyBindings) {
    this.root = document.createElement('div');
    this.root.className = 'key-settings';
    this.root.hidden = true;
    const list = document.createElement('div');
    list.className = 'key-list';
    for (const { action, label } of REBINDABLE) {
      const row = document.createElement('div');
      row.className = 'key-row';
      const name = document.createElement('span');
      name.textContent = label;
      const slots = document.createElement('span');
      slots.className = 'key-slots';
      const boxes: HTMLButtonElement[] = [];
      for (let slot = 0; slot < KEY_SLOTS; slot++) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = slot === 0 ? 'key-button' : 'key-button key-second';
        button.addEventListener('click', (e) => this.onBoxClick(e, { action, slot }));
        slots.append(button);
        boxes.push(button);
      }
      row.append(name, slots);
      // The flash on a row whose key another action just took ends with its animation.
      row.addEventListener('animationend', () => row.classList.remove('moved'));
      list.appendChild(row);
      this.rows.set(action, { row, boxes, label });
    }
    this.note = document.createElement('p');
    this.note.className = 'key-note';
    // Read out as it changes: what a swap did, why a key was refused.
    this.note.setAttribute('role', 'status');
    this.layoutNote = document.createElement('p');
    this.layoutNote.className = 'menu-readout key-layout-note';
    this.resetButton = document.createElement('button');
    this.resetButton.type = 'button';
    this.resetButton.className = 'key-reset';
    this.resetButton.textContent = RESET_LABEL;
    this.resetButton.addEventListener('click', () => this.onReset());
    this.root.append(list, this.note, this.layoutNote, this.resetButton);

    bindings.onChange(() => this.refresh());
    // Capture phase, so the game's keyboard never sees the key being bound.
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('mousedown', this.onMouseDown, true);
    window.addEventListener('mouseup', this.onMouseUp, true);
    window.addEventListener('auxclick', this.swallowBound, true);
    window.addEventListener('contextmenu', this.swallowBound, true);
    this.refresh();
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) {
      this.listen(null);
      this.disarmReset();
    }
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('mousedown', this.onMouseDown, true);
    window.removeEventListener('mouseup', this.onMouseUp, true);
    window.removeEventListener('auxclick', this.swallowBound, true);
    window.removeEventListener('contextmenu', this.swallowBound, true);
    this.listening = null; // takes the wheel listener off
    this.disarmReset();
    this.root.remove();
  }

  private onBoxClick(e: MouseEvent, box: Box): void {
    e.stopPropagation();
    // The left click that just bound Left mouse to this box.
    if (this.boundButton === 0) {
      this.boundButton = null;
      return;
    }
    // The click a Space or Enter just bound would make on the focused box (e.detail 0: from the keyboard).
    if (e.detail === 0 && this.boundKey !== null) return;
    const waiting = this.isListening(box);
    // The second click of a quick double-click on the waiting box cancels (onMouseDown); say why (bug pass).
    if (waiting && e.detail >= 2) {
      this.listening = null;
      this.refresh(DOUBLE_CLICK_NOTE);
      return;
    }
    this.listen(waiting ? null : box);
  }

  private onReset(): void {
    this.listen(null);
    if (this.resetArmed === null) {
      this.resetButton.textContent = RESET_CONFIRM_LABEL;
      this.resetButton.classList.add('armed');
      this.resetArmed = setTimeout(() => this.disarmReset(), KEY_SETTINGS.resetConfirmMs);
      return;
    }
    this.disarmReset();
    this.bindings.reset();
  }

  private disarmReset(): void {
    if (this.resetArmed !== null) clearTimeout(this.resetArmed);
    this.resetArmed = null;
    this.resetButton.textContent = RESET_LABEL;
    this.resetButton.classList.remove('armed');
  }

  private isListening(box: Box): boolean {
    return this.listening?.action === box.action && this.listening.slot === box.slot;
  }

  private listen(box: Box | null): void {
    this.listening = box;
    this.refresh();
  }

  private refresh(message = ''): void {
    let ctrl = false;
    for (const [action, { boxes, label }] of this.rows) {
      const codes = this.bindings.codes(action);
      boxes.forEach((button, slot) => {
        const waiting = this.isListening({ action, slot });
        // The second box shows every key after the main one (a set saved with more than two keys shows them all).
        const keys = slot === 0 ? codes.slice(0, 1) : codes.slice(1);
        button.textContent = waiting ? 'Press a key…' : keys.length > 0 ? this.bindings.describe(keys) : '—';
        // Named for its action and slot too (audit L-31): a screen reader would otherwise say only "W, button".
        button.setAttribute('aria-label', `${label}, ${SLOT_NAMES[slot] ?? 'key'}: ${waiting ? 'waiting for a key' : button.textContent}`);
        button.classList.toggle('listening', waiting);
        button.classList.toggle('empty', !waiting && keys.length === 0);
      });
      if (codes.some((c) => c.startsWith('Control'))) ctrl = true;
    }
    this.note.textContent = message || (this.listening ? LISTENING_NOTE : ctrl ? CTRL_WARNING : '');
    this.layoutNote.textContent = this.bindings.hasLayout ? '' : US_LAYOUT_NOTE;
    this.layoutNote.hidden = this.bindings.hasLayout;
  }

  /**
   * Binds `code` to the waiting box; true if it was bound. A swap or a key taken from another action is said in the
   * note and that action's row flashes; a refusal says why.
   */
  private bind(code: string): boolean {
    const box = this.listening;
    if (!box) return false;
    const name = code && code !== 'Unidentified' ? this.bindings.keyName(code) : 'That key';
    const other = this.bindings.actionOf(code);
    const stranded = this.bindings.strands(box.action, code, box.slot);
    if (stranded) {
      this.refresh(strandNote(name, this.labelOf(stranded)));
      return false;
    }
    if (!bindable(code) || !this.bindings.rebind(box.action, code, box.slot)) {
      this.refresh(refusedNote(name, BROWSER_KEYS.has(code) ? 'browser' : other?.startsWith('debug') ? 'debug' : ''));
      return false;
    }
    this.listening = null;
    if (other && other !== box.action) {
      const now = this.bindings.codes(other);
      this.refresh(swapNote(name, this.labelOf(other), now.length > 0 ? this.bindings.describe(now) : ''));
      this.flash(other);
    } else {
      this.refresh();
    }
    return true;
  }

  /** Backspace or Delete on the waiting box: clears that key. */
  private clear(): void {
    const box = this.listening;
    if (!box) return;
    this.listening = null;
    const had = this.bindings.codes(box.action).length > box.slot;
    if (!this.bindings.unbind(box.action, box.slot)) this.refresh(had ? essentialNote(this.labelOf(box.action)) : '');
    else this.refresh();
  }

  private labelOf(action: Action): string {
    return this.rows.get(action)?.label ?? action;
  }

  /** The row of an action that just lost its key flashes, so the player sees what moved (not under reduced motion). */
  private flash(action: Action): void {
    const row = this.rows.get(action)?.row;
    if (!row) return;
    restartAnimation(row, 'moved');
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.listening) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.code === 'Escape') {
      this.listen(null);
      return;
    }
    if (e.code === 'Backspace' || e.code === 'Delete') {
      this.clear();
      return;
    }
    // The focus stays on the box (audit UI-08); the key's release and any click it makes there are swallowed.
    if (this.bind(e.code)) this.boundKey = e.code;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code !== this.boundKey) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // A Space bound makes its click on the focused box after this keyup: let it be swallowed first.
    setTimeout(() => (this.boundKey = null), 0);
  };

  /** A mouse button pressed on the waiting key box binds that button; a press anywhere else stops listening. */
  private readonly onMouseDown = (e: MouseEvent): void => {
    this.boundButton = null;
    const box = this.listening;
    if (!box) return;
    const button = this.rows.get(box.action)?.boxes[box.slot];
    if (!(e.target instanceof Node && button?.contains(e.target))) {
      this.listen(null);
      return;
    }
    // The second press of a double-click on the box: its click cancels, as clicking the waiting box once more always did.
    if (e.button === 0 && e.detail >= 2) return;
    e.preventDefault();
    e.stopPropagation();
    this.boundButton = e.button;
    this.bind(mouseButtonCode(e.button));
  };

  /** The release of the button just bound: Chrome's back / forward on a side button's release must not follow. */
  private readonly onMouseUp = (e: MouseEvent): void => {
    if (e.button === this.boundButton && e.button !== 0) e.preventDefault();
  };

  /** The menu (right button) and Firefox's back / forward (side buttons) that would follow the button just bound. */
  private readonly swallowBound = (e: MouseEvent): void => {
    if (e.button === this.boundButton || this.listening) e.preventDefault();
  };

  /** The wheel turned while a box waits: binds that direction (and the page doesn't scroll). */
  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.listening || e.deltaY === 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.bind(e.deltaY < 0 ? WHEEL_CODES.up : WHEEL_CODES.down);
  };
}
