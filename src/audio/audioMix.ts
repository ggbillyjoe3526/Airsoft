import { VOLUME, VOLUME_CHANNELS, type VolumeChannel } from '../config/audio';
import { loadSetting, numberIn, saveSetting } from '../settings/storage';

export type Volumes = Record<VolumeChannel, number>;

/** The settings field a volume slider saves to. */
export function volumeField(channel: VolumeChannel): `volume.${VolumeChannel}` {
  return `volume.${channel}`;
}

/** The saved volume sliders (Settings → Audio), each with its default where nothing valid is saved. */
export function loadVolumes(storage?: Storage | null): Volumes {
  const out = { ...VOLUME.defaults };
  for (const ch of VOLUME_CHANNELS) out[ch] = loadSetting(volumeField(ch), numberIn(VOLUME.min, VOLUME.max), VOLUME.defaults[ch], storage);
  return out;
}

/** Saves one volume slider. */
export function saveVolume(channel: VolumeChannel, value: number, storage?: Storage | null): void {
  saveSetting(volumeField(channel), value, storage);
}

/** A slider's position (0..1) as a gain: a power curve, so the low end isn't all squeezed into the first notch. */
export function volumeGain(position: number): number {
  return Math.min(1, Math.max(0, position)) ** VOLUME.curve;
}
