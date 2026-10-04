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
 * What each setting is called in the stored object (`hopUp.<replica id>` and `bbWeight.<replica id>`: that replica's
 * hop-up dial and BB weight; `equip.<gear slot>`: the replica item in that Loadout slot and `fit.<asset id>.<fit slot>`:
 * the item fitted there (M26b, pool/loadoutModel.ts; `equip.dev.*` and `fit.dev.*` hold the picks made with Dev
 * settings → Unlock all gear, M26d); `volume.<channel>`: a volume slider on Settings → Audio;
 * `crosshair.<part>`: Settings → Crosshair).
 */
export type SettingField =
  | 'sensitivity'
  | 'aimSensitivity'
  | 'difficulty'
  | 'teammateDifficulty'
  | 'winsNeeded'
  | 'roundTime'
  | 'teamSize'
  | 'friendlyFire'
  | 'ricochets'
  | 'mode'
  | 'crouch'
  | 'aimMode'
  | 'sprintMode'
  /** How the order wheel gives an order (M23): hover or click. */
  | 'orderWheel'
  | 'invertMouse'
  | 'mouseDpi'
  | 'reducedMotion'
  | 'teamColours'
  | 'soundCues'
  | 'map'
  | 'fov'
  /** Settings → Graphics → Quality: a preset or 'custom' (config/render.ts QualityChoice). */
  | 'quality'
  /** The Custom rows (config/graphics.ts), one per QualitySettings field: read when Quality is Custom. */
  | `graphics.${string}`
  /** Settings → Graphics: the frame-rate cap and the FPS readout (not part of a preset). */
  | 'frameRateCap'
  | 'showFps'
  /** The tutorial was played to the end (M16): the title stops pointing new players at it. */
  | 'tutorialDone'
  | `hopUp.${string}`
  | `volume.${string}`
  | `bbWeight.${string}`
  | `equip.${string}`
  | `fit.${string}`
  | `crosshair.${string}`
  /** Before M26 (read once by pool/oldPicks.ts): the rifle's optic and each replica's grip and magazine. */
  | 'optic'
  | `grip.${string}`
  | `mag.${string}`
  /** Those picks were carried into the asset pool (M26b). */
  | 'oldPicksCarried'
  /** Settings → Accessibility, the sound cues' look (M24). */
  | 'soundCueSize'
  | 'soundCueColour'
  /** Settings → HUD (M24). */
  | 'scoreboardSize'
  | 'hitFeed'
  /** The Dev settings (M24, settings/dev.ts): `dev.enabled` and one per entry in config/dev.ts. */
  | `dev.${string}`;

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

/**
 * Format changes, by the version they upgrade from: `MIGRATIONS[n]` turns a version-n object into a version-n+1 one.
 * Empty so far: every change since version 1 has only added fields (the final alpha audit's Custom graphics rows too),
 * and a reader falls back to the default for a field it doesn't find. A rename or a changed meaning adds an entry here
 * and bumps SETTINGS_VERSION, so no saved setting is lost to the version check.
 */
export const MIGRATIONS: Readonly<Record<number, (stored: Record<string, unknown>) => Record<string, unknown>>> = {};

/** `stored` brought up to SETTINGS_VERSION through `migrations`, or null if it can't be (a future or unknown version). */
export function migrateSettings(stored: unknown, migrations = MIGRATIONS, version = SETTINGS_VERSION): StoredSettings | null {
  if (!stored || typeof stored !== 'object') return null;
  let s = stored as StoredSettings;
  while (typeof s.version === 'number' && s.version < version) {
    const step = migrations[s.version];
    if (!step) return null;
    s = { ...step(s), version: s.version + 1 };
  }
  return s.version === version ? s : null;
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
    return migrateSettings(JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null'));
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
