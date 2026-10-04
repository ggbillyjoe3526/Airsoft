import { isAvailable } from '../config/content';
import type { ItemRef } from './collection';
import type { Pool } from './pool';

/**
 * The pool as the player and the bots see it (M35): every asset while Dev content is on, else only the public ones. The
 * Armory's collection, the bots' kits and Unlock all gear read this view; the full pool stays what saves are checked
 * against, so an owned dev item is kept while it is hidden. A filtered copy (a menu or match build's cost, never a frame's).
 */
export function contentPool(pool: Pool, devContent: boolean): Pool {
  if (devContent || pool.assets.every((a) => isAvailable(a.tag, false))) return pool;
  const assets = pool.assets.filter((a) => isAvailable(a.tag, false));
  return { ...pool, assets, byId: new Map(assets.map((a) => [a.id, a])) };
}

/** Whether item `ref` is of an asset tagged dev (an asset the pool doesn't list isn't). */
export function isDevItem(pool: Pool, ref: ItemRef): boolean {
  return pool.byId.get(ref.asset)?.tag === 'dev';
}

/** Whether any of `items` is dev gear: a match carrying it stays out of the records and pays nothing. */
export function itemsUseDev(pool: Pool, items: readonly (ItemRef | null)[]): boolean {
  return items.some((r) => r !== null && isDevItem(pool, r));
}
