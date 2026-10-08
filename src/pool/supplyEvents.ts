import type { CaseKind } from './tables';
import { missingColumns, type PoolRow, type PoolTable } from './poolFile';

/**
 * Supply events (M49): pool.md's Supply events table, each a modifier on what Extraction's cases hold while it is on.
 * A row is on every week between two weekdays (the Supply weekend, Friday to Sunday) or between two dates (a one-off
 * event), by the device's own clock and local time: the game is offline, so a changed clock moves it, which is fine
 * when everything is free. When several are on, the first in the table's order applies, so dated events go above the
 * weekend. The run takes the event on as it starts (Play), so a run never changes halfway.
 */

/** When an event is on: every week from one weekday to another, or from one date to another (both whole days). */
export type SupplyWhen = { weekly: { from: number; to: number } } | { dated: { from: string; to: string } };

export interface SupplyEvent {
  name: string;
  /** The Key column: lower case words joined with -. */
  key: string;
  when: SupplyWhen;
  /** What every case's Field Credits are scaled by (1.25 for 125 %). */
  fc: number;
  /** What every case's chance of a part is scaled by (capped at certain). */
  parts: number;
}

/** The weekdays as JavaScript's Date numbers them (Sunday 0). */
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** The most an event may scale a case's FC or part chance by (%): far beyond any sane value (a typo guard). */
const MAX_PERCENT = 1000;
/**
 * The least a non-zero FC % or Part % may be (M56, audit POOL-03, owner decision: 10 %): below it the cell is far likelier
 * a ratio typed where a percentage belongs (1.25 for 125 %, which would empty every case all weekend) than a real event.
 * 0 stays readable: an event that empties the cases on purpose.
 */
const MIN_PERCENT = 10;
/** The table's columns (M56, audit POOL-07): one missing is reported once, at the header, not on every row. */
const COLUMNS = ['Supply event', 'Key', 'When', 'FC %', 'Part %'] as const;

function cell(row: PoolRow, header: string): string {
  return row.cells[header] ?? '';
}

/** "2026-10-30": a real calendar date; anything else (2026-02-30, 30/10/2026) is not. */
function isDate(s: string): boolean {
  if (!DATE_PATTERN.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** "Friday to Sunday" (each week) or "2026-10-30 to 2026-11-01" (a date alone is one day); undefined if neither. */
export function readWhen(raw: string): SupplyWhen | undefined {
  const parts = raw.trim().toLowerCase().split(/\s+(?:to|-|–)\s+/);
  if (parts.length > 2) return undefined;
  const from = parts[0]!;
  const to = parts[1] ?? from;
  const day = (s: string): number => WEEKDAYS.indexOf(s.replace(/s$/, '') as (typeof WEEKDAYS)[number]);
  if (day(from) >= 0 && day(to) >= 0) return { weekly: { from: day(from), to: day(to) } };
  if (isDate(from) && isDate(to) && from <= to) return { dated: { from, to } };
  return undefined;
}

/**
 * pool.md's Supply events table (M49). A row that can't be read is left out with its line in the errors; no table means
 * no events (they are extras, so nothing is missing without them).
 */
export function readSupplyEvents(t: PoolTable | undefined, fail: (line: number, m: string) => void): SupplyEvent[] {
  if (!t) return [];
  const missing = missingColumns(t, COLUMNS);
  if (missing) return fail(t.line, `the Supply events table needs the columns ${COLUMNS.join(', ')}; ${missing}`), [];
  const events: SupplyEvent[] = [];
  for (const row of t.rows) {
    // Every check adds its message here once (M56, audit POOL-04): a row with any is left out, so a new check needs no
    // second line to keep its row out.
    const problems: string[] = [];
    const name = cell(row, 'Supply event');
    const key = cell(row, 'Key').toLowerCase();
    const when = readWhen(cell(row, 'When'));
    const fc = percent(row, 'FC %', problems);
    const parts = percent(row, 'Part %', problems);
    if (!name) problems.push('a supply event needs a name');
    if (!KEY_PATTERN.test(key)) problems.push(`Key must be lower case words joined with -, not "${cell(row, 'Key')}"`);
    else if (events.some((e) => e.key === key)) problems.push(`the Key ${key} is used twice`);
    if (!when) problems.push(`When must be weekdays ("Friday to Sunday") or dates ("2026-10-30 to 2026-11-01"), not "${cell(row, 'When')}"`);
    for (const m of problems) fail(row.line, m);
    if (problems.length > 0) continue;
    // Each undefined above has its message in `problems`.
    events.push({ name, key, when: when!, fc: fc!, parts: parts! });
  }
  return events;
}

/**
 * A percent cell as a scale (125 → 1.25): 0, or MIN_PERCENT to MAX_PERCENT; undefined (and its message in `problems`)
 * otherwise.
 */
function percent(row: PoolRow, header: string, problems: string[]): number | undefined {
  const raw = cell(row, header).replace(/%$/, '').trim();
  const v = raw === '' ? Number.NaN : Number(raw);
  if (Number.isFinite(v) && v >= 0 && v <= MAX_PERCENT && (v === 0 || v >= MIN_PERCENT)) return v / 100;
  if (Number.isFinite(v) && v > 0 && v < MIN_PERCENT) {
    problems.push(`${header} is a percentage (125 for a quarter more, not 1.25): "${cell(row, header)}" is under the least, ${MIN_PERCENT} (or 0 for none)`);
  } else problems.push(`${header} must be a percentage from 0 to ${MAX_PERCENT}, not "${cell(row, header)}"`);
  return undefined;
}

/** A local date as pool.md writes one: "2026-10-30". */
function localDate(now: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Whether `when` covers `now` (local time): a weekly span may wrap the week's end (Friday to Monday). */
export function isOn(when: SupplyWhen, now: Date): boolean {
  if ('weekly' in when) {
    const { from, to } = when.weekly;
    const d = now.getDay();
    return from <= to ? d >= from && d <= to : d >= from || d <= to;
  }
  const today = localDate(now);
  return today >= when.dated.from && today <= when.dated.to;
}

/** The event on at `now`: the first in the table's order that is on, else null. */
export function activeSupplyEvent(events: readonly SupplyEvent[], now: Date): SupplyEvent | null {
  return events.find((e) => isOn(e.when, now)) ?? null;
}

/**
 * The case kinds as `event` fills them: Field Credits and the chance of a part scaled (whole credits, a chance capped
 * at certain); how many cases, where they stand and how they are heard are the table's. No event: the kinds as they
 * are. Cases are placed before they are filled, so on one seed an event changes what the cases hold, never which
 * cases stand where.
 */
export function kindsUnder(kinds: readonly CaseKind[], event: SupplyEvent | null): readonly CaseKind[] {
  if (!event) return kinds;
  return kinds.map((k) => ({
    ...k,
    fc: { min: Math.round(k.fc.min * event.fc), max: Math.round(k.fc.max * event.fc) },
    partChance: Math.min(1, k.partChance * event.parts),
  }));
}

/** When `event` ends: "until Sunday" or "until 1 Nov". */
function until(event: SupplyEvent): string {
  if ('weekly' in event.when) return `until ${WEEKDAY_LABELS[event.when.weekly.to]}`;
  const [, m, d] = event.when.dated.to.split('-').map(Number) as [number, number, number];
  return `until ${d} ${MONTH_LABELS[m - 1]}`;
}

/** A change as the Mode pop-up says it: "+25 %" or "−20 %"; null for none. */
function change(scale: number, what: string): string | null {
  const p = Math.round((scale - 1) * 100);
  if (p === 0) return null;
  return `${p > 0 ? '+' : '−'}${Math.abs(p)} % ${what}`;
}

/** The Mode pop-up's line for `event` (M49): "Supply weekend, until Sunday: cases hold +25 % Field Credits and +50 % parts." */
export function supplyLine(event: SupplyEvent): string {
  const changes = [change(event.fc, 'Field Credits'), change(event.parts, 'parts')].filter((c): c is string => c !== null);
  const what = changes.length > 0 ? `cases hold ${changes.join(' and ')}` : 'cases as usual';
  return `${event.name}, ${until(event)}: ${what}.`;
}
