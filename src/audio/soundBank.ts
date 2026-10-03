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
