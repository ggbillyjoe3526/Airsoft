import { RESTORE_POINTS, SAVE_KEYS } from '../config/save';
import { flushSettings } from '../settings/storage';
import type { GuardedStorage } from './guardedStorage';
import { canonicalJson, isEmpty, parseSaveObject, SAVE_FORMAT, type SaveData, saveObject } from './saveFile';
import { SAVE_STORES, type StoreData } from './stores';

/**
 * The save as the game runs (M31): takes it from the stores for a download, writes a loaded one over them, keeps the
 * daily restore points and the Undo slot, and remembers when it last saved and was last downloaded. Every write goes
 * through the visit's GuardedStorage; nothing here touches the DOM (ui/saveSettings.ts does), so it runs in tests over
 * a memory store.
 */

/** What Undo brings back from before. */
export type UndoWhat = 'load' | 'restore' | 'delete';

/** The browser's StorageManager, the part used (absent where the browser has none). */
export interface PersistApi {
  persisted(): Promise<boolean>;
  persist(): Promise<boolean>;
}

export interface SaveManagerOptions {
  storage: GuardedStorage;
  /** The title screen's version (config/buildVersion.ts). */
  build: string;
  /** Reloads the page once a loaded save is written (location.reload in the game). */
  reload: () => void;
  now?: () => Date;
  persist?: PersistApi | null;
}

interface Meta {
  /** The save format that last wrote this browser's save, and its build. */
  format: number;
  build: string;
  /** When a store was last written, and when the save was last downloaded (ISO 8601). */
  savedAt: string | null;
  downloadedAt: string | null;
}

export class SaveManager {
  private readonly storage: GuardedStorage;
  private readonly now: () => Date;
  private readonly listeners = new Set<() => void>();
  private meta: Meta;
  /** The build named in a newer browser save this build won't overwrite, or null. */
  readonly newerBuild: string | null;

  constructor(private readonly opts: SaveManagerOptions) {
    this.storage = opts.storage;
    this.now = opts.now ?? (() => new Date());
    const stored = readMeta(this.storage);
    if (stored && stored.format > SAVE_FORMAT) {
      // A newer build wrote this save: read what this build can, write nothing (KNOWN_ISSUES row 99's rule, for all of it).
      this.newerBuild = stored.build || `format ${stored.format}`;
      this.meta = stored;
      this.storage.freeze('newer');
    } else {
      this.newerBuild = null;
      this.meta = { format: SAVE_FORMAT, build: opts.build, savedAt: stored?.savedAt ?? null, downloadedAt: stored?.downloadedAt ?? null };
      this.writeMeta();
    }
    this.storage.onWrite((key) => {
      if (key.startsWith(SAVE_KEY_PREFIX)) return;
      this.meta.savedAt = this.now().toISOString();
      this.writeMeta();
      this.tell();
    });
    this.storage.onProblem(() => this.tell());
  }

  /** Hears whenever what the Save tab shows may have changed. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get lastSaved(): Date | null {
    return parseDate(this.meta.savedAt);
  }

  get lastDownloaded(): Date | null {
    return parseDate(this.meta.downloadedAt);
  }

  /** Saving works: not blocked, not failing, not frozen. */
  get keeping(): boolean {
    return this.storage.keeping;
  }

  get blocked(): boolean {
    return this.storage.blocked;
  }

  /** Another tab has the save (this one stopped saving). */
  get otherTab(): boolean {
    return this.storage.frozen === 'otherTab';
  }

  /**
   * Loading, restoring, undoing and deleting are possible: saving works (a save written into blocked storage would be
   * gone after the reload) and no load is under way.
   */
  get canReplace(): boolean {
    return this.storage.keeping;
  }

  /** The save as it stands, pending slider changes included. */
  current(): SaveData {
    flushSettings(this.storage);
    return { format: SAVE_FORMAT, build: this.opts.build, savedAt: this.now().toISOString(), stores: readStores(this.storage) };
  }

  /** Notes a download (the Save tab's "Last downloaded"). */
  downloaded(): void {
    this.meta.downloadedAt = this.now().toISOString();
    this.writeMeta();
    this.tell();
  }

  /**
   * Writes `save` over this browser's save and reloads the page to use it; the save it replaces goes to the Undo slot
   * (`what` names the action). Nothing happens while saving is frozen (another tab, a newer save, a load under way).
   */
  replace(save: SaveData, what: UndoWhat): void {
    if (!this.canReplace) return;
    this.keepForUndo(what);
    this.overwrite(save.stores);
  }

  /** Deletes the save (kept for Undo) and reloads: the game starts as for a new player. */
  deleteSave(): void {
    if (!this.canReplace) return;
    this.keepForUndo('delete');
    this.overwrite({});
  }

  /** What Undo would bring back, and from before what; null when there is nothing to undo. */
  undoable(): { what: UndoWhat; save: SaveData } | null {
    try {
      const raw: unknown = JSON.parse(this.storage.getItem(SAVE_KEYS.undo) ?? 'null');
      if (!raw || typeof raw !== 'object') return null;
      const { what, save } = raw as { what?: unknown; save?: unknown };
      if (what !== 'load' && what !== 'restore' && what !== 'delete') return null;
      const parsed = parseSaveObject(save);
      return parsed.ok ? { what, save: parsed.save } : null;
    } catch {
      return null;
    }
  }

  /** Brings back the save from before the last load, restore or delete, and reloads. The Undo slot is used up. */
  undo(): void {
    const slot = this.undoable();
    if (!slot || !this.canReplace) return;
    this.storage.writeThrough(SAVE_KEYS.undo, null);
    this.overwrite(slot.save.stores);
  }

  /** The restore points, newest first. */
  restorePoints(): SaveData[] {
    const out: SaveData[] = [];
    try {
      const raw: unknown = JSON.parse(this.storage.getItem(SAVE_KEYS.restorePoints) ?? '[]');
      if (!Array.isArray(raw)) return out;
      for (const item of raw) {
        const parsed = parseSaveObject(item);
        if (parsed.ok) out.push(parsed.save);
      }
    } catch {
      // Unreadable: none.
    }
    return out;
  }

  /**
   * Keeps today's restore point (called as the game starts): the save as it was when the game was opened, at most one a
   * day and only when it differs from the newest kept, RESTORE_POINTS in all. A full disk drops the oldest first.
   */
  keepRestorePoint(): void {
    if (!this.keeping) return;
    const save = this.current();
    if (isEmpty(save.stores)) return;
    const points = this.restorePoints();
    const newest = points[0];
    if (newest && (dayOf(newest.savedAt) === dayOf(save.savedAt) || canonicalJson(newest.stores) === canonicalJson(save.stores))) return;
    const kept = [save, ...points].slice(0, RESTORE_POINTS);
    while (kept.length > 0 && !this.storage.trySet(SAVE_KEYS.restorePoints, JSON.stringify(kept.map(saveObject)))) kept.pop();
    this.tell();
  }

  /** Whether the browser promised not to clear the save on its own (null: it can't say). */
  async protectedNow(): Promise<boolean | null> {
    const api = this.opts.persist;
    if (!api) return null;
    try {
      return await api.persisted();
    } catch {
      return null;
    }
  }

  /** Asks the browser to keep the save through storage pressure (Firefox shows its own prompt); its answer. */
  async protect(): Promise<boolean | null> {
    const api = this.opts.persist;
    if (!api) return null;
    try {
      return await api.persist();
    } catch {
      return false;
    }
  }

  private keepForUndo(what: UndoWhat): void {
    const slot = JSON.stringify({ what, save: saveObject(this.current()) });
    // A full disk: the restore points make room (Undo matters more right now), then it goes without.
    if (!this.storage.trySet(SAVE_KEYS.undo, slot)) {
      this.storage.writeThrough(SAVE_KEYS.restorePoints, null);
      this.storage.trySet(SAVE_KEYS.undo, slot);
    }
  }

  /** Freezes saving (nothing the old visit holds can write over it), writes `stores` and reloads. */
  private overwrite(stores: StoreData): void {
    flushSettings(this.storage);
    this.storage.freeze('reloading');
    for (const { id, key } of SAVE_STORES) {
      const v = stores[id];
      this.storage.writeThrough(key, v === null || v === undefined ? null : JSON.stringify(v));
    }
    this.meta = { ...this.meta, format: SAVE_FORMAT, build: this.opts.build, savedAt: this.now().toISOString() };
    this.storage.writeThrough(SAVE_KEYS.meta, JSON.stringify(this.meta));
    this.opts.reload();
  }

  private writeMeta(): void {
    this.storage.trySet(SAVE_KEYS.meta, JSON.stringify(this.meta));
  }

  private tell(): void {
    for (const fn of this.listeners) fn();
  }
}

/** The save layer's keys share this start; their writes aren't "the game saved". */
const SAVE_KEY_PREFIX = 'airsoft.save.';

/** Each store's saved value (parsed); null for a store with nothing saved or something unreadable. */
export function readStores(storage: Pick<Storage, 'getItem'>): StoreData {
  const out: StoreData = {};
  for (const { id, key } of SAVE_STORES) {
    let v: unknown = null;
    try {
      v = JSON.parse(storage.getItem(key) ?? 'null');
    } catch {
      // Unreadable: as nothing saved (the store's own module reads it as its defaults too).
    }
    out[id] = v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null;
  }
  return out;
}

function readMeta(storage: Pick<Storage, 'getItem'>): Meta | null {
  try {
    const raw: unknown = JSON.parse(storage.getItem(SAVE_KEYS.meta) ?? 'null');
    if (!raw || typeof raw !== 'object') return null;
    const m = raw as Record<string, unknown>;
    if (typeof m.format !== 'number' || !Number.isInteger(m.format)) return null;
    const text = (v: unknown) => (typeof v === 'string' ? v : null);
    return { format: m.format, build: text(m.build) ?? '', savedAt: text(m.savedAt), downloadedAt: text(m.downloadedAt) };
  } catch {
    return null;
  }
}

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The player's own calendar day of a moment ("2026-10-4"), '' when unknown. */
function dayOf(iso: string): string {
  const d = parseDate(iso);
  return d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : '';
}
