import { BUG_REPORT, BUG_REPORT_TEXT } from '../config/crash';
import { crashReport, type ReportCut, type ReportInfo } from './crashReport';

/** A new GitHub issue's address with the report in it (IM7). */
export interface BugIssue {
  url: string;
  /** Part of the report was cut to fit the address: the whole one belongs on the clipboard. */
  cut: boolean;
}

/** The player's note on one line, as the report's Note field gives it. */
function oneLine(note: string): string {
  return note.replace(/\s+/g, ' ').trim();
}

/** The report with the player's note in it, first of the fields; as it was without one. */
export function withNote(info: ReportInfo, note: string): ReportInfo {
  const text = oneLine(note);
  return text ? { ...info, fields: [['Note', text], ...info.fields] } : info;
}

/** The longest run of backticks in `text`, so the code fence around it can be longer (GitHub's Markdown). */
function longestBackticks(text: string): number {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return longest;
}

/**
 * Report a Bug's address (IM7): a new issue on the game's repository, titled from the note's first line (or the build),
 * with the note and the report, in a code block so nothing in it reads as Markdown (a "#3" as an issue link). Over
 * `maxChars` (GitHub refuses longer addresses) the report is cut to fit, in order: the lists' oldest entries, then the
 * settings, then its last lines; the body then says to paste the whole report, which the caller copies. Pure.
 */
export function bugIssue(info: ReportInfo, note: string, base: string = BUG_REPORT.issueUrl, maxChars: number = BUG_REPORT.maxUrlChars): BugIssue {
  const text = note.trim();
  const first = oneLine(text.split('\n')[0] ?? '');
  const clipped = first.length > BUG_REPORT.titleChars ? `${first.slice(0, BUG_REPORT.titleChars - 1)}…` : first;
  const title = first ? BUG_REPORT_TEXT.titleWithNote(clipped) : BUG_REPORT_TEXT.title(info.build);
  const address = (report: string, cut: boolean): string => {
    const fence = '`'.repeat(Math.max(3, longestBackticks(report) + 1));
    const body = [text || BUG_REPORT_TEXT.askWhat, '', ...(cut ? [BUG_REPORT_TEXT.cutNote, ''] : []), `${fence}text`, report, fence].join('\n');
    // GitHub's own examples put spaces as "+", as URLSearchParams does: the shortest form.
    return `${base}?${new URLSearchParams({ title, body }).toString()}`;
  };
  const cuts: ReportCut[] = [
    { keep: Infinity, drop: [] },
    ...BUG_REPORT.keepSteps.map((keep) => ({ keep, drop: [] })),
    { keep: 0, drop: BUG_REPORT.dropFields },
  ];
  for (let i = 0; i < cuts.length; i++) {
    const url = address(crashReport(info, cuts[i]), i > 0);
    if (url.length <= maxChars) return { url, cut: i > 0 };
  }
  // Still too long (a long stack, a huge settings line): as many of its first lines as fit.
  const lines = crashReport(info, cuts.at(-1)).split('\n');
  let fits = 0;
  let over = lines.length;
  while (over - fits > 1) {
    const mid = (fits + over) >> 1;
    if (address(lines.slice(0, mid).join('\n'), true).length <= maxChars) fits = mid;
    else over = mid;
  }
  return { url: address(lines.slice(0, fits).join('\n'), true), cut: true };
}
