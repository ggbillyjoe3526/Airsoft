/**
 * The browser storage every save goes through (M31): localStorage, with three things added.
 *
 * - It notices each write of the game's own stores (keys under `airsoft.`), so the Save tab can say when it last saved,
 *   and each write the browser refuses (storage full or blocked), so the game can warn.
 * - It can be frozen: writes then land in memory only, for the rest of the visit. The game freezes it while another tab
 *   has the save, when this browser's save was written by a newer build, and just before a loaded save reloads the page.
 * - What the browser refuses is still kept in memory, and reads see it, so the visit carries on and a download made
 *   before closing has everything. With localStorage blocked outright, the save system starts it over memory only.
 *
 * The settings and the other stores reach it through `browserStorage()` (settings/storage.ts) once the save system has
 * started (`startGuardedStorage`); until then, and in unit tests, `browserStorage()` stays plain localStorage or null.
 */

const GAME_PREFIX = 'airsoft.';
const PROBE_KEY = `${GAME_PREFIX}probe`;

/** Why writes are held in memory. */
export type FreezeReason = 'otherTab' | 'newer' | 'reloading';

export class GuardedStorage implements Storage {
  [name: string]: unknown;
  /** Values the backing store doesn't hold (refused, frozen or no backing store); null: removed. */
  private readonly overlay = new Map<string, string | null>();
  private frozenFor: FreezeReason | null = null;
  private failed: boolean;
  private readonly writeListeners = new Set<(key: string) => void>();
  private readonly problemListeners = new Set<() => void>();

  /**
   * `backing`: localStorage, or null when the browser blocks it (everything then lasts for the visit). `refusing`: it
   * can be read but refused a write already (full, or site data blocked).
   */
  constructor(
    private readonly backing: Storage | null,
    refusing = false,
  ) {
    this.failed = refusing;
  }

  /** Writes reach the browser's storage (not blocked, not failing, not frozen). */
  get keeping(): boolean {
    return this.backing !== null && !this.failed && this.frozenFor === null;
  }

  /** The browser refused a write, or blocks storage altogether. */
  get blocked(): boolean {
    return this.backing === null || this.failed;
  }

  get frozen(): FreezeReason | null {
    return this.frozenFor;
  }

  /** Holds every later write of the game's keys in memory (see the header). Once frozen it stays so for the visit. */
  freeze(reason: FreezeReason): void {
    if (this.frozenFor) return;
    this.frozenFor = reason;
    this.tellProblem();
  }

  /** Hears of each saved write of a game store (its key). */
  onWrite(fn: (key: string) => void): () => void {
    this.writeListeners.add(fn);
    return () => this.writeListeners.delete(fn);
  }

  /** Hears when saving stops working (a refused write, a freeze). */
  onProblem(fn: () => void): () => void {
    this.problemListeners.add(fn);
    return () => this.problemListeners.delete(fn);
  }

  getItem(key: string): string | null {
    if (this.overlay.has(key)) return this.overlay.get(key)!;
    try {
      return this.backing?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    this.store(key, String(value), false);
  }

  removeItem(key: string): void {
    this.store(key, null, false);
  }

  /** Writes past a freeze: the save system's own last writes before the page reloads (a loaded save). */
  writeThrough(key: string, value: string | null): void {
    this.store(key, value, true);
  }

  /**
   * The save layer's own bookkeeping (restore points, Undo, when it last saved): straight to the browser's storage when
   * it is being kept, true if it took it. A refusal here (a full disk) is not a saving problem: nothing is kept in memory
   * and no warning is raised.
   */
  trySet(key: string, value: string): boolean {
    if (!this.backing || this.frozenFor !== null) return false;
    try {
      this.backing.setItem(key, value);
      this.overlay.delete(key);
      return true;
    } catch {
      return false;
    }
  }

  get length(): number {
    return this.keys().length;
  }

  key(index: number): string | null {
    return this.keys()[index] ?? null;
  }

  clear(): void {
    for (const k of this.keys()) this.removeItem(k);
  }

  private keys(): string[] {
    const all = new Set<string>();
    try {
      if (this.backing) for (let i = 0; i < this.backing.length; i++) all.add(this.backing.key(i)!);
    } catch {
      // Unreadable: the overlay only.
    }
    for (const [k, v] of this.overlay) {
      if (v === null) all.delete(k);
      else all.add(k);
    }
    return [...all];
  }

  private store(key: string, value: string | null, past: boolean): void {
    const game = key.startsWith(GAME_PREFIX);
    if (this.backing && (past || !game || this.frozenFor === null)) {
      try {
        if (value === null) this.backing.removeItem(key);
        else this.backing.setItem(key, value);
        this.overlay.delete(key);
        if (game) for (const fn of this.writeListeners) fn(key);
        return;
      } catch {
        if (!this.failed) {
          this.failed = true;
          this.tellProblem();
        }
      }
    }
    this.overlay.set(key, value);
  }

  private tellProblem(): void {
    for (const fn of this.problemListeners) fn();
  }
}

let started: GuardedStorage | null = null;

/** The visit's guarded storage, made once over localStorage (or memory when the browser blocks it). */
export function startGuardedStorage(): GuardedStorage {
  if (started) return started;
  let backing: Storage | null = null;
  try {
    backing = globalThis.localStorage ?? null;
  } catch {
    // Blocked outright (site data off): memory only.
  }
  let refusing = false;
  try {
    // A store that can be read but refuses writes (full, blocked site data) is found here, not mid-match.
    backing?.setItem(PROBE_KEY, '1');
    backing?.removeItem(PROBE_KEY);
  } catch {
    refusing = true;
  }
  started = new GuardedStorage(backing, refusing);
  return started;
}

/** The guarded storage once the save system has started it, else null (unit tests, before start-up). */
export function guardedStorage(): GuardedStorage | null {
  return started;
}
