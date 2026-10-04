import { overStored } from '../save/overStored';
import { browserStorage } from '../settings/storage';
import type { Pool } from './pool';

/**
 * What the player owns from the asset pool (M26a): a count of each item (an asset at a rarity tier), and their Field
 * Credits and Tokens (M26c spends them). Plain data, saved in the browser under its own key; every read and write
 * tolerates blocked storage and garbage, as the settings do.
 */
export interface Collection {
  /** Copies owned of each item, by itemKey ("000002@epic"). Items not owned are absent. */
  owned: Record<string, number>;
  /** Field Credits (whole numbers). */
  fc: number;
  /** Tokens (whole numbers). */
  tokens: number;
  /** The Shots' random generator (src/sim/rng.ts state), kept so the draws carry on from visit to visit. */
  seed: number;
  /**
   * Pity counts (audit POOL-01): Shots taken since the last one that held each pity rule's tier or rarer, by tier id.
   * Optional in the save (older saves have none: counted from 0).
   */
  pity?: Record<string, number>;
  /**
   * The save's revision (audit POOL-02): raised by every save, so a copy can tell that another tab saved after it was
   * read. Optional in the save (older saves count as 0).
   */
  rev?: number;
}

export const COLLECTION_KEY = 'airsoft.collection';
export const COLLECTION_VERSION = 1;

/** One item: an asset at a rarity tier. */
export interface ItemRef {
  asset: string;
  tier: string;
}

export function itemKey(asset: string, tier: string): string {
  return `${asset}@${tier}`;
}

/** "000002@epic" → its parts, or null if it isn't an item key. */
export function parseItemKey(key: string): ItemRef | null {
  const m = /^(\d{6})@([a-zA-Z0-9]+)$/.exec(key);
  return m ? { asset: m[1]!, tier: m[2]! } : null;
}

/** An item the pool still has (its asset and tier both exist). */
export function inPool(pool: Pool, ref: ItemRef): boolean {
  return pool.byId.has(ref.asset) && pool.tiers.some((t) => t.id === ref.tier);
}

/** A new player's collection: the starters at the lowest tier, nothing to spend. */
export function newCollection(pool: Pool, seed: number): Collection {
  const c: Collection = { owned: {}, fc: 0, tokens: 0, seed: seed >>> 0, pity: {}, rev: 0 };
  grantStarters(c, pool);
  return c;
}

/** Gives the player any starter they lack (one added to pool.md later reaches existing saves too). */
export function grantStarters(c: Collection, pool: Pool): void {
  const lowest = pool.tiers[0]!.id;
  for (const a of pool.assets) {
    if (!a.starter) continue;
    const owns = pool.tiers.some((t) => (c.owned[itemKey(a.id, t.id)] ?? 0) > 0);
    if (!owns) c.owned[itemKey(a.id, lowest)] = 1;
  }
}

export function ownedCount(c: Collection, ref: ItemRef): number {
  return c.owned[itemKey(ref.asset, ref.tier)] ?? 0;
}

/** Adds `n` copies of an item. */
export function addItem(c: Collection, ref: ItemRef, n = 1): void {
  const key = itemKey(ref.asset, ref.tier);
  c.owned[key] = (c.owned[key] ?? 0) + n;
}

/** Every item owned that the pool still has, in pool order then tier order (commonest first). */
export function ownedItems(c: Collection, pool: Pool): ItemRef[] {
  const out: ItemRef[] = [];
  for (const a of pool.assets) for (const t of pool.tiers) if ((c.owned[itemKey(a.id, t.id)] ?? 0) > 0) out.push({ asset: a.id, tier: t.id });
  return out;
}

function wholeNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER ? v : undefined;
}

/** A balance: a whole number, one past the largest exact one held at that (audit POOL-19: never dropped to 0). */
function balance(v: unknown): number | undefined {
  return typeof v === 'number' && v > Number.MAX_SAFE_INTEGER && Number.isFinite(v) ? Number.MAX_SAFE_INTEGER : wholeNumber(v);
}

/** The pity counts of a save: whole numbers by tier id; anything else is left out. */
function pityCounts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [tier, n] of Object.entries(v as Record<string, unknown>)) {
    const count = wholeNumber(n);
    if (/^[a-zA-Z0-9]+$/.test(tier) && count !== undefined) out[tier] = count;
  }
  return out;
}

/** The stored collection's fields, or null if nothing valid is stored (or storage is blocked). */
function readStored(storage: Storage | null, fallbackSeed: number): Collection | null {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(COLLECTION_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== COLLECTION_VERSION) return null;
    const r = raw as Record<string, unknown>;
    const owned: Record<string, number> = {};
    if (r.owned && typeof r.owned === 'object') {
      for (const [key, n] of Object.entries(r.owned as Record<string, unknown>)) {
        const count = wholeNumber(n);
        if (parseItemKey(key) && count) owned[key] = count;
      }
    }
    return {
      owned,
      fc: balance(r.fc) ?? 0,
      tokens: balance(r.tokens) ?? 0,
      seed: wholeNumber(r.seed) ?? fallbackSeed >>> 0,
      pity: pityCounts(r.pity),
      rev: wholeNumber(r.rev) ?? 0,
    };
  } catch {
    // Unreadable.
    return null;
  }
}

/**
 * The saved collection, or a new one (starters only) if nothing valid is saved or storage is blocked. Items the pool no
 * longer has are kept in the save (a row taken out of pool.md and put back comes back owned) but never shown.
 */
export function loadCollection(pool: Pool, seed: number, storage = browserStorage()): Collection {
  const c = readStored(storage, seed);
  if (!c) return newCollection(pool, seed);
  grantStarters(c, pool);
  return c;
}

/**
 * Before changing `c` (audit POOL-02): if another tab saved the collection since `c` was read or saved (the stored
 * `rev` is newer), `c` takes the stored one's contents in place (it is shared, so it is never replaced), so a spend or
 * an earning there is not overwritten by this tab's older copy. True if it changed.
 */
export function syncCollection(c: Collection, pool: Pool, storage = browserStorage()): boolean {
  const stored = readStored(storage, c.seed);
  if (!stored || (stored.rev ?? 0) <= (c.rev ?? 0)) return false;
  Object.assign(c, stored);
  grantStarters(c, pool);
  return true;
}

/**
 * Saves the collection as the next revision. Not over a newer one another tab saved since `c` was read or synced
 * (audit POOL-02): that would undo its Shots or earnings; false then, as when storage is full or blocked (the change
 * lasts for the visit).
 */
export function saveCollection(c: Collection, storage = browserStorage()): boolean {
  if (!storage) return false;
  try {
    if ((readStored(storage, c.seed)?.rev ?? 0) > (c.rev ?? 0)) return false;
    c.rev = (c.rev ?? 0) + 1;
    // Fields a newer build added stay (M31).
    storage.setItem(COLLECTION_KEY, JSON.stringify(overStored(storage, COLLECTION_KEY, { version: COLLECTION_VERSION, ...c })));
    return true;
  } catch {
    // Full or blocked: kept for this visit.
    return false;
  }
}
