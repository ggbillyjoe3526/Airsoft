import { SAVED_LOADOUTS, SAVED_TEXT } from '../config/savedLoadouts';
import { overStored, storedIsNewer } from '../save/overStored';
import { browserStorage } from '../settings/storage';
import type { LoadoutModel, LoadoutPicks, MissingPick } from './loadoutModel';
import type { Asset } from './pool';

/**
 * Saved loadouts (SL1, Dev 6 item 19): a few named loadouts in fixed slots, one of them the loadout carried. No DOM: the
 * Loadout's tabs and the Match screen's pick show it.
 *
 * The current slot is the loadout carried: every change on the Loadout goes to it, so nothing is ever unsaved. Its
 * record is taken from the loadout (`LoadoutModel.picks`) whenever the set is written, and the others keep the picks
 * they were saved with, gear that is no longer available included: it plays as its default (the loadout's own rule,
 * through the same ownership check) and comes back with the gear. While everything is unlocked (Dev settings, M26d) a
 * second set is used, made from the real one, as the picks themselves are kept apart then.
 *
 * Saved under its own key (`airsoft.loadouts`, a store of the save file: save/stores.ts). Nothing is written until the
 * player changes something: a save without the store starts with one loadout, the one carried.
 */

export const SAVED_LOADOUTS_KEY = 'airsoft.loadouts';
export const SAVED_LOADOUTS_VERSION = 1;

/** One saved loadout: its name and its picks (setting fields and values, `LoadoutModel.picks`). */
export interface SavedLoadout {
  name: string;
  picks: LoadoutPicks;
}

/** A set of saved loadouts: the slots in order (null: empty), and the one carried. */
interface LoadoutSet {
  slots: (SavedLoadout | null)[];
  current: number;
}

/** A saved loadout as the menus show it. */
export interface SavedLoadoutView {
  /** Its slot, from 0. */
  slot: number;
  name: string;
  /** It is the loadout carried. */
  current: boolean;
  /** The replicas it carries now, by gear slot (null: none). */
  replicas: (Asset | null)[];
  /** Gear it holds that isn't available now, and what plays instead. */
  missing: MissingPick[];
}

export class SavedLoadouts {
  private readonly real: LoadoutSet;
  /** The set used while everything is unlocked (M26d); made from the real one the first time it is needed. */
  private dev: LoadoutSet | null;

  constructor(
    private readonly model: LoadoutModel,
    private readonly storage: () => Storage | null = browserStorage,
  ) {
    const stored = readStored(storage());
    this.real = stored.real ?? firstSet();
    this.dev = stored.dev;
  }

  /** The slot carried, from 0. */
  current(): number {
    return this.set().current;
  }

  /** Every slot as the menus show it (null: empty). */
  views(): (SavedLoadoutView | null)[] {
    return this.set().slots.map((_, i) => this.view(i));
  }

  /** One slot as the menus show it, or null when it is empty. */
  view(slot: number): SavedLoadoutView | null {
    const set = this.set();
    const saved = set.slots[slot];
    if (!saved) return null;
    const current = slot === set.current;
    const m = current ? this.model : this.model.over(saved.picks);
    return {
      slot,
      name: saved.name,
      current,
      replicas: m.equipped().map((r) => (r ? (this.model.pool.byId.get(r.asset) ?? null) : null)),
      missing: m.missing(),
    };
  }

  /** A free slot remains (for Duplicate). */
  hasRoom(): boolean {
    return this.set().slots.includes(null);
  }

  /** `slot` holds a loadout and isn't the only one (the player always has one). */
  canDelete(slot: number): boolean {
    const slots = this.set().slots;
    return !!slots[slot] && slots.filter((s) => s !== null).length > 1;
  }

  /** The slot that becomes current if `slot` (the current one) is deleted: the next, else the one before. */
  nextAfter(slot: number): number {
    const slots = this.set().slots;
    for (let j = slot + 1; j < slots.length; j++) if (slots[j]) return j;
    for (let j = slot - 1; j >= 0; j--) if (slots[j]) return j;
    return -1;
  }

  /** Carries the loadout in `slot`: the one carried is kept in its own slot first. False if there is nothing to switch to. */
  use(slot: number): boolean {
    const set = this.set();
    const target = set.slots[slot];
    if (!target || slot === set.current) return false;
    this.keepCurrent(set);
    this.model.usePicks(target.picks);
    set.current = slot;
    this.write();
    return true;
  }

  /** A new loadout in the empty `slot`: a copy of the one carried, which it becomes (so the original stays as it is). */
  create(slot: number): boolean {
    const set = this.set();
    if (!inRange(slot) || set.slots[slot]) return false;
    this.keepCurrent(set);
    set.slots[slot] = { name: SAVED_TEXT.defaultName(slot + 1), picks: this.model.picks() };
    set.current = slot;
    this.write();
    return true;
  }

  /** Names `slot`; false (and nothing changes) when the name is empty once tidied. */
  rename(slot: number, name: string): boolean {
    const saved = this.set().slots[slot];
    const clean = cleanName(name);
    if (!saved || !clean) return false;
    if (clean !== saved.name) {
      saved.name = clean;
      this.write();
    }
    return true;
  }

  /** A copy of `slot` in the first free slot, whose number it returns (-1: no room). The loadout carried stays. */
  duplicate(slot: number): number {
    const set = this.set();
    const saved = set.slots[slot];
    const free = set.slots.indexOf(null);
    if (!saved || free < 0) return -1;
    set.slots[free] = { name: copyName(saved.name), picks: slot === set.current ? this.model.picks() : { ...saved.picks } };
    this.write();
    return free;
  }

  /** Makes `slot` (not the current one) a copy of the loadout carried, keeping its name. */
  replace(slot: number): boolean {
    const set = this.set();
    const saved = set.slots[slot];
    if (!saved || slot === set.current) return false;
    set.slots[slot] = { name: saved.name, picks: this.model.picks() };
    this.write();
    return true;
  }

  /** Deletes `slot` (never the last one); if it was carried, the next one (`nextAfter`) is carried instead. */
  remove(slot: number): boolean {
    const set = this.set();
    if (!this.canDelete(slot)) return false;
    if (slot === set.current) {
      const next = this.nextAfter(slot);
      this.model.usePicks(set.slots[next]!.picks);
      set.current = next;
    }
    set.slots[slot] = null;
    this.write();
    return true;
  }

  /** The set in use: the real one, or while everything is unlocked the Dev one (made from the real one the first time). */
  private set(): LoadoutSet {
    if (!this.model.lent()) return this.real;
    this.dev ??= { slots: this.real.slots.map((s) => (s ? { name: s.name, picks: { ...s.picks } } : null)), current: this.real.current };
    return this.dev;
  }

  /** The current slot's record, from the loadout carried. */
  private keepCurrent(set: LoadoutSet): void {
    const saved = set.slots[set.current];
    if (saved) set.slots[set.current] = { name: saved.name, picks: this.model.picks() };
  }

  /** Saves both sets (never over a newer build's store, M56; fields this build doesn't know are kept, M31). */
  private write(): void {
    this.keepCurrent(this.set());
    const storage = this.storage();
    if (!storage) return;
    try {
      if (storedIsNewer(storage, SAVED_LOADOUTS_KEY, SAVED_LOADOUTS_VERSION)) return;
      const fresh: Record<string, unknown> = { version: SAVED_LOADOUTS_VERSION, slots: this.real.slots, current: this.real.current };
      if (this.dev) fresh.dev = { slots: this.dev.slots, current: this.dev.current };
      storage.setItem(SAVED_LOADOUTS_KEY, JSON.stringify(overStored(storage, SAVED_LOADOUTS_KEY, fresh)));
    } catch {
      // Non-critical, as the settings: the change still holds for this visit.
    }
  }
}

/** A name as saved: control characters out, spaces tidied, at most SAVED_LOADOUTS.nameMax characters; '' if none is left. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const tidy = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(tidy).slice(0, SAVED_LOADOUTS.nameMax).join('').trim();
}

/** A duplicate's name: the original's, cut short to make room, then " copy". */
export function copyName(name: string): string {
  const room = SAVED_LOADOUTS.nameMax - SAVED_TEXT.copySuffix.length;
  return `${Array.from(name).slice(0, room).join('').trim()}${SAVED_TEXT.copySuffix}`;
}

/** A save without the store (or an unreadable one): one loadout, the one carried. */
function firstSet(): LoadoutSet {
  const slots: (SavedLoadout | null)[] = Array.from({ length: SAVED_LOADOUTS.slots }, () => null);
  slots[0] = { name: SAVED_TEXT.defaultName(1), picks: {} };
  return { slots, current: 0 };
}

function inRange(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < SAVED_LOADOUTS.slots;
}

/** The stored sets, or null for each the store doesn't hold (or a newer build's store, which this build doesn't read). */
function readStored(storage: Storage | null): { real: LoadoutSet | null; dev: LoadoutSet | null } {
  const none = { real: null, dev: null };
  if (!storage) return none;
  try {
    if (storedIsNewer(storage, SAVED_LOADOUTS_KEY, SAVED_LOADOUTS_VERSION)) return none;
    const raw: unknown = JSON.parse(storage.getItem(SAVED_LOADOUTS_KEY) ?? 'null');
    if (!isObject(raw)) return none;
    return { real: readSet(raw), dev: readSet(raw.dev) };
  } catch {
    return none;
  }
}

/** A stored set: each slot's loadout if it reads as one, and the current slot. */
function readSet(raw: unknown): LoadoutSet | null {
  if (!isObject(raw) || !Array.isArray(raw.slots)) return null;
  const listed: unknown[] = raw.slots;
  const slots = Array.from({ length: SAVED_LOADOUTS.slots }, (_, i) => readLoadout(listed[i], i));
  if (slots.every((s) => s === null)) return null;
  const at = raw.current;
  if (typeof at === 'number' && inRange(at) && slots[at]) return { slots, current: at };
  // The loadout carried is in no slot (an edited save): it goes in the first free one, so no saved loadout is
  // overwritten by it; with none free, the first slot is carried.
  const free = slots.indexOf(null);
  if (free < 0) return { slots, current: slots.findIndex((s) => s !== null) };
  slots[free] = { name: SAVED_TEXT.defaultName(free + 1), picks: {} };
  return { slots, current: free };
}

function readLoadout(raw: unknown, slot: number): SavedLoadout | null {
  if (!isObject(raw) || !isObject(raw.picks)) return null;
  const picks: Record<string, string | number> = {};
  for (const [field, value] of Object.entries(raw.picks)) {
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) picks[field] = value;
  }
  return { name: cleanName(raw.name) || SAVED_TEXT.defaultName(slot + 1), picks };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
