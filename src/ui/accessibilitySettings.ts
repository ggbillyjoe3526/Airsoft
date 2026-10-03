import { REDUCED_MOTION_CHOICES } from '../config/accessibility';
import { menuRow } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

export interface AccessibilitySettingsOptions {
  reducedMotion: { initial: boolean; onChange: (on: boolean) => void };
}

/** The Accessibility tab's rows (Settings → Accessibility, M18), each saved and applied as it changes. */
export function accessibilitySettings(opts: AccessibilitySettingsOptions): HTMLDivElement[] {
  return [
    menuRow(
      'Reduced motion',
      'Less movement on screen, for players who feel motion sick.',
      new OptionPicker('Reduced motion', REDUCED_MOTION_CHOICES, opts.reducedMotion.initial ? 'on' : 'off', 'reducedMotion', (v) =>
        opts.reducedMotion.onChange(v === 'on'),
      ).root,
    ),
  ];
}
