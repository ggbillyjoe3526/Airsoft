/**
 * The player's saved settings: one versioned object in the browser (`airsoft.settings`), so new settings
 * and later format changes have one place to go (Fable audit W-02). Settings saved by earlier builds under
 * their own keys (`airsoft.sensitivity`, `airsoft.difficulty`, `airsoft.mode`) are read once as a fallback;
 * saving a field writes it into the object and drops its old key. Key bindings keep their own key
 * (input/keyBindings.ts). Every read and write tolerates blocked storage and garbage.
 */

export const SETTINGS_KEY = 'airsoft.settings';
export const SETTINGS_VERSION = 1;

/**
 * What each setting is called in the stored object (`hopUp.<replica id>`: that replica's hop-up dial;
 * `volume.<channel>`: a volume slider on Settings → Audio).
 */
export type SettingField =
  | 'sensitivity'
  | 'aimSensitivity'
  | 'difficulty'
  | 'mode'
  | 'crouch'
  | 'optic'
  | 'map'
  | 'fov'
  | `hopUp.${string}`
  | `volume.${string}`;

/** Where earlier builds kept a setting, before the settings object. */
const LEGACY_KEYS: Partial<Record<SettingField, string>> = {
  sensitivity: 'airsoft.sensitivity',
  difficulty: 'airsoft.difficulty',
  mode: 'airsoft.mode',
};

interface StoredSettings {
  version: number;
  [field: string]: unknown;
}

/** localStorage, or null where the browser blocks it (settings then last for the session only). */
export function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readObject(storage: Storage): StoredSettings | null {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object' && (parsed as StoredSettings).version === SETTINGS_VERSION) return parsed as StoredSettings;
  } catch {
    // Unreadable: treated as nothing saved.
  }
  return null;
}

/**
 * The saved value of `field`, or `fallback` if nothing valid is saved (or storage is blocked). `parse` turns
 * a stored value (the object's field, or an old key's string) into a setting, or returns undefined to reject it.
 */
export function loadSetting<T>(field: SettingField, parse: (raw: unknown) => T | undefined, fallback: T, storage = browserStorage()): T {
  if (!storage) return fallback;
  try {
    const stored = readObject(storage);
    if (stored && field in stored) {
      const v = parse(stored[field]);
      if (v !== undefined) return v;
    }
    const legacy = LEGACY_KEYS[field];
    const old = legacy === undefined ? null : storage.getItem(legacy);
    if (old !== null) {
      const v = parse(old);
      if (v !== undefined) return v;
    }
  } catch {
    // Storage unavailable (private mode etc.): fall back to the default.
  }
  return fallback;
}

/** Saves `field` into the settings object (the old per-setting key, if any, is dropped). Non-critical. */
export function saveSetting(field: SettingField, value: string | number | boolean, storage = browserStorage()): void {
  if (!storage) return;
  try {
    const stored = readObject(storage) ?? { version: SETTINGS_VERSION };
    stored[field] = value;
    storage.setItem(SETTINGS_KEY, JSON.stringify(stored));
    const legacy = LEGACY_KEYS[field];
    if (legacy !== undefined) storage.removeItem(legacy);
  } catch {
    // Non-critical: the setting still applies for this session.
  }
}

/** A parser for settings that are one of a fixed set of ids (difficulty, mode, crouch, optic). */
export function oneOf<T extends string>(ids: readonly T[]): (raw: unknown) => T | undefined {
  return (raw) => ids.find((id) => id === raw);
}

/** A parser for a number setting in [min, max] (the old keys stored numbers as strings). */
export function numberIn(min: number, max: number): (raw: unknown) => number | undefined {
  return (raw) => {
    const v = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
    return Number.isFinite(v) && v >= min && v <= max ? v : undefined;
  };
}
