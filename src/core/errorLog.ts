import { REPORT_LOG } from '../config/crash';
import { errorLine, stackLines, withoutAddresses } from './crashReport';

export type LogLevel = 'error' | 'warn';

interface Entry {
  /** Seconds since the page opened. */
  at: number;
  level: LogLevel;
  text: string;
  stack: string;
  /** Times it was logged in a row. */
  count: number;
}

/**
 * The last console errors and warnings (IM7), for a report: a bug that doesn't crash the game leaves its trace here. A
 * ring of `capacity` entries; the same message again straight after only counts up, so a warning repeated every frame
 * takes no stack again and pushes nothing else out.
 */
export class ErrorLog {
  private readonly entries: Entry[] = [];
  private next = 0;

  constructor(
    private readonly capacity: number = REPORT_LOG.errors,
    /** Milliseconds since the page opened (performance.now). */
    private readonly clock: () => number = () => performance.now(),
  ) {}

  /**
   * One console call's arguments at `level`. `callSite` gives the caller's stack when no argument is an Error (only
   * asked for a new message, never for a repeat).
   */
  add(level: LogLevel, args: readonly unknown[], callSite?: () => string): void {
    const text = message(args);
    const newest = this.entries[(this.next + this.capacity - 1) % this.capacity];
    if (newest && newest.level === level && newest.text === text) {
      newest.count++;
      return;
    }
    const error = args.find((a) => a instanceof Error);
    const stack = error ? firstFrames(error, 0) : (callSite?.() ?? '');
    const entry: Entry = { at: this.clock() / 1000, level, text, stack, count: 1 };
    if (this.entries.length < this.capacity) this.entries.push(entry);
    else this.entries[this.next] = entry;
    this.next = (this.next + 1) % this.capacity;
  }

  /** Each entry as a report gives it, oldest first: when, the level, the message (×n for repeats), then its stack indented. */
  lines(): string[] {
    const n = this.entries.length;
    const start = n < this.capacity ? 0 : this.next;
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const e = this.entries[(start + i) % n]!;
      const head = `${e.at.toFixed(1)} s ${e.level}: ${e.text}${e.count > 1 ? ` (×${e.count})` : ''}`;
      out.push(e.stack ? `${head}\n${e.stack.split('\n').map((l) => `  ${l}`).join('\n')}` : head);
    }
    return out;
  }
}

/** A console call's arguments as one line: strings as they are (less %c styling), errors by name and message, other objects by kind. */
function message(args: readonly unknown[]): string {
  const parts = args.map((a) => {
    if (typeof a === 'string') return a.replace(/%c/g, '');
    if (a instanceof Error || typeof a !== 'object' || a === null) return errorLine(a);
    // Not stringified: an object a library logs can be a whole scene graph.
    return `[${(a as object).constructor?.name ?? 'object'}]`;
  });
  const text = withoutAddresses(parts.join(' ').replace(/\s+/g, ' ').trim());
  return text.length > REPORT_LOG.messageChars ? `${text.slice(0, REPORT_LOG.messageChars)}…` : text;
}

/**
 * Copies every `console.error` and `console.warn` into `log` as well (IM7), from start-up on; the console still gets
 * each call as before. Returns the undo. A call with no Error in it gets its caller's stack: this wrapper's own frame is
 * left out.
 */
export function tapConsole(log: ErrorLog, target: Pick<Console, 'error' | 'warn'> = console): () => void {
  const originals = { error: target.error, warn: target.warn };
  for (const level of ['error', 'warn'] as const) {
    const original = originals[level];
    target[level] = function tapped(...args: unknown[]): void {
      try {
        log.add(level, args, callerStack);
      } catch {
        // A report is never worth breaking the console over.
      }
      original.apply(target, args);
    };
  }
  return () => Object.assign(target, originals);
}

/** The error's first stack lines after the first `skip`, without the count of those left out. */
function firstFrames(error: Error, skip: number): string {
  const frames = stackLines(error, REPORT_LOG.errorStackLines + skip).split('\n');
  return frames.filter((l) => !l.startsWith('… ')).slice(skip).join('\n');
}

/** The stack of whoever called console.error or .warn: past this function, ErrorLog.add and the wrapper. */
function callerStack(): string {
  return firstFrames(new Error('console'), CALLER_DEPTH);
}

/** Frames between `callerStack` and the console call: itself, ErrorLog.add and the wrapper. */
const CALLER_DEPTH = 3;
