import { saveSetting, type SettingField } from '../../settings/storage';
import type { PickerOption } from '../optionPicker';
import { closeButton, el } from './menuParts';

/**
 * A pop-up that offers one choice (match mode, bot difficulty): each option with its own line of description.
 * Picking one saves it as `field`, reports it and closes; Esc or × closes without a change.
 */
export class ChoiceDialog<T extends string> {
  readonly root: HTMLDialogElement;
  private readonly buttons = new Map<T, HTMLButtonElement>();
  private readonly noteLine: HTMLParagraphElement;
  private current: T;

  constructor(
    title: string,
    private readonly options: readonly PickerOption<T>[],
    initial: T,
    field: SettingField,
    onChange: (value: T) => void,
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
      const text = el('span', 'choice-text');
      text.append(el('span', 'choice-name', option.label), el('span', 'choice-blurb', option.blurb));
      button.append(el('span', 'choice-dot'), text);
      button.addEventListener('click', () => {
        if (option.id !== this.current) {
          this.current = option.id;
          saveSetting(field, option.id);
          this.setNote('');
          onChange(option.id);
          this.refresh();
        }
        this.close();
      });
      list.append(button);
      this.buttons.set(option.id, button);
    }
    this.noteLine = el('p', 'menu-dialog-note');
    this.noteLine.hidden = true;
    this.root.append(head, list, this.noteLine);
    // A click on the dimmed backdrop (outside the box) closes it, like Esc.
    this.root.addEventListener('click', (e) => {
      const r = this.root.getBoundingClientRect();
      if (e.target === this.root && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) this.close();
    });
    this.refresh();
  }

  get value(): T {
    return this.current;
  }

  get label(): string {
    return this.find(this.current).label;
  }

  get blurb(): string {
    return this.find(this.current).blurb;
  }

  open(): void {
    if (!this.root.open) this.root.showModal();
    this.buttons.get(this.current)?.focus();
  }

  close(): void {
    if (this.root.open) this.root.close();
  }

  /** A short note under the options, e.g. that a change waits for the next match (empty to clear). */
  setNote(text: string): void {
    this.noteLine.textContent = text;
    this.noteLine.hidden = text.length === 0;
  }

  private find(id: T): PickerOption<T> {
    return this.options.find((o) => o.id === id) ?? this.options[0]!;
  }

  private refresh(): void {
    for (const [id, button] of this.buttons) {
      const on = id === this.current;
      button.classList.toggle('selected', on);
      button.setAttribute('aria-pressed', String(on));
    }
  }
}
