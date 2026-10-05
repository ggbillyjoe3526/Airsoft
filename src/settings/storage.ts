/**
 * The player's saved settings: one versioned object in the browser (`airsoft.settings`), so new settings
 * and later format changes have one place to go (Fable audit W-02). Settings saved by earlier builds under
 * their own keys (`airsoft.sensitivity`, `airsoft.difficulty`, `airsoft.mode`: "version 0") are carried into the
 * object as it is read (`migrate`), and the old keys go with the next save. Key bindings keep their own key
 * (input/keyBindings.ts). Every read and write tolerates blocked storage and garbage.
 *
 * The object is parsed once per stored text, not once per setting (audit UI-25). An object from a newer build
 * (a higher version) is neither read nor overwritten (KNOWN_ISSUES row 99): an older build opened after a newer one
 * keeps its changes for the session only.
 */

import { SETTINGS_WRITE_DELAY_MS } from '../config/menus';
import { guardedStorage } from '../save/guardedStorage';

export const SETTINGS_KEY = 'airsoft.settings';
export const SETTINGS_VERSION = 1;

/**
 * What each setting is called in the stored object (`hopUp.<replica id>` and `bbWeight.<replica id>`: that replica's
 * hop-up dial and BB weight; `glowBBs.<replica id>`: its Glowing BBs choice; `equip.<gear slot>`: the replica item in that Loadout slot and `fit.<asset id>.<fit slot>`:
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
  /** The Rules picker (M39): the ruleset, and Custom's switches (config/matchRules.ts). */
  | 'ruleset'
  | 'overtime'
  | 'timeOut'
  | 'minimapHeard'
  | 'fireModes'
  | 'magazines'
  | 'matchKit'
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
  /** Settings → Graphics → Tone mapping (audit section 5 F2; not part of a preset). */
  | 'toneMapping'
  /** The tutorial was played to the end (M16): the title stops pointing new players at it. */
  | 'tutorialDone'
  /** The tutorial's step still to do, to resume there next time (audit POOL-14); 0 once it is over. */
  | 'tutorialStep'
  | `hopUp.${string}`
  | `volume.${string}`
  | `bbWeight.${string}`
  /** That replica's Glowing BBs choice (M33b): at night, always or off. */
  | `glowBBs.${string}`
  /** That map's Day or Night pick (M34d, map/lightingChoice.ts), on a map that offers both. */
  | `lighting.${string}`
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
  /** Settings → HUD (M24); the HUD's size (audit UI-04). */
  | 'scoreboardSize'
  | 'hitFeed'
  | 'hudSize'
  /** Settings → Controls → Raw mouse input (audit UI-20). */
  | 'rawInput'
  /** The Dev settings (M24, settings/dev.ts): `dev.enabled` and one per entry in config/dev.ts. */
  | `dev.${string}`;

/** Where earlier builds kept a setting, before the settings object. */
const LEGACY_KEYS = {
  sensitivity: 'airsoft.sensitivity',
  difficulty: 'airsoft.difficulty',
  mode: 'airsoft.mode',
} as const satisfies Partial<Record<SettingField, string>>;

interface StoredSettings {
  version: number;
  [field: string]: unknown;
}

/**
 * Where the game keeps what it saves: the save system's guarded storage once it has started (M31,
 * save/guardedStorage.ts: it notices writes, keeps refused ones for the visit and can be frozen); before that, and in
 * unit tests, localStorage, or null where the browser blocks it (settings then last for the session only).
 */
export function browserStorage(): Storage | null {
  const guarded = guardedStorage();
  if (guarded) return guarded;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * The last text parsed for each storage and what it gave (null: nothing this build can read), with any changes not
 * written yet (`dirty`, saveSettingSoon) and the timer that will write them.
 */
interface ParsedSettings {
  text: string | null;
  settings: StoredSettings | null;
  newer: boolean;
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}
const parsed = new WeakMap<Storage, ParsedSettings>();

/**
 * The stored settings as this build reads them: the object parsed (once per stored text, audit UI-25) and migrated
 * from an older format. `newer`: the object is from a newer build, so this build neither reads nor overwrites it.
 */
function readStored(storage: Storage): ParsedSettings {
  const text = storage.getItem(SETTINGS_KEY);
  const cached = parsed.get(storage);
  if (cached && cached.text === text) return cached;
  let raw: unknown = null;
  try {
    raw = JSON.parse(text ?? 'null');
  } catch {
    // Unreadable: treated as nothing saved.
  }
  const version = raw && typeof raw === 'object' ? (raw as StoredSettings).version : undefined;
  const newer = typeof version === 'number' && version > SETTINGS_VERSION;
  const entry: ParsedSettings = { text, settings: newer ? null : migrate(raw, storage), newer, dirty: false, timer: null };
  parsed.set(storage, entry);
  return entry;
}

/**
 * Brings a stored object (or nothing) to SETTINGS_VERSION; null if nothing usable is stored. One case per format
 * change: the next version adds `case 1:` turning a version 1 object into a version 2 one, and so on. Version 0 is the
 * per-setting keys of the builds before the object (LEGACY_KEYS): any still there fill fields the object lacks.
 * Added fields need no case: the final alpha audit's Custom graphics rows (`graphics.<field>`, `quality: 'custom'`,
 * `frameRateCap`, `showFps`) went into version 1, and a reader falls back to its default for a field it doesn't find.
 */
export function migrate(raw: unknown, storage: Storage): StoredSettings | null {
  let stored: StoredSettings | null = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as StoredSettings) : null;
  switch (stored?.version ?? 0) {
    case 0: {
      // No object (or one without a version): only the old keys, if any.
      stored = null;
      break;
    }
    case SETTINGS_VERSION:
      break;
    default:
      return null;
  }
  for (const [field, key] of Object.entries(LEGACY_KEYS)) {
    if (stored && field in stored) continue;
    const old = storage.getItem(key);
    if (old === null) continue;
    stored ??= { version: SETTINGS_VERSION };
    stored[field] = old;
  }
  return stored;
}

/**
 * The saved value of `field`, or `fallback` if nothing valid is saved (or storage is blocked). `parse` turns
 * a stored value (the object's field, or an old key's string) into a setting, or returns undefined to reject it.
 */
export function loadSetting<T>(field: SettingField, parse: (raw: unknown) => T | undefined, fallback: T, storage = browserStorage()): T {
  if (!storage) return fallback;
  try {
    const stored = readStored(storage).settings;
    if (stored && field in stored) {
      const v = parse(stored[field]);
      if (v !== undefined) return v;
    }
  } catch {
    // Storage unavailable (private mode etc.): fall back to the default.
  }
  return fallback;
}

/**
 * Saves `field` into the settings object; the old per-setting keys, now carried into it, are dropped. Non-critical.
 * Not over an object from a newer build: the change then lasts for this session only.
 */
export function saveSetting(field: SettingField, value: string | number | boolean, storage = browserStorage()): void {
  if (!storage) return;
  try {
    const read = readStored(storage);
    if (read.newer) return;
    write(storage, { ...(read.settings ?? { version: SETTINGS_VERSION }), [field]: value });
  } catch {
    // Non-critical: the setting still applies for this session.
  }
}

/**
 * Saves `field` a moment later (SETTINGS_WRITE_DELAY_MS after the last such change, audit UI-11 / CORE-12): a slider
 * dragged or stepped with the keys writes the settings once, not once per step. Reads see the new value at once. The
 * game writes what is waiting when the page is hidden or closed (flushSettings).
 */
export function saveSettingSoon(field: SettingField, value: string | number | boolean, storage = browserStorage()): void {
  if (!storage) return;
  try {
    const read = readStored(storage);
    if (read.newer) return;
    read.settings = { ...(read.settings ?? { version: SETTINGS_VERSION }), [field]: value };
    read.dirty = true;
    if (read.timer !== null) clearTimeout(read.timer);
    read.timer = setTimeout(() => flushSettings(storage), SETTINGS_WRITE_DELAY_MS);
  } catch {
    // Non-critical: the setting still applies for this session.
  }
}

/** Writes any changes saveSettingSoon is holding, now. */
export function flushSettings(storage = browserStorage()): void {
  const read = storage ? parsed.get(storage) : undefined;
  if (!storage || !read?.dirty || !read.settings) return;
  try {
    write(storage, read.settings);
  } catch {
    // Non-critical, as saveSetting.
  }
}

/** Writes the whole object (the old per-setting keys, now carried into it, are dropped) and remembers its text. */
function write(storage: Storage, settings: StoredSettings): void {
  const old = parsed.get(storage);
  if (old?.timer) clearTimeout(old.timer);
  const text = JSON.stringify(settings);
  parsed.set(storage, { text, settings, newer: false, dirty: false, timer: null });
  storage.setItem(SETTINGS_KEY, text);
  for (const key of Object.values(LEGACY_KEYS)) storage.removeItem(key);
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
