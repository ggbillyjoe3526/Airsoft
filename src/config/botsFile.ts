import { missingColumns, type PoolRow, type PoolTable, readTables } from '../pool/poolFile';

/**
 * Reads bots.md (BN1): the hand-edited roster of bot names and what each personality changes. Pure text in, plain data
 * out; config/botPersonalities.ts loads the bundled file. Never throws: a cell it can't read plays neutral (as if the
 * personality changed nothing there) and is listed in `errors` with its line; a roster row it can't read is left out.
 */

/**
 * What a personality changes about how a bot plays (bots.md › How they move and Habits). The scales multiply the
 * difficulty's BotSkill numbers (config/bots.ts), `flankChance` adds to its chance; ai/personality.ts applies them.
 */
export interface PersonalityStyle {
  /** The personality as the file names it ("Rusher"): the scoreboard's tag. */
  readonly label: string;
  /** The "What got you" card's line about a bot of this personality, `{name}` standing for its name. */
  readonly cardNote: string;
  /** × BotSkill.holdTime: the pause at each lane point. */
  readonly holdTime: number;
  /** × BotSkill.holdCoverChance (at most 1): stepping into cover by a lane point. */
  readonly holdCoverChance: number;
  /** × BotSkill.contactCoverMinDistance: how far off a fresh contact sends it to cover first. */
  readonly contactCoverMinDistance: number;
  /** × BotSkill.searchWalkDistance: the last metres walked to where someone was. */
  readonly searchWalkDistance: number;
  /** + BotSkill.flankChance (kept within 0 to 1). */
  readonly flankChance: number;
  /** × BotSkill.burst and burstPause. */
  readonly burst: number;
  readonly burstPause: number;
  /** BotSkill.peekWatchTime in its place (s), or null to keep the difficulty's. */
  readonly peekWatchTime: readonly [number, number] | null;
  /** Pushes in: fights closing in, no cover on a fresh contact, runs at where someone was (as Extraction's hunters do). */
  readonly pushesIn: boolean;
  /** Waits at a lane point for teammates it is well ahead of (false: never). */
  readonly waitsForTeam: boolean;
  /** Takes a free lane rather than share one with a teammate (the free lane furthest from the team's). */
  readonly ownLane: boolean;
  /** Elimination: holds the last lane point short of the middle until the clock is down to this (s); null never holds. */
  readonly holdUntil: number | null;
  /** Raises its sight when it stands still to fight or hold. */
  readonly aimsFromCover: boolean;
  /** BotSkill.holdsAngles and slicesCorners in their place, or null to keep the difficulty's. */
  readonly holdsAngles: boolean | null;
  readonly slicesCorners: boolean | null;
  /**
   * Elimination's overtime flag (Dev 6 item 45): holds cover by it, aiming at it, for this long (s) before going in for
   * the touch (ai/personality.ts overtimeWatching); null goes straight for it.
   */
  readonly overtimeWatch: number | null;
}

/** A personality that changes nothing: what an unreadable cell, or a bot without a personality, plays. */
export const NEUTRAL_STYLE: PersonalityStyle = {
  label: '',
  cardNote: '',
  holdTime: 1,
  holdCoverChance: 1,
  contactCoverMinDistance: 1,
  searchWalkDistance: 1,
  flankChance: 0,
  burst: 1,
  burstPause: 1,
  peekWatchTime: null,
  pushesIn: false,
  waitsForTeam: true,
  ownLane: false,
  holdUntil: null,
  aimsFromCover: false,
  holdsAngles: null,
  slicesCorners: null,
  overtimeWatch: null,
};

/** One name on the roster and the personality it always plays (its key in `BotsFile.styles`). */
export interface RosterEntry {
  readonly name: string;
  readonly personality: string;
}

export interface BotsFile {
  readonly roster: readonly RosterEntry[];
  /** Every personality by its key (the Personalities table's name, lower case). */
  readonly styles: ReadonlyMap<string, PersonalityStyle>;
  /** What couldn't be read, each with its line: `bots.md:42: …`. */
  readonly errors: readonly string[];
}

/** Longest name the roster takes: it sits over a teammate's head and in the hit feed. */
export const NAME_MAX_LENGTH = 12;

/** A made-up name: letters, then letters, spaces, hyphens or apostrophes. */
const NAME_PATTERN = /^\p{L}[\p{L} '-]*$/u;

type Scale = 'holdTime' | 'holdCoverChance' | 'contactCoverMinDistance' | 'searchWalkDistance' | 'burst' | 'burstPause';

/** How they move: the (×) columns and the field each sets, read within 0 to `max`. */
const SCALE_COLUMNS: readonly { header: string; field: Scale; max: number }[] = [
  { header: 'Lane pause (×)', field: 'holdTime', max: 5 },
  { header: 'Cover at a lane point (×)', field: 'holdCoverChance', max: 5 },
  { header: 'Cover on contact from (×)', field: 'contactCoverMinDistance', max: 5 },
  { header: 'Walk the last (×)', field: 'searchWalkDistance', max: 5 },
  { header: 'Burst (×)', field: 'burst', max: 3 },
  { header: 'Burst pause (×)', field: 'burstPause', max: 3 },
];
const FLANK_HEADER = 'Flank chance (+)';
const WATCH_HEADER = 'Watch where you ducked (s)';
const MOVE_HEADERS = ['Personality', ...SCALE_COLUMNS.map((c) => c.header), FLANK_HEADER, WATCH_HEADER];

type Habit = 'pushesIn' | 'waitsForTeam' | 'ownLane' | 'aimsFromCover';
const HABIT_COLUMNS: readonly { header: string; field: Habit }[] = [
  { header: 'Pushes in', field: 'pushesIn' },
  { header: 'Waits for the team', field: 'waitsForTeam' },
  { header: 'Own lane', field: 'ownLane' },
  { header: 'Aims from cover', field: 'aimsFromCover' },
];
const HOLD_HEADER = 'Holds until (s left)';
const ANGLES_HEADER = 'Holds angles';
const CORNERS_HEADER = 'Slices corners';
const HABIT_HEADERS = ['Personality', ...HABIT_COLUMNS.map((c) => c.header), HOLD_HEADER, ANGLES_HEADER, CORNERS_HEADER];
/** Optional (Dev 6 item 45): a Habits table without it watches nothing first, as before it. */
const WATCH_FLAG_HEADER = 'Watches the flag first (s)';

/** The cell for "nothing here": an en dash, a hyphen or empty. */
const isNone = (s: string): boolean => s === '' || s === '–' || s === '-' || s === '—';

/** A number as written in the file: a plain or Unicode minus, a decimal point; NaN when it isn't one. */
function numberOf(s: string): number {
  const t = s.replace('−', '-').trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}

/** Yes, no or – (null). Undefined when it is none of these. */
function triState(s: string): boolean | null | undefined {
  const t = s.trim().toLowerCase();
  if (t === 'yes') return true;
  if (t === 'no') return false;
  return isNone(t) ? null : undefined;
}

/** `1.5–3` (an en dash or a hyphen), a pair from shortest to longest, or undefined. */
function rangeOf(s: string): [number, number] | undefined {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*$/.exec(s);
  if (!m) return undefined;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  return lo <= hi ? [lo, hi] : undefined;
}

/** The table under heading `name` (exactly), or undefined. */
function tableNamed(tables: readonly PoolTable[], name: string): PoolTable | undefined {
  return tables.find((t) => t.heading === name);
}

/** The personality key of a first-column cell: lower case, trimmed. */
const keyOf = (s: string): string => s.trim().toLowerCase();

export function loadBotsFile(text: string): BotsFile {
  const errors: string[] = [];
  const fail = (line: number, message: string) => errors.push(`bots.md:${line}: ${message}`);
  const tables = readTables(text);
  for (const t of tables) for (const p of t.problems) fail(p.line, p.message);

  // Personalities: the names a personality can have, and its card note.
  const styles = new Map<string, { -readonly [K in keyof PersonalityStyle]: PersonalityStyle[K] }>();
  const people = required(tables, 'Personalities', ['Personality', 'Card note'], fail);
  for (const row of people?.rows ?? []) {
    const label = row.cells['Personality']!.trim();
    const key = keyOf(label);
    if (!/^\p{L}[\p{L} -]*$/u.test(label)) {
      fail(row.line, `"${label}" is not a personality name (letters, spaces and hyphens)`);
      continue;
    }
    if (styles.has(key)) {
      fail(row.line, `${label} is listed twice`);
      continue;
    }
    styles.set(key, { ...NEUTRAL_STYLE, label, cardNote: row.cells['Card note']!.trim() });
  }

  // How they move.
  eachRow(required(tables, 'How they move', MOVE_HEADERS, fail), styles, fail, (row, style) => {
    for (const col of SCALE_COLUMNS) {
      const v = numberOf(row.cells[col.header]!);
      if (Number.isFinite(v) && v >= 0 && v <= col.max) style[col.field] = v;
      else fail(row.line, `${col.header}: "${row.cells[col.header]}" is not a number from 0 to ${col.max}`);
    }
    const flank = numberOf(row.cells[FLANK_HEADER]!);
    if (Number.isFinite(flank) && flank >= -1 && flank <= 1) style.flankChance = flank;
    else fail(row.line, `${FLANK_HEADER}: "${row.cells[FLANK_HEADER]}" is not a number from -1 to 1`);
    const watch = row.cells[WATCH_HEADER]!;
    if (!isNone(watch.trim())) {
      const r = rangeOf(watch);
      if (r && r[1] <= 30) style.peekWatchTime = r;
      else fail(row.line, `${WATCH_HEADER}: "${watch}" is not a range of seconds like 1.5–3 (at most 30), or –`);
    }
  });

  // Habits.
  eachRow(required(tables, 'Habits', HABIT_HEADERS, fail), styles, fail, (row, style) => {
    for (const col of HABIT_COLUMNS) {
      const v = triState(row.cells[col.header]!);
      if (v === undefined) fail(row.line, `${col.header}: "${row.cells[col.header]}" is not yes, no or –`);
      // – leaves the habit as the difficulty plays it: none of these is a difficulty's, so off, except waiting.
      else style[col.field] = v ?? NEUTRAL_STYLE[col.field];
    }
    const hold = row.cells[HOLD_HEADER]!.trim();
    if (!isNone(hold)) {
      const s = numberOf(hold);
      if (Number.isFinite(s) && s >= 0 && s <= 600) style.holdUntil = s;
      else fail(row.line, `${HOLD_HEADER}: "${hold}" is not seconds from 0 to 600, or –`);
    }
    for (const [header, field] of [
      [ANGLES_HEADER, 'holdsAngles'],
      [CORNERS_HEADER, 'slicesCorners'],
    ] as const) {
      const v = triState(row.cells[header]!);
      if (v === undefined) fail(row.line, `${header}: "${row.cells[header]}" is not yes, no or –`);
      else style[field] = v;
    }
    const watchFlag = row.cells[WATCH_FLAG_HEADER]?.trim() ?? '';
    if (!isNone(watchFlag)) {
      const s = numberOf(watchFlag);
      if (Number.isFinite(s) && s >= 0 && s <= 60) style.overtimeWatch = s;
      else fail(row.line, `${WATCH_FLAG_HEADER}: "${watchFlag}" is not seconds from 0 to 60, or –`);
    }
  });

  // Roster: unique made-up names, each playing a personality the file describes.
  const roster: RosterEntry[] = [];
  const taken = new Set<string>();
  const names = required(tables, 'Roster', ['Name', 'Personality'], fail);
  for (const row of names?.rows ?? []) {
    const name = row.cells['Name']!.trim();
    const personality = keyOf(row.cells['Personality']!);
    if (!NAME_PATTERN.test(name) || name.length > NAME_MAX_LENGTH) {
      fail(row.line, `"${name}" is not a name (letters, spaces, hyphens and apostrophes, at most ${NAME_MAX_LENGTH})`);
      continue;
    }
    if (taken.has(name.toLowerCase())) {
      fail(row.line, `${name} is on the roster twice`);
      continue;
    }
    if (!styles.has(personality)) {
      fail(row.line, `${name}: "${row.cells['Personality']}" is not in the Personalities table`);
      continue;
    }
    taken.add(name.toLowerCase());
    roster.push({ name, personality });
  }
  return { roster, styles, errors };
}

/** The table `name` with its columns `wanted`, or undefined (and an error) when it is missing or lacks one. */
function required(tables: readonly PoolTable[], name: string, wanted: readonly string[], fail: (line: number, message: string) => void): PoolTable | undefined {
  const t = tableNamed(tables, name);
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

/**
 * Runs `read` on each row of `t` whose first cell names a personality the Personalities table has, each personality
 * once; a personality the table leaves out keeps the neutral values for these columns, and is reported.
 */
function eachRow<S>(t: PoolTable | undefined, styles: ReadonlyMap<string, S>, fail: (line: number, message: string) => void, read: (row: PoolRow, style: S) => void): void {
  if (!t) return;
  const seen = new Set<string>();
  for (const row of t.rows) {
    const key = keyOf(row.cells['Personality']!);
    const style = styles.get(key);
    if (!style) fail(row.line, `${t.heading}: "${row.cells['Personality']}" is not in the Personalities table`);
    else if (seen.has(key)) fail(row.line, `${t.heading}: ${row.cells['Personality']} is listed twice`);
    else {
      seen.add(key);
      read(row, style);
    }
  }
  for (const key of styles.keys()) if (!seen.has(key)) fail(t.line, `${t.heading}: no row for ${key}, so it plays neutral there`);
}
