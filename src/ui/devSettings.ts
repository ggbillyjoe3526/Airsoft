import { CRASH_TEXT, DIAGNOSTICS_TEXT } from '../config/crash';
import { DEV_ENTRIES, DEV_SWITCH_CHOICES, type DevSettings } from '../config/dev';
import { devField } from '../settings/dev';
import { copyText } from './clipboard';
import { menuButton, menuRow, rangeControl } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

export interface DevSettingsOptions {
  /** The saved values, shown as picked. */
  initial: DevSettings;
  onChange: <K extends keyof DevSettings>(id: K, value: DevSettings[K]) => void;
  /** The diagnostics report to copy (Game.diagnostics, audit CORE-32); no row without it. */
  diagnostics?: () => string;
}

/** The Dev tab's rows (Settings → Dev, M24), one per entry in config/dev.ts, each saved as `dev.<id>` as it changes. */
export function devSettings(opts: DevSettingsOptions): HTMLDivElement[] {
  const rows = DEV_ENTRIES.map((e) => {
    if (e.kind === 'switch') {
      const picker = new OptionPicker(e.label, DEV_SWITCH_CHOICES, opts.initial[e.id] ? 'on' : 'off', devField(e.id), (v) => opts.onChange(e.id, v === 'on'));
      return menuRow(e.label, e.help, picker.root);
    }
    return menuRow(e.label, e.help, rangeControl(e.label, e, opts.initial[e.id], (v) => `${Math.round(v * 100)}%`, devField(e.id), (v) => opts.onChange(e.id, v)));
  });
  const diagnostics = opts.diagnostics;
  if (diagnostics) rows.push(menuRow(DIAGNOSTICS_TEXT.label, DIAGNOSTICS_TEXT.help, diagnosticsButton(diagnostics)));
  return rows;
}

/** Copy diagnostics (audit CORE-32): the build, browser, graphics card, seed and settings, for a bug report. */
function diagnosticsButton(report: () => string): HTMLButtonElement {
  const button = menuButton(DIAGNOSTICS_TEXT.copy, 'secondary', () => {
    void copyText(report()).then((ok) => {
      button.textContent = ok ? CRASH_TEXT.copied : DIAGNOSTICS_TEXT.failed;
      window.setTimeout(() => (button.textContent = DIAGNOSTICS_TEXT.copy), DIAGNOSTICS_TEXT.noteTime);
    });
  });
  return button;
}
