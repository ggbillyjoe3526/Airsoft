import { saveSetting, type SettingField } from '../../settings/storage';
import type { PickerOption } from '../optionPicker';
import { closeButton, el } from './menuParts';

/** An entry shown greyed out under a dialog's options with a tag (a map still being built): never picked. */
export interface SoonEntry {
  label: string;
  blurb: string;
}

/**
 * A pop-up that offers one choice (match mode, bot difficulty): each option with its own line of description.
 * Picking one saves it as `field`, reports it and closes; Esc or × closes without a change. `soon` entries follow the
 * options, greyed out and disabled, each with `soonTag` beside its name.
 */
export class ChoiceDialog<T extends string> {
  readonly root: HTMLDialogElement;
  private readonly buttons = new Map<T, HTMLButtonElement>();
  private current: T;

  constructor(
    title: string,
    private readonly options: readonly PickerOption<T>[],
    initial: T,
    field: SettingField,
    onChange: (value: T) => void,
    soon: readonly SoonEntry[] = [],
    soonTag = '',
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
          onChange(option.id);
          this.refresh();
        }
        this.close();
      });
      list.append(button);
      this.buttons.set(option.id, button);
    }
    for (const entry of soon) {
      const button = el('button', 'choice-option soon');
      button.type = 'button';
      button.disabled = true;
      const name = el('span', 'choice-name', entry.label);
      name.append(el('span', 'menu-later', soonTag));
      const text = el('span', 'choice-text');
      text.append(name, el('span', 'choice-blurb', entry.blurb));
      button.append(el('span', 'choice-dot'), text);
      list.append(button);
    }
    this.root.append(head, list);
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
