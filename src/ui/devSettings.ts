import { CRASH_TEXT, DIAGNOSTICS_TEXT } from '../config/crash';
import { withNote } from '../core/bugIssue';
import { crashReport, type ReportInfo } from '../core/crashReport';
import { DEV_ACTION_TEXT, DEV_ACTIONS, DEV_ENTRIES, DEV_SWITCH_CHOICES, type DevAction, type DevActionId, type DevSettings } from '../config/dev';
import { devField } from '../settings/dev';
import { noteBox, reportBugLink } from './bugReport';
import { copyText } from './clipboard';
import { el, menuButton, menuRow, rangeControl } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

export interface DevSettingsOptions {
  /** The saved values, shown as picked. */
  initial: DevSettings;
  onChange: <K extends keyof DevSettings>(id: K, value: DevSettings[K]) => void;
  /** The diagnostics report to copy or send (Game.diagnosticsInfo, audit CORE-32, IM7); no row without it. */
  diagnostics?: () => ReportInfo;
  /**
   * The Dev buttons (M90, config/dev.ts DEV_ACTIONS): each runs once and says how it went for a moment (the button's
   * own words, `DEV_ACTION_TEXT`). No rows without it.
   */
  actions?: (id: DevActionId) => string;
  /** Asks before a button with a `confirm` acts (the Settings screen's pop-up). */
  ask?: (title: string, question: string, yes: string, run: () => void) => void;
}

const percent = (v: number): string => `${Math.round(v * 100)}%`;

/** The Dev tab's rows (Settings → Dev, M24), one per entry in config/dev.ts, each saved as `dev.<id>` as it changes; then its buttons (M90). */
export function devSettings(opts: DevSettingsOptions): HTMLDivElement[] {
  const rows = DEV_ENTRIES.map((e) => {
    if (e.kind === 'switch') {
      const picker = new OptionPicker(e.label, DEV_SWITCH_CHOICES, opts.initial[e.id] ? 'on' : 'off', devField(e.id), (v) => opts.onChange(e.id, v === 'on'));
      return menuRow(e.label, e.help, picker.root);
    }
    if (e.kind === 'choice') {
      const picker = new OptionPicker(e.label, e.choices, opts.initial[e.id], devField(e.id), (v) => opts.onChange(e.id, v as DevSettings[typeof e.id]));
      return menuRow(e.label, e.help, picker.root);
    }
    return menuRow(e.label, e.help, rangeControl(e.label, e, opts.initial[e.id], e.format ?? percent, devField(e.id), (v) => opts.onChange(e.id, v)));
  });
  const run = opts.actions;
  if (run) for (const a of DEV_ACTIONS) rows.push(menuRow(a.label, a.help, actionButton(a, run, opts.ask)));
  const diagnostics = opts.diagnostics;
  if (diagnostics) rows.push(menuRow(DIAGNOSTICS_TEXT.label, DIAGNOSTICS_TEXT.help, diagnosticsControls(diagnostics)));
  return rows;
}

/** A Dev button (M90): runs its action (after asking, for one with `confirm`), then shows the result for a moment. */
function actionButton(a: DevAction, run: (id: DevActionId) => string, ask: DevSettingsOptions['ask']): HTMLButtonElement {
  const act = (): void => {
    const note = run(a.id);
    button.textContent = note;
    window.setTimeout(() => (button.textContent = a.button), DEV_ACTION_TEXT.noteTime);
  };
  const button = menuButton(a.button, 'secondary', () => {
    if (a.confirm && ask) ask(a.confirm.title, a.confirm.question, a.confirm.yes, act);
    else if (!a.confirm) act();
  });
  button.dataset.devAction = a.id;
  return button;
}

/**
 * Diagnostics (audit CORE-32, IM7): a note box, then Copy (the report with the note, for pasting anywhere) and Report a
 * Bug (a GitHub issue filled in with them), and a line saying how it went.
 */
function diagnosticsControls(report: () => ReportInfo): HTMLDivElement {
  const controls = el('div', 'menu-row-control bug-report');
  const note = noteBox();
  const status = el('p', 'bug-report-status');
  status.setAttribute('aria-live', 'polite');
  const copy = menuButton(DIAGNOSTICS_TEXT.copy, 'secondary', () => {
    void copyText(crashReport(withNote(report(), note.value))).then((ok) => {
      copy.textContent = ok ? CRASH_TEXT.copied : DIAGNOSTICS_TEXT.failed;
      window.setTimeout(() => (copy.textContent = DIAGNOSTICS_TEXT.copy), DIAGNOSTICS_TEXT.noteTime);
    });
  });
  controls.append(note, copy, reportBugLink(report, () => note.value, (text) => (status.textContent = text)), status);
  return controls;
}
