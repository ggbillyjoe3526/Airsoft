import { AUDIO } from '../config/audio';
import { SOUNDS, type SoundCue } from '../config/sounds';
import { muffle, renderRecipe, seededRandom } from './dsp';

/** Every sound, rendered: a few variants of each cue, as raw samples ready to copy into audio buffers. */
export type RenderedSounds = ReadonlyMap<SoundCue, readonly Float32Array[]>;

/** Renders `variants` versions of every cue in config/sounds.ts at `sampleRate`. Deterministic for a given seed. */
export function renderSounds(sampleRate: number, variants: number = AUDIO.variants, seed: number = AUDIO.synthSeed): Map<SoundCue, Float32Array[]> {
  const rand = seededRandom(seed);
  const out = new Map<SoundCue, Float32Array[]>();
  for (const cue of Object.keys(SOUNDS) as SoundCue[]) {
    const list: Float32Array[] = [];
    for (let v = 0; v < variants; v++) list.push(renderRecipe(SOUNDS[cue], sampleRate, rand));
    out.set(cue, list);
  }
  return out;
}

/** Muffled copies of a shot's variants, for a replica fitted with a suppressor (AUDIO.suppressed). */
export function suppressedCopies(variants: readonly Float32Array[], sampleRate: number): Float32Array[] {
  return variants.map((v) => {
    const copy = v.slice();
    muffle(copy, sampleRate, AUDIO.suppressed.lowpassHz, AUDIO.suppressed.volume);
    return copy;
  });
}

/**
 * The rendered sounds, kept for the page's lifetime: each match makes its own audio context, but the sounds are
 * only synthesised once per sample rate (the first Play), not on every Play.
 */
export class SoundLibrary {
  private readonly bySampleRate = new Map<number, RenderedSounds>();

  get(sampleRate: number): RenderedSounds {
    let sounds = this.bySampleRate.get(sampleRate);
    if (!sounds) {
      sounds = renderSounds(sampleRate);
      this.bySampleRate.set(sampleRate, sounds);
    }
    return sounds;
  }
}
