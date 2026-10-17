import { BARRELS, type BarrelId, GRIPS, type GripId, MAGAZINES, type MagazineId, MUZZLES, type MuzzleId } from '../config/attachments';
import { CONTENT_TAGS, type ContentTag } from '../config/content';
import { LASERS, type LaserId } from '../config/lasers';
import { type OpticId, OPTICS } from '../config/optics';
import { LIGHT_KEYS } from '../config/torches';
import { AEG, CYBER_PISTOL, GAS_PISTOL, type ReplicaConfig } from '../config/replicas';
import { type PoolRow, type PoolTable, readTables } from './poolFile';
import { type CaseKind, readCaseKinds } from './tables';

/**
 * The asset pool (M26a): every replica and part there is, and Extraction's cases, read from pool.md (the owner edits
 * that file by hand; its guide explains the columns). What each one shoots like is stats.md's, and the level that
 * unlocks it levels.md's (LV1). Nothing here touches the browser: `loadPool` turns the file's text into plain data and
 * lists what it couldn't read, and src/pool/gamePool.ts loads the bundled file.
 */

export type AssetCategory = 'replica' | 'power' | 'optic' | 'grip' | 'laser' | 'magazine' | 'barrel' | 'muzzle' | 'light' | 'grenade';
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
/** The weapon lights (M33h, config/torches.ts). */
export { LIGHT_KEYS };

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
  /** pool.md's Access (M35, config/content.ts): `dev` assets show only with Dev content on. */
  tag: ContentTag;
}

export interface Pool {
  assets: readonly Asset[];
  byId: ReadonlyMap<string, Asset>;
  /** Extraction's kinds of case (M44, pool.md's Caches table), in the table's order. */
  caseKinds: readonly CaseKind[];
  /** What couldn't be read, each with its pool.md line ("line 12: …"). Those rows are left out. */
  errors: readonly string[];
}

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
  Lights: 'light',
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
  light: LIGHT_KEYS,
  grenade: [],
};

const ID_PATTERN = /^\d{6}$/;
const TAG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Reads pool.md's text. Never throws: rows it can't read are left out and listed in `errors`. */
export function loadPool(text: string): Pool {
  const tables = readTables(text);
  const errors: string[] = [];
  const fail = (line: number, message: string): void => void errors.push(`line ${line}: ${message}`);
  for (const t of tables) for (const p of t.problems) fail(p.line, p.message);
  // A table by its first column's header, else by its heading.
  const table = (name: string): PoolTable | undefined => tables.find((t) => t.headers[0] === name) ?? tables.find((t) => t.heading === name);

  const caseKinds = readCaseKinds(table('Case'), fail, errors);
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
      const asset = readAsset(row, category, fail);
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
  return { assets: kept, byId, caseKinds, errors };
}

function cell(row: PoolRow, header: string): string {
  return row.cells[header] ?? '';
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

function readAsset(row: PoolRow, category: AssetCategory, fail: (line: number, m: string) => void): Asset | null {
  const id = cell(row, 'ID');
  const name = cell(row, 'Name');
  if (!ID_PATTERN.test(id)) return fail(row.line, `ID must be six digits, not "${id}"`), null;
  if (!name) return fail(row.line, `asset ${id} has no Name`), null;
  const tag = accessCell(row, fail);
  if (tag === undefined) return null;
  const tags = list(cell(row, category === 'replica' ? 'Tags' : 'Fits'));
  const badTag = tags.find((t) => !TAG_PATTERN.test(t));
  if (badTag !== undefined) return fail(row.line, `"${badTag}" isn't a tag (lower case words joined with -) or an ID`), null;
  if (tags.length === 0) return fail(row.line, `${name} needs ${category === 'replica' ? 'Tags' : 'Fits'}`), null;
  if (category === 'power') {
    const type = cell(row, 'Type').toLowerCase();
    if (!(type in POWER_TAGS)) return fail(row.line, `Type must be battery, gas or spring, not "${cell(row, 'Type')}"`), null;
    return { id, name, category, key: '', tags, power: { type: type as PowerType }, tag };
  }
  const key = cell(row, 'Key');
  const keys = KEYS_BY_CATEGORY[category];
  if (!keys.includes(key)) {
    return fail(row.line, `"${key}" isn't a ${category} Key${keys.length ? ` (one of ${keys.join(', ')})` : ' (there are none yet)'}`), null;
  }
  return { id, name, category, key, tags, tag };
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

/** The tag of a replica whose power source is built in (the Cyber Pistol's battery, M32): none is fitted to it. */
const BUILT_IN_POWER = 'built-in-power';

/** True if replica `asset` has its power source built in (tagged BUILT_IN_POWER). */
export function hasBuiltInPower(asset: Asset): boolean {
  return asset.tags.includes(BUILT_IN_POWER);
}
