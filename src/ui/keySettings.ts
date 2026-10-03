import { type Action, REBINDABLE, UNBINDABLE_KEYS } from '../config/controls';
import { describeKeys, type KeyBindings, keyLabel } from '../input/keyBindings';

const CTRL_WARNING = 'Heads up: some Ctrl combinations (like Ctrl+W, close tab) can\'t be blocked by the browser.';

/**
 * Key-binding settings: one row per rebindable action. Click a key button, then press the new key
 * (Esc cancels). Taking a key another action uses swaps the two. Lives on the Settings screen (Key bindings tab).
 */
export class KeySettings {
  readonly root: HTMLDivElement;
  private readonly buttons = new Map<Action, HTMLButtonElement>();
  private readonly note: HTMLParagraphElement;
  /** The action waiting for a key press, if any. */
  private listening: Action | null = null;

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
        // Unfocused, so binding Space or Enter doesn't "click" the button again on key release.
        button.blur();
        this.listen(this.listening === action ? null : action);
      });
      row.append(name, button);
      list.appendChild(row);
      this.buttons.set(action, button);
    }
    this.note = document.createElement('p');
    this.note.className = 'key-note';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'key-reset';
    reset.textContent = 'Reset to defaults';
    reset.addEventListener('click', () => {
      this.listen(null);
      bindings.reset();
    });
    this.root.append(list, this.note, reset);

    bindings.onChange(() => this.refresh());
    // Capture phase, so the game's keyboard never sees the key being bound.
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('pointerdown', this.onPointerDown, true);
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
    window.removeEventListener('pointerdown', this.onPointerDown, true);
    this.root.remove();
  }

  private listen(action: Action | null): void {
    this.listening = action;
    this.refresh();
  }

  private refresh(message = ''): void {
    let ctrl = false;
    for (const [action, button] of this.buttons) {
      const waiting = action === this.listening;
      button.textContent = waiting ? 'Press a key…' : describeKeys(this.bindings.codes(action));
      button.classList.toggle('listening', waiting);
      if (this.bindings.codes(action).some((c) => c.startsWith('Control'))) ctrl = true;
    }
    this.note.textContent = message || (this.listening ? 'Press the new key, or Esc to cancel.' : ctrl ? CTRL_WARNING : '');
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
    if (UNBINDABLE_KEYS.has(e.code) || !this.bindings.rebind(action, e.code)) {
      const reserved = this.bindings.actionOf(e.code)?.startsWith('debug');
      this.refresh(`${keyLabel(e.code)} can't be bound${reserved ? ' (it shows debug info)' : ''}.`);
      return;
    }
    this.listening = null;
    this.refresh();
  };

  /** Clicking anywhere else stops listening. */
  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.listening && !(e.target instanceof HTMLElement && e.target.classList.contains('key-button'))) this.listen(null);
  };
}
