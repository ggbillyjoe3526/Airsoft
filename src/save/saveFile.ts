import { SAVE_GAME_ID, SAVE_FILE_PREFIX } from '../config/save';
import { sha256 } from './sha256';
import { SAVE_STORES, type StoreData, type StoreId } from './stores';

/**
 * The save file (M31): readable JSON a player can keep and load in any browser. Pure: no DOM, no storage.
 *
 * ```
 * { "game": "Airsoft", "format": 1, "build": "0.1 Dev 3+40 · abc1234", "savedAt": "2026-10-04T16:40:00.000Z",
 *   "summary": { "fc": 120, ... }, "stores": { "settings": {...}, "keyBindings": {...}, ... }, "checksum": "sha256:..." }
 * ```
 *
 * `format` is what migrations go by; `build` (the title screen's version, from git) and `savedAt` are for people.
 * `summary` is for anyone reading the file; the game works it out again from `stores`. The checksum covers `format` and
 * `stores` (canonical JSON: keys sorted, no spaces), so reformatting the file keeps it valid and a cut-off or edited one
 * is caught. It isn't a lock: the game's code is public, so anyone can recompute it.
 *
 * Forward compatibility, the rule: a save from any earlier format loads in every later build (MIGRATIONS walks it up one
 * format at a time); a save from a later format is refused, since this build would drop what it doesn't know.
 * SAVE_FORMAT goes up whenever a store's own version goes up or a store is added (STORES_BY_FORMAT records each, and a
 * test fails if the list and the stores disagree). Fields only added to a store (the usual change) need no new format:
 * every store keeps fields it doesn't know when it saves (save/overStored.ts).
 */

export const SAVE_FORMAT = 1;

/** The stores' own versions each format carried (id → version), for the test that keeps SAVE_FORMAT honest. */
export const STORES_BY_FORMAT: Readonly<Record<number, Readonly<Record<string, number>>>> = {
  1: { settings: 1, keyBindings: 0, records: 1, collection: 1 },
};

/**
 * One step per format change: MIGRATIONS[n] turns format n's stores into format n + 1's. Empty while there is only
 * format 1; the first change adds `1: (stores) => ...`, the stores' own `migrate` (settings/storage.ts) doing the rest.
 */
export const MIGRATIONS: Readonly<Record<number, (stores: StoreData) => StoreData>> = {};

/** What a save holds, read or about to be written. */
export interface SaveData {
  format: number;
  build: string;
  /** When it was taken (ISO 8601), or '' when unknown. */
  savedAt: string;
  stores: StoreData;
}

/** A save at a glance, for the comparison before a load and for anyone reading the file. */
export interface SaveSummary {
  fc: number;
  tokens: number;
  /** Copies owned in the Armory collection. */
  items: number;
  /** Matches with a result (wins and losses, every difficulty and mode). */
  matches: number;
}

export type ParseError = 'notJson' | 'notSave' | 'newer';

export type ParsedSave =
  | { ok: true; save: SaveData; checksumOk: boolean }
  | { ok: false; error: ParseError; build?: string };

/** A save as the file's object (also how the browser keeps restore points and Undo). */
export function saveObject(save: SaveData): Record<string, unknown> {
  return {
    game: SAVE_GAME_ID,
    format: save.format,
    build: save.build,
    savedAt: save.savedAt,
    summary: summarize(save.stores),
    stores: save.stores,
    checksum: checksum(save.format, save.stores),
  };
}

/** The file's text for a save: indented, so it can be read. */
export function saveFileText(save: SaveData): string {
  return `${JSON.stringify(saveObject(save), null, 2)}\n`;
}

/**
 * Reads a save file's text: refused when it isn't JSON, isn't an Airsoft save or comes from a newer format; otherwise
 * brought up to SAVE_FORMAT, with `checksumOk` false when the file was changed or damaged since it was written.
 * `migrations` and `current` are for tests.
 */
export function parseSaveText(text: string, migrations = MIGRATIONS, current = SAVE_FORMAT): ParsedSave {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'notJson' };
  }
  return parseSaveObject(raw, migrations, current);
}

/** parseSaveText for a value already parsed. */
export function parseSaveObject(raw: unknown, migrations = MIGRATIONS, current = SAVE_FORMAT): ParsedSave {
  if (!isObject(raw) || raw.game !== SAVE_GAME_ID) return { ok: false, error: 'notSave' };
  const format = raw.format;
  const build = typeof raw.build === 'string' ? raw.build : '';
  if (typeof format !== 'number' || !Number.isInteger(format) || format < 1 || !isObject(raw.stores)) return { ok: false, error: 'notSave' };
  if (format > current) return { ok: false, error: 'newer', build };
  const checksumOk = raw.checksum === checksum(format, raw.stores);
  const stores = migrateStores(cleanStores(raw.stores), format, migrations, current);
  if (!stores) return { ok: false, error: 'notSave' };
  return { ok: true, save: { format: current, build, savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '', stores }, checksumOk };
}

/**
 * Brings stores written in `from` up to `current`, one MIGRATIONS step at a time; null when a step is missing (a
 * format this build never knew, which can't happen for a published one).
 */
export function migrateStores(stores: StoreData, from: number, migrations = MIGRATIONS, current = SAVE_FORMAT): StoreData | null {
  let out = stores;
  for (let f = from; f < current; f++) {
    const step = migrations[f];
    if (!step) return null;
    out = step(out);
  }
  return out;
}

/** The known stores of a parsed `stores` object; each an object, or null (nothing saved, its defaults). */
function cleanStores(stores: Record<string, unknown>): StoreData {
  const out: StoreData = {};
  for (const { id } of SAVE_STORES) {
    const v = stores[id];
    out[id] = isObject(v) ? v : null;
  }
  return out;
}

export function summarize(stores: StoreData): SaveSummary {
  const c = field(stores, 'collection');
  let items = 0;
  if (isObject(c.owned)) for (const n of Object.values(c.owned)) items += whole(n);
  let matches = 0;
  const r = field(stores, 'records');
  if (isObject(r.results)) for (const wl of Object.values(r.results)) if (isObject(wl)) matches += whole(wl.wins) + whole(wl.losses);
  return { fc: whole(c.fc), tokens: whole(c.tokens), items, matches };
}

/** Nothing saved in any store (a new player, or a deleted save). */
export function isEmpty(stores: StoreData): boolean {
  return SAVE_STORES.every(({ id }) => stores[id] === null || stores[id] === undefined);
}

/** "sha256:<hex>" of the canonical JSON of the format and stores. */
export function checksum(format: number, stores: unknown): string {
  return `sha256:${sha256(canonicalJson({ format, stores }))}`;
}

/** JSON with every object's keys sorted and no spaces, so the same data always gives the same text. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => canonicalJson(x === undefined ? null : x)).join(',')}]`;
  if (isObject(v)) {
    const keys = Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** The download's file name for a moment, by the player's own calendar ("airsoft-save-2026-10-04.json"). */
export function saveFileName(at: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${SAVE_FILE_PREFIX}${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}.json`;
}

function field(stores: StoreData, id: StoreId): Record<string, unknown> {
  const v = stores[id];
  return isObject(v) ? v : {};
}

function whole(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
