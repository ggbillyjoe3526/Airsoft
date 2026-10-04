import { AUDIO } from '../config/audio';
import { SOUNDS, type SoundCue } from '../config/sounds';
import { muffle, renderRecipe, seededRandom } from './dsp';

/** Every sound, rendered: a few variants of each cue, as raw samples ready to copy into audio buffers. */
export type RenderedSounds = ReadonlyMap<SoundCue, readonly Float32Array[]>;

/**
 * Renders `variants` versions of every cue in config/sounds.ts at `sampleRate`, pausing (yielding) after each cue so
 * the work can be spread over the browser's spare time. Deterministic for a given seed, however it is spread.
 */
export function* renderSoundsGradually(
  sampleRate: number,
  variants: number = AUDIO.variants,
  seed: number = AUDIO.synthSeed,
): Generator<void, Map<SoundCue, Float32Array[]>> {
  const rand = seededRandom(seed);
  const out = new Map<SoundCue, Float32Array[]>();
  for (const cue of Object.keys(SOUNDS) as SoundCue[]) {
    const list: Float32Array[] = [];
    for (let v = 0; v < variants; v++) list.push(renderRecipe(SOUNDS[cue], sampleRate, rand));
    out.set(cue, list);
    yield;
  }
  return out;
}

/** Renders `variants` versions of every cue in config/sounds.ts at `sampleRate`, all at once. */
export function renderSounds(sampleRate: number, variants: number = AUDIO.variants, seed: number = AUDIO.synthSeed): Map<SoundCue, Float32Array[]> {
  return finish(renderSoundsGradually(sampleRate, variants, seed));
}

/** Runs a gradual job to its end and returns its result. */
function finish<T>(job: Generator<void, T>): T {
  for (;;) {
    const r = job.next();
    if (r.done) return r.value;
  }
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
 * The rendered sounds, kept for the page's lifetime and synthesised once per sample rate: in the browser's spare time
 * on the title screen (`step`), or all at once if a match needs them first (`get`). `render` is the renderer (a test
 * can count its calls).
 */
export class SoundLibrary {
  private readonly bySampleRate = new Map<number, RenderedSounds>();
  private readonly rendering = new Map<number, Generator<void, Map<SoundCue, Float32Array[]>>>();

  constructor(private readonly render: (sampleRate: number) => Generator<void, Map<SoundCue, Float32Array[]>> = renderSoundsGradually) {}

  /** Renders one more cue at `sampleRate`; true once every cue is there. */
  step(sampleRate: number): boolean {
    if (this.bySampleRate.has(sampleRate)) return true;
    let job = this.rendering.get(sampleRate);
    if (!job) {
      job = this.render(sampleRate);
      this.rendering.set(sampleRate, job);
    }
    const r = job.next();
    if (!r.done) return false;
    this.bySampleRate.set(sampleRate, r.value);
    this.rendering.delete(sampleRate);
    return true;
  }

  /** Every sound at `sampleRate`, finishing (or doing) the rendering now if it isn't done. */
  get(sampleRate: number): RenderedSounds {
    while (!this.step(sampleRate));
    return this.bySampleRate.get(sampleRate)!;
  }

  /** Whether the sounds at `sampleRate` are rendered and held. */
  holds(sampleRate: number): boolean {
    return this.bySampleRate.has(sampleRate);
  }

  /** Lets go of the samples at `sampleRate` once they live elsewhere (the engine's AudioBuffers), so they aren't held twice. */
  release(sampleRate: number): void {
    this.bySampleRate.delete(sampleRate);
  }
}
