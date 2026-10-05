import { type LookSettings, REALISTIC_COLOUR_CHOICES, ROBOT_CHOICES } from '../config/look';
import { menuRow } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

export interface LookSettingsOptions {
  initial: LookSettings;
  onChange: (look: LookSettings) => void;
}

/** The Look tab's rows (Settings › Look, graphics overhaul G1), each saved as it changes and shown from the next match. */
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
  return [
    menuRow('Robots', 'Who the players are drawn as. From the next match.', robots.root),
    menuRow('Realistic colours', 'Bold two-tone colour schemes, or plain real-world colours. Pick each replica’s scheme in Loadout › Customise. From the next match.', colours.root),
  ];
}
