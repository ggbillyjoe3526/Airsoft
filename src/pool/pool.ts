import { GRIPS, type GripId, MAGAZINES, type MagazineId } from '../config/attachments';
import type { Difficulty } from '../config/bots';
import { LASERS, type LaserId } from '../config/lasers';
import { type OpticId, OPTICS } from '../config/optics';
import { AEG, GAS_PISTOL, type ReplicaConfig } from '../config/replicas';
import { type PoolRow, type PoolTable, readTables } from './poolFile';

/**
 * The asset pool (M26a): every replica and part the player can own, and the Armory's numbers, read from pool.md (the
 * owner edits that file by hand; its guide explains the columns). Nothing here touches the browser: `loadPool` turns the
 * file's text into plain data and lists what it couldn't read, and src/pool/gamePool.ts loads the bundled file.
 */

export type AssetCategory = 'replica' | 'power' | 'optic' | 'grip' | 'laser' | 'magazine' | 'grenade';
export type PowerType = 'battery' | 'gas' | 'spring';

/** The replica behind each replica Key (pool.md's Key column). */
export const REPLICA_KEYS: Readonly<Record<string, ReplicaConfig>> = { pistol: GAS_PISTOL, aeg: AEG };
/** The optic, grip, laser and magazine behind each Key. "As it comes" (iron sights, no grip, standard) isn't pooled. */
export const OPTIC_KEYS = Object.keys(OPTICS) as OpticId[];
export const GRIP_KEYS = (Object.keys(GRIPS) as GripId[]).filter((g) => g !== 'none');
export const LASER_KEYS = Object.keys(LASERS) as LaserId[];
export const MAGAZINE_KEYS = (Object.keys(MAGAZINES) as MagazineId[]).filter((m) => m !== 'standard');

/** The power type each replica tag stands for: a battery drives an `electric` replica. */
export const POWER_TAGS: Readonly<Record<PowerType, string>> = { battery: 'electric', gas: 'gas', spring: 'spring' };

export interface Asset {
  /** Six digits, never reused (the player's save remembers it). */
  id: string;
  name: string;
  category: AssetCategory;
  /** The code behind it (REPLICA_KEYS, OPTIC_KEYS …); '' for a power source. */
  key: string;
  /** A replica's own tags; a part's Fits (tags or replica IDs, any one of which it needs). */
  tags: readonly string[];
  /** Power sources only: battery, gas or spring, and how much harder it shoots (0.1 = 10%). */
  power?: { type: PowerType; boost: number };
  /** Owned from the start, at the lowest tier. */
  starter: boolean;
  /** Shots can dispense it. */
  inShots: boolean;
}

export interface RarityTier {
  /** Its name in camel case ('veryRare'): what saves and code use. */
  id: string;
  label: string;
  /** Chance (0..1) that a dispensed asset comes in this tier. */
  odds: number;
  /** How much it improves its asset (0.15 = 15%; what each category improves is set in code, from M26b). */
  bonus: number;
  /** FC one spare copy scraps for. */
  scrapFc: number;
}

export interface Economy {
  /** FC per match played and won, per round won and per hit on an opponent. */
  earn: { matchPlayed: number; matchWon: number; roundWon: number; hit: number };
  /** The opponents' difficulty multiplies a match's FC. */
  difficulty: Readonly<Record<Difficulty, number>>;
  tokensPerFc: number;
  tokensPerShot: number;
  tokensPerTenShots: number;
  assetsPerShot: number;
  /** The lowest tier a ten-Shot always holds one of (a tier id), or null for none. */
  tenShotGuarantee: string | null;
}

export interface Pool {
  assets: readonly Asset[];
  byId: ReadonlyMap<string, Asset>;
  /** Commonest first, rarest last. */
  tiers: readonly RarityTier[];
  economy: Economy;
  /** What couldn't be read, each with its pool.md line ("line 12: …"). Those rows are left out. */
  errors: readonly string[];
}

/** pool.md's numbers as shipped: used for any the file is missing. */
export const DEFAULT_ECONOMY: Economy = {
  earn: { matchPlayed: 40, matchWon: 60, roundWon: 10, hit: 5 },
  difficulty: { easy: 0.5, normal: 1, hard: 1.5 },
  tokensPerFc: 0.00625,
  tokensPerShot: 1,
  tokensPerTenShots: 10,
  assetsPerShot: 3,
  tenShotGuarantee: 'rare',
};

/** Used if pool.md has no readable Rarity table: one tier, so the game still runs. */
const FALLBACK_TIER: RarityTier = { id: 'common', label: 'Common', odds: 1, bonus: 0, scrapFc: 5 };

/** The asset tables, by their pool.md heading. */
const ASSET_SECTIONS: Readonly<Record<string, AssetCategory>> = {
  Replicas: 'replica',
  'Power sources': 'power',
  Optics: 'optic',
  Grips: 'grip',
  Lasers: 'laser',
  Magazines: 'magazine',
  Grenades: 'grenade',
};

const KEYS_BY_CATEGORY: Readonly<Record<Exclude<AssetCategory, 'power'>, readonly string[]>> = {
  replica: Object.keys(REPLICA_KEYS),
  optic: OPTIC_KEYS,
  grip: GRIP_KEYS,
  laser: LASER_KEYS,
  magazine: MAGAZINE_KEYS,
  grenade: [],
};

const ID_PATTERN = /^\d{6}$/;
const TAG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Very Rare" → "veryRare". */
export function tierId(label: string): string {
  const words = label.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.map((w, i) => (i === 0 ? w : w[0]!.toUpperCase() + w.slice(1))).join('');
}

/** Reads pool.md's text. Never throws: rows it can't read are left out and listed in `errors`. */
export function loadPool(text: string): Pool {
  const tables = readTables(text);
  const errors: string[] = [];
  const fail = (line: number, message: string): void => void errors.push(`line ${line}: ${message}`);
  // A table by its first column's header (the Difficulty table shares the Field Credits heading), else by its heading.
  const table = (name: string): PoolTable | undefined => tables.find((t) => t.headers[0] === name) ?? tables.find((t) => t.heading === name);

  // By first column, so another table under the same heading (the Rarity section's Bonus table) is never misread.
  const tiers = readTiers(table('Tier'), fail, errors);
  const economy = readEconomy(table('Event'), table('Difficulty'), table('Setting'), tiers, fail, errors);
  const assets: Asset[] = [];
  const byId = new Map<string, Asset>();
  for (const t of tables) {
    const category = ASSET_SECTIONS[t.heading];
    if (!category) continue;
    for (const row of t.rows) {
      const asset = readAsset(row, category, fail);
      if (!asset) continue;
      if (byId.has(asset.id)) {
        fail(row.line, `ID ${asset.id} is already used by ${byId.get(asset.id)!.name}`);
        continue;
      }
      byId.set(asset.id, asset);
      assets.push(asset);
    }
  }
  for (const heading of Object.keys(ASSET_SECTIONS)) if (!table(heading)) errors.push(`no "${heading}" table (it may be empty, but keep its header)`);
  checkFits(assets, tables, fail);
  return { assets, byId, tiers, economy, errors };
}

function cell(row: PoolRow, header: string): string {
  return row.cells[header] ?? '';
}

function yesNo(row: PoolRow, header: string, fail: (line: number, m: string) => void): boolean | undefined {
  const v = cell(row, header).toLowerCase();
  if (v === 'yes') return true;
  if (v === 'no') return false;
  fail(row.line, `${header} must be yes or no, not "${cell(row, header)}"`);
  return undefined;
}

/** A number cell (a trailing % is allowed), or undefined (and an error) if it isn't one in [min, max]. */
function numberCell(row: PoolRow, header: string, fail: (line: number, m: string) => void, min = 0, max = Number.POSITIVE_INFINITY): number | undefined {
  const raw = cell(row, header).replace(/%$/, '').trim();
  const v = raw === '' ? Number.NaN : Number(raw);
  if (Number.isFinite(v) && v >= min && v <= max) return v;
  fail(row.line, `${header} must be a number${max < Number.POSITIVE_INFINITY ? ` from ${min} to ${max}` : ` of ${min} or more`}, not "${cell(row, header)}"`);
  return undefined;
}

function list(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function readAsset(row: PoolRow, category: AssetCategory, fail: (line: number, m: string) => void): Asset | null {
  const id = cell(row, 'ID');
  const name = cell(row, 'Name');
  if (!ID_PATTERN.test(id)) return fail(row.line, `ID must be six digits, not "${id}"`), null;
  if (!name) return fail(row.line, `asset ${id} has no Name`), null;
  const starter = yesNo(row, 'Starter', fail);
  const inShots = yesNo(row, 'In Shots', fail);
  if (starter === undefined || inShots === undefined) return null;
  const tags = list(cell(row, category === 'replica' ? 'Tags' : 'Fits'));
  const badTag = tags.find((t) => !TAG_PATTERN.test(t));
  if (badTag !== undefined) return fail(row.line, `"${badTag}" isn't a tag (lower case words joined with -) or an ID`), null;
  if (tags.length === 0) return fail(row.line, `${name} needs ${category === 'replica' ? 'Tags' : 'Fits'}`), null;
  if (category === 'power') {
    const type = cell(row, 'Type').toLowerCase();
    if (!(type in POWER_TAGS)) return fail(row.line, `Type must be battery, gas or spring, not "${cell(row, 'Type')}"`), null;
    const pct = numberCell(row, 'Power %', fail, -50, 100);
    if (pct === undefined) return null;
    return { id, name, category, key: '', tags, power: { type: type as PowerType, boost: pct / 100 }, starter, inShots };
  }
  const key = cell(row, 'Key');
  const keys = KEYS_BY_CATEGORY[category];
  if (!keys.includes(key)) {
    return fail(row.line, `"${key}" isn't a ${category} Key${keys.length ? ` (one of ${keys.join(', ')})` : ' (there are none yet)'}`), null;
  }
  return { id, name, category, key, tags, starter, inShots };
}

/**
 * Every Fits entry names a tag some replica has (or a power type's tag), or a replica's ID; a power source fits only
 * replicas driven its way (a battery's Fits holds `electric`, or names replicas by ID).
 */
function checkFits(assets: readonly Asset[], tables: readonly PoolTable[], fail: (line: number, m: string) => void): void {
  const replicas = assets.filter((a) => a.category === 'replica');
  const known = new Set<string>([...Object.values(POWER_TAGS), ...replicas.flatMap((r) => r.tags)]);
  const ids = new Set(replicas.map((r) => r.id));
  for (const a of assets) {
    if (a.category === 'replica') continue;
    const row = tables.flatMap((t) => t.rows).find((r) => r.cells.ID === a.id);
    for (const f of a.tags) {
      if (ID_PATTERN.test(f) ? !ids.has(f) : !known.has(f)) fail(row?.line ?? 0, `${a.name} fits "${f}", which no replica has`);
    }
    if (a.power) {
      const own = POWER_TAGS[a.power.type];
      const wrong = a.tags.find((f) => !ID_PATTERN.test(f) && f !== own);
      if (wrong !== undefined) fail(row?.line ?? 0, `${a.name} is a ${a.power.type}, so it fits "${own}" replicas, not "${wrong}"`);
    }
  }
}

function readTiers(t: PoolTable | undefined, fail: (line: number, m: string) => void, errors: string[]): RarityTier[] {
  if (!t) return errors.push('no "Rarity" table: every asset is Common'), [FALLBACK_TIER];
  const tiers: RarityTier[] = [];
  for (const row of t.rows) {
    const label = cell(row, 'Tier');
    const odds = numberCell(row, 'Odds %', fail, 0, 100);
    const bonus = numberCell(row, 'Bonus %', fail, 0, 100);
    const scrapFc = numberCell(row, 'Scrap FC', fail);
    if (!label) fail(row.line, 'a tier needs a name');
    if (!label || odds === undefined || bonus === undefined || scrapFc === undefined) continue;
    const id = tierId(label);
    if (tiers.some((x) => x.id === id)) {
      fail(row.line, `tier ${label} is listed twice`);
      continue;
    }
    tiers.push({ id, label, odds: odds / 100, bonus: bonus / 100, scrapFc: Math.round(scrapFc) });
  }
  if (tiers.length === 0) return errors.push('the Rarity table has no readable tiers: every asset is Common'), [FALLBACK_TIER];
  const sum = tiers.reduce((s, x) => s + x.odds, 0);
  if (Math.abs(sum - 1) > 1e-6) fail(t.line, `the Odds % add up to ${Math.round(sum * 1000) / 10}, not 100`);
  return tiers;
}

/** A table of label → number rows, matched case-insensitively against `labels` (each label to its field). */
function labelled<K extends string>(
  t: PoolTable | undefined,
  name: string,
  labels: Readonly<Record<string, K>>,
  valueHeader: string,
  fail: (line: number, m: string) => void,
  errors: string[],
  read: (row: PoolRow) => number | string | undefined,
): Partial<Record<K, number | string>> {
  const out: Partial<Record<K, number | string>> = {};
  if (!t) return errors.push(`no "${name}" table: using the built-in numbers`), out;
  const labelHeader = t.headers[0]!;
  for (const row of t.rows) {
    const label = cell(row, labelHeader);
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
  for (const [label, field] of Object.entries(labels)) if (!(field in out)) errors.push(`"${name}" has no ${label} row (${valueHeader}): using the built-in number`);
  return out;
}

function readEconomy(
  fc: PoolTable | undefined,
  difficulty: PoolTable | undefined,
  shots: PoolTable | undefined,
  tiers: readonly RarityTier[],
  fail: (line: number, m: string) => void,
  errors: string[],
): Economy {
  const d = DEFAULT_ECONOMY;
  const earn = labelled(fc, 'Field Credits', { 'match played': 'matchPlayed', 'match won': 'matchWon', 'round won': 'roundWon', 'hit on an opponent': 'hit' } as const, 'FC', fail, errors, (row) =>
    numberCell(row, 'FC', fail),
  );
  const diff = labelled(difficulty, 'Difficulty', { easy: 'easy', normal: 'normal', hard: 'hard' } as const, 'Multiplier', fail, errors, (row) => numberCell(row, 'Multiplier', fail));
  const s = labelled(
    shots,
    'Tokens and Shots',
    {
      'tokens per fc': 'tokensPerFc',
      'tokens per shot': 'tokensPerShot',
      'tokens per 10 shots': 'tokensPerTenShots',
      'assets per shot': 'assetsPerShot',
      'ten shots guarantee': 'tenShotGuarantee',
    } as const,
    'Value',
    fail,
    errors,
    (row) => {
      const label = cell(row, 'Setting').toLowerCase();
      if (label === 'ten shots guarantee') {
        const v = cell(row, 'Value');
        if (v.toLowerCase() === 'none') return 'none';
        if (tiers.some((t) => t.id === tierId(v))) return tierId(v);
        return fail(row.line, `"${v}" isn't a tier in the Rarity table (or none)`), undefined;
      }
      if (label === 'tokens per fc') return numberCell(row, 'Value', fail, 1e-6, 1);
      return numberCell(row, 'Value', fail, 1, label === 'assets per shot' ? 10 : 1000);
    },
  );
  const num = (v: number | string | undefined, fallback: number): number => (typeof v === 'number' ? v : fallback);
  const guarantee = s.tenShotGuarantee;
  return {
    earn: {
      matchPlayed: num(earn.matchPlayed, d.earn.matchPlayed),
      matchWon: num(earn.matchWon, d.earn.matchWon),
      roundWon: num(earn.roundWon, d.earn.roundWon),
      hit: num(earn.hit, d.earn.hit),
    },
    difficulty: { easy: num(diff.easy, d.difficulty.easy), normal: num(diff.normal, d.difficulty.normal), hard: num(diff.hard, d.difficulty.hard) },
    tokensPerFc: num(s.tokensPerFc, d.tokensPerFc),
    tokensPerShot: Math.round(num(s.tokensPerShot, d.tokensPerShot)),
    tokensPerTenShots: Math.round(num(s.tokensPerTenShots, d.tokensPerTenShots)),
    assetsPerShot: Math.round(num(s.assetsPerShot, d.assetsPerShot)),
    tenShotGuarantee: guarantee === undefined ? (tiers.some((t) => t.id === d.tenShotGuarantee) ? d.tenShotGuarantee : null) : guarantee === 'none' ? null : String(guarantee),
  };
}

/** FC one Token costs (the exchange rate's inverse: 160 FC at 0.00625 Tokens per FC). */
export function fcPerToken(e: Economy): number {
  return Math.max(1, Math.round(1 / e.tokensPerFc));
}

/** True if part `part` fits replica `replica`: one of its Fits is one of the replica's tags, or the replica's ID. */
export function fits(part: Asset, replica: Asset): boolean {
  return part.tags.some((f) => f === replica.id || replica.tags.includes(f));
}

/** The replica config behind a replica asset. */
export function replicaOf(asset: Asset): ReplicaConfig {
  return REPLICA_KEYS[asset.key]!;
}

/** The pool's replica asset for a replica config (its first row with that Key), if any. */
export function assetOfReplica(pool: Pool, replica: ReplicaConfig): Asset | undefined {
  return pool.assets.find((a) => a.category === 'replica' && REPLICA_KEYS[a.key]?.id === replica.id);
}

export function tierOf(pool: Pool, id: string): RarityTier | undefined {
  return pool.tiers.find((t) => t.id === id);
}
