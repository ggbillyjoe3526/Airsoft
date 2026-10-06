import { defaultScheme } from '../../config/schemes';
import type { ItemRef } from '../../pool/collection';
import { type Asset, type Pool, replicaOf } from '../../pool/pool';
import { tierLine } from '../performanceSheet';
import { itemIcon } from './icons';
import type { PictureContext } from './kitStrip';
import { el } from './menuParts';
import { partSubject, PictureSlot, replicaSubject } from './menuPictures';

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
 * An item's picture (G3): a replica in its first colour scheme, a part on its own, or the item's drawing (a power source,
 * a grenade, or no picture source at all).
 */
export function itemPicture(asset: Asset, context: PictureContext | null | undefined, className: string): PictureSlot {
  const slot = new PictureSlot(className);
  const realistic = context?.realistic() ?? false;
  const subject = asset.category === 'replica' ? replicaSubject(asset, defaultScheme(replicaOf(asset)), realistic) : partSubject(asset, realistic);
  slot.show(context?.pictures ?? null, subject, itemIcon(asset));
  return slot;
}

/**
 * An item as the Armory reveals it (M26c; shared with Extraction's haul on the match summary, M44): its picture (G3),
 * its category, its name, its tier in the tier's colour (`data-tier`, style.css), what the tier adds, and `note` (New,
 * Spare …) at the bottom.
 */
export function itemTile(pool: Pool, item: ItemRef, note: string, context?: PictureContext | null): HTMLDivElement {
  const asset = pool.byId.get(item.asset)!;
  const tile = el('div', 'item-tile armory-tile');
  tile.dataset.tier = item.tier;
  const kind = el('span', 'item-note item-kind', CATEGORY_LABELS[asset.category]);
  tile.append(itemPicture(asset, context, 'reveal-pic').root, kind, el('span', 'item-name', asset.name), el('span', 'item-tier', tierLabel(pool, item)));
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
