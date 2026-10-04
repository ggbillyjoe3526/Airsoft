import { factoryParts } from '../config/attachments';
import { RANDOM_LOADOUT } from '../config/bots';
import type { ReplicaConfig } from '../config/replicas';
import { fitOptics, fitParts } from '../sim/armament';
import { type Character, createCharacter } from '../sim/character';
import { createRng, rngNext, type RngState } from '../sim/rng';
import { vec3 } from '../sim/vec';
import { drawTier } from './armory';
import type { ItemRef } from './collection';
import { EMPTY_FIT, FIT_CATEGORY, FIT_SLOTS, kitSlot, type KitSlot, type ReplicaFit } from './kit';
import { type Asset, assetOfReplica, fits, type Pool } from './pool';

/**
 * A bot's own loadout (M29b): on a difficulty that rolls them (config/bots.ts BOT_LOADOUTS), each opponent carries its
 * replicas at a tier drawn by the Armory's odds, with a power source and, slot by slot, a part or none, every one of them
 * something that fits and at its own drawn tier. BB weight and hop-up stay as the replica comes. Seeded by the match's
 * seed and the bot's id, so a match replays the same kits. Pure.
 */

/** The seed for bot `id`'s kit in a match seeded `seed`: each bot's rolls are its own. */
export function botKitSeed(seed: number, id: number): number {
  return (seed ^ Math.imul(id + 1, 0x9e3779b1)) >>> 0;
}

function pick<T>(list: readonly T[], rng: RngState): T | undefined {
  return list.length > 0 ? list[Math.min(list.length - 1, Math.floor(rngNext(rng) * list.length))] : undefined;
}

function drawItem(pool: Pool, asset: Asset, rng: RngState): ItemRef {
  return { asset: asset.id, tier: drawTier(pool.tiers, rng).id };
}

/** A random fit for replica asset `replica`: a power source always (when one fits), each other slot a part or none. */
export function randomFit(pool: Pool, replica: Asset, rng: RngState, partChance: number = RANDOM_LOADOUT.partChance): ReplicaFit {
  const fit: ReplicaFit = { ...EMPTY_FIT };
  for (const slot of FIT_SLOTS) {
    const options = pool.assets.filter((a) => a.category === FIT_CATEGORY[slot] && fits(a, replica));
    // The roll is made whatever the options, so one slot's choices never shift the next slot's draws.
    const wanted = slot === 'power' || rngNext(rng) < partChance;
    const asset = pick(options, rng);
    const item = asset ? drawItem(pool, asset, rng) : null;
    fit[slot] = wanted ? item : null;
  }
  return fit;
}

/**
 * A rolled kit for `loadout` (the replicas a bot carries, by slot), seeded `seed`. A replica the pool has no row for is
 * carried as it comes, with its factory parts.
 */
export function randomKit(pool: Pool, loadout: readonly ReplicaConfig[], seed: number, partChance: number = RANDOM_LOADOUT.partChance): KitSlot[] {
  const rng = createRng(seed);
  return loadout.map((replica) => {
    const asset = assetOfReplica(pool, replica);
    if (!asset || pool.tiers.length === 0) return { replica, optic: null, parts: factoryParts(replica) };
    const item = drawItem(pool, asset, rng);
    return kitSlot(pool, item, randomFit(pool, asset, rng, partChance));
  });
}

/** A character carrying `kit`: its replicas as the kit makes them, with the kit's optics and parts fitted. */
export function kittedCharacter(id: number, team: number, kit: readonly KitSlot[]): Character {
  const c = createCharacter(id, vec3(), 0, kit.map((s) => s.replica), team);
  fitOptics(c.armament, kit.map((s) => s.optic));
  fitParts(c.armament, kit.map((s) => s.parts));
  return c;
}
