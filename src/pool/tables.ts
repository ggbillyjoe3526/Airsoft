import type { PoolRow, PoolTable } from './poolFile';

/**
 * What pool.ts reads out of pool.md that the files built on it (caches.ts) also need: the Caches table's case kinds.
 * Below pool.ts, so no pool file imports another in a loop (M79, audit CORE-08). Holds only types and pure readers.
 */

/** One kind of case, as pool.md's Caches table has it. */
export interface CaseKind {
  /** The Key column: what map data names in a case spot's kinds (`ammo-can`). */
  key: string;
  name: string;
  /** How many a run places (each run rolls a number in this range, as far as the map has spots for them). */
  count: NumberRange;
  /** Seconds the Use key is held to open one. */
  openTime: number;
  /** How far its noise carries while it is opened (m). */
  heard: number;
  /** XP it holds (rolled in this range, whole numbers; LV1, in place of Field Credits). */
  xp: NumberRange;
  /** Chance (0..1) that it holds a BB resupply instead of its XP. */
  resupplyChance: number;
}

export interface NumberRange {
  min: number;
  max: number;
}

/** pool.md's Caches table as shipped (plan, section 4): used when the file has no readable rows. */
export const DEFAULT_CASE_KINDS: readonly CaseKind[] = [
  { key: 'ammo-can', name: 'Ammo can', count: { min: 4, max: 6 }, openTime: 2, heard: 8, xp: { min: 15, max: 40 }, resupplyChance: 0.4 },
  { key: 'field-case', name: 'Field case', count: { min: 2, max: 3 }, openTime: 4, heard: 14, xp: { min: 40, max: 80 }, resupplyChance: 0 },
  { key: 'locker', name: "Marshal's locker", count: { min: 1, max: 1 }, openTime: 7, heard: 30, xp: { min: 100, max: 150 }, resupplyChance: 0 },
];

/** The most of one kind a run places, and the most XP one case holds: far beyond any sane value (a typo guard). */
const MAX_COUNT = 50;
const MAX_XP = 100000;
const MAX_SECONDS = 120;
const MAX_HEARD = 200;
const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function cell(row: PoolRow, header: string): string {
  return row.cells[header] ?? '';
}

/** "4 to 6", "4-6" or "4": a whole-number range in [0, max]; undefined (and an error) otherwise. */
function rangeCell(row: PoolRow, header: string, max: number, fail: (line: number, m: string) => void): NumberRange | undefined {
  const raw = cell(row, header).trim();
  const m = /^(\d+)(?:\s*(?:to|-|–)\s*(\d+))?$/.exec(raw);
  const min = m ? Number(m[1]) : Number.NaN;
  const top = m?.[2] !== undefined ? Number(m[2]) : min;
  if (Number.isFinite(min) && Number.isFinite(top) && min <= top && top <= max) return { min, max: top };
  fail(row.line, `${header} must be a number or a range like "4 to 6" (at most ${max}), not "${raw}"`);
  return undefined;
}

/** A number cell (a trailing % allowed) in [0, max]; undefined (and an error) otherwise. */
function numberCell(row: PoolRow, header: string, max: number, fail: (line: number, m: string) => void): number | undefined {
  const raw = cell(row, header).replace(/%$/, '').trim();
  const v = raw === '' ? Number.NaN : Number(raw);
  if (Number.isFinite(v) && v >= 0 && v <= max) return v;
  fail(row.line, `${header} must be a number from 0 to ${max}, not "${cell(row, header)}"`);
  return undefined;
}

/**
 * pool.md's Caches table (M44). A row that can't be read is left out with its line in the errors; with no table, or
 * no readable row, the defaults are used (and said so), so Extraction always has cases.
 */
export function readCaseKinds(t: PoolTable | undefined, fail: (line: number, m: string) => void, errors: string[]): CaseKind[] {
  if (!t) return errors.push('no "Caches" table: Extraction uses the cases as shipped'), [...DEFAULT_CASE_KINDS];
  const kinds: CaseKind[] = [];
  for (const row of t.rows) {
    const name = cell(row, 'Case');
    const key = cell(row, 'Key').toLowerCase();
    if (!name) fail(row.line, 'a case needs a name');
    if (!KEY_PATTERN.test(key)) fail(row.line, `Key must be lower case words joined with -, not "${cell(row, 'Key')}"`);
    else if (kinds.some((k) => k.key === key)) fail(row.line, `the Key ${key} is used twice`);
    const count = rangeCell(row, 'Per run', MAX_COUNT, fail);
    const openTime = numberCell(row, 'Open s', MAX_SECONDS, fail);
    const heard = numberCell(row, 'Heard m', MAX_HEARD, fail);
    const xp = rangeCell(row, 'XP', MAX_XP, fail);
    const resupply = numberCell(row, 'BB resupply %', 100, fail);
    if (!name || !KEY_PATTERN.test(key) || kinds.some((k) => k.key === key)) continue;
    if (!count || openTime === undefined || heard === undefined || !xp || resupply === undefined) continue;
    kinds.push({ key, name, count, openTime, heard, xp, resupplyChance: resupply / 100 });
  }
  if (kinds.length === 0) return errors.push('the Caches table has no readable cases: Extraction uses the cases as shipped'), [...DEFAULT_CASE_KINDS];
  return kinds;
}
