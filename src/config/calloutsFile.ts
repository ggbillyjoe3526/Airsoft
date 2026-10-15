import { AREA_NAME_MAX_LENGTH } from '../map/areas';
import { missingColumns, type PoolTable, readTables } from '../pool/poolFile';

/**
 * Reads callouts.md (CL1): when the bots call to their team, how often, and the words. Pure text in, plain data out;
 * config/calloutLines.ts loads the bundled file and ai/callouts.ts plays it. Never throws: a row it can't read is left
 * out and listed in `errors` with its line; an event without a row in When they call is never called.
 */

/** The events a bot calls (callouts.md › The events), each found in the file by its `name`. */
export type CalloutEvent =
  | 'contact'
  | 'contacts'
  | 'heard'
  | 'down'
  | 'lastOne'
  | 'tagged'
  | 'reloading'
  | 'pushing'
  | 'flanking'
  | 'checking'
  | 'holding'
  | 'raising'
  | 'flag'
  | 'overtime'
  | 'pingGoing'
  | 'pingWatching'
  | 'needMag'
  | 'magComing'
  | 'magThanks';

/** What a line may fill in: the named area, how many were seen, how many are left. */
export type CalloutFill = 'area' | 'count' | 'left';

/** Every event, with its name in the file and what its lines may fill in. */
export const CALLOUT_EVENTS: readonly { readonly id: CalloutEvent; readonly name: string; readonly fills: readonly CalloutFill[] }[] = [
  { id: 'contact', name: 'Contact', fills: ['area'] },
  { id: 'contacts', name: 'Contacts', fills: ['count', 'area'] },
  { id: 'heard', name: 'Heard', fills: ['area'] },
  { id: 'down', name: 'Down', fills: ['left'] },
  { id: 'lastOne', name: 'Last one', fills: ['area'] },
  { id: 'tagged', name: 'Tagged', fills: [] },
  { id: 'reloading', name: 'Reloading', fills: [] },
  { id: 'pushing', name: 'Pushing', fills: ['area'] },
  { id: 'flanking', name: 'Flanking', fills: ['area'] },
  { id: 'checking', name: 'Checking', fills: ['area'] },
  { id: 'holding', name: 'Holding', fills: ['area'] },
  { id: 'raising', name: 'Raising', fills: [] },
  { id: 'flag', name: 'Flag', fills: [] },
  { id: 'overtime', name: 'Overtime', fills: ['area'] },
  { id: 'pingGoing', name: 'Going to your ping', fills: ['area'] },
  { id: 'pingWatching', name: 'Watching your ping', fills: ['area'] },
  { id: 'needMag', name: 'Need a mag', fills: [] },
  { id: 'magComing', name: 'Mag coming', fills: [] },
  { id: 'magThanks', name: 'Thanks for the mag', fills: [] },
];

/** When an event is called (callouts.md › When they call). */
export interface CalloutRule {
  /** The chance (0 to 1) a bot calls it when it happens, before its personality's Talks (×). */
  readonly chance: number;
  /** Seconds before the team calls this event again. */
  readonly teamGap: number;
  /** Its row in the table (0 first): the lower wins when two calls come at once. */
  readonly priority: number;
}

/** callouts.md › Pace, in seconds. */
export interface CalloutPace {
  /** One bot's calls are at least this far apart. */
  readonly botGap: number;
  /** Any two of a team's calls are at least this far apart. */
  readonly teamGap: number;
  /** A team calls the same enemy (Contact, Contacts) again only after this. */
  readonly sameEnemyGap: number;
  /** A call the team gap holds back is dropped after this. */
  readonly maxWait: number;
}

/** callouts.md › Marks (PG1): how often a sighting call also marks the enemy for the team's players. */
export interface CalloutMarks {
  /** The chance (0 to 1) a Contact or Contacts call marks the enemy it calls, when the caller still sees them. */
  readonly chance: number;
  /** Seconds between two of a team's marks. */
  readonly gap: number;
}

/** One line: `who` is a personality's key ("rusher") or '' for Any; `text` has its `{fills}` still in. */
export interface CalloutLine {
  readonly who: string;
  readonly text: string;
  /** Whether `text` holds `{area}`: such a line is skipped when there is no area to name. */
  readonly needsArea: boolean;
}

export interface CalloutsFile {
  readonly rules: Readonly<Record<CalloutEvent, CalloutRule>>;
  readonly pace: CalloutPace;
  readonly marks: CalloutMarks;
  /** Talks (×) per personality key; a bot without a personality, or one the table lacks, talks × 1. */
  readonly talks: ReadonlyMap<string, number>;
  readonly lines: Readonly<Record<CalloutEvent, readonly CalloutLine[]>>;
  /** What couldn't be read, each with its line: `callouts.md:42: …`. */
  readonly errors: readonly string[];
}

/** Longest a line may be once filled in (with the longest area name and number word): one line of the feed. */
export const CALLOUT_LINE_MAX = 48;
/** The longest number word a line can fill in (numberWord). */
const LONGEST_NUMBER = 'Twelve';

/** An event that is never called: what a missing or unreadable When they call row leaves. */
const NEVER: CalloutRule = { chance: 0, teamGap: 0, priority: CALLOUT_EVENTS.length };

/** The Pace rows, by the words in their first column. */
const PACE_ROWS: readonly { name: string; field: keyof CalloutPace; fallback: number }[] = [
  { name: "One bot's calls apart", field: 'botGap', fallback: 4 },
  { name: "The team's calls apart", field: 'teamGap', fallback: 1.5 },
  { name: 'The same enemy again after', field: 'sameEnemyGap', fallback: 10 },
  { name: 'A call waits at most', field: 'maxWait', fallback: 1.5 },
];
/** Longest gap any Pace or Team gap cell may give (s). */
const GAP_MAX = 120;

/** The Marks rows, by the words in their first column, with what each may be. */
const MARK_ROWS: readonly { name: string; field: keyof CalloutMarks; fallback: number; max: number; what: string }[] = [
  { name: 'A sighting is marked (chance)', field: 'chance', fallback: 0.35, max: 1, what: 'a number from 0 to 1' },
  { name: "The team's marks apart (s)", field: 'gap', fallback: 12, max: GAP_MAX, what: `seconds from 0 to ${GAP_MAX}` },
];

/** A number as written in the file (a plain or Unicode minus, a decimal point); NaN when it isn't one. */
function numberOf(s: string): number {
  const t = s.replace('−', '-').trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}

/** A first-column key: lower case, trimmed, curly apostrophes straight. */
const keyOf = (s: string): string => s.trim().toLowerCase().replace(/’/g, "'");

const EVENT_BY_KEY: ReadonlyMap<string, (typeof CALLOUT_EVENTS)[number]> = new Map(CALLOUT_EVENTS.map((e) => [keyOf(e.name), e]));

/** A number in words for a line ("Two"), capitalised; past twelve, the digits. */
export function numberWord(n: number): string {
  const words = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', LONGEST_NUMBER];
  return Number.isInteger(n) && n >= 0 && n < words.length ? words[n]! : String(n);
}

/**
 * `text` with its fills put in: `{area}` the area, `{count}` and `{left}` as number words, a capital only where a
 * sentence starts ("Got one! Two left.", "Contact, two, Dock!"). The first letter is made a capital.
 */
export function fillLine(text: string, area: string, count: number, left: number): string {
  const out = text.replace(/\{(area|count|left)\}/g, (_, fill: string, at: number) => {
    if (fill === 'area') return area;
    const w = numberWord(fill === 'count' ? count : left);
    return at === 0 || /[.!?]\s+$/.test(text.slice(0, at)) ? w : w.toLowerCase();
  });
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/**
 * Reads callouts.md. `personalities` are the keys bots.md's Personalities table gives ("rusher"): a Who or a
 * Personalities row naming another is an error, and one the Personalities table here lacks talks × 1 (reported).
 */
export function loadCalloutsFile(text: string, personalities: ReadonlySet<string>): CalloutsFile {
  const errors: string[] = [];
  const fail = (line: number, message: string) => errors.push(`callouts.md:${line}: ${message}`);
  const tables = readTables(text);
  for (const t of tables) for (const p of t.problems) fail(p.line, p.message);

  // When they call: one row per event, the order the priority.
  const rules = Object.fromEntries(CALLOUT_EVENTS.map((e) => [e.id, NEVER])) as Record<CalloutEvent, CalloutRule>;
  const when = required(tables, 'When they call', ['Event', 'Chance', 'Team gap (s)'], fail);
  const ruled = new Set<CalloutEvent>();
  for (const row of when?.rows ?? []) {
    const e = EVENT_BY_KEY.get(keyOf(row.cells['Event']!));
    if (!e) {
      fail(row.line, `"${row.cells['Event']}" is not an event (${CALLOUT_EVENTS.map((x) => x.name).join(', ')})`);
      continue;
    }
    if (ruled.has(e.id)) {
      fail(row.line, `${e.name} is listed twice`);
      continue;
    }
    const chance = numberOf(row.cells['Chance']!);
    const gap = numberOf(row.cells['Team gap (s)']!);
    if (!(chance >= 0 && chance <= 1)) fail(row.line, `Chance: "${row.cells['Chance']}" is not a number from 0 to 1`);
    else if (!(gap >= 0 && gap <= GAP_MAX)) fail(row.line, `Team gap (s): "${row.cells['Team gap (s)']}" is not seconds from 0 to ${GAP_MAX}`);
    else {
      ruled.add(e.id);
      rules[e.id] = { chance, teamGap: gap, priority: ruled.size - 1 };
    }
  }
  if (when) for (const e of CALLOUT_EVENTS) if (!ruled.has(e.id)) fail(when.line, `When they call: no row for ${e.name}, so it is never called`);

  // Pace.
  const pace = Object.fromEntries(PACE_ROWS.map((p) => [p.field, p.fallback])) as Record<keyof CalloutPace, number>;
  const paced = new Set<string>();
  const paceTable = required(tables, 'Pace', ['Rule', 'Seconds'], fail);
  for (const row of paceTable?.rows ?? []) {
    const p = PACE_ROWS.find((x) => keyOf(x.name) === keyOf(row.cells['Rule']!));
    const s = numberOf(row.cells['Seconds']!);
    if (!p) fail(row.line, `"${row.cells['Rule']}" is not a pace rule (${PACE_ROWS.map((x) => x.name).join(', ')})`);
    else if (paced.has(p.field)) fail(row.line, `${p.name} is listed twice`);
    else if (!(s >= 0 && s <= GAP_MAX)) fail(row.line, `${p.name}: "${row.cells['Seconds']}" is not seconds from 0 to ${GAP_MAX}`);
    else {
      paced.add(p.field);
      pace[p.field] = s;
    }
  }
  if (paceTable) for (const p of PACE_ROWS) if (!paced.has(p.field)) fail(paceTable.line, `Pace: no row for ${p.name}, so it is ${p.fallback} s`);

  // Marks (PG1): a sighting call marking the enemy for the team's players.
  const marks = Object.fromEntries(MARK_ROWS.map((m) => [m.field, m.fallback])) as Record<keyof CalloutMarks, number>;
  const marked = new Set<string>();
  const markTable = required(tables, 'Marks', ['Rule', 'Value'], fail);
  for (const row of markTable?.rows ?? []) {
    const m = MARK_ROWS.find((x) => keyOf(x.name) === keyOf(row.cells['Rule']!));
    const v = numberOf(row.cells['Value']!);
    if (!m) fail(row.line, `"${row.cells['Rule']}" is not a marks rule (${MARK_ROWS.map((x) => x.name).join(', ')})`);
    else if (marked.has(m.field)) fail(row.line, `${m.name} is listed twice`);
    else if (!(v >= 0 && v <= m.max)) fail(row.line, `${m.name}: "${row.cells['Value']}" is not ${m.what}`);
    else {
      marked.add(m.field);
      marks[m.field] = v;
    }
  }
  if (markTable) for (const m of MARK_ROWS) if (!marked.has(m.field)) fail(markTable.line, `Marks: no row for ${m.name}, so it is ${m.fallback}`);

  // Personalities: how chatty each is.
  const talks = new Map<string, number>();
  const people = required(tables, 'Personalities', ['Personality', 'Talks (×)'], fail);
  for (const row of people?.rows ?? []) {
    const key = keyOf(row.cells['Personality']!);
    const v = numberOf(row.cells['Talks (×)']!);
    if (!personalities.has(key)) fail(row.line, `"${row.cells['Personality']}" is not in bots.md's Personalities table`);
    else if (talks.has(key)) fail(row.line, `${row.cells['Personality']} is listed twice`);
    else if (!(v >= 0 && v <= 5)) fail(row.line, `Talks (×): "${row.cells['Talks (×)']}" is not a number from 0 to 5`);
    else talks.set(key, v);
  }
  if (people) for (const key of personalities) if (!talks.has(key)) fail(people.line, `Personalities: no row for ${key}, so it talks × 1`);

  // Lines.
  const lines = Object.fromEntries(CALLOUT_EVENTS.map((e) => [e.id, [] as CalloutLine[]])) as Record<CalloutEvent, CalloutLine[]>;
  const said = required(tables, 'Lines', ['Event', 'Who', 'Line'], fail);
  for (const row of said?.rows ?? []) {
    const e = EVENT_BY_KEY.get(keyOf(row.cells['Event']!));
    const whoCell = keyOf(row.cells['Who']!);
    const who = whoCell === 'any' ? '' : whoCell;
    const line = row.cells['Line']!.trim();
    if (!e) {
      fail(row.line, `"${row.cells['Event']}" is not an event`);
      continue;
    }
    if (who !== '' && !personalities.has(who)) {
      fail(row.line, `Who: "${row.cells['Who']}" is not Any or a personality in bots.md`);
      continue;
    }
    const problem = lineProblem(line, e.fills);
    if (problem) {
      fail(row.line, `${e.name}: ${problem}`);
      continue;
    }
    lines[e.id].push({ who, text: line, needsArea: line.includes('{area}') });
  }
  if (said) for (const e of CALLOUT_EVENTS) if (rules[e.id].chance > 0 && !lines[e.id].some((l) => l.who === '')) fail(said.line, `Lines: no Any line for ${e.name}, so a bot whose personality has none never calls it`);

  return { rules, pace, marks, talks, lines, errors };
}

/** What is wrong with a Lines cell for an event that fills `fills`, or null. */
function lineProblem(line: string, fills: readonly CalloutFill[]): string | null {
  if (line === '') return 'the line is empty';
  for (const m of line.matchAll(/\{([^{}]*)\}/g)) {
    const fill = m[1] as CalloutFill;
    if (!(['area', 'count', 'left'] as const).includes(fill)) return `"{${m[1]}}" is not something a line fills in ({area}, {count}, {left})`;
    if (!fills.includes(fill)) return `"{${fill}}" is not filled in for this event (${fills.length > 0 ? fills.map((f) => `{${f}}`).join(', ') : 'nothing'})`;
  }
  if (/[{}]/.test(line.replace(/\{(area|count|left)\}/g, ''))) return 'a brace with nothing to fill in';
  const longest = fillLine(line, 'x'.repeat(AREA_NAME_MAX_LENGTH), 12, 12).length;
  if (longest > CALLOUT_LINE_MAX) return `"${line}" is too long (${longest} characters with the longest fills in; ${CALLOUT_LINE_MAX} at most)`;
  return null;
}

/** The table `name` with its columns `wanted`, or undefined (and an error) when it is missing or lacks one. */
function required(tables: readonly PoolTable[], name: string, wanted: readonly string[], fail: (line: number, message: string) => void): PoolTable | undefined {
  const t = tables.find((x) => x.heading === name);
  if (!t) {
    fail(1, `no "${name}" table (a "## ${name}" heading over it)`);
    return undefined;
  }
  const missing = missingColumns(t, wanted);
  if (missing) {
    fail(t.line, `${name}: ${missing}`);
    return undefined;
  }
  return t;
}
