import { DEFAULT_RETRO, RETRO_COLOURS, RETRO_PIXEL_SIZE, type RetroSettings } from '../config/look';
import { browserStorage, loadSetting, numberIn, oneOf, saveSetting, type SettingField } from './storage';

/**
 * Settings › Look › Retro look (M96): saved as `retroLook` ('on' / 'off'), `retroPixelSize` and `retroColours`. Before
 * M96 it was a Dev setting (M42: `dev.retroPixels`, `dev.retroPixelSize`, `dev.retroColours`); save keys are permanent,
 * so while nothing is saved under the new names the old ones are read. The switch carries over as it was in force: on
 * only if the Dev settings box was ticked too (with it unticked the filter never showed). The sliders carry over as
 * they were set. `carryOverDevRetro` writes them under the new names once, so unticking the Dev box later changes nothing.
 */

export const RETRO_FIELDS = { on: 'retroLook', pixelSize: 'retroPixelSize', colours: 'retroColours' } as const satisfies Record<keyof RetroSettings, SettingField>;
/** Where the Dev tab kept them (M42), read only to carry them over. */
const DEV_FIELDS = { on: 'dev.retroPixels', pixelSize: 'dev.retroPixelSize', colours: 'dev.retroColours', enabled: 'dev.enabled' } as const satisfies Record<string, SettingField>;

const onOff = oneOf(['on', 'off'] as const);
const isTrue = (raw: unknown): boolean | undefined => (typeof raw === 'boolean' ? raw : undefined);
const whole = (r: { min: number; max: number }) => (raw: unknown) => {
  const v = numberIn(r.min, r.max)(raw);
  return v === undefined ? undefined : Math.round(v);
};

/** The Retro look as saved, each part falling back to the Dev tab's old value and then to its default. */
export function loadRetroSettings(storage = browserStorage()): RetroSettings {
  const d = DEFAULT_RETRO;
  const devShown = loadSetting(DEV_FIELDS.enabled, isTrue, false, storage);
  const devOn = devShown && loadSetting(DEV_FIELDS.on, onOff, 'off', storage) === 'on';
  const size = whole(RETRO_PIXEL_SIZE);
  const colours = whole(RETRO_COLOURS);
  return {
    on: loadSetting(RETRO_FIELDS.on, onOff, devOn || d.on ? 'on' : 'off', storage) === 'on',
    pixelSize: loadSetting(RETRO_FIELDS.pixelSize, size, loadSetting(DEV_FIELDS.pixelSize, size, d.pixelSize, storage), storage),
    colours: loadSetting(RETRO_FIELDS.colours, colours, loadSetting(DEV_FIELDS.colours, colours, d.colours, storage), storage),
  };
}

/**
 * Once, as the game starts (M96): a Dev tab's Retro pixels saved before M96 is written under the public names, so it
 * stays as it was whatever happens to the Dev settings box later. Does nothing once `retroLook` is saved, or when no
 * Dev value was ever saved.
 */
export function carryOverDevRetro(storage = browserStorage()): void {
  const has = (field: SettingField): boolean => loadSetting(field, (raw) => (raw === undefined ? undefined : true), false, storage);
  if (has(RETRO_FIELDS.on) || !(has(DEV_FIELDS.on) || has(DEV_FIELDS.pixelSize) || has(DEV_FIELDS.colours))) return;
  const r = loadRetroSettings(storage);
  saveSetting(RETRO_FIELDS.pixelSize, r.pixelSize, storage);
  saveSetting(RETRO_FIELDS.colours, r.colours, storage);
  saveSetting(RETRO_FIELDS.on, r.on ? 'on' : 'off', storage);
}
