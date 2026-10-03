/**
 * Pure sound synthesis: renders a sound recipe (config/sounds.ts) into samples, with no Web Audio involved, so
 * every sound is built once when audio starts and played back as a buffer (cheap per shot, and testable here).
 * Presentation-only randomness: a small seeded generator, never the simulation's RNG.
 */

export type FilterType = 'lowpass' | 'highpass' | 'bandpass';
export type Wave = 'sine' | 'triangle' | 'saw' | 'square';

/** A filter on one layer: its type, centre or corner frequency (Hz, optionally gliding to `hzTo`) and resonance. */
export interface LayerFilter {
  type: FilterType;
  hz: number;
  hzTo?: number;
  q: number;
}

interface LayerTiming {
  /** Start, seconds after the sound's start. */
  at?: number;
  /** Fade in (s), then an exponential fall to -60 dB over `decay` (s). */
  attack: number;
  decay: number;
  /** Peak level (linear). */
  gain: number;
}

/** Filtered noise: puffs of air, hiss, scuffs, rustle. */
export interface NoiseLayer extends LayerTiming {
  kind: 'noise';
  filter: LayerFilter;
}

/** An oscillator whose pitch glides from `hz` to `hzTo` over `glide` seconds (the whole decay if not given). */
export interface ToneLayer extends LayerTiming {
  kind: 'tone';
  wave: Wave;
  hz: number;
  hzTo?: number;
  glide?: number;
  filter?: LayerFilter;
}

/**
 * Struck resonances (modal synthesis): decaying sines at a body's resonant frequencies, each with its own decay
 * time and level. Plastic and metal clacks, a spring's twang, a steel plate ringing under a boot.
 */
export interface ModesLayer {
  kind: 'modes';
  at?: number;
  gain: number;
  modes: readonly { hz: number; decay: number; gain: number }[];
}

export type Layer = NoiseLayer | ToneLayer | ModesLayer;

/** A sound recipe: layers mixed together. Each rendered variant moves pitch, timing and levels a little. */
export interface SoundRecipe {
  layers: readonly Layer[];
  /** Every frequency in a variant is scaled by up to ± this fraction. */
  pitchSpread: number;
  /** Every decay in a variant is scaled by up to ± this fraction. */
  timeSpread: number;
  /** Each layer's level in a variant is scaled by up to ± this fraction (the mix shifts a little). */
  gainSpread: number;
  /** Soft saturation (0 = none): more body and punch from the same layers, without a hard edge. */
  drive?: number;
}

/** -60 dB in natural-log units: an exponential decay reaches 1/1000 after its decay time. */
const DECAY_60DB = Math.log(1000);
/** Samples of fade at a sound's very end, so no buffer stops on a click. */
const END_FADE = 64;
/** Filter coefficients are recomputed this often while a filter glides (samples). */
const GLIDE_BLOCK = 32;
/** The highest a filter or oscillator may go, as a fraction of the sample rate (below Nyquist). */
const MAX_FREQ_FRACTION = 0.45;
/** Peak a rendered sound is limited to (headroom when several play at once is the mixer's job). */
const PEAK_LIMIT = 0.98;

/** Mulberry32: a small, fast seeded generator in [0, 1). */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A factor within 1 ± `spread`. */
function spreadFactor(rand: () => number, spread: number): number {
  return 1 + (rand() * 2 - 1) * spread;
}

/** One RBJ-cookbook biquad (direct form I). */
class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(
    private readonly type: FilterType,
    private readonly sampleRate: number,
  ) {}

  set(hz: number, q: number): void {
    const f = Math.min(Math.max(hz, 10), this.sampleRate * MAX_FREQ_FRACTION);
    const w = (2 * Math.PI * f) / this.sampleRate;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * Math.max(q, 0.05));
    const a0 = 1 + alpha;
    let b0: number;
    let b1: number;
    let b2: number;
    if (this.type === 'lowpass') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = b0;
    } else if (this.type === 'highpass') {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = b0;
    } else {
      // Band-pass with 0 dB at the centre.
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Runs `buf[from..to)` through `filter` in place, gliding its frequency (scaled by `pitch`) from hz to hzTo. */
function applyFilter(buf: Float32Array, from: number, to: number, filter: LayerFilter, pitch: number, sampleRate: number): void {
  const bq = new Biquad(filter.type, sampleRate);
  const start = filter.hz * pitch;
  const end = (filter.hzTo ?? filter.hz) * pitch;
  const span = Math.max(1, to - from);
  for (let i = from; i < to; i++) {
    if ((i - from) % GLIDE_BLOCK === 0) bq.set(start * (end / start) ** ((i - from) / span), filter.q);
    buf[i] = bq.process(buf[i]!);
  }
}

/** PolyBLEP: smooths an oscillator's jump at phase 0 so saw and square waves don't alias harshly. */
function polyBlep(phase: number, inc: number): number {
  if (phase < inc) {
    const t = phase / inc;
    return t + t - t * t - 1;
  }
  if (phase > 1 - inc) {
    const t = (phase - 1) / inc;
    return t * t + t + t + 1;
  }
  return 0;
}

function oscillator(wave: Wave, phase: number, inc: number): number {
  switch (wave) {
    case 'sine':
      return Math.sin(2 * Math.PI * phase);
    case 'triangle':
      return 1 - 4 * Math.abs(phase - 0.5);
    case 'saw':
      return 2 * phase - 1 - polyBlep(phase, inc);
    case 'square': {
      const p2 = (phase + 0.5) % 1;
      return (phase < 0.5 ? 1 : -1) + polyBlep(phase, inc) - polyBlep(p2, inc);
    }
  }
}

/** The seconds a layer lasts from the sound's start, with its decay scaled by `time`. */
function layerEnd(layer: Layer, time: number): number {
  if (layer.kind === 'modes') return (layer.at ?? 0) + Math.max(...layer.modes.map((m) => m.decay)) * time;
  return (layer.at ?? 0) + layer.attack + layer.decay * time;
}

/** How long a recipe's longest variant can last (seconds). */
export function recipeLength(recipe: SoundRecipe): number {
  return Math.max(...recipe.layers.map((l) => layerEnd(l, 1 + recipe.timeSpread)));
}

/** Scratch for one layer before it's mixed in (filters run on the layer alone). */
function renderLayer(layer: Layer, out: Float32Array, sampleRate: number, pitch: number, time: number, gain: number, rand: () => number): void {
  const from = Math.round((layer.at ?? 0) * sampleRate);
  const to = Math.min(out.length, Math.ceil(layerEnd(layer, time) * sampleRate));
  if (to <= from) return;
  if (layer.kind === 'modes') {
    // A 1 ms fade in keeps the strike from clicking; each mode starts at a random phase so variants differ.
    // Each mode is a sine rotated sample by sample (no sin or exp per sample: this is most of the render time).
    const fadeIn = sampleRate * 0.001;
    for (const m of layer.modes) {
      const hz = Math.min(m.hz * pitch, sampleRate * MAX_FREQ_FRACTION);
      const fall = Math.exp(-DECAY_60DB / (m.decay * time * sampleRate));
      const phase0 = rand() * 2 * Math.PI;
      const w = (2 * Math.PI * hz) / sampleRate;
      const cw = Math.cos(w);
      const sw = Math.sin(w);
      let sin = Math.sin(phase0);
      let cos = Math.cos(phase0);
      let level = layer.gain * m.gain * gain;
      for (let i = from; i < to; i++) {
        const n = i - from;
        out[i]! += level * (n < fadeIn ? n / fadeIn : 1) * sin;
        const s2 = sin * cw + cos * sw;
        cos = cos * cw - sin * sw;
        sin = s2;
        level *= fall;
      }
    }
    return;
  }
  const scratch = new Float32Array(to - from);
  const attack = layer.attack;
  const decay = layer.decay * time;
  if (layer.kind === 'noise') {
    for (let n = 0; n < scratch.length; n++) scratch[n] = rand() * 2 - 1;
    applyFilter(scratch, 0, scratch.length, layer.filter, pitch, sampleRate);
  } else {
    const startHz = layer.hz * pitch;
    const endHz = (layer.hzTo ?? layer.hz) * pitch;
    const glide = Math.max(1, (layer.glide ?? attack + decay) * sampleRate);
    let phase = rand();
    for (let n = 0; n < scratch.length; n++) {
      const hz = Math.min(startHz * (endHz / startHz) ** Math.min(1, n / glide), sampleRate * MAX_FREQ_FRACTION);
      const inc = hz / sampleRate;
      scratch[n] = oscillator(layer.wave, phase, inc);
      phase = (phase + inc) % 1;
    }
    if (layer.filter) applyFilter(scratch, 0, scratch.length, layer.filter, pitch, sampleRate);
  }
  // The envelope: a linear fade in, then a per-sample fall (exponential, without an exp per sample).
  const attackSamples = attack * sampleRate;
  const fall = Math.exp(-DECAY_60DB / (decay * sampleRate));
  let level = layer.gain * gain;
  for (let n = 0; n < scratch.length; n++) {
    if (n < attackSamples) {
      out[from + n]! += level * (n / attackSamples) * scratch[n]!;
    } else {
      out[from + n]! += level * scratch[n]!;
      level *= fall;
    }
  }
}

/**
 * Renders one variant of `recipe` at `sampleRate`. Variants differ through `rand` (pitch, timing, levels, noise),
 * so the same seed gives the same sound. The result never peaks above PEAK_LIMIT and fades out at its end.
 */
export function renderRecipe(recipe: SoundRecipe, sampleRate: number, rand: () => number): Float32Array {
  const pitch = spreadFactor(rand, recipe.pitchSpread);
  const time = spreadFactor(rand, recipe.timeSpread);
  const out = new Float32Array(Math.ceil(recipeLength(recipe) * sampleRate) + END_FADE);
  for (const layer of recipe.layers) renderLayer(layer, out, sampleRate, pitch, time, spreadFactor(rand, recipe.gainSpread), rand);
  const drive = recipe.drive ?? 0;
  if (drive > 0) {
    // tanh saturation, scaled so a quiet signal keeps its level and only the peaks round off.
    const k = 1 + drive;
    for (let i = 0; i < out.length; i++) out[i] = Math.tanh(k * out[i]!) / k;
  }
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]!));
  const scale = peak > PEAK_LIMIT ? PEAK_LIMIT / peak : 1;
  for (let i = 0; i < out.length; i++) {
    const tail = out.length - i;
    out[i] = out[i]! * scale * (tail < END_FADE ? tail / END_FADE : 1);
  }
  return out;
}

/** Low-passes and turns down a rendered sound in place (a suppressed replica: duller and quieter). */
export function muffle(buf: Float32Array, sampleRate: number, lowpassHz: number, gain: number): void {
  applyFilter(buf, 0, buf.length, { type: 'lowpass', hz: lowpassHz, q: 0.7 }, 1, sampleRate);
  for (let i = 0; i < buf.length; i++) buf[i] = buf[i]! * gain;
}
