import { AUDIO, type LoopId } from '../config/audio';
import { MAP_CUE_SEEDS, SOUNDS, type SoundCue, TITLE_CUES } from '../config/sounds';
import { renderLoop } from './ambience';
import { muffle, renderRecipe, seededRandom } from './dsp';

/** Every sound, rendered: a few variants of each cue, as raw samples ready to copy into audio buffers. */
export type RenderedSounds = ReadonlyMap<SoundCue, readonly Float32Array[]>;

/**
 * How many variants of `cue` are rendered: its recipe's own count (M69, audit AUD-08; absent: AUDIO.variants), at most
 * `most` (a test's lighter bank).
 */
export function variantsOf(cue: SoundCue, most: number = Number.POSITIVE_INFINITY): number {
  return Math.min(SOUNDS[cue].variants ?? AUDIO.variants, most);
}

/**
 * Renders `variants` versions of every title-screen cue in config/sounds.ts (TITLE_CUES: all but the map cues) at
 * `sampleRate`, in table order from one seeded stream, and keeps as many as the cue has (variantsOf), pausing (yielding)
 * after each cue so the work can be spread over the browser's spare time. Deterministic for a given seed, however it is
 * spread. A cue that keeps fewer still draws the others from the stream (M69, audit AUD-08), so every cue after it
 * sounds as it did: a dropped count.beep costs well under a millisecond.
 */
export function* renderSoundsGradually(
  sampleRate: number,
  variants: number = AUDIO.variants,
  seed: number = AUDIO.synthSeed,
): Generator<void, Map<SoundCue, Float32Array[]>> {
  const rand = seededRandom(seed);
  const out = new Map<SoundCue, Float32Array[]>();
  for (const cue of TITLE_CUES) {
    const list: Float32Array[] = [];
    const keep = variantsOf(cue, variants);
    for (let v = 0; v < variants; v++) {
      const samples = renderRecipe(SOUNDS[cue], sampleRate, rand);
      if (v < keep) list.push(samples);
    }
    out.set(cue, list);
    yield;
  }
  return out;
}

/**
 * The variants of map cue `cue` (MAP_CUE_SEEDS, M33j; variantsOf, at most `variants`) at `sampleRate`, from the cue's
 * own seed: the same whatever else has been rendered, and whichever maps were played first.
 */
export function renderMapCue(cue: SoundCue, sampleRate: number, variants?: number): Float32Array[] {
  return finish(renderMapCueGradually(cue, sampleRate, variants));
}

/**
 * renderMapCue a variant at a time (M65, audit AUD-01): pauses (yields) after each variant but the last, so New game's
 * spare time can render a field's sounds ahead of Play. The same samples however the steps are spread.
 */
export function* renderMapCueGradually(cue: SoundCue, sampleRate: number, variants?: number): Generator<void, Float32Array[]> {
  const seed = MAP_CUE_SEEDS[cue];
  if (seed === undefined) throw new Error(`${cue} is not a map cue`);
  const rand = seededRandom(seed);
  const list: Float32Array[] = [];
  for (let v = 0, n = variantsOf(cue, variants); v < n; v++) {
    if (v > 0) yield;
    list.push(renderRecipe(SOUNDS[cue], sampleRate, rand));
  }
  return list;
}

/** How a field's own sounds are rendered a step at a time (M65): a map cue's variants and a loop. A test can count the calls. */
export interface MapSoundRenderers {
  cue(cue: SoundCue, sampleRate: number): Generator<void, Float32Array[]>;
  loop(id: LoopId, sampleRate: number): Generator<void, Float32Array>;
}

export const MAP_SOUND_RENDERERS: MapSoundRenderers = { cue: (cue, sampleRate) => renderMapCueGradually(cue, sampleRate), loop: renderLoop };

/**
 * Renders every title-screen cue in config/sounds.ts at `sampleRate` (renderSoundsGradually), all at once (test only: the game
 * renders them a slice at a time through SoundBank).
 */
export function renderSounds(sampleRate: number, variants: number = AUDIO.variants, seed: number = AUDIO.synthSeed): Map<SoundCue, Float32Array[]> {
  return finish(renderSoundsGradually(sampleRate, variants, seed));
}

/** Runs a gradual job to its end (from wherever it was left) and returns its result. */
export function finish<T>(job: Generator<void, T>): T {
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
