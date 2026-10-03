import { volumeField, type Volumes } from '../audio/audioMix';
import { VOLUME, VOLUME_CHANNELS, type VolumeChannel } from '../config/audio';
import { menuRow, rangeControl } from './menus/menuParts';

export interface AudioSettingsOptions {
  initial: Volumes;
  onChange: (channel: VolumeChannel, position: number) => void;
}

/** Each volume slider's label and the line under it. */
const SLIDERS: Readonly<Record<VolumeChannel, { label: string; help: string }>> = {
  master: { label: 'Master volume', help: '' },
  effects: { label: 'Effects volume', help: 'Replicas, footsteps, impacts and the field.' },
  interface: { label: 'Interface volume', help: 'Hit tick, hit marker and the referee’s whistle.' },
};

/** The Audio tab's rows (Settings → Audio, M13): one slider per volume channel, saved and applied as it moves. */
export function audioSettings(opts: AudioSettingsOptions): HTMLDivElement[] {
  return VOLUME_CHANNELS.map((ch) =>
    menuRow(
      SLIDERS[ch].label,
      SLIDERS[ch].help,
      rangeControl(
        SLIDERS[ch].label,
        { min: VOLUME.min, max: VOLUME.max, step: VOLUME.step },
        opts.initial[ch],
        (v) => `${Math.round(v * 100)}%`,
        volumeField(ch),
        (v) => opts.onChange(ch, v),
      ),
    ),
  );
}
