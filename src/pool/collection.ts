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
}

const COLLECTION_KEY = 'airsoft.collection';
const COLLECTION_VERSION = 1;

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
  const c: Collection = { owned: {}, fc: 0, tokens: 0, seed: seed >>> 0 };
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

/**
 * The saved collection, or a new one (starters only) if nothing valid is saved or storage is blocked. Items the pool no
 * longer has are kept in the save (a row taken out of pool.md and put back comes back owned) but never shown.
 */
export function loadCollection(pool: Pool, seed: number, storage = browserStorage()): Collection {
  let c: Collection | null = null;
  try {
    const raw: unknown = JSON.parse(storage?.getItem(COLLECTION_KEY) ?? 'null');
    if (raw && typeof raw === 'object' && (raw as { version?: unknown }).version === COLLECTION_VERSION) {
      const r = raw as Record<string, unknown>;
      const owned: Record<string, number> = {};
      if (r.owned && typeof r.owned === 'object') {
        for (const [key, n] of Object.entries(r.owned as Record<string, unknown>)) {
          const count = wholeNumber(n);
          if (parseItemKey(key) && count) owned[key] = count;
        }
      }
      c = { owned, fc: wholeNumber(r.fc) ?? 0, tokens: wholeNumber(r.tokens) ?? 0, seed: wholeNumber(r.seed) ?? seed >>> 0 };
    }
  } catch {
    // Unreadable: a new collection.
  }
  if (!c) return newCollection(pool, seed);
  grantStarters(c, pool);
  return c;
}

/** Saves the collection. Non-critical: with storage blocked it lasts for the visit. */
export function saveCollection(c: Collection, storage = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(COLLECTION_KEY, JSON.stringify({ version: COLLECTION_VERSION, ...c }));
  } catch {
    // Full or blocked: kept for this visit.
  }
}
