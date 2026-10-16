import { BOT_GLOW_BBS, bbsGlow, DEFAULT_GLOW_BBS, GLOW_BB_CHOICES, type GlowBBs } from '../config/glowBBs';
import { HOP_UP, LOADOUT, type ReplicaConfig, validBbWeight } from '../config/replicas';
import { DEFAULT_LOOK, type LookSettings } from '../config/look';
import { defaultScheme, isFamilyId, isSchemeId, offeredSchemes, type PaintId, type ReplicaPaint, type SchemeId } from '../config/schemes';
import { loadSetting, numberIn, oneOf, saveSetting, type SettingField } from '../settings/storage';
import { isAvailable } from '../config/content';
import { isDevItem } from './contentPool';
import { inPool, type ItemRef, itemKey, parseItemKey } from './item';
import { EMPTY_FIT, energyCapped, FIT_CATEGORY, FIT_SLOTS, type FitSlot, type KitSlot, kitSlot, type ReplicaFit } from './kit';
import { type Asset, fits, type Pool, replicaOf } from './pool';

/**
 * The player's loadout (M26b): which unlocked replica is in each gear slot, what is fitted to each replica, and each
 * replica's BB weight and hop-up dial. Saved in the settings store as the player changes it; read back against what
 * they have unlocked now, so anything not unlocked (or no longer fitting, after a pool.md edit) falls back to a
 * default. No DOM: the Loadout screen shows it, the game builds each match's kit from it.
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
  /** Each slot's colour scheme (graphics overhaul G1): presentation only. */
  schemes: readonly PaintId[];
}

/**
 * Whose BBs glow on a field played at night (`night`) or by day (M33b): the player's by gear slot from their kit, and
 * the bots' the default way (BOT_GLOW_BBS).
 */
export function bbGlowFor(kit: PlayerKit, night: boolean): { player: boolean[]; others: boolean } {
  return { player: kit.glowBBs.map((g) => bbsGlow(g, night)), others: bbsGlow(BOT_GLOW_BBS, night) };
}

/** How the player's replicas are painted (G1): each slot's scheme, plain under Realistic colours (Settings › Look). */
export function kitPaint(kit: PlayerKit, look: LookSettings = DEFAULT_LOOK): ReplicaPaint {
  return { schemes: kit.schemes, realistic: look.realisticColours };
}

/** What the player can equip: the items their levels unlocked (LV1), or (Dev settings › Disable levelling) everything. */
export interface Ownership {
  owns(ref: ItemRef): boolean;
  /** Whether `asset` is offered at all (M35: dev gear only with Dev content on); every asset when absent. */
  offers?(asset: Asset): boolean;
  /** Whether dev content is offered (M35's switch; CT4: a dev colour scheme shows only then); never when absent. */
  devContent?(): boolean;
  /**
   * The level that unlocks `ref` (levels.md, LV1) while the player hasn't got it, so the Loadout can show what is to
   * come; null once it is theirs or when no level unlocks it. Never when absent.
   */
  lockedAt?(ref: ItemRef): number | null;
  /**
   * True while everything is unlocked (M26d, LV1: Disable levelling): picks are then saved apart from the real ones
   * (under `equip.dev.` and `fit.dev.`), starting from them, so turning levelling back on brings back the loadout the
   * player's levels gave them.
   */
  sandboxed?(): boolean;
}

/** What the player's levels give them (LV1): the items unlocked, and the level that unlocks each item. */
export interface Unlocks {
  /** The pool asset ids unlocked (the player's progress). */
  unlocked(): readonly string[];
  /** The level that unlocks an asset (levels.md), or undefined when none does. */
  levelOf(assetId: string): number | undefined;
}

/** The items in `unlocked` (pool asset ids). */
export function unlockedOwnership(unlocked: () => readonly string[]): Ownership {
  return { owns: (ref) => unlocked().includes(ref.asset) };
}

/**
 * The unlocked items, or, while `unlockAll()` (Dev settings › Disable levelling, M26d), every asset; either way only
 * public ones unless `devContent()` (M35): an unlocked dev item is then hidden, not lost, and a pick of it falls back
 * to a default until Dev content is on again.
 */
export function gameOwnership(pool: Pool, unlocks: Unlocks, unlockAll: () => boolean, devContent: () => boolean = () => false): Ownership {
  const owned = unlockedOwnership(() => unlocks.unlocked());
  const owns = (ref: ItemRef): boolean => (devContent() || !isDevItem(pool, ref)) && inPool(pool, ref) && (unlockAll() || owned.owns(ref));
  return {
    owns,
    lockedAt: (ref) => (owns(ref) || !inPool(pool, ref) ? null : (unlocks.levelOf(ref.asset) ?? null)),
    offers: (asset) => isAvailable(asset.tag, devContent()),
    devContent,
    sandboxed: unlockAll,
  };
}

/**
 * Where a LoadoutModel keeps its picks (SL1): the settings store for the loadout the player carries, or a saved
 * loadout's own record (`recordPicks`), read by the same rules.
 */
export interface PickStore {
  load<T>(field: SettingField, parse: (raw: unknown) => T | undefined, fallback: T): T;
  save(field: SettingField, value: string | number): void;
}

const SETTINGS_PICKS: PickStore = {
  load: (field, parse, fallback) => loadSetting(field, parse, fallback),
  save: (field, value) => saveSetting(field, value),
};

/** A saved loadout's picks (SL1): setting fields and their values, as the settings store keeps them. */
export type LoadoutPicks = Readonly<Record<string, string | number>>;

/** A PickStore over a plain record (SL1): a saved loadout read, or written, as the loadout's own picks are. */
export function recordPicks(record: Record<string, string | number>): PickStore {
  return {
    load: (field, parse, fallback) => {
      if (!Object.hasOwn(record, field)) return fallback;
      const v = parse(record[field]);
      return v === undefined ? fallback : v;
    },
    save: (field, value) => {
      record[field] = value;
    },
  };
}

/** Gear a loadout holds that isn't available now (SL1): it plays as `instead` until it is back. */
export interface MissingPick {
  /** The gear slot whose replica, or the fit slot whose part, it is. */
  slot: GearSlot | FitSlot;
  wanted: Asset;
  /** What is carried or fitted in its place, or null: nothing. */
  instead: Asset | null;
  /** `dev`: dev gear while Dev content is off (M35); `locked`: not unlocked yet. */
  reason: 'locked' | 'dev';
  /** The level that unlocks it (LV1), or null: dev gear, or no level does. */
  level: number | null;
}

const NONE = 'none';

/** The two dials every replica has (never pooled). */
type Dial = 'hopUp' | 'bbWeight';

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
    private readonly store: PickStore = SETTINGS_PICKS,
  ) {}

  /** Every unlocked item of the given assets, in pool order. */
  ownedItems(filter: (a: Asset) => boolean): ItemRef[] {
    return this.pool.assets.filter((a) => filter(a) && this.ownership.owns({ asset: a.id })).map((a) => ({ asset: a.id }));
  }

  /** The replicas the player can put in a gear slot (any replica goes in either slot). */
  replicaChoices(): ItemRef[] {
    return this.ownedItems((a) => a.category === 'replica');
  }

  /**
   * Offered items of the given assets the player hasn't unlocked yet (M35: dev gear only with Dev content on), each with
   * the level that unlocks it, lowest level first (pool order within a level): what the Loadout shows locked.
   */
  lockedItems(filter: (a: Asset) => boolean): { item: ItemRef; level: number }[] {
    const out: { item: ItemRef; level: number }[] = [];
    for (const a of this.pool.assets) {
      if (!filter(a) || !(this.ownership.offers?.(a) ?? true)) continue;
      const level = this.ownership.lockedAt?.({ asset: a.id }) ?? null;
      if (level !== null) out.push({ item: { asset: a.id }, level });
    }
    return out.sort((x, y) => x.level - y.level);
  }

  /** The replicas still to unlock, with their levels (lockedItems). */
  lockedReplicas(): { item: ItemRef; level: number }[] {
    return this.lockedItems((a) => a.category === 'replica');
  }

  /** The items still to unlock that would go in `slot` on the replica asset `replicaId`, with their levels (lockedItems). */
  lockedFitChoices(replicaId: string, slot: FitSlot): { item: ItemRef; level: number }[] {
    const replica = this.pool.byId.get(replicaId);
    if (!replica) return [];
    return this.lockedItems((a) => a.category === FIT_CATEGORY[slot] && fits(a, replica));
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
   * The gear slot the kit's `index`th replica is carried in (kit() leaves an empty slot out), e.g. the slot of the
   * replica in hand on the range (M95); the first slot when there is no such replica.
   */
  gearSlotOf(index: number): GearSlot {
    let n = -1;
    const equipped = this.equipped();
    for (let i = 0; i < equipped.length; i++) if (equipped[i] && ++n === index) return GEAR_SLOTS[i]!;
    return GEAR_SLOTS[0]!;
  }

  /**
   * Whether everything is lent (Dev settings › Disable levelling, M26d and LV1): the Loadout says so (M95), and the picks
   * are then the Dev ones, kept apart from the real ones (so are the saved loadouts, SL1).
   */
  lent(): boolean {
    return this.ownership.sandboxed?.() ?? false;
  }

  /**
   * Puts `ref` (an owned replica item) in `slot`. If the other slot holds the same replica, the two swap, so a replica
   * is never in both.
   */
  equip(slot: GearSlot, ref: ItemRef): void {
    const now = this.equipped();
    const i = GEAR_SLOTS.indexOf(slot);
    const other = now.findIndex((r, j) => j !== i && r?.asset === ref.asset);
    if (other >= 0 && now[i]) this.savePick(`equip.${GEAR_SLOTS[other]!}`, itemKey(now[i]!));
    this.savePick(`equip.${slot}`, itemKey(ref));
  }

  /** What is fitted to the replica asset `replicaId`: each slot's item if still unlocked and fitting, else its default. */
  fitOf(replicaId: string): ReplicaFit {
    const replica = this.pool.byId.get(replicaId);
    const fit: ReplicaFit = { ...EMPTY_FIT };
    if (!replica) return fit;
    for (const slot of FIT_SLOTS) {
      const raw = this.readPick(`fit.${replicaId}.${slot}`);
      // "As it comes" picked on purpose stays empty, even in a slot with a default (BP2: "No light" fell back to the
      // torch). A replica always needs a power source, so a saved "none" there still takes the default.
      if (raw === NONE && slot !== 'power') continue;
      const saved = raw && raw !== NONE ? parseItemKey(raw) : null;
      fit[slot] = saved && this.canFit(replica, slot, saved) ? saved : this.defaultFit(replica, slot);
    }
    return fit;
  }

  /** Fits `ref` (or nothing: as it comes) to `replicaId`'s `slot`. */
  setFit(replicaId: string, slot: FitSlot, ref: ItemRef | null): void {
    this.savePick(`fit.${replicaId}.${slot}`, ref ? itemKey(ref) : NONE);
  }

  /** The unlocked items that can go in `slot` on the replica asset `replicaId`, in pool order. */
  fitChoices(replicaId: string, slot: FitSlot): ItemRef[] {
    const replica = this.pool.byId.get(replicaId);
    if (!replica) return [];
    return this.ownedItems((a) => a.category === FIT_CATEGORY[slot] && fits(a, replica));
  }

  /** Any asset offered (unlocked or not; M35: dev gear only with Dev content on) fits `slot` on this replica: the slot exists for it. */
  hasSlot(replicaId: string, slot: FitSlot): boolean {
    const replica = this.pool.byId.get(replicaId);
    return !!replica && this.pool.assets.some((a) => a.category === FIT_CATEGORY[slot] && fits(a, replica) && (this.ownership.offers?.(a) ?? true));
  }

  /**
   * Where the replica asset `replicaId`'s dial is saved (audit POOL-17): by asset id, so two pool.md rows sharing a Key
   * keep their own; `hopUp.dev.<id>` while everything is unlocked, so a dial turned with borrowed gear doesn't stay on
   * the real replica.
   */
  dialField(kind: Dial, replicaId: string): `${Dial}.${string}` {
    return this.ownership.sandboxed?.() ? `${kind}.dev.${replicaId}` : `${kind}.${replicaId}`;
  }

  /** A replica asset's hop-up dial, or its factory setting. */
  hopUp(replicaId: string): number {
    const r = this.replicaConfig(replicaId);
    return r ? this.readDial('hopUp', replicaId, r, numberIn(HOP_UP.minDial, HOP_UP.maxDial), r.hopUpDial) : HOP_UP.minDial;
  }

  setHopUp(replicaId: string, dial: number): void {
    this.store.save(this.dialField('hopUp', replicaId), dial);
  }

  /** A replica asset's BB weight (grams), or the one it comes set up for. */
  bbWeight(replicaId: string): number {
    const r = this.replicaConfig(replicaId);
    return r ? this.readDial('bbWeight', replicaId, r, (raw) => validBbWeight(typeof raw === 'number' ? raw : Number(raw)), r.bbWeight) : 0;
  }

  setBbWeight(replicaId: string, grams: number): void {
    const g = validBbWeight(grams);
    if (g !== undefined) this.store.save(this.dialField('bbWeight', replicaId), g);
  }

  /**
   * A dial: the sandboxed one while everything is unlocked, else the asset's own, else the one saved by replica config
   * id before audit POOL-17 (`hopUp.aeg`), else the factory setting.
   */
  private readDial(kind: Dial, replicaId: string, r: ReplicaConfig, parse: (raw: unknown) => number | undefined, factory: number): number {
    const read = (field: `${Dial}.${string}`, fallback: number): number => this.store.load(field, parse, fallback);
    const own = read(`${kind}.${replicaId}`, read(`${kind}.${r.id}`, factory));
    return this.ownership.sandboxed?.() ? read(`${kind}.dev.${replicaId}`, own) : own;
  }

  private replicaConfig(replicaId: string): ReplicaConfig | undefined {
    const a = this.pool.byId.get(replicaId);
    return a?.category === 'replica' ? replicaOf(a) : undefined;
  }

  /** Where the replica asset's Glowing BBs choice is saved (M33b): by asset id, sandboxed like the dials. */
  glowField(replicaId: string): `glowBBs.${string}` {
    return this.ownership.sandboxed?.() ? `glowBBs.dev.${replicaId}` : `glowBBs.${replicaId}`;
  }

  /** A replica asset's Glowing BBs choice (M33b), or the default: on night fields only. */
  glowBBs(replicaId: string): GlowBBs {
    const parse = oneOf(GLOW_BB_CHOICES.map((c) => c.id));
    const own = this.store.load(`glowBBs.${replicaId}`, parse, DEFAULT_GLOW_BBS);
    return this.ownership.sandboxed?.() ? this.store.load(`glowBBs.dev.${replicaId}`, parse, own) : own;
  }

  setGlowBBs(replicaId: string, choice: GlowBBs): void {
    this.store.save(this.glowField(replicaId), choice);
  }

  /**
   * A replica asset's colour scheme (G1), or its default (a Cobalt rifle, a Ghost pistol). Cosmetic, so one pick per
   * asset whether or not everything is unlocked: a colour picked on borrowed gear is waiting when the player unlocks it.
   * A dev scheme picked with Dev content on plays as the default while it is off (CT4), and comes back with it. A plain
   * family (MR1) is always offered.
   */
  scheme(replicaId: string): PaintId {
    const r = this.replicaConfig(replicaId);
    const fallback = r ? defaultScheme(r) : 'cobalt';
    const offered = this.schemes();
    return this.store.load(`scheme.${replicaId}`, (raw) => (isFamilyId(raw) || (isSchemeId(raw) && offered.includes(raw)) ? raw : undefined), fallback);
  }

  /** The schemes Customise offers (CT4): the public ones, and the dev ones while Dev content is on. */
  schemes(): SchemeId[] {
    return offeredSchemes(this.ownership.devContent?.() ?? false);
  }

  setScheme(replicaId: string, scheme: PaintId): void {
    this.store.save(`scheme.${replicaId}`, scheme);
  }

  /** The kit slot for a replica item with its current fit: what the Customise screen's numbers describe. */
  slotKit(ref: ItemRef): KitSlot {
    return kitSlot(this.pool, ref, this.fitOf(ref.asset));
  }

  /**
   * The replica asset `replicaId` as it comes (M29): no parts, on the first power source in pool.md that fits it (the
   * standard one: none for a battery built in). What the Loadout's Performance sheet compares against (and what bots
   * carry on Easy and Normal).
   */
  asItComes(replicaId: string): KitSlot {
    const replica = this.pool.byId.get(replicaId)!;
    const power = this.pool.assets.find((a) => a.category === 'power' && fits(a, replica));
    return kitSlot(this.pool, { asset: replicaId }, { ...EMPTY_FIT, power: power ? { asset: power.id } : null });
  }

  /** True if the site limit stops the energy of `ref` with its current fit (the Performance sheet says so). */
  capped(ref: ItemRef): boolean {
    return energyCapped(this.pool, ref, this.fitOf(ref.asset));
  }

  /** The player's kit for the next match or range visit. */
  kit(): PlayerKit {
    const refs = this.equipped().filter((r): r is ItemRef => r !== null);
    return {
      slots: refs.map((r) => this.slotKit(r)),
      hopUps: refs.map((r) => this.hopUp(r.asset)),
      bbWeights: refs.map((r) => this.bbWeight(r.asset)),
      glowBBs: refs.map((r) => this.glowBBs(r.asset)),
      schemes: refs.map((r) => this.scheme(r.asset)),
    };
  }

  /**
   * The loadout as a saved loadout keeps it (SL1): each gear slot's replica and, for each replica in a slot (as picked
   * and as carried), every fit slot's pick, its dials, Glowing BBs and colour scheme, under the fields the settings use.
   * Gear picked but not available now is kept as picked (it plays as its default until it is back); a slot never picked
   * is written as it plays, so the record alone gives the same loadout.
   */
  picks(): Record<string, string | number> {
    const out: Record<string, string | number> = {};
    const carried = this.equipped();
    const replicas = new Set<string>();
    GEAR_SLOTS.forEach((slot, i) => {
      const picked = this.pickedItem(`equip.${slot}`);
      const ref = picked && this.isReplica(picked) ? picked : (carried[i] ?? null);
      if (ref) {
        out[`equip.${slot}`] = itemKey(ref);
        replicas.add(ref.asset);
      }
      if (carried[i]) replicas.add(carried[i]!.asset);
    });
    for (const id of replicas) {
      const fit = this.fitOf(id);
      for (const slot of FIT_SLOTS) {
        const raw = this.readPick(`fit.${id}.${slot}`);
        const fitted = fit[slot];
        out[`fit.${id}.${slot}`] = raw !== null && (raw === NONE || parseItemKey(raw)) ? raw : fitted ? itemKey(fitted) : NONE;
      }
      out[`hopUp.${id}`] = this.hopUp(id);
      out[`bbWeight.${id}`] = this.bbWeight(id);
      out[`glowBBs.${id}`] = this.glowBBs(id);
      // A dev scheme stays picked while Dev content is off (CT4), as it does on the replica itself.
      out[`scheme.${id}`] = this.store.load(`scheme.${id}`, (raw) => (isSchemeId(raw) || isFamilyId(raw) ? raw : undefined), this.scheme(id));
    }
    return out;
  }

  /**
   * Makes `picks` (a saved loadout, SL1) the loadout: each field saved as the player's own pick would be (into the Dev
   * picks while everything is unlocked, M26d). A field it doesn't know, or a value that isn't a pick, is left out.
   */
  usePicks(picks: LoadoutPicks): void {
    const hop = numberIn(HOP_UP.minDial, HOP_UP.maxDial);
    const glow = oneOf(GLOW_BB_CHOICES.map((c) => c.id));
    for (const [field, value] of Object.entries(picks)) {
      const dot = field.indexOf('.');
      const rest = field.slice(dot + 1);
      const text = typeof value === 'string' ? value : null;
      switch (field.slice(0, dot)) {
        case 'equip':
          if (GEAR_SLOTS.includes(rest as GearSlot) && text && parseItemKey(text)) this.savePick(`equip.${rest}`, text);
          break;
        case 'fit': {
          const [id, slot, more] = rest.split('.');
          if (id && !more && this.pool.byId.has(id) && FIT_SLOTS.includes(slot as FitSlot) && text && (text === NONE || parseItemKey(text))) this.savePick(`fit.${id}.${slot}`, text);
          break;
        }
        case 'hopUp': {
          const dial = hop(value);
          if (this.replicaConfig(rest) && dial !== undefined) this.setHopUp(rest, dial);
          break;
        }
        case 'bbWeight':
          if (this.replicaConfig(rest) && typeof value === 'number') this.setBbWeight(rest, value);
          break;
        case 'glowBBs': {
          const choice = glow(value);
          if (this.replicaConfig(rest) && choice) this.setGlowBBs(rest, choice);
          break;
        }
        case 'scheme':
          if (this.replicaConfig(rest) && (isSchemeId(value) || isFamilyId(value))) this.setScheme(rest, value);
          break;
      }
    }
  }

  /**
   * This loadout's rules over `picks` (SL1): a saved loadout as it would play now, against what is available now, through
   * the same ownership check as the loadout itself. Its picks are its own: nothing it does is saved.
   */
  over(picks: LoadoutPicks): LoadoutModel {
    return new LoadoutModel(this.pool, { ...this.ownership, sandboxed: () => false }, recordPicks({ ...picks }));
  }

  /**
   * The gear picked that isn't available now (SL1): a gear slot's replica, then the parts fitted to each replica carried,
   * each with what plays in its place. Only gear the pool still has and that still fits counts.
   */
  missing(): MissingPick[] {
    const out: MissingPick[] = [];
    const named = (ref: ItemRef | null | undefined): Asset | null => (ref ? (this.pool.byId.get(ref.asset) ?? null) : null);
    const lost = (asset: Asset): boolean => !this.ownership.owns({ asset: asset.id });
    const reason = (asset: Asset): MissingPick['reason'] => (this.ownership.offers?.(asset) === false ? 'dev' : 'locked');
    const level = (asset: Asset): number | null => (reason(asset) === 'dev' ? null : (this.ownership.lockedAt?.({ asset: asset.id }) ?? null));
    const carried = this.equipped();
    GEAR_SLOTS.forEach((slot, i) => {
      const picked = this.pickedItem(`equip.${slot}`);
      const wanted = picked && this.isReplica(picked) ? named(picked) : null;
      if (wanted && lost(wanted)) out.push({ slot, wanted, instead: named(carried[i]), reason: reason(wanted), level: level(wanted) });
    });
    for (const ref of carried) {
      const replica = named(ref);
      if (!replica) continue;
      const fit = this.fitOf(replica.id);
      for (const slot of FIT_SLOTS) {
        const wanted = named(this.pickedItem(`fit.${replica.id}.${slot}`));
        if (wanted && wanted.category === FIT_CATEGORY[slot] && fits(wanted, replica) && lost(wanted)) out.push({ slot, wanted, instead: named(fit[slot]), reason: reason(wanted), level: level(wanted) });
      }
    }
    return out;
  }

  /** A saved pick as an item, whether or not it is available now; null when nothing (or "as it comes") is saved. */
  private pickedItem(field: Pick): ItemRef | null {
    const raw = this.readPick(field);
    return raw && raw !== NONE ? parseItemKey(raw) : null;
  }

  /** A saved pick (`equip.<slot>` or `fit.<asset>.<slot>`): the sandboxed one while everything is unlocked, else the real one. */
  private readPick(field: Pick): string | null {
    const read = (f: `equip.${string}` | `fit.${string}`) => this.store.load<string | null>(f, (v) => (typeof v === 'string' ? v : undefined), null);
    return (this.ownership.sandboxed?.() ? read(sandboxField(field)) : null) ?? read(field);
  }

  private savePick(field: Pick, value: string): void {
    this.store.save(this.ownership.sandboxed?.() ? sandboxField(field) : field, value);
  }

  private isReplica(ref: ItemRef): boolean {
    return this.pool.byId.get(ref.asset)?.category === 'replica';
  }

  private canFit(replica: Asset, slot: FitSlot, ref: ItemRef): boolean {
    const part = this.pool.byId.get(ref.asset);
    return !!part && part.category === FIT_CATEGORY[slot] && fits(part, replica) && this.ownership.owns(ref);
  }

  /** The unlocked replica `preferred` came as, else any unlocked replica not in `used`. */
  private defaultReplica(preferred: ReplicaConfig | undefined, used: Set<string | undefined>): ItemRef | null {
    const choices = this.replicaChoices().filter((r) => !used.has(r.asset));
    const same = choices.find((r) => preferred && replicaOf(this.pool.byId.get(r.asset)!).id === preferred.id);
    return same ?? choices[0] ?? null;
  }

  /**
   * What a replica gets in a slot nothing was ever picked for: its first unlocked power source and light in pool order
   * (the standard one first; M33h: a torch hidden in Customise is a mechanic nobody finds, and it starts each round
   * off), and in the other slots nothing (as it comes), so a new unlock is never fitted behind the player's back.
   */
  private defaultFit(replica: Asset, slot: FitSlot): ItemRef | null {
    if (slot !== 'power' && slot !== 'light') return null;
    return this.ownedItems((a) => a.category === FIT_CATEGORY[slot] && fits(a, replica))[0] ?? null;
  }
}
