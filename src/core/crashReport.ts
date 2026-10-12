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
  /** Lists after the error: the recent console errors and game events (IM7), each oldest first. */
  lists?: readonly ReportList[];
}

/** A list in a report, oldest entry first; an entry may run over several lines (an error and its stack). */
export interface ReportList {
  label: string;
  entries: readonly string[];
}

/** How much of a report to give (core/bugIssue.ts cuts one to fit an address): each list's newest `keep` entries, and fields left out. */
export interface ReportCut {
  keep: number;
  drop: readonly string[];
}

const WHOLE: ReportCut = { keep: Infinity, drop: [] };

/**
 * A web address in a message or stack, up to its file name ("https://host/game/assets/index-abc.js:1:2" → "index-abc.js:1:2"):
 * the build names the files, and a page opened from a folder would otherwise give its path, the player's name in it.
 */
const ADDRESS = /\b(?:blob:)?(?:https?|file):\/\/[^\s()'"]*\//g;

/** `text` with every web address cut down to its file name (IM7: a report may go into a public issue). */
export function withoutAddresses(text: string): string {
  return text.replace(ADDRESS, '');
}

/** The error's name and message ("TypeError: x is undefined"), whatever was thrown. */
export function errorLine(error: unknown): string {
  return withoutAddresses(rawErrorLine(error));
}

function rawErrorLine(error: unknown): string {
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
  if (lines[0] === rawErrorLine(error) || lines[0]?.startsWith(`${(error as Error).name}:`)) lines.shift();
  const kept = lines.filter((l) => l.trim() !== '').slice(0, max);
  const left = lines.filter((l) => l.trim() !== '').length - kept.length;
  return [...kept.map((l) => withoutAddresses(l.trim())), ...(left > 0 ? [`… ${left} more`] : [])].join('\n');
}

/**
 * The text a player copies: the build, the browser, the game's state, the error and its stack, then the lists (each
 * indented under its label). `cut` gives less of it: fewer list entries (the newest kept), fields left out.
 */
export function crashReport(info: ReportInfo, cut: ReportCut = WHOLE): string {
  const lines = [info.title, `Build: ${info.build}`, `Browser: ${info.userAgent}`];
  for (const [label, value] of info.fields) {
    if (cut.drop.includes(label)) lines.push(`${label}: (left out to fit)`);
    else lines.push(`${label}: ${value === null || value === undefined || value === '' ? '-' : String(value)}`);
  }
  if (info.error !== undefined) {
    lines.push(`Error: ${errorLine(info.error)}`);
    const stack = stackLines(info.error);
    if (stack) lines.push('Stack:', stack);
  }
  for (const { label, entries } of info.lists ?? []) {
    const kept = entries.slice(Math.max(0, entries.length - cut.keep));
    if (entries.length === 0) lines.push(`${label}: none`);
    else lines.push(kept.length === entries.length ? `${label} (${entries.length}, oldest first):` : `${label} (newest ${kept.length} of ${entries.length}):`);
    for (const entry of kept) for (const line of entry.split('\n')) lines.push(`  ${line}`);
  }
  return lines.join('\n');
}
