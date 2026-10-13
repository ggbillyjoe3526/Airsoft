import { defaultScheme } from '../../config/schemes';
import { type Asset, replicaOf } from '../../pool/pool';
import { itemIcon } from './icons';
import type { PictureContext } from './kitStrip';
import { partSubject, PictureSlot, replicaSubject } from './menuPictures';

/** One item's kind, as an Armory card names it ("Optic"). */
export const KIND_LABELS: Readonly<Record<Asset['category'], string>> = {
  replica: 'Replica',
  power: 'Power source',
  optic: 'Optic',
  grip: 'Grip',
  laser: 'Laser',
  magazine: 'Magazine',
  barrel: 'Barrel',
  muzzle: 'Muzzle part',
  light: 'Light',
  grenade: 'Grenade',
};

/**
 * An item's picture (G3): a replica in its first colour scheme, a part or a power source (RM3) on its own, or the item's
 * drawing (a grenade, or no picture source at all).
 */
export function itemPicture(asset: Asset, context: PictureContext | null | undefined, className: string): PictureSlot {
  const slot = new PictureSlot(className);
  const realistic = context?.realistic() ?? false;
  const subject = asset.category === 'replica' ? replicaSubject(asset, defaultScheme(replicaOf(asset)), realistic) : partSubject(asset, realistic);
  slot.show(context?.pictures ?? null, subject, itemIcon(asset));
  return slot;
}
