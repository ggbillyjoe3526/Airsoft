import type { ItemRef } from '../../pool/collection';
import type { Asset, Pool } from '../../pool/pool';
import { tierLine } from '../performanceSheet';
import { itemIcon } from './icons';
import { el } from './menuParts';

/** The category names the collection list groups items under, in the pool's order. */
export const CATEGORY_LABELS: Readonly<Record<Asset['category'], string>> = {
  replica: 'Replicas',
  power: 'Power sources',
  optic: 'Optics',
  grip: 'Grips',
  laser: 'Lasers',
  magazine: 'Magazines',
  barrel: 'Barrels',
  muzzle: 'Muzzle parts',
  light: 'Lights',
  grenade: 'Grenades',
};

/** An item's tier name ("Very Rare"), or its id if the pool has no such tier. */
export function tierLabel(pool: Pool, item: ItemRef): string {
  return pool.tiers.find((t) => t.id === item.tier)?.label ?? item.tier;
}

/**
 * An item as the Armory reveals it (M26c; shared with Extraction's haul on the match summary, M44): its category with
 * its drawing at the top, its name, its tier in the tier's colour (`data-tier`, style.css), what the tier adds, and
 * `note` (New, Spare …) at the bottom.
 */
export function itemTile(pool: Pool, item: ItemRef, note: string): HTMLDivElement {
  const asset = pool.byId.get(item.asset)!;
  const tile = el('div', 'item-tile armory-tile');
  tile.dataset.tier = item.tier;
  // The category with its drawing at the top (FA13), what it is at the bottom: tiles with a one-line name keep the same head.
  const kind = el('span', 'item-note item-kind');
  kind.innerHTML = itemIcon(asset);
  kind.append(el('span', '', CATEGORY_LABELS[asset.category]));
  tile.append(kind, el('span', 'item-name', asset.name), el('span', 'item-tier', tierLabel(pool, item)));
  const adds = tierLine(pool, item);
  if (adds) {
    // A square tile holds three lines of it; the whole line is on hover and in the collection list.
    const line = el('span', 'item-note tier-adds', adds);
    line.title = adds;
    tile.append(line);
  }
  tile.append(el('span', 'item-note', note));
  return tile;
}
