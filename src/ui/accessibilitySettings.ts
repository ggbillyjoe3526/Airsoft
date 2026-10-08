import { REDUCED_MOTION_CHOICES, SOUND_CUE_CHOICES, SOUND_CUE_COLOURS, SOUND_CUE_SIZE, type SoundCueColour } from '../config/accessibility';
import { cssColor, TEAM_COLOUR_CHOICES, TEAM_COLOUR_SETS, TEAMS, type TeamColourSetId } from '../config/teams';
import { el, menuRow, rangeControl } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

export interface AccessibilitySettingsOptions {
  /**
   * `follow` hands over a way to show a new value without saving it: the system's setting changing while no choice is
   * saved (audit UI-07, BP2).
   */
  reducedMotion: { initial: boolean; onChange: (on: boolean) => void; follow?: (show: (on: boolean) => void) => void };
  teamColours: { initial: TeamColourSetId; onChange: (set: TeamColourSetId) => void };
  soundCues: { initial: boolean; onChange: (on: boolean) => void };
  /** The markers' size (a scale, 1 = as before M24) and colour. */
  soundCueSize: { initial: number; onChange: (scale: number) => void };
  soundCueColour: { initial: SoundCueColour; onChange: (colour: SoundCueColour) => void };
}

/** The Accessibility tab's rows (Settings → Accessibility, M18), each saved and applied as it changes. */
export function accessibilitySettings(opts: AccessibilitySettingsOptions): HTMLDivElement[] {
  const teams = new OptionPicker('Team colours', TEAM_COLOUR_CHOICES, opts.teamColours.initial, 'teamColours', (v) => {
    showSwatches(v);
    opts.teamColours.onChange(v);
  });
  // A swatch per team in the picked set, as the figures wear it.
  const swatches = el('div', 'team-swatches');
  const showSwatches = (set: TeamColourSetId): void => {
    swatches.replaceChildren(
      ...TEAMS.map((t, i) => {
        const s = el('span', 'team-swatch', t.name);
        s.style.setProperty('--swatch', cssColor(TEAM_COLOUR_SETS[set].figures[i]!));
        return s;
      }),
    );
  };
  showSwatches(opts.teamColours.initial);
  const cueColours = new OptionPicker('Sound cue colour', SOUND_CUE_COLOURS, opts.soundCueColour.initial, 'soundCueColour', opts.soundCueColour.onChange);
  cueColours.addSwatches(SOUND_CUE_COLOURS);
  teams.root.append(swatches);
  const motion = new OptionPicker('Reduced motion', REDUCED_MOTION_CHOICES, opts.reducedMotion.initial ? 'on' : 'off', 'reducedMotion', (v) =>
    opts.reducedMotion.onChange(v === 'on'),
  );
  opts.reducedMotion.follow?.((on) => motion.show(on ? 'on' : 'off'));
  return [
    menuRow('Reduced motion', 'Less movement on screen, for players who feel motion sick.', motion.root),
    menuRow('Team colours', 'The two teams’ tape and armbands, and their colour on the HUD.', teams.root),
    menuRow(
      'On-screen sound cues',
      'Markers round the crosshair for footsteps, shots and hit calls, for playing without sound.',
      new OptionPicker('Sound cues', SOUND_CUE_CHOICES, opts.soundCues.initial ? 'on' : 'off', 'soundCues', (v) => opts.soundCues.onChange(v === 'on')).root,
    ),
    menuRow(
      'Sound cue size',
      'How big the markers round the crosshair are.',
      rangeControl('Sound cue size', SOUND_CUE_SIZE, opts.soundCueSize.initial, (v) => `${Math.round(v * 100)}%`, 'soundCueSize', opts.soundCueSize.onChange),
    ),
    menuRow('Sound cue colour', 'One colour for every marker.', cueColours.root),
  ];
}
