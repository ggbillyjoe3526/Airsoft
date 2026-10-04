import { loadSetting, oneOf, type SettingField, saveSetting } from '../settings/storage';

/** One choice in an OptionPicker. */
export interface PickerOption<T extends string> {
  id: T;
  label: string;
  /** One line describing the option, shown under the buttons while it's picked. */
  blurb: string;
}

/** The choice saved as `field`, or `fallback` if nothing valid is saved (or storage is blocked). */
export function loadChoice<T extends string>(field: SettingField, options: readonly PickerOption<T>[], fallback: T): T {
  return loadSetting(field, oneOf(options.map((o) => o.id)), fallback);
}

/**
 * A labelled row of buttons, one per option, and a line describing the picked one. The choice is saved in the
 * browser's settings as `field`. Used in the menus (the optic on the Loadout screen, the crouch key in Settings).
 */
export class OptionPicker<T extends string> {
  readonly root: HTMLDivElement;
  private readonly buttons = new Map<T, HTMLButtonElement>();
  private readonly blurb: HTMLParagraphElement;
  private current: T;

  /** `initial`: the option shown as picked (normally loadChoice(field, ...)). */
  constructor(
    label: string,
    private readonly options: readonly PickerOption<T>[],
    initial: T,
    field: SettingField,
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
        saveSetting(field, id);
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

  /** A swatch of each option's colour in front of its button (the crosshair's colours, the sound cues'). */
  addSwatches(colours: readonly { css: string }[]): void {
    let i = 0;
    for (const button of this.buttons.values()) {
      const swatch = document.createElement('span');
      swatch.className = 'crosshair-swatch';
      swatch.style.background = colours[i++]!.css;
      button.prepend(swatch);
    }
  }

  /** Shows `value` as picked without saving it or reporting a change (another choice set it, e.g. M20's teammates). */
  show(value: T): void {
    this.current = value;
    this.refresh();
  }

  private refresh(): void {
    for (const [id, button] of this.buttons) {
      const on = id === this.current;
      button.classList.toggle('selected', on);
      button.setAttribute('aria-pressed', String(on));
    }
    this.blurb.textContent = this.options.find((o) => o.id === this.current)?.blurb ?? '';
  }
}
