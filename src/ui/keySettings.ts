import { type Action, REBINDABLE } from '../config/controls';
import { bindable, describeKeys, type KeyBindings, keyLabel, mouseButtonCode } from '../input/keyBindings';

const CTRL_WARNING = 'Heads up: some Ctrl combinations (like Ctrl+W, close tab) can\'t be blocked by the browser.';

/** Shown when a quick second click on a waiting key box cancelled instead of binding Left mouse. */
const DOUBLE_CLICK_NOTE = 'Two quick clicks cancel. To bind Left mouse, click the box, wait a moment, then click it again.';

/**
 * Key-binding settings: one row per rebindable action. Click a key button, then press the new key, or click the
 * button again with the mouse button wanted (left, right, middle or a side button; M18). Esc or a click elsewhere
 * cancels. Taking a key another action uses swaps the two. Lives on the Settings screen (Key Bindings tab).
 */
export class KeySettings {
  readonly root: HTMLDivElement;
  private readonly buttons = new Map<Action, { button: HTMLButtonElement; label: string }>();
  private readonly note: HTMLParagraphElement;
  /** The action waiting for a key press, if any. */
  private listening: Action | null = null;
  /**
   * The mouse button just bound (until the next press): its click, menu or browser navigation (the side buttons go back
   * and forward) must not follow.
   */
  private boundButton: number | null = null;

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
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'key-button';
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        // The left click that just bound Left mouse to this action.
        if (this.boundButton === 0) {
          this.boundButton = null;
          return;
        }
        // Unfocused, so binding Space or Enter doesn't "click" the button again on key release.
        button.blur();
        // The second click of a quick double-click on the waiting box cancels (onMouseDown); say why (bug pass).
        if (this.listening === action && e.detail >= 2) {
          this.listening = null;
          this.refresh(DOUBLE_CLICK_NOTE);
          return;
        }
        this.listen(this.listening === action ? null : action);
      });
      row.append(name, button);
      list.appendChild(row);
      this.buttons.set(action, { button, label });
    }
    this.note = document.createElement('p');
    this.note.className = 'key-note';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'key-reset';
    reset.textContent = 'Reset All';
    reset.addEventListener('click', () => {
      this.listen(null);
      bindings.reset();
    });
    this.root.append(list, this.note, reset);

    bindings.onChange(() => this.refresh());
    // Capture phase, so the game's keyboard never sees the key being bound.
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('mousedown', this.onMouseDown, true);
    window.addEventListener('mouseup', this.onMouseUp, true);
    window.addEventListener('auxclick', this.swallowBound, true);
    window.addEventListener('contextmenu', this.swallowBound, true);
    this.refresh();
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) this.listen(null);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('mousedown', this.onMouseDown, true);
    window.removeEventListener('mouseup', this.onMouseUp, true);
    window.removeEventListener('auxclick', this.swallowBound, true);
    window.removeEventListener('contextmenu', this.swallowBound, true);
    this.root.remove();
  }

  private listen(action: Action | null): void {
    this.listening = action;
    this.refresh();
  }

  private refresh(message = ''): void {
    let ctrl = false;
    for (const [action, { button, label }] of this.buttons) {
      const waiting = action === this.listening;
      button.textContent = waiting ? 'Press a key or click…' : describeKeys(this.bindings.codes(action));
      // Named for its action too (audit L-31): a screen reader would otherwise say only "W, button".
      button.setAttribute('aria-label', `${label}: ${button.textContent}`);
      button.classList.toggle('listening', waiting);
      if (this.bindings.codes(action).some((c) => c.startsWith('Control'))) ctrl = true;
    }
    this.note.textContent =
      message || (this.listening ? 'Press the new key, or click this box with the mouse button you want. Esc cancels.' : ctrl ? CTRL_WARNING : '');
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const action = this.listening;
    if (!action) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'Escape') {
      this.listen(null);
      return;
    }
    if (!bindable(e.code) || !this.bindings.rebind(action, e.code)) {
      const reserved = this.bindings.actionOf(e.code)?.startsWith('debug');
      // A key the browser can't name (an unmapped media or Fn key) has no label worth showing.
      const name = e.code && e.code !== 'Unidentified' ? keyLabel(e.code) : 'That key';
      this.refresh(`${name} can't be bound${reserved ? ' (it shows debug info)' : ''}.`);
      return;
    }
    this.listening = null;
    this.refresh();
  };

  /** A mouse button pressed on the waiting key box binds that button; a press anywhere else stops listening. */
  private readonly onMouseDown = (e: MouseEvent): void => {
    this.boundButton = null;
    const action = this.listening;
    if (!action) return;
    const box = this.buttons.get(action)?.button;
    if (!(e.target instanceof Node && box?.contains(e.target))) {
      this.listen(null);
      return;
    }
    // The second press of a double-click on the box: its click cancels, as clicking the waiting box once more always did.
    if (e.button === 0 && e.detail >= 2) return;
    e.preventDefault();
    e.stopPropagation();
    this.boundButton = e.button;
    if (!this.bindings.rebind(action, mouseButtonCode(e.button))) {
      this.refresh(`${keyLabel(mouseButtonCode(e.button))} can't be bound.`);
      return;
    }
    this.listening = null;
    this.refresh();
  };

  /** The release of the button just bound: Chrome's back / forward on a side button's release must not follow. */
  private readonly onMouseUp = (e: MouseEvent): void => {
    if (e.button === this.boundButton && e.button !== 0) e.preventDefault();
  };

  /** The menu (right button) and Firefox's back / forward (side buttons) that would follow the button just bound. */
  private readonly swallowBound = (e: MouseEvent): void => {
    if (e.button === this.boundButton || this.listening) e.preventDefault();
  };
}
