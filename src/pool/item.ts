import type { Pool } from './pool';

/**
 * One item the player can carry or fit (LV1): a pool asset, by its six-digit id. There is one of each (levels unlock
 * items for good; no copies, no rarity), so an item is its asset. Kept as its own type so the Loadout's picks, the kit
 * maths and the bots' kits say what they hold, and so a skin can join it later without touching every caller.
 */
export interface ItemRef {
  asset: string;
}

/** What a pick is saved as: the asset id ("000002"). */
export function itemKey(ref: ItemRef): string {
  return ref.asset;
}

/**
 * A saved pick → its item, or null if it isn't one. Picks saved before LV1 carried a rarity tier ("000002@epic"): the
 * tier is dropped, so a returning player's Loadout comes back as far as their levels allow.
 */
export function parseItemKey(key: string): ItemRef | null {
  const m = /^(\d{6})(?:@[a-zA-Z0-9]+)?$/.exec(key);
  return m ? { asset: m[1]! } : null;
}

/** An item the pool still has (an asset pool.md no longer lists stays in the save, never offered). */
export function inPool(pool: Pool, ref: ItemRef): boolean {
  return pool.byId.has(ref.asset);
}
