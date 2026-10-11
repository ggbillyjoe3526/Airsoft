import {
  type LookSettings,
  REALISTIC_COLOUR_CHOICES,
  RETRO_COLOURS,
  RETRO_LOOK_CHOICES,
  RETRO_PIXEL_SIZE,
  type RetroSettings,
  retroColoursText,
  retroPixelText,
  ROBOT_CHOICES,
} from '../config/look';
import { RETRO_FIELDS } from '../settings/retroLook';
import { menuRow, rangeControl } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

export interface LookSettingsOptions {
  initial: LookSettings;
  onChange: (look: LookSettings) => void;
  /** The Retro look (M96, the Dev tab's Retro pixels before): shown at once as it changes. */
  retro: { initial: RetroSettings; onChange: (retro: RetroSettings) => void };
}

/**
 * The Look tab's rows (Settings › Look, graphics overhaul G1), each saved as it changes: Robots and Realistic colours
 * from the next match, then the Retro look and its two sliders (M96) at once.
 */
export function lookSettings(opts: LookSettingsOptions): HTMLDivElement[] {
  const look = { ...opts.initial };
  const robots = new OptionPicker('Robots', ROBOT_CHOICES, look.robots ? 'on' : 'off', 'robots', (v) => {
    look.robots = v === 'on';
    opts.onChange({ ...look });
  });
  const colours = new OptionPicker('Replica colours', REALISTIC_COLOUR_CHOICES, look.realisticColours ? 'on' : 'off', 'realisticColours', (v) => {
    look.realisticColours = v === 'on';
    opts.onChange({ ...look });
  });
  const retro = { ...opts.retro.initial };
  const changeRetro = <K extends keyof RetroSettings>(key: K, value: RetroSettings[K]): void => {
    retro[key] = value;
    opts.retro.onChange({ ...retro });
  };
  const retroPicker = new OptionPicker('Retro look', RETRO_LOOK_CHOICES, retro.on ? 'on' : 'off', RETRO_FIELDS.on, (v) => changeRetro('on', v === 'on'));
  return [
    menuRow('Robots', 'Who the players are drawn as. From the next match.', robots.root),
    menuRow('Realistic colours', 'Bold two-tone colour schemes, or plain real-world colours. From the next match.', colours.root),
    menuRow('Retro look', 'Chunky pixels and a small dithered palette, like a 1990s shooter. The HUD and menus stay sharp.', retroPicker.root),
    menuRow(
      'Pixel size',
      'How big each retro pixel is, in screen pixels, with the Retro look on.',
      rangeControl('Retro pixel size', RETRO_PIXEL_SIZE, retro.pixelSize, retroPixelText, RETRO_FIELDS.pixelSize, (v) => changeRetro('pixelSize', v)),
    ),
    menuRow(
      'Colours',
      'How many colours the retro palette has, with the Retro look on: fewer is cruder.',
      rangeControl('Retro colours', RETRO_COLOURS, retro.colours, retroColoursText, RETRO_FIELDS.colours, (v) => changeRetro('colours', v)),
    ),
  ];
}
