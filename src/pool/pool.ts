import { BARRELS, type BarrelId, GRIPS, type GripId, MAGAZINES, type MagazineId, MUZZLES, type MuzzleId } from '../config/attachments';
import type { Difficulty } from '../config/bots';
import { CONTENT_TAGS, type ContentTag } from '../config/content';
import { LASERS, type LaserId } from '../config/lasers';
import { type OpticId, OPTICS } from '../config/optics';
import { AEG, CYBER_PISTOL, GAS_PISTOL, type ReplicaConfig } from '../config/replicas';
import { type CaseKind, readCaseKinds } from './caches';
import { type PoolRow, type PoolTable, readTables } from './poolFile';

/**
 * The asset pool (M26a): every replica and part the player can own, and the Armory's numbers, read from pool.md (the
 * owner edits that file by hand; its guide explains the columns). Nothing here touches the browser: `loadPool` turns the
 * file's text into plain data and lists what it couldn't read, and src/pool/gamePool.ts loads the bundled file.
 */

export type AssetCategory = 'replica' | 'power' | 'optic' | 'grip' | 'laser' | 'magazine' | 'barrel' | 'muzzle' | 'grenade';
export type PowerType = 'battery' | 'gas' | 'spring';

/** The replica behind each replica Key (pool.md's Key column). */
export const REPLICA_KEYS: Readonly<Record<string, ReplicaConfig>> = { pistol: GAS_PISTOL, aeg: AEG, cyber: CYBER_PISTOL };
/** The optic, grip, laser and magazine behind each Key. "As it comes" (iron sights, no grip, standard) isn't pooled. */
export const OPTIC_KEYS = Object.keys(OPTICS) as OpticId[];
export const GRIP_KEYS = (Object.keys(GRIPS) as GripId[]).filter((g) => g !== 'none');
export const LASER_KEYS = Object.keys(LASERS) as LaserId[];
export const MAGAZINE_KEYS = (Object.keys(MAGAZINES) as MagazineId[]).filter((m) => m !== 'standard');
export const BARREL_KEYS = Object.keys(BARRELS) as BarrelId[];
export const MUZZLE_KEYS = Object.keys(MUZZLES) as MuzzleId[];

/** The power type each replica tag stands for: a battery drives an `electric` replica. */
const POWER_TAGS: Readonly<Record<PowerType, string>> = { battery: 'electric', gas: 'gas', spring: 'spring' };

export interface Asset {
  /** Six digits, never reused (the player's save remembers it). */
  id: string;
  name: string;
  category: AssetCategory;
  /** The code behind it (REPLICA_KEYS, OPTIC_KEYS …); '' for a power source. */
  key: string;
  /** A replica's own tags; a part's Fits (tags or replica IDs, any one of which it needs). */
  tags: readonly string[];
  /** Power sources only: battery, gas or spring (what it does is in stats.md's Power sources table, by ID, M29). */
  power?: { type: PowerType };
  /** Owned from the start, at the lowest tier. */
  starter: boolean;
  /** Shots can dispense it (a `dev` asset never, whatever this says: armory.ts shotAssets). */
  inShots: boolean;
  /** pool.md's Access (M35, config/content.ts): `dev` assets show only with Dev content on. */
  tag: ContentTag;
  /**
   * The tiers it comes in, by tier id (pool.md's Tiers column, M32), commonest first; absent: every tier. A chase
   * replica comes at Legendary only.
   */
  tiers?: readonly string[];
  /**
   * Its own chance (0..1) per item a Shot gives (pool.md's Drop %, M32): a chase item, drawn apart from the rest, in a
   * tier of its own. Absent: one of the even draw.
   */
  dropChance?: number;
}

export interface RarityTier {
  /** Its name in camel case ('veryRare'): what saves and code use. */
  id: string;
  label: string;
  /** Chance (0..1) that a dispensed asset comes in this tier. */
  odds: number;
  /** How much it improves its asset (0.15 = 15%; which stats and by how much is stats.md's Tier scaling, M29). */
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
  /**
   * How much likelier a draw picks an asset you don't own at the tier drawn than one you do (1: no difference; audit
   * POOL-05). The tier odds stay exactly as listed: this only chooses between assets.
   */
  unownedWeight: number;
  /**
   * Pity (audit POOL-01): a tier (id) or rarer is guaranteed within this many Shots, counted from the last Shot that
   * held one, across visits. Rarest first.
   */
  pity: readonly PityRule[];
}

export interface PityRule {
  /** The tier (id) the rule guarantees, or rarer. */
  tier: string;
  /** Within this many Shots. */
  shots: number;
}

export interface Pool {
  assets: readonly Asset[];
  byId: ReadonlyMap<string, Asset>;
  /** Commonest first, rarest last. */
  tiers: readonly RarityTier[];
  economy: Economy;
  /** Extraction's kinds of case (M44, pool.md's Caches table), in the table's order. */
  caseKinds: readonly CaseKind[];
  /** What couldn't be read, each with its pool.md line ("line 12: …"). Those rows are left out. */
  errors: readonly string[];
}

/** pool.md's numbers as shipped: used for any the file is missing. */
export const DEFAULT_ECONOMY: Economy = {
  earn: { matchPlayed: 40, matchWon: 60, roundWon: 10, hit: 5 },
  difficulty: { easy: 0.5, normal: 1, hard: 1.5, pro: 2 },
  tokensPerFc: 0.00625,
  tokensPerShot: 1,
  tokensPerTenShots: 10,
  assetsPerShot: 3,
  tenShotGuarantee: 'rare',
  unownedWeight: 2,
  pity: [
    { tier: 'legendary', shots: 100 },
    { tier: 'epic', shots: 20 },
  ],
};

/** The most FC a single pool.md number (Scrap FC, a match's FC) may be (audit POOL-19): far beyond any sane value. */
const MAX_FC_CELL = 1e6;
/** The most Shots a pity rule may wait. */
const MAX_PITY_SHOTS = 10000;

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
  Barrels: 'barrel',
  'Muzzle parts': 'muzzle',
  Grenades: 'grenade',
};

const KEYS_BY_CATEGORY: Readonly<Record<Exclude<AssetCategory, 'power'>, readonly string[]>> = {
  replica: Object.keys(REPLICA_KEYS),
  optic: OPTIC_KEYS,
  grip: GRIP_KEYS,
  laser: LASER_KEYS,
  magazine: MAGAZINE_KEYS,
  barrel: BARREL_KEYS,
  muzzle: MUZZLE_KEYS,
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
  for (const t of tables) for (const p of t.problems) fail(p.line, p.message);
  // A table by its first column's header (the Difficulty table shares the Field Credits heading), else by its heading.
  const table = (name: string): PoolTable | undefined => tables.find((t) => t.headers[0] === name) ?? tables.find((t) => t.heading === name);

  // By first column, so another table under the same heading (the Rarity section's Bonus table) is never misread.
  const tiers = readTiers(table('Tier'), fail, errors);
  const economy = readEconomy(table('Event'), table('Difficulty'), table('Setting'), table('Guarantee'), tiers, fail, errors);
  const caseKinds = readCaseKinds(table('Case'), tiers, fail, errors);
  const assets: Asset[] = [];
  const byId = new Map<string, Asset>();
  // Each asset's pool.md line, for the fits check's messages (audit POOL-20: no scan of every row per asset).
  const lines = new Map<string, number>();
  const names = new Map<string, string>();
  for (const t of tables) {
    const category = ASSET_SECTIONS[t.heading];
    if (!category) {
      // "### Power Sources" would drop the whole table with only "no Power sources table" to go on (audit POOL-18).
      const section = Object.keys(ASSET_SECTIONS).find((h) => h.toLowerCase() === t.heading.toLowerCase());
      if (section) fail(t.line, `"${t.heading}" should be "${section}" (headings are read exactly)`);
      continue;
    }
    for (const row of t.rows) {
      const asset = readAsset(row, category, tiers, fail);
      if (!asset) continue;
      if (byId.has(asset.id)) {
        fail(row.line, `ID ${asset.id} is already used by ${byId.get(asset.id)!.name}`);
        continue;
      }
      // Two rows with one Name read fine but can't be told apart on screen: kept, and reported.
      const same = names.get(asset.name.toLowerCase());
      if (same) fail(row.line, `the Name "${asset.name}" is already used by ${same}`);
      names.set(asset.name.toLowerCase(), asset.id);
      byId.set(asset.id, asset);
      lines.set(asset.id, row.line);
      assets.push(asset);
    }
  }
  for (const heading of Object.keys(ASSET_SECTIONS)) if (!table(heading)) errors.push(`no "${heading}" table (it may be empty, but keep its header)`);
  // A part that fits nothing it should is left out like any other unreadable row.
  const misfits = checkFits(assets, lines, fail);
  const kept = assets.filter((a) => !misfits.has(a.id));
  for (const id of misfits) byId.delete(id);
  return { assets: kept, byId, tiers, economy, caseKinds, errors };
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

/**
 * The Access cell (M35): public or dev, blank meaning public; any other word is an error and leaves the row out, so a
 * typo never makes something unfinished public.
 */
function accessCell(row: PoolRow, fail: (line: number, m: string) => void): ContentTag | undefined {
  const v = cell(row, 'Access').toLowerCase();
  if (v === '') return 'public';
  const tag = CONTENT_TAGS.find((t) => t === v);
  if (!tag) fail(row.line, `Access must be ${CONTENT_TAGS.join(' or ')}, not "${cell(row, 'Access')}"`);
  return tag;
}

function list(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The optional Tiers and Drop % cells (M32): which tiers an asset comes in (blank: all) and its own chance per Shot item
 * (blank: the even draw). Undefined (and an error) if either can't be read.
 */
function readRarity(row: PoolRow, tiers: readonly RarityTier[], fail: (line: number, m: string) => void): Pick<Asset, 'tiers' | 'dropChance'> | undefined {
  const out: Pick<Asset, 'tiers' | 'dropChance'> = {};
  const names = list(cell(row, 'Tiers'));
  if (names.length > 0) {
    const ids = names.map(tierId);
    const unknown = names.find((_, i) => !tiers.some((t) => t.id === ids[i]));
    if (unknown !== undefined) return fail(row.line, `"${unknown}" isn't a tier in the Rarity table`), undefined;
    // In the Rarity table's order, whatever order they were typed in.
    out.tiers = tiers.filter((t) => ids.includes(t.id)).map((t) => t.id);
  }
  if (cell(row, 'Drop %').trim() !== '') {
    const drop = numberCell(row, 'Drop %', fail, 0, 100);
    if (drop === undefined) return undefined;
    out.dropChance = drop / 100;
  }
  return out;
}

function readAsset(row: PoolRow, category: AssetCategory, tiers: readonly RarityTier[], fail: (line: number, m: string) => void): Asset | null {
  const id = cell(row, 'ID');
  const name = cell(row, 'Name');
  if (!ID_PATTERN.test(id)) return fail(row.line, `ID must be six digits, not "${id}"`), null;
  if (!name) return fail(row.line, `asset ${id} has no Name`), null;
  const starter = yesNo(row, 'Starter', fail);
  const inShots = yesNo(row, 'In Shots', fail);
  const tag = accessCell(row, fail);
  if (starter === undefined || inShots === undefined || tag === undefined) return null;
  const rarity = readRarity(row, tiers, fail);
  if (!rarity) return null;
  const tags = list(cell(row, category === 'replica' ? 'Tags' : 'Fits'));
  const badTag = tags.find((t) => !TAG_PATTERN.test(t));
  if (badTag !== undefined) return fail(row.line, `"${badTag}" isn't a tag (lower case words joined with -) or an ID`), null;
  if (tags.length === 0) return fail(row.line, `${name} needs ${category === 'replica' ? 'Tags' : 'Fits'}`), null;
  if (category === 'power') {
    const type = cell(row, 'Type').toLowerCase();
    if (!(type in POWER_TAGS)) return fail(row.line, `Type must be battery, gas or spring, not "${cell(row, 'Type')}"`), null;
    return { id, name, category, key: '', tags, power: { type: type as PowerType }, starter, inShots, tag, ...rarity };
  }
  const key = cell(row, 'Key');
  const keys = KEYS_BY_CATEGORY[category];
  if (!keys.includes(key)) {
    return fail(row.line, `"${key}" isn't a ${category} Key${keys.length ? ` (one of ${keys.join(', ')})` : ' (there are none yet)'}`), null;
  }
  return { id, name, category, key, tags, starter, inShots, tag, ...rarity };
}

/**
 * Every Fits entry names a tag some replica has (or a power type's tag), or a replica's ID; a power source fits only
 * replicas driven its way (a battery's Fits holds `electric`, or names replicas by ID).
 */
function checkFits(assets: readonly Asset[], lines: ReadonlyMap<string, number>, fail: (line: number, m: string) => void): Set<string> {
  const misfits = new Set<string>();
  const replicas = assets.filter((a) => a.category === 'replica');
  const known = new Set<string>([...Object.values(POWER_TAGS), ...replicas.flatMap((r) => r.tags)]);
  const ids = new Set(replicas.map((r) => r.id));
  for (const a of assets) {
    if (a.category === 'replica') continue;
    const line = lines.get(a.id) ?? 0;
    for (const f of a.tags) {
      if (ID_PATTERN.test(f) ? !ids.has(f) : !known.has(f)) {
        fail(line, `${a.name} fits "${f}", which no replica has`);
        misfits.add(a.id);
      }
    }
    if (a.power) {
      const own = POWER_TAGS[a.power.type];
      const wrong = a.tags.find((f) => !ID_PATTERN.test(f) && f !== own);
      if (wrong !== undefined) {
        fail(line, `${a.name} is a ${a.power.type}, so it fits "${own}" replicas, not "${wrong}"`);
        misfits.add(a.id);
      }
    }
  }
  return misfits;
}

function readTiers(t: PoolTable | undefined, fail: (line: number, m: string) => void, errors: string[]): RarityTier[] {
  if (!t) return errors.push('no "Rarity" table: every asset is Common'), [FALLBACK_TIER];
  const tiers: RarityTier[] = [];
  for (const row of t.rows) {
    const label = cell(row, 'Tier');
    const odds = numberCell(row, 'Odds %', fail, 0, 100);
    const bonus = numberCell(row, 'Bonus %', fail, 0, 100);
    const scrapFc = numberCell(row, 'Scrap FC', fail, 0, MAX_FC_CELL);
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
  // Commonest first (audit POOL-06): starters come at the first tier and guarantees count up the table, so a table
  // listed rarest-first would hand every player Legendary starters. A tier's Bonus and Scrap FC never fall down it.
  const outOfOrder = tiers.some((x, i) => i > 0 && (x.bonus < tiers[i - 1]!.bonus || x.scrapFc < tiers[i - 1]!.scrapFc));
  if (outOfOrder) {
    fail(t.line, 'tiers must be listed commonest first: Bonus % and Scrap FC may not fall down the table (read in Bonus order instead)');
    tiers.sort((a, b) => a.bonus - b.bonus || a.scrapFc - b.scrapFc);
  }
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
  pityTable: PoolTable | undefined,
  tiers: readonly RarityTier[],
  fail: (line: number, m: string) => void,
  errors: string[],
): Economy {
  const d = DEFAULT_ECONOMY;
  const earn = labelled(fc, 'Field Credits', { 'match played': 'matchPlayed', 'match won': 'matchWon', 'round won': 'roundWon', 'hit on an opponent': 'hit' } as const, 'FC', fail, errors, (row) =>
    numberCell(row, 'FC', fail, 0, MAX_FC_CELL),
  );
  const diff = labelled(difficulty, 'Difficulty', { easy: 'easy', normal: 'normal', hard: 'hard', pro: 'pro' } as const, 'Multiplier', fail, errors, (row) => numberCell(row, 'Multiplier', fail));
  const s = labelled(
    shots,
    'Tokens and Shots',
    {
      'tokens per fc': 'tokensPerFc',
      'tokens per shot': 'tokensPerShot',
      'tokens per 10 shots': 'tokensPerTenShots',
      'assets per shot': 'assetsPerShot',
      'ten shots guarantee': 'tenShotGuarantee',
      'unowned item weight': 'unownedWeight',
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
      if (label === 'unowned item weight') return numberCell(row, 'Value', fail, 1, 10);
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
    difficulty: { easy: num(diff.easy, d.difficulty.easy), normal: num(diff.normal, d.difficulty.normal), hard: num(diff.hard, d.difficulty.hard), pro: num(diff.pro, d.difficulty.pro) },
    tokensPerFc: num(s.tokensPerFc, d.tokensPerFc),
    tokensPerShot: Math.round(num(s.tokensPerShot, d.tokensPerShot)),
    tokensPerTenShots: Math.round(num(s.tokensPerTenShots, d.tokensPerTenShots)),
    assetsPerShot: Math.round(num(s.assetsPerShot, d.assetsPerShot)),
    tenShotGuarantee: guarantee === undefined ? (tiers.some((t) => t.id === d.tenShotGuarantee) ? d.tenShotGuarantee : null) : guarantee === 'none' ? null : String(guarantee),
    unownedWeight: num(s.unownedWeight, d.unownedWeight),
    pity: readPity(pityTable, tiers, fail, errors),
  };
}

/**
 * The Pity table (audit POOL-01): `| Epic or rarer within | 20 |` guarantees an Epic or rarer within 20 Shots. Rarest
 * tier first; a tier listed twice keeps its first row. Without the table, the built-in rules for the tiers there are.
 */
function readPity(t: PoolTable | undefined, tiers: readonly RarityTier[], fail: (line: number, m: string) => void, errors: string[]): PityRule[] {
  const rank = (id: string): number => tiers.findIndex((x) => x.id === id);
  const sorted = (rules: PityRule[]): PityRule[] => rules.sort((a, b) => rank(b.tier) - rank(a.tier));
  if (!t) {
    errors.push('no "Pity" table: using the built-in guarantees');
    return sorted(DEFAULT_ECONOMY.pity.filter((r) => rank(r.tier) >= 0).map((r) => ({ ...r })));
  }
  const rules: PityRule[] = [];
  for (const row of t.rows) {
    const label = cell(row, t.headers[0]!);
    const m = /^(.+?)(\s+or rarer)?\s+within$/i.exec(label);
    const tier = m ? tierId(m[1]!) : '';
    if (!m || rank(tier) < 0) {
      fail(row.line, `"${label}" should read "<tier> or rarer within" with a tier from the Rarity table`);
      continue;
    }
    if (rules.some((r) => r.tier === tier)) {
      fail(row.line, `${m[1]} is listed twice in "Pity"`);
      continue;
    }
    const shots = numberCell(row, 'Shots', fail, 1, MAX_PITY_SHOTS);
    if (shots !== undefined) rules.push({ tier, shots: Math.round(shots) });
  }
  return sorted(rules);
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

/** The tiers `asset` comes in (pool.md's Tiers column; all of them when it names none), commonest first (M32). */
export function tiersOf(pool: Pool, asset: Asset): readonly RarityTier[] {
  if (!asset.tiers) return pool.tiers;
  const own = pool.tiers.filter((t) => asset.tiers!.includes(t.id));
  return own.length > 0 ? own : pool.tiers;
}

/** True if `asset` comes in tier `tier` (M32: a chase replica only at Legendary). */
export function comesIn(asset: Asset, tier: string): boolean {
  return !asset.tiers || asset.tiers.includes(tier);
}

/** The tag of a replica whose power source is built in (the Cyber Pistol's battery, M32): none is fitted to it. */
export const BUILT_IN_POWER = 'built-in-power';

/** True if replica `asset` has its power source built in (tagged BUILT_IN_POWER). */
export function hasBuiltInPower(asset: Asset): boolean {
  return asset.tags.includes(BUILT_IN_POWER);
}

/** A chase item (M32): Shots give it on a chance of its own (pool.md's Drop %), not in the even draw. */
export function isChase(asset: Asset): boolean {
  return asset.dropChance !== undefined;
}
