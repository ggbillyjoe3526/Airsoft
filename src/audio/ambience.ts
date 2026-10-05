import { AMBIENT_LOOPS, AUDIO, type AmbientCallSpec, type CrackleLoopSpec, type HumLoopSpec, type InsectLoopSpec, type LoopId, type NoiseLoopSpec } from '../config/audio';
import type { Vec3 } from '../sim/vec';
import { Biquad, seededRandom } from './dsp';

/**
 * The yard's quiet outdoor bed (audit CORE-34), rendered once per page like every other sound: filtered noise (a
 * band rolled off above it for distant traffic and air, a low rumble under it) whose level swells in slow gusts, made
 * into a seamless loop of `spec.seconds` by crossfading its tail over its head. Normalised to a loudness (RMS) of 1: the
 * level it plays at is its bed's gain (config/audio.ts AMBIENCES). Yields after each second of sound, so the title
 * screen's spare moments can spread the work; deterministic for a generator. Another noise loop (M33j: the wind in the
 * woods' pines) is the same recipe with other values.
 */
export function* renderAmbienceBed(
  sampleRate: number,
  rand: () => number = seededRandom(AUDIO.ambience.seed),
  spec: Omit<NoiseLoopSpec, 'kind'> = AUDIO.ambience,
): Generator<void, Float32Array> {
  const a = spec;
  const loop = Math.round(a.seconds * sampleRate);
  const fade = Math.round(a.crossfade * sampleRate);
  const raw = new Float32Array(loop + fade);
  const band = new Biquad('bandpass', sampleRate);
  band.set(a.bandHz, a.bandQ);
  const top = new Biquad('lowpass', sampleRate);
  top.set(a.topHz, Math.SQRT1_2);
  const rumble = new Biquad('lowpass', sampleRate);
  rumble.set(a.rumbleHz, Math.SQRT1_2);
  const gustPhase = rand();
  for (let i = 0; i < raw.length; i++) {
    // Whole gust cycles per loop: the swell at the loop's end matches its start.
    const gust = 1 - a.gustDepth * 0.5 * (1 + Math.cos(2 * Math.PI * ((a.gusts * i) / loop + gustPhase)));
    raw[i] = (top.process(band.process(rand() * 2 - 1)) + a.rumbleMix * rumble.process(rand() * 2 - 1)) * gust;
    if ((i + 1) % sampleRate === 0) yield;
  }
  return seamless(raw, loop, fade);
}

/**
 * A loop of `loop` samples from `raw` (`loop + fade` long): its last `fade` samples continue into its first, equal power
 * (the two stretches are unrelated noise), normalised to a loudness (RMS) of 1.
 */
function seamless(raw: Float32Array, loop: number, fade: number): Float32Array {
  const out = raw.subarray(0, loop);
  for (let i = 0; i < fade; i++) {
    const k = (i / fade) * (Math.PI / 2);
    out[i] = raw[i]! * Math.sin(k) + raw[loop + i]! * Math.cos(k);
  }
  return normalised(out);
}

/** A copy of `out` scaled to a loudness (RMS) of 1. */
function normalised(out: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < out.length; i++) sum += out[i]! ** 2;
  const scale = 1 / Math.sqrt(sum / out.length || 1);
  for (let i = 0; i < out.length; i++) out[i] = out[i]! * scale;
  return out.slice();
}

/**
 * Insects at night (M33j): each voice a pair of slightly beating sines high above the footstep band, switched on and off
 * in quick pulses grouped into chirps, every chirp a little louder or softer than the last (from a seed). Every
 * frequency and rate is a whole number of cycles per loop, so the loop is seamless without a crossfade. Normalised to a
 * loudness (RMS) of 1; yields after each second of sound.
 */
export function* renderInsects(sampleRate: number, spec: InsectLoopSpec): Generator<void, Float32Array> {
  const loop = Math.round(spec.seconds * sampleRate);
  const out = new Float32Array(loop);
  const rand = seededRandom(spec.seed);
  const whole = (hz: number): number => Math.max(1, Math.round(hz * spec.seconds)) / spec.seconds;
  const voices = spec.voices.map((v) => {
    const chirpLevels = Float32Array.from({ length: v.chirps }, () => v.level * (1 - spec.jitter * rand()));
    return { ...v, hz: whole(v.hz), twin: whole(v.hz * INSECT_TWIN), period: loop / v.chirps, pulse: sampleRate / v.pulseHz, chirpLevels, phase: rand() };
  });
  for (let i = 0; i < loop; i++) {
    let s = 0;
    for (const v of voices) {
      const at = (i + v.phase * loop) % loop;
      const chirp = Math.floor(at / v.period);
      const inChirp = at - chirp * v.period;
      const n = Math.floor(inChirp / v.pulse);
      if (n >= v.pulses) continue;
      // A raised-cosine pulse over the first INSECT_DUTY of each pulse's slot: no clicks.
      const p = (inChirp - n * v.pulse) / (v.pulse * INSECT_DUTY);
      if (p >= 1) continue;
      const env = 0.5 - 0.5 * Math.cos(2 * Math.PI * p);
      const t = i / sampleRate;
      s += v.chirpLevels[chirp]! * env * (Math.sin(2 * Math.PI * v.hz * t) + 0.5 * Math.sin(2 * Math.PI * v.twin * t));
    }
    out[i] = s;
    if ((i + 1) % sampleRate === 0) yield;
  }
  return normalised(out);
}

/** An insect voice's second sine, this much above its first: a slow beat that makes it sound alive. */
const INSECT_TWIN = 1.012;
/** The share of each pulse's slot that sounds. */
const INSECT_DUTY = 0.6;

/**
 * A camp fire burning (M33j): a low roar of noise that flickers, quick crackles (tiny bursts of bright noise, placed at
 * random from a seed) and now and then a louder, lower pop. A seamless loop (its tail crossfaded over its head),
 * normalised to a loudness (RMS) of 1; yields after each second of sound.
 */
export function* renderCrackle(sampleRate: number, spec: CrackleLoopSpec): Generator<void, Float32Array> {
  const loop = Math.round(spec.seconds * sampleRate);
  const fade = Math.round(spec.crossfade * sampleRate);
  const raw = new Float32Array(loop + fade);
  const rand = seededRandom(spec.seed);
  const roar = new Biquad('lowpass', sampleRate);
  roar.set(spec.roarHz, Math.SQRT1_2);
  const flicker = new Biquad('lowpass', sampleRate);
  flicker.set(CRACKLE_FLICKER_HZ, Math.SQRT1_2);
  for (let i = 0; i < raw.length; i++) {
    const wobble = 1 + spec.flicker * CRACKLE_FLICKER_GAIN * flicker.process(rand() * 2 - 1);
    raw[i] = spec.roarLevel * roar.process(rand() * 2 - 1) * wobble;
    if ((i + 1) % sampleRate === 0) yield;
  }
  // The crackles and pops: struck at random times (Poisson), each a short burst of filtered noise.
  const burst = new Biquad('bandpass', sampleRate);
  const strike = (rate: number, hz: readonly [number, number], decay: readonly [number, number], level: number, q: number): void => {
    for (let t = -Math.log(1 - rand()) / rate; t < raw.length / sampleRate; t += -Math.log(1 - rand()) / rate) {
      const from = Math.floor(t * sampleRate);
      const tau = (decay[0] + rand() * (decay[1] - decay[0])) * sampleRate;
      const gain = level * (CRACKLE_LEAST + (1 - CRACKLE_LEAST) * rand() ** 2);
      burst.set(hz[0] + rand() * (hz[1] - hz[0]), q);
      const to = Math.min(raw.length, from + Math.ceil(tau * CRACKLE_TAIL));
      for (let i = from; i < to; i++) raw[i] = raw[i]! + gain * Math.exp(-(i - from) / tau) * burst.process(rand() * 2 - 1);
    }
  };
  strike(spec.crackles, spec.crackleHz, spec.crackleDecay, spec.crackleLevel, CRACKLE_Q);
  yield;
  strike(spec.pops, spec.popHz, [spec.popDecay, spec.popDecay], spec.popLevel, POP_Q);
  return seamless(raw, loop, fade);
}

/** How fast and how far a fire's roar flickers (Hz; the flicker noise's scale), and its bursts' filters. */
const CRACKLE_FLICKER_HZ = 6;
const CRACKLE_FLICKER_GAIN = 8;
const CRACKLE_Q = 1.5;
const POP_Q = 2.5;
/** The quietest crackle as a share of the loudest; a burst rings this many of its decay times. */
const CRACKLE_LEAST = 0.15;
const CRACKLE_TAIL = 5;

/**
 * A neon tube's hum (M34g): harmonics of the mains frequency, swelling a little a whole number of times a loop, over a
 * faint high sizzle (band-passed noise) that pulses at twice the mains frequency as the tube strikes on each half cycle.
 * The tones are whole cycles per loop, so they wrap exactly; the sizzle's tail is crossfaded over its head. Normalised
 * to a loudness (RMS) of 1; yields after each second of sound.
 */
export function* renderHum(sampleRate: number, spec: HumLoopSpec): Generator<void, Float32Array> {
  const loop = Math.round(spec.seconds * sampleRate);
  const fade = Math.round(spec.crossfade * sampleRate);
  const rand = seededRandom(spec.seed);
  const hz = Math.max(1, Math.round(spec.hz * spec.seconds)) / spec.seconds;
  const sizzle = new Float32Array(loop + fade);
  const band = new Biquad('bandpass', sampleRate);
  band.set(spec.buzzHz, spec.buzzQ);
  for (let i = 0; i < sizzle.length; i++) {
    const strike = Math.abs(Math.sin((2 * Math.PI * hz * i) / sampleRate));
    sizzle[i] = band.process(rand() * 2 - 1) * strike;
    if ((i + 1) % sampleRate === 0) yield;
  }
  const buzz = seamless(sizzle, loop, fade);
  const phase = rand();
  const out = new Float32Array(loop);
  for (let i = 0; i < loop; i++) {
    const t = i / sampleRate;
    let tone = 0;
    for (let h = 0; h < spec.harmonics.length; h++) tone += spec.harmonics[h]! * Math.sin(2 * Math.PI * hz * (h + 1) * t);
    const swell = 1 - spec.flickerDepth * 0.5 * (1 + Math.cos(2 * Math.PI * ((spec.flickers * i) / loop + phase)));
    out[i] = tone * swell + spec.buzzLevel * buzz[i]!;
  }
  return normalised(out);
}

/** Renders loop `id` (config/audio.ts AMBIENT_LOOPS) at `sampleRate`, yielding as it goes. */
export function renderLoop(id: LoopId, sampleRate: number): Generator<void, Float32Array> {
  const spec = AMBIENT_LOOPS[id];
  switch (spec.kind) {
    case 'noise':
      return renderAmbienceBed(sampleRate, seededRandom(spec.seed), spec);
    case 'insects':
      return renderInsects(sampleRate, spec);
    case 'crackle':
      return renderCrackle(sampleRate, spec);
    case 'hum':
      return renderHum(sampleRate, spec);
  }
}

/**
 * An ambience's calls (the yard's birds by day, M33j's owl in the woods at night): one now and then (`spec.every`
 * seconds apart) somewhere round the listener, timed on the simulation's clock from a seeded generator (presentation
 * only, never the simulation's RNG).
 */
export class AmbientCalls {
  private readonly rand: () => number;
  private next: number;

  constructor(
    private readonly spec: AmbientCallSpec,
    seed: number = spec.seed,
  ) {
    this.rand = seededRandom(seed);
    this.next = this.interval();
  }

  /** True when a call sounds at `now` (s); `at` is then where, round `listener`. Writes `at` only then. */
  due(now: number, listener: Vec3, at: Vec3): boolean {
    if (now < this.next) return false;
    this.next = now + this.interval();
    const [near, far] = this.spec.distance;
    const d = near + this.rand() * (far - near);
    const angle = this.rand() * 2 * Math.PI;
    at.x = listener.x + Math.cos(angle) * d;
    at.y = this.spec.height;
    at.z = listener.z + Math.sin(angle) * d;
    return true;
  }

  private interval(): number {
    const [least, most] = this.spec.every;
    return least + this.rand() * (most - least);
  }
}
