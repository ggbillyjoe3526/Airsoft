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
