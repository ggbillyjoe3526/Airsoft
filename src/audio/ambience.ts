import { AUDIO } from '../config/audio';
import type { Vec3 } from '../sim/vec';
import { Biquad, seededRandom } from './dsp';

/**
 * The yard's quiet outdoor bed (audit CORE-34), rendered once per page like every other sound: filtered noise (a
 * band rolled off above it for distant traffic and air, a low rumble under it) whose level swells in slow gusts, made
 * into a seamless loop of AUDIO.ambience.seconds by crossfading its tail over its head. Normalised to a loudness
 * (RMS) of 1: the level it plays at is AUDIO.ambience.gain. Yields after each second of sound, so the title screen's
 * spare moments can spread the work; deterministic for a generator.
 */
export function* renderAmbienceBed(sampleRate: number, rand: () => number = seededRandom(AUDIO.ambience.seed)): Generator<void, Float32Array> {
  const a = AUDIO.ambience;
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
  // The loop: its last `fade` samples continue into its first, equal power (the two stretches of noise are unrelated).
  const out = raw.subarray(0, loop);
  let sum = 0;
  for (let i = 0; i < loop; i++) {
    if (i < fade) {
      const k = (i / fade) * (Math.PI / 2);
      out[i] = raw[i]! * Math.sin(k) + raw[loop + i]! * Math.cos(k);
    }
    sum += out[i]! ** 2;
  }
  const scale = 1 / Math.sqrt(sum / loop || 1);
  for (let i = 0; i < loop; i++) out[i] = out[i]! * scale;
  return out.slice();
}

/**
 * The ambience's birds: a chirp now and then (AUDIO.ambience.birdEvery seconds apart) somewhere round the listener,
 * timed on the simulation's clock from a seeded generator (presentation only, never the simulation's RNG).
 */
export class Birdsong {
  private readonly rand: () => number;
  private next: number;

  constructor(seed: number = AUDIO.ambience.seed) {
    this.rand = seededRandom(seed);
    this.next = this.interval();
  }

  /** True when a bird sings at `now` (s); `at` is then where, round `listener`. Writes `at` only then. */
  due(now: number, listener: Vec3, at: Vec3): boolean {
    if (now < this.next) return false;
    this.next = now + this.interval();
    const a = AUDIO.ambience;
    const [near, far] = a.birdDistance;
    const d = near + this.rand() * (far - near);
    const angle = this.rand() * 2 * Math.PI;
    at.x = listener.x + Math.cos(angle) * d;
    at.y = a.birdHeight;
    at.z = listener.z + Math.sin(angle) * d;
    return true;
  }

  private interval(): number {
    const [least, most] = AUDIO.ambience.birdEvery;
    return least + this.rand() * (most - least);
  }
}
