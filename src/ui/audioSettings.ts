import { volumeField, type Volumes } from '../audio/audioMix';
import { VOLUME, VOLUME_CHANNELS, type VolumeChannel } from '../config/audio';
import { menuRow, rangeControl } from './menus/menuParts';

export interface AudioSettingsOptions {
  initial: Volumes;
  onChange: (channel: VolumeChannel, position: number) => void;
  /** A slider was let go (or stepped by a key): play a short cue through its bus (audit L-17). */
  onRelease?: (channel: VolumeChannel) => void;
}

/** Each volume slider's label and the line under it. */
const SLIDERS: Readonly<Record<VolumeChannel, { label: string; help: string }>> = {
  master: { label: 'Master volume', help: 'Everything the game plays; the sliders below set each part.' },
  effects: { label: 'Effects volume', help: 'Replicas, footsteps, impacts and the field around you.' },
  power: { label: 'Power source volume', help: 'Each replica’s battery motor, gas and spring as it fires, yours and everyone’s. Effects turns it down too.' },
  ambience: { label: 'Ambience volume', help: 'The field’s background: wind, birds, traffic. Effects turns it down too.' },
  interface: { label: 'Interface volume', help: 'Hit tick, hit marker and the referee’s whistle.' },
};

/**
 * The Audio tab's rows (Settings → Audio, M13): one slider per volume channel, saved and applied as it moves; letting
 * it go plays a short cue at the new level.
 */
export function audioSettings(opts: AudioSettingsOptions): HTMLDivElement[] {
  return VOLUME_CHANNELS.map((ch) => {
    const control = rangeControl(
      SLIDERS[ch].label,
      { min: VOLUME.min, max: VOLUME.max, step: VOLUME.step },
      opts.initial[ch],
      (v) => `${Math.round(v * 100)}%`,
      volumeField(ch),
      (v) => opts.onChange(ch, v),
    );
    control.querySelector('input')!.addEventListener('change', () => opts.onRelease?.(ch));
    return menuRow(SLIDERS[ch].label, SLIDERS[ch].help, control);
  });
}
