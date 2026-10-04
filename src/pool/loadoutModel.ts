import { BOT_GLOW_BBS, bbsGlow, DEFAULT_GLOW_BBS, GLOW_BB_CHOICES, type GlowBBs } from '../config/glowBBs';
import { HOP_UP, LOADOUT, type ReplicaConfig, validBbWeight } from '../config/replicas';
import { loadSetting, numberIn, oneOf, saveSetting } from '../settings/storage';
import { type Collection, inPool, type ItemRef, itemKey, parseItemKey } from './collection';
import { EMPTY_FIT, energyCapped, FIT_CATEGORY, FIT_SLOTS, type FitSlot, type KitSlot, kitSlot, type ReplicaFit } from './kit';
import { type Asset, fits, type Pool, replicaOf } from './pool';

/**
 * The player's loadout (M26b): which owned replica is in each gear slot, what is fitted to each replica, and each
 * replica's BB weight and hop-up dial. Saved in the settings store as the player changes it; read back against what
 * they own now, so anything no longer owned (or no longer fitting, after a pool.md edit) falls back to a default.
 * No DOM: the Loadout screen shows it, the game builds each match's kit from it.
 */

/** The gear slots that hold a replica, top to bottom (the Grenades slot under them waits for grenades, v0.3). */
export type GearSlot = 'primary' | 'secondary';
export const GEAR_SLOTS: readonly GearSlot[] = ['primary', 'secondary'];

/** What a match or the range is given for the player (bots carry config/replicas.ts LOADOUT as it comes). */
export interface PlayerKit {
  /** By gear slot: the replica as carried, its optic and parts. */
  slots: readonly KitSlot[];
  /** Each slot's hop-up dial and BB weight (grams). */
  hopUps: readonly number[];
  bbWeights: readonly number[];
  /** Each slot's Glowing BBs choice (M33b); the session resolves it against the field's day or night. */
  glowBBs: readonly GlowBBs[];
}

/**
 * Whose BBs glow on a field played at night (`night`) or by day (M33b): the player's by gear slot from their kit, and
 * the bots' the default way (BOT_GLOW_BBS).
 */
export function bbGlowFor(kit: PlayerKit, night: boolean): { player: boolean[]; others: boolean } {
  return { player: kit.glowBBs.map((g) => bbsGlow(g, night)), others: bbsGlow(BOT_GLOW_BBS, night) };
}

/** What the player can equip: the collection's items, or (Dev settings, M26d) everything. */
export interface Ownership {
  owns(ref: ItemRef): boolean;
  /**
   * True while everything is unlocked (M26d): picks are then saved apart from the real ones (under `equip.dev.` and
   * `fit.dev.`), starting from them, so turning Unlock all gear off brings back the loadout the player owns.
   */
  sandboxed?(): boolean;
}

export function collectionOwnership(collection: () => Collection): Ownership {
  return { owns: (ref) => (collection().owned[itemKey(ref.asset, ref.tier)] ?? 0) > 0 };
}

/** The collection's items, or, while `unlockAll()` (Dev settings → Unlock all gear, M26d), every asset at every tier. */
export function gameOwnership(pool: Pool, collection: () => Collection, unlockAll: () => boolean): Ownership {
  const owned = collectionOwnership(collection);
  return { owns: (ref) => (unlockAll() ? inPool(pool, ref) : owned.owns(ref)), sandboxed: unlockAll };
}

const NONE = 'none';

type Pick = `equip.${string}` | `fit.${string}`;

/** `equip.primary` → `equip.dev.primary`: where a pick made with everything unlocked is kept. */
function sandboxField(field: Pick): Pick {
  const dot = field.indexOf('.');
  return `${field.slice(0, dot)}.dev.${field.slice(dot + 1)}` as Pick;
}

export class LoadoutModel {
  constructor(
    readonly pool: Pool,
    private readonly ownership: Ownership,
  ) {}

  /** Every item owned of the given assets, rarest tier first within each asset (pool order between assets). */
  ownedItems(filter: (a: Asset) => boolean): ItemRef[] {
    const out: ItemRef[] = [];
    for (const a of this.pool.assets) {
      if (!filter(a)) continue;
      for (let t = this.pool.tiers.length - 1; t >= 0; t--) {
        const ref = { asset: a.id, tier: this.pool.tiers[t]!.id };
        if (this.ownership.owns(ref)) out.push(ref);
      }
    }
    return out;
  }

  /** The replicas the player can put in a gear slot (any replica goes in either slot). */
  replicaChoices(): ItemRef[] {
    return this.ownedItems((a) => a.category === 'replica');
  }

  /** The replica item in each gear slot (null only if the player owns no replica for it). */
  equipped(): (ItemRef | null)[] {
    const out: (ItemRef | null)[] = [];
    GEAR_SLOTS.forEach((slot, i) => {
      const used = new Set(out.map((r) => r?.asset));
      const raw = this.readPick(`equip.${slot}`);
      const saved = raw ? parseItemKey(raw) : null;
      if (saved && this.isReplica(saved) && this.ownership.owns(saved) && !used.has(saved.asset)) return void out.push(saved);
      out.push(this.defaultReplica(LOADOUT[i], used));
    });
    return out;
  }

  /**
   * Puts `ref` (an owned replica item) in `slot`. If the other slot holds the same replica, the two swap, so a replica
   * is never in both.
   */
  equip(slot: GearSlot, ref: ItemRef): void {
    const now = this.equipped();
    const i = GEAR_SLOTS.indexOf(slot);
    const other = now.findIndex((r, j) => j !== i && r?.asset === ref.asset);
    if (other >= 0 && now[i]) this.savePick(`equip.${GEAR_SLOTS[other]!}`, itemKey(now[i]!.asset, now[i]!.tier));
    this.savePick(`equip.${slot}`, itemKey(ref.asset, ref.tier));
  }

  /** What is fitted to the replica asset `replicaId`: each slot's item if still owned and fitting, else its default. */
  fitOf(replicaId: string): ReplicaFit {
    const replica = this.pool.byId.get(replicaId);
    const fit: ReplicaFit = { ...EMPTY_FIT };
    if (!replica) return fit;
    for (const slot of FIT_SLOTS) {
      const raw = this.readPick(`fit.${replicaId}.${slot}`);
      const saved = raw && raw !== NONE ? parseItemKey(raw) : null;
      fit[slot] = saved && this.canFit(replica, slot, saved) ? saved : this.defaultFit(replica, slot);
    }
    return fit;
  }

  /** Fits `ref` (or nothing: as it comes) to `replicaId`'s `slot`. */
  setFit(replicaId: string, slot: FitSlot, ref: ItemRef | null): void {
    this.savePick(`fit.${replicaId}.${slot}`, ref ? itemKey(ref.asset, ref.tier) : NONE);
  }

  /** The owned items that can go in `slot` on the replica asset `replicaId`, rarest first. */
  fitChoices(replicaId: string, slot: FitSlot): ItemRef[] {
    const replica = this.pool.byId.get(replicaId);
    if (!replica) return [];
    return this.ownedItems((a) => a.category === FIT_CATEGORY[slot] && fits(a, replica));
  }

  /** Any asset in the pool (owned or not) fits `slot` on this replica: the slot exists for it. */
  hasSlot(replicaId: string, slot: FitSlot): boolean {
    const replica = this.pool.byId.get(replicaId);
    return !!replica && this.pool.assets.some((a) => a.category === FIT_CATEGORY[slot] && fits(a, replica));
  }

  /** A replica's hop-up dial (by its config id, whichever tier), or its factory setting. */
  hopUp(r: ReplicaConfig): number {
    return loadSetting(`hopUp.${r.id}`, numberIn(HOP_UP.minDial, HOP_UP.maxDial), r.hopUpDial);
  }

  setHopUp(r: ReplicaConfig, dial: number): void {
    saveSetting(`hopUp.${r.id}`, dial);
  }

  /** A replica's BB weight (grams), or the one it comes set up for. */
  bbWeight(r: ReplicaConfig): number {
    return loadSetting(`bbWeight.${r.id}`, (raw) => validBbWeight(typeof raw === 'number' ? raw : Number(raw)), r.bbWeight);
  }

  setBbWeight(r: ReplicaConfig, grams: number): void {
    const g = validBbWeight(grams);
    if (g !== undefined) saveSetting(`bbWeight.${r.id}`, g);
  }

  /** A replica's Glowing BBs choice (M33b), or the default: on night fields only. */
  glowBBs(r: ReplicaConfig): GlowBBs {
    return loadSetting(`glowBBs.${r.id}`, oneOf(GLOW_BB_CHOICES.map((c) => c.id)), DEFAULT_GLOW_BBS);
  }

  setGlowBBs(r: ReplicaConfig, choice: GlowBBs): void {
    saveSetting(`glowBBs.${r.id}`, choice);
  }

  /** The kit slot for a replica item with its current fit: what the Customise screen's numbers describe. */
  slotKit(ref: ItemRef): KitSlot {
    return kitSlot(this.pool, ref, this.fitOf(ref.asset));
  }

  /**
   * The replica asset `replicaId` as it comes (M29): Common, no parts, on its starter power source. What the Loadout's
   * Performance sheet compares against (and what bots carry).
   */
  asItComes(replicaId: string): KitSlot {
    const replica = this.pool.byId.get(replicaId)!;
    const power = this.pool.assets.find((a) => a.category === 'power' && a.starter && fits(a, replica));
    const common = this.pool.tiers[0]!.id;
    return kitSlot(this.pool, { asset: replicaId, tier: common }, { ...EMPTY_FIT, power: power ? { asset: power.id, tier: common } : null });
  }

  /** True if the site limit stops the energy of `ref` with its current fit (the Performance sheet says so). */
  capped(ref: ItemRef): boolean {
    return energyCapped(this.pool, ref, this.fitOf(ref.asset));
  }

  /** The player's kit for the next match or range visit. */
  kit(): PlayerKit {
    const slots = this.equipped()
      .filter((r): r is ItemRef => r !== null)
      .map((r) => this.slotKit(r));
    return {
      slots,
      hopUps: slots.map((s) => this.hopUp(s.replica)),
      bbWeights: slots.map((s) => this.bbWeight(s.replica)),
      glowBBs: slots.map((s) => this.glowBBs(s.replica)),
    };
  }

  /** A saved pick (`equip.<slot>` or `fit.<asset>.<slot>`): the sandboxed one while everything is unlocked, else the real one. */
  private readPick(field: Pick): string | null {
    const read = (f: `equip.${string}` | `fit.${string}`) => loadSetting<string | null>(f, (v) => (typeof v === 'string' ? v : undefined), null);
    return (this.ownership.sandboxed?.() ? read(sandboxField(field)) : null) ?? read(field);
  }

  private savePick(field: Pick, value: string): void {
    saveSetting(this.ownership.sandboxed?.() ? sandboxField(field) : field, value);
  }

  private isReplica(ref: ItemRef): boolean {
    return this.pool.byId.get(ref.asset)?.category === 'replica' && this.pool.tiers.some((t) => t.id === ref.tier);
  }

  private canFit(replica: Asset, slot: FitSlot, ref: ItemRef): boolean {
    const part = this.pool.byId.get(ref.asset);
    return !!part && part.category === FIT_CATEGORY[slot] && fits(part, replica) && this.ownership.owns(ref) && this.pool.tiers.some((t) => t.id === ref.tier);
  }

  /** The best owned copy of the replica `preferred` came as, else of any replica not in `used`. */
  private defaultReplica(preferred: ReplicaConfig | undefined, used: Set<string | undefined>): ItemRef | null {
    const choices = this.replicaChoices().filter((r) => !used.has(r.asset));
    const same = choices.find((r) => preferred && replicaOf(this.pool.byId.get(r.asset)!).id === preferred.id);
    return same ?? choices[0] ?? null;
  }

  /**
   * What a replica gets in a slot nothing was ever picked for: its best owned power source (a starter first), and in
   * the other slots nothing (as it comes), so a new unlock is never fitted behind the player's back.
   */
  private defaultFit(replica: Asset, slot: FitSlot): ItemRef | null {
    if (slot !== 'power') return null;
    const choices = this.ownedItems((a) => a.category === 'power' && fits(a, replica));
    return choices.find((r) => this.pool.byId.get(r.asset)!.starter) ?? choices[0] ?? null;
  }
}
