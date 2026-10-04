import { GRIPS, type GripId, MAGAZINES, type MagazineId, NO_TUNE, type PartTune, type ReplicaParts } from '../config/attachments';
import { LASERS, type LaserId } from '../config/lasers';
import { type OpticId, OPTICS } from '../config/optics';
import type { ReplicaConfig } from '../config/replicas';
import type { ItemRef } from './collection';
import { type Asset, type Pool, type RarityTier, replicaOf } from './pool';

/**
 * What the player's items make of a replica (M26b): its rarity, power source and laser worked into the replica the
 * player carries, and its optic, grip and magazine (with their rarity) as parts. Bots carry the replicas as they come.
 * Pure: the Loadout screen's readouts and the match use the same numbers.
 */

/** The customisable places on a replica, besides its BB weight and hop-up (which aren't pooled). */
export type FitSlot = 'optic' | 'grip' | 'laser' | 'magazine' | 'power';
export const FIT_SLOTS: readonly FitSlot[] = ['optic', 'grip', 'laser', 'magazine', 'power'];

/** The asset category each fit slot takes. */
export const FIT_CATEGORY = { optic: 'optic', grip: 'grip', laser: 'laser', magazine: 'magazine', power: 'power' } as const satisfies Record<FitSlot, Asset['category']>;

/** What is fitted to one replica: an item in each slot, or null for "as it comes" (the power slot is never empty in use). */
export type ReplicaFit = Record<FitSlot, ItemRef | null>;

export const EMPTY_FIT: ReplicaFit = { optic: null, grip: null, laser: null, magazine: null, power: null };

/**
 * How much of a tier's Bonus % each category gets (pool.md's "What the Bonus % improves" table explains these): a
 * replica and an optic or magazine take it in full, a power source, grip or laser half.
 */
export const RARITY_SHARE: Readonly<Record<Asset['category'], number>> = {
  replica: 1,
  power: 0.5,
  optic: 1,
  grip: 0.5,
  laser: 0.5,
  magazine: 1,
  grenade: 0,
};

/** One slot of the player's kit: the replica as carried, and what goes on it. */
export interface KitSlot {
  replica: ReplicaConfig;
  optic: OpticId | null;
  parts: ReplicaParts;
}

function tier(pool: Pool, ref: ItemRef | null): RarityTier | undefined {
  return ref ? pool.tiers.find((t) => t.id === ref.tier) : undefined;
}

/** The bonus (0..1) an item brings, by its tier and its asset's category; 0 for none. */
export function bonusOf(pool: Pool, ref: ItemRef | null): number {
  const asset = ref ? pool.byId.get(ref.asset) : undefined;
  return asset ? (tier(pool, ref)?.bonus ?? 0) * RARITY_SHARE[asset.category] : 0;
}

/** The asset behind a fitted item, if it is in the pool and of the slot's category. */
function fitted(pool: Pool, fit: ReplicaFit, slot: FitSlot): Asset | undefined {
  const ref = fit[slot];
  const asset = ref ? pool.byId.get(ref.asset) : undefined;
  return asset?.category === FIT_CATEGORY[slot] ? asset : undefined;
}

/** The fitted laser's config, if its key is one the code knows (pool.ts checks keys, but a stale save could differ). */
function fittedLaser(pool: Pool, fit: ReplicaFit): LaserId | null {
  const key = fitted(pool, fit, 'laser')?.key;
  return key && key in LASERS ? (key as LaserId) : null;
}

/** The replica `item` (a replica asset at a tier) as carried with `fit`: tighter, quicker and stronger as its items say. */
export function kitReplica(pool: Pool, item: ItemRef, fit: ReplicaFit): ReplicaConfig {
  const base = replicaOf(pool.byId.get(item.asset)!);
  const b = bonusOf(pool, item);
  const laser = fittedLaser(pool, fit);
  const laserScale = laser ? LASERS[laser].spreadScale * (1 - bonusOf(pool, fit.laser)) : 1;
  const power = fitted(pool, fit, 'power');
  const boost = power?.power ? 1 + power.power.boost + bonusOf(pool, fit.power) : 1;
  return {
    ...base,
    name: pool.byId.get(item.asset)!.name,
    spreadDeg: base.spreadDeg * (1 - b) * laserScale,
    reloadTime: base.reloadTime * (1 - b),
    drawTime: base.drawTime * (1 - b),
    muzzleEnergy: base.muzzleEnergy * boost,
    fireRate: power?.power?.type === 'battery' ? base.fireRate * boost : base.fireRate,
  };
}

/** The tuning the fitted optic's, grip's and magazine's tiers bring. */
export function partTune(pool: Pool, fit: ReplicaFit): PartTune {
  const optic = fitted(pool, fit, 'optic') ? 1 - bonusOf(pool, fit.optic) : 1;
  const grip = fitted(pool, fit, 'grip') ? 1 - bonusOf(pool, fit.grip) : 1;
  const mag = fitted(pool, fit, 'magazine') ? 1 - bonusOf(pool, fit.magazine) : 1;
  if (optic === 1 && grip === 1 && mag === 1) return NO_TUNE;
  return { raiseScale: optic * grip, shakeScale: grip, drawScale: grip, reloadScale: mag };
}

/** One kit slot from a replica item and what is fitted to it. */
export function kitSlot(pool: Pool, item: ItemRef, fit: ReplicaFit): KitSlot {
  const replica = kitReplica(pool, item, fit);
  const optic = fitted(pool, fit, 'optic');
  const grip = fitted(pool, fit, 'grip');
  const mag = fitted(pool, fit, 'magazine');
  const laser = fittedLaser(pool, fit);
  return {
    replica,
    optic: optic && optic.key in OPTICS ? (optic.key as OpticId) : null,
    parts: {
      grip: grip && grip.key in GRIPS ? (grip.key as GripId) : 'none',
      magazine: mag && mag.key in MAGAZINES ? (mag.key as MagazineId) : replica.magazines[0]!,
      laser,
      tune: partTune(pool, fit),
    },
  };
}
