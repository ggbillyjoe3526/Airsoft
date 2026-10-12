import { BUG_REPORT, BUG_REPORT_TEXT } from '../config/crash';
import { bugIssue, withNote } from '../core/bugIssue';
import { crashReport, type ReportInfo } from '../core/crashReport';
import { copyText } from './clipboard';
import { el } from './menus/menuParts';

/** The note box (IM7): what went wrong, in the player's words, put first in the report they copy or send. */
export function noteBox(): HTMLTextAreaElement {
  const box = el('textarea', 'bug-note');
  box.maxLength = BUG_REPORT.noteChars;
  box.rows = 2;
  box.placeholder = BUG_REPORT_TEXT.notePlaceholder;
  box.setAttribute('aria-label', BUG_REPORT_TEXT.noteLabel);
  return box;
}

/**
 * Report a Bug (IM7): a link that looks like a menu button, so the new issue opens in a tab as any link does, with no
 * pop-up blocker in the way. Its address is made as it's clicked (the report as it is then, with `note`); when the
 * report had to be cut to fit, the whole of it is copied for pasting in. `say` tells the player what happened.
 */
export function reportBugLink(report: () => ReportInfo, note: () => string, say: (text: string) => void): HTMLAnchorElement {
  const link = el('a', 'menu-button menu-button-secondary bug-report-link', BUG_REPORT_TEXT.button);
  link.href = BUG_REPORT.issueUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  // A middle click opens the link too (auxclick); a left click or Enter is a click. Either way, before the browser follows it.
  const open = (e: MouseEvent): void => {
    if (e.type === 'auxclick' && e.button !== 1) return;
    const info = report();
    const issue = bugIssue(info, note());
    link.href = issue.url;
    if (!issue.cut) return say(BUG_REPORT_TEXT.opened);
    void copyText(crashReport(withNote(info, note()))).then((ok) => say(ok ? BUG_REPORT_TEXT.openedCopied : BUG_REPORT_TEXT.openedNotCopied));
  };
  link.addEventListener('click', open);
  link.addEventListener('auxclick', open);
  return link;
}
