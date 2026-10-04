import { saveSetting, type SettingField } from '../../settings/storage';
import type { PickerOption } from '../optionPicker';
import { closeButton, el } from './menuParts';

/**
 * Options that can be locked (maps still being built, M33): while locked, greyed out, disabled and tagged `locked`;
 * once open, picked like any other and tagged `open`.
 */
export interface Lockable<T extends string> {
  ids: readonly T[];
  locked: string;
  open: string;
}

/**
 * A pop-up that offers one choice (match mode, bot difficulty): each option with its own line of description.
 * Picking one saves it as `field`, reports it and closes; Esc or × closes without a change. `lockable` options start
 * locked (setUnlocked opens them); a locked pick stays saved but `value` reads as the first open option meanwhile.
 */
export class ChoiceDialog<T extends string> {
  readonly root: HTMLDialogElement;
  private readonly buttons = new Map<T, HTMLButtonElement>();
  private readonly tags = new Map<T, HTMLSpanElement>();
  private current: T;
  private unlocked = false;

  constructor(
    title: string,
    private readonly options: readonly PickerOption<T>[],
    initial: T,
    field: SettingField,
    onChange: (value: T) => void,
    private readonly lockable: Lockable<T> = { ids: [], locked: '', open: '' },
  ) {
    this.current = initial;
    this.root = el('dialog', 'menu-dialog');
    this.root.setAttribute('aria-label', title);
    const head = el('div', 'menu-dialog-head');
    head.append(el('h2', 'menu-dialog-title', title), closeButton('Close', () => this.close()));
    const list = el('div', 'menu-dialog-options');
    for (const option of options) {
      const button = el('button', 'choice-option');
      button.type = 'button';
      const name = el('span', 'choice-name', option.label);
      if (lockable.ids.includes(option.id)) {
        const tag = el('span', 'menu-later');
        name.append(tag);
        this.tags.set(option.id, tag);
      }
      const text = el('span', 'choice-text');
      text.append(name, el('span', 'choice-blurb', option.blurb));
      button.append(el('span', 'choice-dot'), text);
      button.addEventListener('click', () => {
        if (option.id !== this.current) {
          this.current = option.id;
          saveSetting(field, option.id);
          onChange(option.id);
          this.refresh();
        }
        this.close();
      });
      list.append(button);
      this.buttons.set(option.id, button);
    }
    this.root.append(head, list);
    // A click on the dimmed backdrop (outside the box) closes it, like Esc.
    this.root.addEventListener('click', (e) => {
      const r = this.root.getBoundingClientRect();
      if (e.target === this.root && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) this.close();
    });
    this.refresh();
  }

  /** The option in force: the pick, or while it is locked the first open option. */
  get value(): T {
    return this.isLocked(this.current) ? (this.options.find((o) => !this.isLocked(o.id)) ?? this.options[0]!).id : this.current;
  }

  get label(): string {
    return this.find(this.value).label;
  }

  get blurb(): string {
    return this.find(this.value).blurb;
  }

  /** Opens or locks the lockable options (Dev settings › Access maps in development). */
  setUnlocked(on: boolean): void {
    if (this.unlocked === on) return;
    this.unlocked = on;
    this.refresh();
  }

  open(): void {
    if (!this.root.open) this.root.showModal();
    this.buttons.get(this.value)?.focus();
  }

  close(): void {
    if (this.root.open) this.root.close();
  }

  private find(id: T): PickerOption<T> {
    return this.options.find((o) => o.id === id) ?? this.options[0]!;
  }

  private isLocked(id: T): boolean {
    return !this.unlocked && this.lockable.ids.includes(id);
  }

  private refresh(): void {
    const value = this.value;
    for (const [id, button] of this.buttons) {
      const on = id === value;
      const locked = this.isLocked(id);
      button.classList.toggle('selected', on);
      button.setAttribute('aria-pressed', String(on));
      button.classList.toggle('soon', locked);
      button.disabled = locked;
    }
    for (const [id, tag] of this.tags) tag.textContent = this.isLocked(id) ? this.lockable.locked : this.lockable.open;
  }
}
