import { DEV_DEFAULTS, DEV_ENTRIES, type DevSettings } from '../config/dev';
import { browserStorage, loadSetting, numberIn, oneOf, type SettingField } from './storage';

/**
 * The Dev settings' saved values (config/dev.ts): each as `dev.<id>` (a switch as 'on' / 'off', as the other switches),
 * and whether the tab is shown as `dev.enabled` (true / false, from its checkbox).
 */

export const DEV_ENABLED_FIELD: SettingField = 'dev.enabled';

export function devField(id: keyof DevSettings): SettingField {
  return `dev.${id}`;
}

const isBoolean = (raw: unknown): boolean | undefined => (typeof raw === 'boolean' ? raw : undefined);
const onOff = oneOf(['on', 'off'] as const);

/** Whether "Dev settings" is ticked (the tab shown, the settings applied). */
export function loadDevEnabled(storage = browserStorage()): boolean {
  return loadSetting(DEV_ENABLED_FIELD, isBoolean, false, storage);
}

/** Every Dev setting as saved, each falling back to its default. */
export function loadDevSettings(storage = browserStorage()): DevSettings {
  const d: DevSettings = { ...DEV_DEFAULTS };
  for (const e of DEV_ENTRIES) {
    if (e.kind === 'switch') d[e.id] = loadSetting(devField(e.id), onOff, DEV_DEFAULTS[e.id] ? 'on' : 'off', storage) === 'on';
    else d[e.id] = loadSetting(devField(e.id), numberIn(e.min, e.max), DEV_DEFAULTS[e.id], storage);
  }
  return d;
}
