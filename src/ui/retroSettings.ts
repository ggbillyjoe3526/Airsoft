import { RETRO_COLOURS, RETRO_LOOK_CHOICES, RETRO_PIXEL_SIZE, type RetroSettings, retroColoursText, retroPixelText } from '../config/look';
import { RETRO_FIELDS } from '../settings/retroLook';
import { menuRow, rangeControl } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

export interface RetroSettingsOptions {
  initial: RetroSettings;
  onChange: (retro: RetroSettings) => void;
}

/**
 * The Retro look's rows on the Dev tab (M96; moved from Settings › Look in the Dev 6 playtest, William, 2026-10-16):
 * the switch and its two sliders, saved and shown at once as they change, while the Dev tab is shown.
 */
export function retroSettings(opts: RetroSettingsOptions): HTMLDivElement[] {
  const retro = { ...opts.initial };
  const change = <K extends keyof RetroSettings>(key: K, value: RetroSettings[K]): void => {
    retro[key] = value;
    opts.onChange({ ...retro });
  };
  const picker = new OptionPicker('Retro look', RETRO_LOOK_CHOICES, retro.on ? 'on' : 'off', RETRO_FIELDS.on, (v) => change('on', v === 'on'));
  return [
    menuRow('Retro look', 'Chunky pixels and a small dithered palette, like a 1990s shooter. The HUD and menus stay sharp.', picker.root),
    menuRow(
      'Pixel size',
      'How big each retro pixel is, in screen pixels, with the Retro look on.',
      rangeControl('Retro pixel size', RETRO_PIXEL_SIZE, retro.pixelSize, retroPixelText, RETRO_FIELDS.pixelSize, (v) => change('pixelSize', v)),
    ),
    menuRow(
      'Colours',
      'How many colours the retro palette has, with the Retro look on: fewer is cruder.',
      rangeControl('Retro colours', RETRO_COLOURS, retro.colours, retroColoursText, RETRO_FIELDS.colours, (v) => change('colours', v)),
    ),
  ];
}
