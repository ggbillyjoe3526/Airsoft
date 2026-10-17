import { type LookSettings, ROBOT_CHOICES } from '../config/look';
import { menuRow } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

export interface LookSettingsOptions {
  initial: LookSettings;
  onChange: (look: LookSettings) => void;
}

/**
 * The Looks tab's rows (Settings › Looks, graphics overhaul G1), saved as they change and shown from the next match:
 * Robots. Realistic colours left for the Loadout's colour tab and the Retro look for the Dev tab (William, Dev 6
 * playtest, 2026-10-16); a saved Realistic colours is kept and passed on as it was.
 */
export function lookSettings(opts: LookSettingsOptions): HTMLDivElement[] {
  const look = { ...opts.initial };
  const robots = new OptionPicker('Robots', ROBOT_CHOICES, look.robots ? 'on' : 'off', 'robots', (v) => {
    look.robots = v === 'on';
    opts.onChange({ ...look });
  });
  return [menuRow('Robots', 'Who the players are drawn as. From the next match.', robots.root)];
}
