import { availableChoice, isAvailable, type Tagged } from '../../config/content';
import { saveSetting, type SettingField } from '../../settings/storage';
import type { PickerOption } from '../optionPicker';
import { closeButton, el } from './menuParts';

/**
 * An entry shown greyed out under a dialog's options with a tag (a map still being built): never picked. Dev content
 * (M35): listed only while Dev content is on.
 */
export interface SoonEntry extends Tagged {
  label: string;
  blurb: string;
}

/** How a dialog shows its options and entries beyond the picked one. */
export interface ChoiceDialogExtras<T extends string> {
  /** Entries under the options, greyed out and disabled, each with `soonTag` beside its name. */
  soon?: readonly SoonEntry[];
  soonTag?: string;
  /** What a dev pick plays as while Dev content is off (the list's default; else its first option). */
  fallback?: T;
}

/**
 * A pop-up that offers one choice (match mode, bot difficulty): each option with its own line of description.
 * Picking one saves it as `field`, reports it and closes; Esc or × closes without a change. `soon` entries follow the
 * options, greyed out and disabled, each with `soonTag` beside its name. Dev options and entries (M35) are listed only
 * after setDevContent(true), looking like the rest; a saved dev pick shows as the fallback until then, and stays saved.
 */
export class ChoiceDialog<T extends string> {
  readonly root: HTMLDialogElement;
  private readonly buttons = new Map<T, HTMLButtonElement>();
  /** The `soon` entries' buttons, with their tags. */
  private readonly soonButtons: { entry: SoonEntry; button: HTMLButtonElement }[] = [];
  private readonly fallback: T;
  private current: T;
  private devContent = false;

  constructor(
    title: string,
    private readonly options: readonly PickerOption<T>[],
    initial: T,
    field: SettingField,
    onChange: (value: T) => void,
    extras: ChoiceDialogExtras<T> = {},
  ) {
    this.current = initial;
    this.fallback = extras.fallback ?? options[0]!.id;
    const soonTag = extras.soonTag ?? '';
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
    for (const entry of extras.soon ?? []) {
      const button = el('button', 'choice-option soon');
      button.type = 'button';
      button.disabled = true;
      const name = el('span', 'choice-name', entry.label);
      name.append(el('span', 'menu-later', soonTag));
      const text = el('span', 'choice-text');
      text.append(name, el('span', 'choice-blurb', entry.blurb));
      button.append(el('span', 'choice-dot'), text);
      list.append(button);
      this.soonButtons.push({ entry, button });
    }
    this.root.append(head, list);
    // A click on the dimmed backdrop (outside the box) closes it, like Esc.
    this.root.addEventListener('click', (e) => {
      const r = this.root.getBoundingClientRect();
      if (e.target === this.root && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) this.close();
    });
    this.refresh();
  }

  /** Dev content on or off (Settings → Dev, M35): dev options and entries listed, or not shown at all. */
  setDevContent(on: boolean): void {
    if (on === this.devContent) return;
    this.devContent = on;
    this.refresh();
  }

  /** What is picked, as it plays: a dev pick is the fallback while Dev content is off. */
  get value(): T {
    return availableChoice(this.options, this.current, this.devContent, this.fallback);
  }

  get label(): string {
    return this.find(this.value).label;
  }

  get blurb(): string {
    return this.find(this.value).blurb;
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

  private refresh(): void {
    const picked = this.value;
    for (const option of this.options) {
      const button = this.buttons.get(option.id)!;
      const on = option.id === picked;
      button.classList.toggle('selected', on);
      button.setAttribute('aria-pressed', String(on));
      button.hidden = button.disabled = !isAvailable(option.tag, this.devContent);
    }
    for (const { entry, button } of this.soonButtons) button.hidden = !isAvailable(entry.tag, this.devContent);
  }
}
