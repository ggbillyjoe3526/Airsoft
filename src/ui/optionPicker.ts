/** One choice in an OptionPicker. */
export interface PickerOption<T extends string> {
  id: T;
  label: string;
  /** One line describing the option, shown under the buttons while it's picked. */
  blurb: string;
}

/** The choice saved under `key`, or `fallback` if nothing valid is saved (or storage is blocked). */
export function loadChoice<T extends string>(key: string, options: readonly PickerOption<T>[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    const found = options.find((o) => o.id === raw);
    if (found) return found.id;
  } catch {
    // Storage unavailable (private mode etc.): fall back to the default.
  }
  return fallback;
}

function saveChoice(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Non-critical: the choice still applies for this session.
  }
}

/**
 * A labelled row of buttons, one per option, and a line describing the picked one (plus an optional
 * note, e.g. that a change made mid-match waits). The choice is saved in the browser under
 * `storageKey`. Lives inside the start screen (bot difficulty, match mode).
 */
export class OptionPicker<T extends string> {
  readonly root: HTMLDivElement;
  private readonly buttons = new Map<T, HTMLButtonElement>();
  private readonly blurb: HTMLParagraphElement;
  private current: T;
  private note = '';

  /** `initial`: the option shown as picked (normally loadChoice(storageKey, ...)). */
  constructor(
    label: string,
    private readonly options: readonly PickerOption<T>[],
    initial: T,
    storageKey: string,
    onChange: (value: T) => void,
  ) {
    this.current = initial;
    this.root = document.createElement('div');
    this.root.className = 'picker';
    const row = document.createElement('div');
    row.className = 'picker-row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', label);
    const name = document.createElement('span');
    name.className = 'picker-label';
    name.textContent = label;
    row.appendChild(name);
    for (const { id, label: text } of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'picker-button';
      button.textContent = text;
      button.addEventListener('click', () => {
        if (id === this.current) return;
        this.current = id;
        saveChoice(storageKey, id);
        this.note = '';
        onChange(id);
        this.refresh();
      });
      row.appendChild(button);
      this.buttons.set(id, button);
    }
    this.blurb = document.createElement('p');
    this.blurb.className = 'picker-blurb';
    this.root.append(row, this.blurb);
    this.refresh();
  }

  /** A short note after the option's description (empty to clear). */
  setNote(text: string): void {
    this.note = text;
    this.refresh();
  }

  private refresh(): void {
    for (const [id, button] of this.buttons) {
      const on = id === this.current;
      button.classList.toggle('selected', on);
      button.setAttribute('aria-pressed', String(on));
    }
    const blurb = this.options.find((o) => o.id === this.current)?.blurb ?? '';
    this.blurb.textContent = this.note ? `${blurb} ${this.note}` : blurb;
  }
}
