import { CRASH_TEXT } from '../config/crash';
import { copyText } from './clipboard';
import { el, menuButton } from './menus/menuParts';

export interface CrashScreenText {
  heading: string;
  body: string;
  /** An extra paragraph of advice (a start-up without WebGL), or ''. */
  advice: string;
  /** The report to copy (core/crashReport.ts). */
  report: string;
}

/**
 * Over everything, menus and the graphics notice included, once the game has stopped on an error (audit CORE-04,
 * UI-02, CORE-28): what happened, a read-only report to copy, and Reload. Styled as a menu screen. Shown once: the
 * first error is the one worth reporting, so a second only adds to the report box below the first.
 */
export class CrashScreen {
  private readonly root: HTMLDivElement;
  private readonly report: HTMLTextAreaElement;
  private readonly status: HTMLParagraphElement;

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
    this.report.value = text.report;
    this.report.setAttribute('aria-label', CRASH_TEXT.reportLabel);
    this.status = el('p', 'crash-status');
    this.status.setAttribute('aria-live', 'polite');
    const copy = menuButton(CRASH_TEXT.copy, 'secondary', () => void this.copy());
    const reload = menuButton(CRASH_TEXT.reload, 'primary', () => window.location.reload());
    const actions = el('div', 'crash-actions');
    actions.append(reload, copy, this.status);
    panel.append(this.report, actions);
    this.root.append(panel);
    parent.appendChild(this.root);
    reload.focus();
  }

  /** A later error while the pane is up: added under the first, for completeness. */
  append(report: string): void {
    this.report.value += `\n\n${report}`;
  }

  /** Copies the report (ui/clipboard.ts), else leaves it selected for Ctrl+C. */
  private async copy(): Promise<void> {
    if (await copyText(this.report.value)) {
      this.status.textContent = CRASH_TEXT.copied;
      return;
    }
    this.report.focus();
    this.report.select();
    this.status.textContent = CRASH_TEXT.copyFailed;
  }
}
