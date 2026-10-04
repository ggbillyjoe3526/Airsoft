import { DEV_ENTRIES, DEV_SWITCH_CHOICES, type DevSettings } from '../config/dev';
import { devField } from '../settings/dev';
import { menuRow, rangeControl } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

export interface DevSettingsOptions {
  /** The saved values, shown as picked. */
  initial: DevSettings;
  onChange: <K extends keyof DevSettings>(id: K, value: DevSettings[K]) => void;
}

/** The Dev tab's rows (Settings → Dev, M24), one per entry in config/dev.ts, each saved as `dev.<id>` as it changes. */
export function devSettings(opts: DevSettingsOptions): HTMLDivElement[] {
  return DEV_ENTRIES.map((e) => {
    if (e.kind === 'switch') {
      const picker = new OptionPicker(e.label, DEV_SWITCH_CHOICES, opts.initial[e.id] ? 'on' : 'off', devField(e.id), (v) => opts.onChange(e.id, v === 'on'));
      return menuRow(e.label, e.help, picker.root);
    }
    return menuRow(e.label, e.help, rangeControl(e.label, e, opts.initial[e.id], (v) => `${Math.round(v * 100)}%`, devField(e.id), (v) => opts.onChange(e.id, v)));
  });
}
