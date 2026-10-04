import { BARRELS, type BarrelId, GRIPS, type GripId, MAGAZINES, type MagazineId, MUZZLES, type MuzzleId, NO_TUNE, type PartTune, type ReplicaParts } from '../config/attachments';
import { GAME_STATS } from '../config/gameStats';
import { LASERS, type LaserId } from '../config/lasers';
import { type OpticId, OPTICS } from '../config/optics';
import type { ReplicaConfig } from '../config/replicas';
import { NO_POWER_STATS, type PowerStats, type ScaledCategory, type ScaledStat, type TierShares } from '../config/statsFile';
import type { ItemRef } from './collection';
import { type Asset, type Pool, type RarityTier, replicaOf } from './pool';

/**
 * What the player's items make of a replica (M26b): its rarity, power source and laser worked into the replica the
 * player carries, and its optic, grip and magazine (with their rarity) as parts. Bots carry the replicas as they come.
 * Pure: the Loadout screen's readouts and the match use the same numbers. What each power source adds and what share of
 * a tier's Bonus each stat gets are stats.md's (M29), passed in so tests can try other numbers.
 */

/** The performance numbers kit maths reads: stats.md's power sources and tier shares. */
export interface KitStats {
  power: Readonly<Record<string, PowerStats>>;
  tierShares: TierShares;
}

/** The customisable places on a replica, besides its BB weight and hop-up (which aren't pooled). */
export type FitSlot = 'optic' | 'grip' | 'laser' | 'barrel' | 'muzzle' | 'magazine' | 'power';
export const FIT_SLOTS: readonly FitSlot[] = ['optic', 'grip', 'laser', 'barrel', 'muzzle', 'magazine', 'power'];

/** The asset category each fit slot takes. */
export const FIT_CATEGORY = {
  optic: 'optic',
  grip: 'grip',
  laser: 'laser',
  barrel: 'barrel',
  muzzle: 'muzzle',
  magazine: 'magazine',
  power: 'power',
} as const satisfies Record<FitSlot, Asset['category']>;

/** What is fitted to one replica: an item in each slot, or null for "as it comes" (the power slot is never empty in use). */
export type ReplicaFit = Record<FitSlot, ItemRef | null>;

export const EMPTY_FIT: ReplicaFit = { optic: null, grip: null, laser: null, barrel: null, muzzle: null, magazine: null, power: null };

/** One slot of the player's kit: the replica as carried, and what goes on it. */
export interface KitSlot {
  replica: ReplicaConfig;
  optic: OpticId | null;
  parts: ReplicaParts;
}

function tier(pool: Pool, ref: ItemRef | null): RarityTier | undefined {
  return ref ? pool.tiers.find((t) => t.id === ref.tier) : undefined;
}

/** The tier scaling category of an asset: a power source by its type; null for one no tier improves (a grenade). */
export function scaledCategory(asset: Asset): ScaledCategory | null {
  if (asset.category === 'power') return asset.power?.type ?? null;
  return asset.category === 'grenade' ? null : asset.category;
}

/** The tier's Bonus (0..1) an item brings to `stat` (its share in stats.md's Tier scaling); 0 for none. */
export function bonusOf(pool: Pool, ref: ItemRef | null, stat: ScaledStat, stats: KitStats = GAME_STATS): number {
  const asset = ref ? pool.byId.get(ref.asset) : undefined;
  const category = asset ? scaledCategory(asset) : null;
  return category ? (tier(pool, ref)?.bonus ?? 0) * (stats.tierShares[category][stat] ?? 0) : 0;
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

/** The fitted power source's stats.md numbers (none: no change) and its item, for its tier. */
function powerOf(pool: Pool, fit: ReplicaFit, stats: KitStats): { p: PowerStats; ref: ItemRef | null } {
  const power = fitted(pool, fit, 'power');
  return { p: (power && stats.power[power.id]) || NO_POWER_STATS, ref: power ? fit.power : null };
}

/** The fitted barrel's and muzzle part's keys, if the code knows them. */
function fittedBarrel(pool: Pool, fit: ReplicaFit): BarrelId | null {
  const key = fitted(pool, fit, 'barrel')?.key;
  return key && key in BARRELS ? (key as BarrelId) : null;
}

function fittedMuzzle(pool: Pool, fit: ReplicaFit): MuzzleId | null {
  const key = fitted(pool, fit, 'muzzle')?.key;
  return key && key in MUZZLES ? (key as MuzzleId) : null;
}

/**
 * The replica `item` (a replica asset at a tier) as carried with `fit`: tighter, quicker and stronger as its items say.
 * Energy: the replica's tier, its power source (its own Energy % and its tier), its barrel and muzzle part (M29b),
 * capped at the site limit. Rate of fire: the replica's tier and the power source's Fire rate % and tier. Kick: the
 * power source's Recoil %. Spread: the replica's tier, the laser and the barrel (each with its tier).
 */
export function kitReplica(pool: Pool, item: ItemRef, fit: ReplicaFit, stats: KitStats = GAME_STATS): ReplicaConfig {
  const base = replicaOf(pool.byId.get(item.asset)!);
  const better = (stat: ScaledStat, ref: ItemRef | null = item): number => 1 - bonusOf(pool, ref, stat, stats);
  const more = (stat: ScaledStat, ref: ItemRef | null = item): number => 1 + bonusOf(pool, ref, stat, stats);
  const laser = fittedLaser(pool, fit);
  const laserScale = laser ? LASERS[laser].spreadScale * better('spread', fit.laser) : 1;
  const barrel = fittedBarrel(pool, fit);
  const barrelScale = barrel ? BARRELS[barrel].spreadScale * better('spread', fit.barrel) : 1;
  const { p, ref } = powerOf(pool, fit, stats);
  const energy = energyFactor(pool, item, fit, stats);
  const rate = more('fireRate') * (1 + p.fireRate + bonusOf(pool, ref, 'fireRate', stats));
  return {
    ...base,
    name: pool.byId.get(item.asset)!.name,
    spreadDeg: base.spreadDeg * better('spread') * laserScale * barrelScale,
    reloadTime: base.reloadTime * better('reload'),
    drawTime: base.drawTime * better('draw'),
    muzzleEnergy: Math.min(base.energyLimit, base.muzzleEnergy * energy),
    fireRate: base.fireRate * rate,
    recoilDeg: base.recoilDeg * (1 + p.recoil),
  };
}

/** True if the site limit cut the energy `item` would shoot with on `fit` (the Loadout says so). */
export function energyCapped(pool: Pool, item: ItemRef, fit: ReplicaFit, stats: KitStats = GAME_STATS): boolean {
  const base = replicaOf(pool.byId.get(item.asset)!);
  return base.muzzleEnergy * energyFactor(pool, item, fit, stats) > base.energyLimit;
}

/** What the replica's tier, its power source, barrel and muzzle part multiply its energy by, before the site limit. */
function energyFactor(pool: Pool, item: ItemRef, fit: ReplicaFit, stats: KitStats): number {
  const { p, ref } = powerOf(pool, fit, stats);
  const barrel = fittedBarrel(pool, fit);
  const muzzle = fittedMuzzle(pool, fit);
  return (
    (1 + bonusOf(pool, item, 'energy', stats)) *
    (1 + p.energy + bonusOf(pool, ref, 'energy', stats)) *
    (1 + (barrel ? BARRELS[barrel].energy : 0)) *
    (1 + (muzzle ? MUZZLES[muzzle].energy : 0))
  );
}

/** The tuning the fitted optic's, grip's, barrel's, muzzle part's and magazine's tiers bring. */
export function partTune(pool: Pool, fit: ReplicaFit, stats: KitStats = GAME_STATS): PartTune {
  const better = (slot: FitSlot, stat: ScaledStat): number => (fitted(pool, fit, slot) ? 1 - bonusOf(pool, fit[slot], stat, stats) : 1);
  const raise = better('optic', 'raise') * better('grip', 'raise') * better('barrel', 'raise') * better('muzzle', 'raise');
  const shake = better('grip', 'shake');
  const draw = better('grip', 'draw') * better('barrel', 'draw') * better('muzzle', 'draw');
  const reload = better('magazine', 'reload');
  if (raise === 1 && shake === 1 && draw === 1 && reload === 1) return NO_TUNE;
  return { raiseScale: raise, shakeScale: shake, drawScale: draw, reloadScale: reload };
}

/** One kit slot from a replica item and what is fitted to it. */
export function kitSlot(pool: Pool, item: ItemRef, fit: ReplicaFit, stats: KitStats = GAME_STATS): KitSlot {
  const replica = kitReplica(pool, item, fit, stats);
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
      barrel: fittedBarrel(pool, fit),
      muzzle: fittedMuzzle(pool, fit),
      tune: partTune(pool, fit, stats),
    },
  };
}
