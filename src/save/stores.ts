import { RECORDS_KEY } from '../config/matchInfo';
import { KEY_BINDINGS_KEY } from '../input/keyBindings';
import { PROGRESS_KEY, PROGRESS_VERSION } from '../progress/progress';
import { SAVED_LOADOUTS_KEY, SAVED_LOADOUTS_VERSION } from '../pool/savedLoadouts';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { RECORDS_VERSION } from '../stats/records';

/**
 * The stores a save holds (M31), each one key in the browser that its own module reads and writes as the game runs:
 * the settings (with the Loadout picks, Dev settings and the tutorial flag), key bindings, records, the level progress
 * (XP and what it unlocked, LV1) and the saved loadouts (SL1). `version`: the format the store's own module writes now
 * (0: it carries none). A store added later joins this list; a save without it simply leaves it at its defaults.
 */
export const SAVE_STORES = [
  { id: 'settings', key: SETTINGS_KEY, version: SETTINGS_VERSION },
  { id: 'keyBindings', key: KEY_BINDINGS_KEY, version: 0 },
  { id: 'records', key: RECORDS_KEY, version: RECORDS_VERSION },
  { id: 'progress', key: PROGRESS_KEY, version: PROGRESS_VERSION },
  { id: 'loadouts', key: SAVED_LOADOUTS_KEY, version: SAVED_LOADOUTS_VERSION },
] as const;

export type StoreId = (typeof SAVE_STORES)[number]['id'];

/** Each store's stored value (parsed), or null when it has nothing saved (its defaults). */
export type StoreData = Partial<Record<StoreId, unknown>>;
