import { overStored, storedIsNewer } from '../save/overStored';
import { browserStorage } from '../settings/storage';
import { type LevelTable, standing, unlocksUpTo } from './levels';

/**
 * The player's level progress (LV1): the XP earned and every item unlocked, saved in the browser under its own key.
 * Unlocks are kept as a list, never worked out again from the level alone, so an item levels.md later moves up a level
 * stays with whoever has it, and one moved down reaches everyone already past it (`grantReached`). Plain data; every
 * read and write tolerates blocked storage and garbage, as the settings do.
 */
export interface Progress {
  /** XP earned, counted up to the cap's total (XP stops at the cap until levels.md raises it). Whole numbers. */
  xp: number;
  /** Every item unlocked, by pool asset id, in the order they were unlocked. Never taken away. */
  unlocked: string[];
  /** The save's revision: raised by every save, so a copy can tell that another tab saved after it was read. */
  rev?: number;
}

export const PROGRESS_KEY = 'airsoft.progress';
export const PROGRESS_VERSION = 1;

/** What reaching new levels changed: the level before and after, and what it unlocked (asset ids, lowest level first). */
export interface LevelUp {
  from: number;
  to: number;
  unlocked: string[];
}

const ASSET_ID = /^\d{6}$/;

/** A new player's progress: level 0, with the starting kit. */
export function newProgress(t: LevelTable): Progress {
  return { xp: 0, unlocked: unlocksUpTo(t, 0), rev: 0 };
}

/**
 * Adds what every level up to the player's own unlocks and they lack (a new player's kit, an item levels.md added to a
 * level they are past, or one it moved down); returns what was added, lowest level first.
 */
export function grantReached(p: Progress, t: LevelTable): string[] {
  const have = new Set(p.unlocked);
  const added = unlocksUpTo(t, standing(t, p.xp).level).filter((id) => !have.has(id));
  p.unlocked.push(...added);
  return added;
}

/**
 * Adds `xp` (a match's, rounded, never negative) and unlocks what the levels it reaches give. XP stops at the cap's
 * total: past it there is nothing to count towards until the cap goes up.
 */
export function addXp(p: Progress, t: LevelTable, xp: number): LevelUp {
  const from = standing(t, p.xp).level;
  const top = t.levels[t.cap]!.total;
  // Never lowered: a save over a cap levels.md has since brought down keeps its XP.
  if (p.xp < top) p.xp = Math.min(top, p.xp + Math.max(0, Math.round(xp)));
  const unlocked = grantReached(p, t);
  return { from, to: standing(t, p.xp).level, unlocked };
}

/** XP still to earn to reach the next level; 0 at the cap. */
export function xpToNext(p: Progress, t: LevelTable): number {
  const s = standing(t, p.xp);
  return s.next === null ? 0 : s.next - s.into;
}

/** Back to level 0 (Dev settings › Reset level): no XP, and the starting kit alone. */
export function resetProgress(p: Progress, t: LevelTable): void {
  p.xp = 0;
  p.unlocked = unlocksUpTo(t, 0);
}

function wholeNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER ? v : undefined;
}

/** The stored progress's fields, or null if nothing valid is stored (or storage is blocked). */
function readStored(storage: Storage | null): Progress | null {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(PROGRESS_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== PROGRESS_VERSION) return null;
    const r = raw as Record<string, unknown>;
    const unlocked = Array.isArray(r.unlocked) ? r.unlocked.filter((id): id is string => typeof id === 'string' && ASSET_ID.test(id)) : [];
    return { xp: wholeNumber(r.xp) ?? 0, unlocked: [...new Set(unlocked)], rev: wholeNumber(r.rev) ?? 0 };
  } catch {
    // Unreadable.
    return null;
  }
}

/**
 * The saved progress, or a new player's if nothing valid is saved or storage is blocked, with anything its level
 * reaches added (`grantReached`). Items pool.md no longer has stay in the save but are never offered. Progress a newer
 * build saved is not read: the new one lasts for the visit, as saveProgress never writes over it.
 */
export function loadProgress(t: LevelTable, storage = browserStorage()): Progress {
  const p = readStored(storage) ?? newProgress(t);
  grantReached(p, t);
  return p;
}

/**
 * Before changing `p`: if another tab saved progress since `p` was read or saved (the stored `rev` is newer), `p`
 * takes the stored one's contents in place (it is shared, so it is never replaced), so XP earned there is not
 * overwritten by this tab's older copy. True if it changed.
 */
export function syncProgress(p: Progress, t: LevelTable, storage = browserStorage()): boolean {
  const stored = readStored(storage);
  if (!stored || (stored.rev ?? 0) <= (p.rev ?? 0)) return false;
  Object.assign(p, stored);
  grantReached(p, t);
  return true;
}

/**
 * Saves the progress as the next revision. Not over a newer one another tab saved since `p` was read or synced, nor
 * over one from a newer version of the store, which this build can't read and would wipe. False then, as when storage
 * is full or blocked (the change lasts for the visit).
 */
export function saveProgress(p: Progress, storage = browserStorage()): boolean {
  if (!storage) return false;
  try {
    if (storedIsNewer(storage, PROGRESS_KEY, PROGRESS_VERSION)) return false;
    if ((readStored(storage)?.rev ?? 0) > (p.rev ?? 0)) return false;
    p.rev = (p.rev ?? 0) + 1;
    // Fields a newer build added stay (M31).
    storage.setItem(PROGRESS_KEY, JSON.stringify(overStored(storage, PROGRESS_KEY, { version: PROGRESS_VERSION, ...p })));
    return true;
  } catch {
    // Full or blocked: kept for this visit.
    return false;
  }
}
