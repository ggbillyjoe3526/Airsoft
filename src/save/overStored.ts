/** Minimal storage (localStorage in the game, a map in tests). */
interface ReadStore {
  getItem(key: string): string | null;
}

/**
 * `fresh` laid over the object already stored under `key` (when there is one), for a store about to be written: fields
 * this build doesn't know, written by a newer build or carried in by a loaded save, survive its save (M31, forward
 * compatibility). Never throws: anything unreadable counts as nothing stored.
 */
export function overStored(store: ReadStore, key: string, fresh: Record<string, unknown>): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(store.getItem(key) ?? 'null');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>), ...fresh };
  } catch {
    // Unreadable: just the fresh fields.
  }
  return fresh;
}

/**
 * True if the object stored under `key` is from a newer version of its store than `version` (M56, audit POOL-01): this
 * build then neither reads nor overwrites it, as the settings store does. Never throws: anything unreadable, or an
 * object without a numeric version, is not newer.
 */
export function storedIsNewer(store: ReadStore, key: string, version: number): boolean {
  try {
    const raw: unknown = JSON.parse(store.getItem(key) ?? 'null');
    const stored = raw && typeof raw === 'object' ? (raw as { version?: unknown }).version : undefined;
    return typeof stored === 'number' && stored > version;
  } catch {
    // Unreadable: not newer.
    return false;
  }
}
