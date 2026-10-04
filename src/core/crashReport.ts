import { CRASH_REPORT } from '../config/crash';

/** One line of a report: a label and its value ('-' when not known). */
export type ReportField = readonly [label: string, value: string | number | boolean | null | undefined];

/** What a crash or diagnostics report says (audit CORE-04, CORE-32). Plain data, so the report is a pure function of it. */
export interface ReportInfo {
  /** The report's first line, e.g. "Airsoft crash report". */
  title: string;
  /** The build label (config/buildVersion.ts). */
  build: string;
  userAgent: string;
  /** The game's state: seed, map, mode, tick, quality … in order. */
  fields: readonly ReportField[];
  /** The error, if this is a crash. */
  error?: unknown;
}

/** The error's name and message ("TypeError: x is undefined"), whatever was thrown. */
export function errorLine(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/** The error's stack, its first `max` lines (a note says how many were left out); '' with no stack. */
export function stackLines(error: unknown, max: number = CRASH_REPORT.stackLines): string {
  const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : '';
  if (!stack) return '';
  const lines = stack.split('\n').map((l) => l.trimEnd());
  // Firefox's stack has no "Name: message" first line; Chrome's does. The message is on its own line already.
  if (lines[0] === errorLine(error) || lines[0]?.startsWith(`${(error as Error).name}:`)) lines.shift();
  const kept = lines.filter((l) => l.trim() !== '').slice(0, max);
  const left = lines.filter((l) => l.trim() !== '').length - kept.length;
  return [...kept.map((l) => l.trim()), ...(left > 0 ? [`… ${left} more`] : [])].join('\n');
}

/** The text a player copies: the build, the browser, the game's state, then the error and its stack. */
export function crashReport(info: ReportInfo): string {
  const lines = [info.title, `Build: ${info.build}`, `Browser: ${info.userAgent}`];
  for (const [label, value] of info.fields) lines.push(`${label}: ${value === null || value === undefined || value === '' ? '-' : String(value)}`);
  if (info.error !== undefined) {
    lines.push(`Error: ${errorLine(info.error)}`);
    const stack = stackLines(info.error);
    if (stack) lines.push('Stack:', stack);
  }
  return lines.join('\n');
}
