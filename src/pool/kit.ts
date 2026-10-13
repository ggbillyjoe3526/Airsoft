import { BARRELS, type BarrelId, GRIPS, type GripId, MAGAZINES, type MagazineId, MUZZLES, type MuzzleId, type ReplicaParts } from '../config/attachments';
import { GAME_STATS } from '../config/gameStats';
import { LASERS, type LaserId } from '../config/lasers';
import { type OpticId, OPTICS } from '../config/optics';
import type { ReplicaConfig } from '../config/replicas';
import { isLightId, type LightId } from '../config/torches';
import { NO_POWER_STATS, type PowerStats } from '../config/statsFile';
import type { ItemRef } from './item';
import { type Asset, type Pool, replicaOf } from './pool';

/**
 * What the player's items make of a replica (M26b): its power source, laser, barrel and muzzle part worked into the
 * replica the player carries, and its optic, grip and magazine as parts. Pure: the Loadout screen's readouts, the bots'
 * kits and the match use the same numbers. What each power source adds is stats.md's (M29), passed in so tests can try
 * other numbers. One of each item, so an item is what its stats.md row says (LV1: no rarity tiers).
 */

/** The performance numbers kit maths reads: stats.md's power sources. */
export interface KitStats {
  power: Readonly<Record<string, PowerStats>>;
}

/**
 * The customisable places on a replica, besides its BB weight and hop-up (which aren't pooled). The weapon light (M33h)
 * comes last. A bot kit never fits one: bots carry it by rule on a night field (pool/botKit.ts botLight).
 */
export type FitSlot = 'optic' | 'grip' | 'laser' | 'barrel' | 'muzzle' | 'magazine' | 'power' | 'light';
export const FIT_SLOTS: readonly FitSlot[] = ['optic', 'grip', 'laser', 'barrel', 'muzzle', 'magazine', 'power', 'light'];

/** The asset category each fit slot takes. */
export const FIT_CATEGORY = {
  optic: 'optic',
  grip: 'grip',
  laser: 'laser',
  barrel: 'barrel',
  muzzle: 'muzzle',
  magazine: 'magazine',
  power: 'power',
  light: 'light',
} as const satisfies Record<FitSlot, Asset['category']>;

/** What is fitted to one replica: an item in each slot, or null for "as it comes" (the power slot is never empty in use). */
export type ReplicaFit = Record<FitSlot, ItemRef | null>;

export const EMPTY_FIT: ReplicaFit = { optic: null, grip: null, laser: null, barrel: null, muzzle: null, magazine: null, power: null, light: null };

/** One slot of the player's kit: the replica as carried, and what goes on it. */
export interface KitSlot {
  replica: ReplicaConfig;
  optic: OpticId | null;
  parts: ReplicaParts;
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

/** The fitted power source's stats.md numbers (none: no change). */
function powerOf(pool: Pool, fit: ReplicaFit, stats: KitStats): PowerStats {
  const power = fitted(pool, fit, 'power');
  return (power && stats.power[power.id]) || NO_POWER_STATS;
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

/** The fitted weapon light's key (M33h), if the code knows it. */
function fittedLight(pool: Pool, fit: ReplicaFit): LightId | null {
  const key = fitted(pool, fit, 'light')?.key;
  return isLightId(key) ? key : null;
}

/**
 * The replica `item` as carried with `fit`. Energy: its power source's Energy %, its barrel and muzzle part (M29b),
 * capped at the site limit. Rate of fire: the power source's Fire rate %. Kick: the power source's Recoil %. Spread:
 * the laser and the barrel.
 */
export function kitReplica(pool: Pool, item: ItemRef, fit: ReplicaFit, stats: KitStats = GAME_STATS): ReplicaConfig {
  const base = replicaOf(pool.byId.get(item.asset)!);
  const laser = fittedLaser(pool, fit);
  const barrel = fittedBarrel(pool, fit);
  const p = powerOf(pool, fit, stats);
  return {
    ...base,
    name: pool.byId.get(item.asset)!.name,
    spreadDeg: base.spreadDeg * (laser ? LASERS[laser].spreadScale : 1) * (barrel ? BARRELS[barrel].spreadScale : 1),
    muzzleEnergy: Math.min(base.energyLimit, base.muzzleEnergy * energyFactor(pool, fit, stats)),
    fireRate: base.fireRate * (1 + p.fireRate),
    recoilDeg: base.recoilDeg * (1 + p.recoil),
  };
}

/** True if the site limit cut the energy `item` would shoot with on `fit` (the Loadout says so). */
export function energyCapped(pool: Pool, item: ItemRef, fit: ReplicaFit, stats: KitStats = GAME_STATS): boolean {
  return uncappedEnergy(pool, item, fit, stats) > replicaOf(pool.byId.get(item.asset)!).energyLimit;
}

/** The energy (J) `item` would shoot with on `fit` before the site limit stops it (the content toolkit's grid, CT1). */
export function uncappedEnergy(pool: Pool, item: ItemRef, fit: ReplicaFit, stats: KitStats = GAME_STATS): number {
  return replicaOf(pool.byId.get(item.asset)!).muzzleEnergy * energyFactor(pool, fit, stats);
}

/** What the power source, barrel and muzzle part multiply a replica's energy by, before the site limit. */
function energyFactor(pool: Pool, fit: ReplicaFit, stats: KitStats): number {
  const barrel = fittedBarrel(pool, fit);
  const muzzle = fittedMuzzle(pool, fit);
  return (1 + powerOf(pool, fit, stats).energy) * (1 + (barrel ? BARRELS[barrel].energy : 0)) * (1 + (muzzle ? MUZZLES[muzzle].energy : 0));
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
      light: fittedLight(pool, fit),
    },
  };
}
