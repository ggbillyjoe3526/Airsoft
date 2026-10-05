import { createRng, rngNext, type RngState } from '../sim/rng';
import type { CaseFind, CaseSetup } from '../sim/extraction';
import type { Vec3 } from '../sim/vec';
import { drawPart } from './armory';
import { itemKey } from './collection';
import { type Pool, type RarityTier, tierId } from './pool';
import type { PoolRow, PoolTable } from './poolFile';

/**
 * Extraction's cases (M44): pool.md's Caches table (one row per kind of case: how many a run places, how long one takes
 * to open, how far it is heard and what it holds) and the seeded roll that places a run's cases on a map's case spots
 * and fills them. The numbers are the owner's to tune in pool.md; the ones below are used for any the file is missing.
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
  /** Field Credits it holds (rolled in this range, whole numbers). */
  fc: NumberRange;
  /** Chance (0..1) that it holds a BB resupply instead of its Field Credits. */
  resupplyChance: number;
  /** Chance (0..1) that it also holds one part. */
  partChance: number;
  /** The commonest tier a part from it comes in (a tier id): the draw starts there. */
  partsFrom: string;
}

export interface NumberRange {
  min: number;
  max: number;
}

/** pool.md's Caches table as shipped (plan, section 4): used when the file has no readable rows. */
export const DEFAULT_CASE_KINDS: readonly CaseKind[] = [
  { key: 'ammo-can', name: 'Ammo can', count: { min: 4, max: 6 }, openTime: 2, heard: 8, fc: { min: 15, max: 40 }, resupplyChance: 0.4, partChance: 0, partsFrom: 'common' },
  { key: 'field-case', name: 'Field case', count: { min: 2, max: 3 }, openTime: 4, heard: 14, fc: { min: 40, max: 80 }, resupplyChance: 0, partChance: 0.3, partsFrom: 'common' },
  { key: 'locker', name: "Marshal's locker", count: { min: 1, max: 1 }, openTime: 7, heard: 30, fc: { min: 100, max: 150 }, resupplyChance: 0, partChance: 1, partsFrom: 'rare' },
];

/** The most of one kind a run places, and the most FC one case holds: far beyond any sane value (a typo guard). */
const MAX_COUNT = 50;
const MAX_FC = 100000;
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
export function readCaseKinds(t: PoolTable | undefined, tiers: readonly RarityTier[], fail: (line: number, m: string) => void, errors: string[]): CaseKind[] {
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
    const fc = rangeCell(row, 'FC', MAX_FC, fail);
    const resupply = numberCell(row, 'BB resupply %', 100, fail);
    const part = numberCell(row, 'Part %', 100, fail);
    const fromLabel = cell(row, 'Parts from');
    const from = tiers.find((x) => x.id === tierId(fromLabel));
    if (!from) fail(row.line, `Parts from must be a tier in the Rarity table, not "${fromLabel}"`);
    if (!name || !KEY_PATTERN.test(key) || kinds.some((k) => k.key === key)) continue;
    if (!count || openTime === undefined || heard === undefined || !fc || resupply === undefined || part === undefined || !from) continue;
    kinds.push({ key, name, count, openTime, heard, fc, resupplyChance: resupply / 100, partChance: part / 100, partsFrom: from.id });
  }
  if (kinds.length === 0) return errors.push('the Caches table has no readable cases: Extraction uses the cases as shipped'), [...DEFAULT_CASE_KINDS];
  return kinds;
}

/** A place a case can stand on a map (map data), and the kinds of case it suits (pool.md Keys). */
export interface CaseSpotLike {
  position: Vec3;
  yaw: number;
  kinds: readonly string[];
}

/** A whole number in `r`, inclusive. */
function rollRange(r: NumberRange, rng: RngState): number {
  return r.min + Math.min(r.max - r.min, Math.floor(rngNext(rng) * (r.max - r.min + 1)));
}

/**
 * Which spot gets which kind of case (M44): the kinds the fewest spots suit first (the locker), each placing its rolled
 * number on free spots that suit it, picked at random; a kind runs out quietly when its spots do (map data tests
 * check every map has room for each kind's most). Pure.
 */
export function placeCases(kinds: readonly CaseKind[], spots: readonly CaseSpotLike[], rng: RngState): { spot: number; kind: CaseKind }[] {
  const suits = (k: CaseKind): number => spots.filter((s) => s.kinds.includes(k.key)).length;
  const order = [...kinds].sort((a, b) => suits(a) - suits(b));
  const used = new Set<number>();
  const out: { spot: number; kind: CaseKind }[] = [];
  for (const kind of order) {
    const want = rollRange(kind.count, rng);
    const free: number[] = [];
    spots.forEach((s, i) => {
      if (!used.has(i) && s.kinds.includes(kind.key)) free.push(i);
    });
    for (let n = 0; n < want && free.length > 0; n++) {
      const spot = free.splice(Math.floor(rngNext(rng) * free.length), 1)[0]!;
      used.add(spot);
      out.push({ spot, kind });
    }
  }
  return out.sort((a, b) => a.spot - b.spot);
}

/**
 * What one case holds: its Field Credits (or a BB resupply instead, on its chance) and, on its chance, a part drawn
 * like a Shot's item (armory.ts drawPart: never dev gear, pity untouched). `drawn` keeps a run's parts apart for the
 * unowned weight, as a Shot's are.
 */
export function rollFind(pool: Pool, kind: CaseKind, owned: Readonly<Record<string, number>>, drawn: Set<string>, rng: RngState): CaseFind {
  const resupply = rngNext(rng) < kind.resupplyChance;
  const fc = rollRange(kind.fc, rng);
  const item = rngNext(rng) < kind.partChance ? drawPart(pool, owned, kind.partsFrom, drawn, rng) : null;
  if (item) drawn.add(itemKey(item.asset, item.tier));
  return { fc: resupply ? 0 : fc, resupply, item };
}

/**
 * A run's cases (M44), from its seed: placed on the map's spots and filled from pool.md's Caches table, with the parts
 * weighted towards what `owned` (the collection's items) lacks. The same seed and collection give the same run. Pure.
 */
export function rollRunCases(pool: Pool, spots: readonly CaseSpotLike[], owned: Readonly<Record<string, number>>, seed: number): CaseSetup[] {
  const rng = createRng(seed);
  const drawn = new Set<string>();
  return placeCases(pool.caseKinds, spots, rng).map(({ spot, kind }) => {
    const s = spots[spot]!;
    return {
      kind: kind.key,
      name: kind.name,
      position: { x: s.position.x, y: s.position.y, z: s.position.z },
      yaw: s.yaw,
      openTime: kind.openTime,
      heard: kind.heard,
      find: rollFind(pool, kind, owned, drawn, rng),
    };
  });
}
