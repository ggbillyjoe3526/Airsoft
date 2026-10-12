import { CRASH_TEXT } from '../config/crash';
import { withNote } from '../core/bugIssue';
import { crashReport, type ReportInfo } from '../core/crashReport';
import { noteBox, reportBugLink } from './bugReport';
import { copyText } from './clipboard';
import { el, menuButton } from './menus/menuParts';

export interface CrashScreenText {
  heading: string;
  body: string;
  /** An extra paragraph of advice (a start-up without WebGL), or ''. */
  advice: string;
  /** The report to show, copy and send (core/crashReport.ts). */
  report: ReportInfo;
}

/**
 * Over everything, menus and the graphics notice included, once the game has stopped on an error (audit CORE-04,
 * UI-02, CORE-28): what happened, a read-only report, a note box, Copy, Report a Bug (IM7) and Reload. Styled as a menu
 * screen. Shown once: the first error is the one worth reporting (the one Report a Bug sends), so a second only adds to
 * the report box below the first.
 */
export class CrashScreen {
  private readonly root: HTMLDivElement;
  private readonly report: HTMLTextAreaElement;
  private readonly status: HTMLParagraphElement;
  private readonly note = noteBox();
  /** The first report, then any later error's. */
  private readonly reports: ReportInfo[];

  constructor(parent: HTMLElement, text: CrashScreenText) {
    this.root = el('div', 'crash-screen');
    this.root.setAttribute('role', 'alertdialog');
    this.root.setAttribute('aria-modal', 'true');
    const panel = el('div', 'crash-panel');
    const heading = el('h1', 'menu-heading', text.heading);
    heading.id = 'crash-heading';
    this.root.setAttribute('aria-labelledby', heading.id);
    panel.append(heading, el('p', 'crash-body', text.body));
    if (text.advice) panel.append(el('p', 'crash-advice', text.advice));
    this.report = el('textarea', 'crash-report');
    this.report.readOnly = true;
    this.report.spellcheck = false;
    this.reports = [text.report];
    this.report.value = crashReport(text.report);
    this.report.setAttribute('aria-label', CRASH_TEXT.reportLabel);
    this.status = el('p', 'crash-status');
    this.status.setAttribute('aria-live', 'polite');
    const copy = menuButton(CRASH_TEXT.copy, 'secondary', () => void this.copy());
    const reload = menuButton(CRASH_TEXT.reload, 'primary', () => window.location.reload());
    const send = reportBugLink(() => text.report, () => this.note.value, (line) => (this.status.textContent = line));
    const actions = el('div', 'crash-actions');
    actions.append(reload, copy, send, this.status);
    panel.append(this.report, this.note, actions);
    this.root.append(panel);
    parent.appendChild(this.root);
    reload.focus();
  }

  /** A later error while the pane is up: added under the first, for completeness. */
  append(report: ReportInfo): void {
    this.reports.push(report);
    this.report.value += `\n\n${crashReport(report)}`;
  }

  /** Copies the report with the note (ui/clipboard.ts), else leaves the report selected for Ctrl+C. */
  private async copy(): Promise<void> {
    const text = this.reports.map((r, i) => crashReport(i === 0 ? withNote(r, this.note.value) : r)).join('\n\n');
    if (await copyText(text)) {
      this.status.textContent = CRASH_TEXT.copied;
      return;
    }
    this.report.focus();
    this.report.select();
    this.status.textContent = CRASH_TEXT.copyFailed;
  }
}
