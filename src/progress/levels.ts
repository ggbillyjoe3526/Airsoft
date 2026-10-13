import type { Difficulty } from '../config/bots';
import type { Pool } from '../pool/pool';
import { type PoolRow, type PoolTable, readTables } from '../pool/poolFile';

/**
 * The levels (LV1; owner, 2026-10-13): what each level unlocks, the XP it takes and what a match gives, read from
 * levels.md (the owner edits that file by hand; its guide explains the columns). Nothing here touches the browser:
 * `loadLevels` turns the file's text into plain data against the asset pool and lists what it couldn't read, and
 * src/progress/gameLevels.ts loads the bundled file.
 */

/** One level: the XP it takes and what it unlocks. */
export interface Level {
  /** Its number: 0 (the starting kit) up to the cap. */
  level: number;
  /** XP it takes on top of the level before it (0 for level 0). */
  xp: number;
  /** XP from nothing to reach it: the running total of `xp`. */
  total: number;
  /** The pool asset ids it unlocks, in the order its row names them. */
  unlocks: readonly string[];
}

/** What a finished match gives (levels.md's XP tables). */
export interface XpRules {
  /** XP for a match played and won, per round won and per hit on an opponent. */
  earn: { matchPlayed: number; matchWon: number; roundWon: number; hit: number };
  /** The difficulty multiplies a match's XP. */
  difficulty: Readonly<Record<Difficulty, number>>;
}

export interface LevelTable {
  /** By level number, from 0 to the cap: never empty, level 0 is always there. */
  levels: readonly Level[];
  /** The top level: the last row read. */
  cap: number;
  xp: XpRules;
  /** The level each asset unlocks at, by pool asset id. An asset no row names is absent: no level unlocks it. */
  unlockLevel: ReadonlyMap<string, number>;
  /** What couldn't be read, each with its levels.md line ("line 12: …"). */
  errors: readonly string[];
}

/** levels.md's XP numbers as shipped: used for any the file is missing. */
export const DEFAULT_XP: XpRules = {
  earn: { matchPlayed: 100, matchWon: 100, roundWon: 20, hit: 10 },
  difficulty: { easy: 0.5, normal: 1, hard: 1.5, pro: 2 },
};

/** The most XP one cell may hold (a level's, or a match event's): far beyond any sane value, a typo guard. */
const MAX_XP_CELL = 1e6;
/** The least a Difficulty multiplier may be: a 0 would give nothing at that difficulty, with no error to say why. */
const MIN_DIFFICULTY_MULTIPLIER = 0.1;
/** Level 0's XP cell may be left empty or hold a dash. */
const NO_XP = new Set(['', '0', '-', '–']);

/** Reads levels.md's text against `pool`. Never throws: what it can't read is left out and listed in `errors`. */
export function loadLevels(text: string, pool: Pool): LevelTable {
  const tables = readTables(text);
  const errors: string[] = [];
  const fail = (line: number, message: string): void => void errors.push(`line ${line}: ${message}`);
  for (const t of tables) for (const p of t.problems) fail(p.line, p.message);
  const table = (first: string): PoolTable | undefined => tables.find((t) => t.headers[0] === first);
  const xp = readXp(table('Event'), table('Difficulty'), fail, errors);
  const levelRows = table('Level');
  const { levels, named } = readLevels(levelRows, pool, fail);
  if (levels.length === 0) {
    errors.push('no readable level 0: every item is unlocked from the start');
    const all: Level = { level: 0, xp: 0, total: 0, unlocks: pool.assets.map((a) => a.id) };
    return { levels: [all], cap: 0, xp, unlockLevel: new Map(all.unlocks.map((id) => [id, 0])), errors };
  }
  const unlockLevel = new Map<string, number>();
  for (const l of levels) for (const id of l.unlocks) unlockLevel.set(id, l.level);
  // Every item has a level (an item no row names could never be had); one named in a row left out is said there.
  for (const a of pool.assets) if (!named.has(a.id)) errors.push(`no level unlocks the ${a.name} (pool.md ID ${a.id}): add its Name to a level's Unlocks`);
  return { levels, cap: levels.length - 1, xp, unlockLevel, errors };
}

function cell(row: PoolRow, header: string): string {
  return row.cells[header] ?? '';
}

/**
 * The Levels table, in order: each row the next level, from 0. The first row that can't be read ends it (the levels
 * from there up are left out, so the numbers never skip); a name it can't place is left out of its row alone. `named`:
 * every asset some row names, read or not.
 */
function readLevels(t: PoolTable | undefined, pool: Pool, fail: (line: number, m: string) => void): { levels: Level[]; named: Set<string> } {
  const levels: Level[] = [];
  const named = new Set<string>();
  if (!t) return { levels, named };
  const byName = new Map<string, string>();
  // The first of two rows sharing a Name (pool.ts reports the second).
  for (const a of [...pool.assets].reverse()) byName.set(a.name.toLowerCase(), a.id);
  const placed = new Map<string, number>();
  let stopped = false;
  for (const row of t.rows) {
    const names = cell(row, 'Unlocks')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const n of names) {
      const id = byName.get(n.toLowerCase());
      if (id) named.add(id);
    }
    if (stopped) continue;
    const want = levels.length;
    const number = cell(row, 'Level');
    if (number !== String(want)) {
      fail(row.line, `Level must be ${want} here (levels count up from 0 with no gaps), not "${number}": the levels from here up are left out`);
      stopped = true;
      continue;
    }
    const xp = levelXp(row, want, fail);
    if (xp === undefined) {
      stopped = true;
      continue;
    }
    const unlocks: string[] = [];
    for (const n of names) {
      const id = byName.get(n.toLowerCase());
      if (!id) {
        fail(row.line, `"${n}" isn't a Name in pool.md`);
        continue;
      }
      const at = placed.get(id);
      if (at !== undefined) {
        fail(row.line, `the ${pool.byId.get(id)!.name} is already unlocked at level ${at}`);
        continue;
      }
      placed.set(id, want);
      unlocks.push(id);
    }
    levels.push({ level: want, xp, total: (levels.at(-1)?.total ?? 0) + xp, unlocks });
  }
  return { levels, named };
}

/** A level's XP cell: none for level 0, else a whole number from 1; undefined (and an error) otherwise. */
function levelXp(row: PoolRow, level: number, fail: (line: number, m: string) => void): number | undefined {
  const raw = cell(row, 'XP').replace(/,/g, '').trim();
  if (level === 0) {
    if (NO_XP.has(raw)) return 0;
    fail(row.line, `level 0 is the starting kit and takes no XP, not "${cell(row, 'XP')}"`);
    return undefined;
  }
  const v = raw === '' ? Number.NaN : Number(raw);
  if (Number.isInteger(v) && v >= 1 && v <= MAX_XP_CELL) return v;
  fail(row.line, `XP must be a whole number from 1 to ${MAX_XP_CELL}, not "${cell(row, 'XP')}": the levels from here up are left out`);
  return undefined;
}

/** A number cell (a trailing % and thousands commas allowed) in [min, max]; undefined (and an error) otherwise. */
function numberCell(row: PoolRow, header: string, fail: (line: number, m: string) => void, min: number, max: number): number | undefined {
  const raw = cell(row, header).replace(/%$/, '').replace(/,/g, '').trim();
  const v = raw === '' ? Number.NaN : Number(raw);
  if (Number.isFinite(v) && v >= min && v <= max) return v;
  fail(row.line, `${header} must be a number from ${min} to ${max}, not "${cell(row, header)}"`);
  return undefined;
}

/** A table of label → number rows, matched case-insensitively against `labels` (each label to its field). */
function labelled<K extends string>(
  t: PoolTable | undefined,
  name: string,
  labels: Readonly<Record<string, K>>,
  read: (row: PoolRow) => number | undefined,
  fail: (line: number, m: string) => void,
  errors: string[],
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  if (!t) return errors.push(`no "${name}" table: using the built-in numbers`), out;
  for (const row of t.rows) {
    const label = cell(row, t.headers[0]!);
    const field = labels[label.toLowerCase()];
    if (!field) {
      fail(row.line, `"${label}" isn't one of ${Object.keys(labels).map((l) => `"${l}"`).join(', ')}`);
      continue;
    }
    if (field in out) {
      fail(row.line, `"${label}" is listed twice in "${name}"`);
      continue;
    }
    const v = read(row);
    if (v !== undefined) out[field] = v;
  }
  for (const [label, field] of Object.entries(labels)) if (!(field in out)) errors.push(`"${name}" has no ${label} row: using the built-in number`);
  return out;
}

function readXp(events: PoolTable | undefined, difficulty: PoolTable | undefined, fail: (line: number, m: string) => void, errors: string[]): XpRules {
  const d = DEFAULT_XP;
  const earn = labelled(events, 'XP', { 'match played': 'matchPlayed', 'match won': 'matchWon', 'round won': 'roundWon', 'hit on an opponent': 'hit' } as const, (row) => numberCell(row, 'XP', fail, 0, MAX_XP_CELL), fail, errors);
  const diff = labelled(difficulty, 'Difficulty', { easy: 'easy', normal: 'normal', hard: 'hard', pro: 'pro' } as const, (row) => numberCell(row, 'Multiplier', fail, MIN_DIFFICULTY_MULTIPLIER, 100), fail, errors);
  return {
    earn: {
      matchPlayed: earn.matchPlayed ?? d.earn.matchPlayed,
      matchWon: earn.matchWon ?? d.earn.matchWon,
      roundWon: earn.roundWon ?? d.earn.roundWon,
      hit: earn.hit ?? d.earn.hit,
    },
    difficulty: { easy: diff.easy ?? d.difficulty.easy, normal: diff.normal ?? d.difficulty.normal, hard: diff.hard ?? d.difficulty.hard, pro: diff.pro ?? d.difficulty.pro },
  };
}

/** The level `xp` reaches (the highest whose total it covers), never past the cap. */
export function levelOf(t: LevelTable, xp: number): number {
  let level = 0;
  for (const l of t.levels) if (xp >= l.total) level = l.level;
  return level;
}

/** Where `xp` stands: its level, the XP into it, what the next level takes (null at the cap) and the running totals. */
export interface LevelStanding {
  level: number;
  /** XP earned past the level's total (0 at the cap: XP stops there). */
  into: number;
  /** XP the next level takes on top of this one; null at the cap. */
  next: number | null;
  /** The XP counted (never past the cap's total). */
  xp: number;
}

export function standing(t: LevelTable, xp: number): LevelStanding {
  const counted = Math.max(0, Math.min(xp, t.levels[t.cap]!.total));
  const level = levelOf(t, counted);
  const next = t.levels[level + 1];
  return { level, into: counted - t.levels[level]!.total, next: next ? next.xp : null, xp: counted };
}

/** The asset ids levels 0 to `level` unlock, lowest level first. */
export function unlocksUpTo(t: LevelTable, level: number): string[] {
  return t.levels.filter((l) => l.level <= level).flatMap((l) => l.unlocks);
}
