import { describe, expect, it } from 'vitest';
import { AMBIENCES, type AmbienceId, AMBIENT_LOOPS, AUDIO, type LoopId } from '../config/audio';
import { isMapCue, MAP_CUE_SEEDS, SOUNDS, type SoundCue, TITLE_CUES } from '../config/sounds';
import { DEPOT } from '../map/depot';
import { lightingChoices, mapUnderLighting, playsAtNight } from '../map/lightingChoice';
import { MAPS, mapData } from '../map/maps';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND } from '../map/woodland';
import { vec3 } from '../sim/vec';
import { renderLoop } from './ambience';
import { measureSeam, seamFailures } from './loopSeamSupport';
import { renderMapCue, renderSounds } from './soundBank';
import { surfaceUnder } from './soundMaterials';
import { soundscapeOf } from './soundscape';

/**
 * M34g QA: the city's sound (Neon Heights by day and by night), pinned beyond the M33j tests that were adapted to it
 * (woodlandSound.test.ts, woodlandSoundQA.test.ts, sfx.test.ts). Pure synthesis and data.
 */

const RATE = AUDIO.renderRate;
const CITY_LOOPS = ['traffic', 'drones', 'neon'] as const;
const CITY_CUES = ['ambience.chime', 'ambience.arcade'] as const;
/** The footstep band (Hz), as in woodlandSound.test.ts. */
const STEP_BAND = [700, 4000] as const;

/** FNV-1a over the sample bits of `variants`: an exact fingerprint of a cue's buffers. */
function fingerprint(variants: readonly Float32Array[]): string {
  let h = 0x811c9dc5;
  for (const v of variants) {
    const bits = new Uint32Array(v.buffer, v.byteOffset, v.length);
    for (let i = 0; i < bits.length; i++) h = Math.imul(h ^ bits[i]!, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** FNV-1a over a string. */
function hashOf(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function finish<T>(job: Generator<void, T>): T {
  for (;;) {
    const r = job.next();
    if (r.done) return r.value;
  }
}

function power(v: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! ** 2;
  return sum / v.length;
}

function peakOf(v: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < v.length; i++) peak = Math.max(peak, Math.abs(v[i]!));
  return peak;
}

/** In-place radix-2 FFT of (re, im). */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k);
        const wi = Math.sin(a * k);
        const xr = re[i + k + len / 2]! * wr - im[i + k + len / 2]! * wi;
        const xi = re[i + k + len / 2]! * wi + im[i + k + len / 2]! * wr;
        re[i + k + len / 2] = re[i + k]! - xr;
        im[i + k + len / 2] = im[i + k]! - xi;
        re[i + k] = re[i + k]! + xr;
        im[i + k] = im[i + k]! + xi;
      }
    }
  }
}

/** `v`'s power spectrum summed over Hann-windowed frames of 4096 samples. */
function spectrum(v: Float32Array): { hz: Float64Array; power: Float64Array } {
  const N = 4096;
  const hz = Float64Array.from({ length: N / 2 }, (_, k) => (k * RATE) / N);
  const out = new Float64Array(N / 2);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let at = 0; at + N <= v.length; at += N) {
    for (let i = 0; i < N; i++) {
      re[i] = v[at + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) out[k] = out[k]! + re[k]! ** 2 + im[k]! ** 2;
  }
  return { hz, power: out };
}

/** The share of `v`'s power between `lo` and `hi` Hz. */
function bandShare(v: Float32Array, lo: number, hi: number): number {
  const { hz, power: p } = spectrum(v);
  let inBand = 0;
  let all = 0;
  for (let k = 1; k < p.length; k++) {
    all += p[k]!;
    if (hz[k]! >= lo && hz[k]! <= hi) inBand += p[k]!;
  }
  return inBand / all;
}

/** The amplitude of the sine at `hz` in `v` (a single DFT bin: exact where `hz` is whole cycles over `v`). */
function toneAt(v: Float32Array, hz: number): number {
  let re = 0;
  let im = 0;
  for (let i = 0; i < v.length; i++) {
    const a = (2 * Math.PI * hz * i) / RATE;
    re += v[i]! * Math.cos(a);
    im -= v[i]! * Math.sin(a);
  }
  return (Math.hypot(re, im) * 2) / v.length;
}

/** The strongest frequency (Hz, 2 Hz steps) in `lo`..`hi` of the 1024 samples of `v` from `at`, Hann-windowed. */
function dominantHz(v: Float32Array, at: number, lo: number, hi: number): number {
  const N = 1024;
  let best = lo;
  let bestPower = -1;
  for (let f = lo; f <= hi; f += 2) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < N; i++) {
      const x = (v[at + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      re += x * Math.cos((2 * Math.PI * f * i) / RATE);
      im -= x * Math.sin((2 * Math.PI * f * i) / RATE);
    }
    const p = re * re + im * im;
    if (p > bestPower) {
      bestPower = p;
      best = f;
    }
  }
  return best;
}

/**
 * The notes of a short sound, in order: its loud stretches (frames of 1024 samples, hop 480, over 5% of the loudest
 * frame's energy) as pitch, collapsed where consecutive frames stay within 5% of each other, with the time each began.
 */
function notesOf(v: Float32Array): { hz: number; at: number }[] {
  const frames: { at: number; energy: number }[] = [];
  for (let at = 0; at + 1024 <= v.length; at += 480) {
    let e = 0;
    for (let i = 0; i < 1024; i++) e += v[at + i]! ** 2;
    frames.push({ at, energy: e });
  }
  const loudest = Math.max(...frames.map((f) => f.energy));
  const notes: { hz: number; at: number }[] = [];
  for (const f of frames) {
    if (f.energy < 0.05 * loudest) continue;
    const hz = dominantHz(v, f.at, 400, 1500);
    const last = notes[notes.length - 1];
    if (!last || Math.abs(hz - last.hz) / last.hz > 0.05) notes.push({ hz, at: f.at / RATE });
  }
  return notes;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

describe('M34g city acceptance 1: what each loop is made of (traffic under the footstep band, drones and sizzle above it)', () => {
  const loops = new Map<LoopId, Float32Array>(CITY_LOOPS.map((id) => [id, finish(renderLoop(id, RATE))]));

  it('puts the traffic under the footstep band: most of its energy below 500 Hz, almost none in the band', () => {
    const traffic = loops.get('traffic')!;
    expect(bandShare(traffic, 0, 500)).toBeGreaterThan(0.85);
    expect(bandShare(traffic, STEP_BAND[0], STEP_BAND[1])).toBeLessThan(0.03);
  });

  it('puts the drones above the footstep band: a thin whine, under a tenth of it between 0.7 and 4 kHz', () => {
    const drones = loops.get('drones')!;
    expect(bandShare(drones, STEP_BAND[0], STEP_BAND[1])).toBeLessThan(0.1);
    expect(bandShare(drones, 4000, 8000)).toBeGreaterThan(0.85);
  });

  it("puts the neon's tones at 100 Hz and its harmonics, and its sizzle above the footstep band", () => {
    const neon = loops.get('neon')!;
    // Whole cycles of the loop, so each tone sits exactly in one bin; nothing at the in-between frequencies. The stack
    // leans on 200 and 300 Hz (M69, audit AUD-11).
    const [h1, h2, h3, h4] = [100, 200, 300, 400].map((hz) => toneAt(neon, hz)) as [number, number, number, number];
    expect(h2).toBeGreaterThan(h3);
    expect(h3).toBeGreaterThan(h1);
    expect(h1).toBeGreaterThan(h4);
    expect(h4).toBeGreaterThan(0.05);
    for (const hz of [50, 150, 250, 350, 500]) expect(toneAt(neon, hz), `${hz} Hz`).toBeLessThan(0.01 * h1);
    // The hum is where the energy is; the sizzle is a faint band above the footstep band, not in it.
    expect(bandShare(neon, 80, 420)).toBeGreaterThan(0.8);
    const sizzle = bandShare(neon, 5000, 8000);
    expect(sizzle).toBeGreaterThan(0.03);
    expect(sizzle).toBeGreaterThan(5 * bandShare(neon, STEP_BAND[0], STEP_BAND[1]));
  });

  it('keeps the hum on a laptop: most of its power between 150 and 500 Hz, little under 150 Hz (M69, audit AUD-11)', () => {
    const neon = loops.get('neon')!;
    // Small speakers give little under 150 Hz: 100 Hz held 60 % of the loop's power, and they were left the sizzle.
    expect(bandShare(neon, 0, 150)).toBeLessThan(0.2);
    expect(bandShare(neon, 150, 500)).toBeGreaterThan(0.65);
  });

  it('is the neon that a night preset plays, not a made-up one: the spec says a 100 Hz mains hum', () => {
    const spec = AMBIENT_LOOPS.neon;
    expect(spec.kind).toBe('hum');
    if (spec.kind === 'hum') {
      expect(spec.hz).toBe(100);
      expect(spec.harmonics.length).toBeGreaterThanOrEqual(3);
      expect(spec.buzzHz).toBeGreaterThan(STEP_BAND[1]);
    }
  });

  it('gives each loop its own sound: three different buffers, none the yard', () => {
    const yard = finish(renderLoop('yard', RATE));
    const prints = new Set([fingerprint([yard]), ...CITY_LOOPS.map((id) => fingerprint([loops.get(id)!]))]);
    expect(prints.size).toBe(4);
    const seeds = (Object.values(AMBIENT_LOOPS) as { seed: number }[]).map((s) => s.seed);
    expect(new Set(seeds).size).toBe(seeds.length);
  });
});

describe('M34g city acceptance 1: each new loop renders at its length and a loudness of 1, seamless where it wraps', () => {
  const SECONDS = { traffic: 8, drones: 5, neon: 3 } as const;

  for (const id of CITY_LOOPS) {
    it(`renders ${id} as ${SECONDS[id]} s of finite samples at an RMS of 1`, () => {
      const v = finish(renderLoop(id, RATE));
      expect(AMBIENT_LOOPS[id].seconds).toBe(SECONDS[id]);
      expect(v.length).toBe(SECONDS[id] * RATE);
      expect(v.every(Number.isFinite)).toBe(true);
      expect(Math.sqrt(power(v))).toBeCloseTo(1, 3);
    });

    it(`wraps ${id} without a click: its jump, bend and spectrum at the wrap sit within the loop's own (loopSeamSupport.ts)`, () => {
      // Measured 2026-10-08 (jump and bend as a percentile of the loop's own steps and second differences; spectrum as the
      // last window against the first, dB and percentile of its adjacent windows): traffic p75 p98 7.9 dB p60; drones
      // p10 p48 8.4 dB p93; neon p24 p2 7.7 dB p43.
      const failures = seamFailures(measureSeam(finish(renderLoop(id, RATE))));
      expect(failures, `${id}`).toEqual([]);
    });

    it(`is the same samples each time (${id} comes from its own seed)`, () => {
      expect(finish(renderLoop(id, RATE))).toEqual(finish(renderLoop(id, RATE)));
    });
  }

  it('wraps the neon on whole cycles: the hum is continuous across the loop point (no tone left half-way through a cycle)', () => {
    const v = finish(renderLoop('neon', RATE));
    // The hum is 100 Hz, 480 samples a cycle: the loop holds a whole number of them (and of every harmonic).
    expect(v.length % (RATE / 100)).toBe(0);
    // Wrapping the buffer onto itself leaves the 100 Hz tone as strong as in one pass (a broken phase would cancel it).
    const twice = new Float32Array(v.length * 2);
    twice.set(v);
    twice.set(v, v.length);
    expect(toneAt(twice, 100)).toBeCloseTo(toneAt(v, 100), 3);
  });

  it("plays the neon bed's two copies with their hums apart: together twice one copy's hum power, as unrelated sounds add (M53, audit AUD-02)", () => {
    const v = finish(renderLoop('neon', RATE));
    const spec = AMBIENT_LOOPS.neon;
    if (spec.kind !== 'hum') throw new Error('the neon is a hum');
    const bed = AMBIENCES.city.night.beds.find((b) => b.loop === 'neon')!;
    // The second copy as Sfx starts it: half a loop on, and the bed's copy offset more.
    const shift = (v.length / 2 + Math.round((bed.copyOffset ?? 0) * RATE)) % v.length;
    const both = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) both[i] = v[i]! + v[(i + shift) % v.length]!;
    const hum = (x: Float32Array): number => spec.harmonics.reduce((sum, _, h) => sum + toneAt(x, spec.hz * (h + 1)) ** 2, 0);
    // In step (half a loop alone is 150 whole cycles) the hum would be four times one copy's: 3 dB over its sizzle.
    expect(hum(both) / (2 * hum(v))).toBeGreaterThan(0.9);
    expect(hum(both) / (2 * hum(v))).toBeLessThan(1.1);
    // The sizzle stays as it was: unrelated noise half a loop apart.
    expect(power(both) / (2 * power(v))).toBeGreaterThan(0.9);
    expect(power(both) / (2 * power(v))).toBeLessThan(1.1);
  });

  it('loops the traffic and the drones at coprime lengths (8 s and 5 s line up only every 40 s), and the neon coprime with both', () => {
    expect(gcd(AMBIENT_LOOPS.traffic.seconds, AMBIENT_LOOPS.drones.seconds)).toBe(1);
    expect(gcd(AMBIENT_LOOPS.traffic.seconds, AMBIENT_LOOPS.neon.seconds)).toBe(1);
    expect(gcd(AMBIENT_LOOPS.drones.seconds, AMBIENT_LOOPS.neon.seconds)).toBe(1);
  });

  it("keeps every pair of beds in one city soundscape at coprime lengths, by day and by night", () => {
    for (const time of ['day', 'night'] as const) {
      const secs = AMBIENCES.city[time].beds.map((b) => AMBIENT_LOOPS[b.loop].seconds);
      for (let i = 0; i < secs.length; i++) for (let j = i + 1; j < secs.length; j++) expect(gcd(secs[i]!, secs[j]!), `${time} ${secs[i]} / ${secs[j]}`).toBe(1);
    }
  });
});

describe('M34g city acceptance 1 and 2: the city by day and by night, no louder than the yard', () => {
  const yard = AMBIENCES.yard.day.beds[0]!;

  it('plays by Day the traffic and the drones with a chime, by Night a quieter traffic and the neon with the arcade', () => {
    const day = AMBIENCES.city.day;
    const night = AMBIENCES.city.night;
    expect(day.beds.map((b) => b.loop)).toEqual(['traffic', 'drones']);
    expect(night.beds.map((b) => b.loop)).toEqual(['traffic', 'neon']);
    expect(day.call?.cue).toBe('ambience.chime');
    expect(night.call?.cue).toBe('ambience.arcade');
    expect(night.beds[0]!.gain).toBeLessThan(day.beds[0]!.gain);
  });

  it("keeps every bed, and each time of day's beds together, no louder than the yard's bed", () => {
    for (const time of ['day', 'night'] as const) {
      const beds = AMBIENCES.city[time].beds;
      for (const b of beds) expect(b.gain, `${time} ${b.loop}`).toBeLessThanOrEqual(yard.gain);
      // Every loop is rendered at an RMS of 1, so a bed's gain is its loudness; unrelated beds add in power.
      const together = Math.sqrt(beds.reduce((sum, b) => sum + b.gain ** 2, 0));
      expect(together, time).toBeLessThanOrEqual(yard.gain);
    }
  });

  it('keeps the drones and the neon (the beds that sit above the footstep band) quieter than the traffic under it', () => {
    expect(AMBIENCES.city.day.beds[1]!.gain).toBeLessThan(AMBIENCES.city.day.beds[0]!.gain);
    expect(AMBIENCES.city.night.beds[1]!.gain).toBeLessThan(AMBIENCES.city.night.beds[0]!.gain);
  });

  it('keeps the chime and the arcade no louder than a bird: by level and by the peak of every rendered variant', () => {
    const L = AUDIO.levels;
    expect(L.chime.gain).toBeLessThanOrEqual(L.bird.gain);
    expect(L.arcade.gain).toBeLessThanOrEqual(L.bird.gain);
    expect(AMBIENCES.city.day.call!.level).toBe(L.chime);
    expect(AMBIENCES.city.night.call!.level).toBe(L.arcade);
    const birds = renderSounds(RATE).get('ambience.bird')!;
    const birdPeak = Math.max(...birds.map(peakOf)) * L.bird.gain;
    for (const [cue, level] of [['ambience.chime', L.chime], ['ambience.arcade', L.arcade]] as const) {
      for (const v of renderMapCue(cue, RATE)) expect(peakOf(v) * level.gain, cue).toBeLessThanOrEqual(birdPeak);
    }
  });

  it('calls only now and then and well away: a chime every 12 to 28 s, bleeps every 9 to 22 s, 10 m or more off', () => {
    for (const call of [AMBIENCES.city.day.call!, AMBIENCES.city.night.call!]) {
      expect(call.every[0]).toBeGreaterThanOrEqual(8);
      expect(call.distance[0]).toBeGreaterThanOrEqual(10);
    }
  });

  it('has no bird in the city, by Day or by Night, in its calls or its cues', () => {
    for (const time of ['day', 'night'] as const) expect(AMBIENCES.city[time].call?.cue, time).not.toBe('ambience.bird');
    for (const night of [false, true]) {
      const scene = soundscapeOf(NEON_HEIGHTS, night);
      expect(scene.cues).not.toContain('ambience.bird');
      expect(scene.ambience.call?.cue).toBe(night ? 'ambience.arcade' : 'ambience.chime');
    }
  });

  it("puts nothing of the city's into any other ambience, and the yard and woods keep their data as before M34g", () => {
    // JSON of each as it stood at 9d32c94 (the beds, call and the call's level, by day and night).
    // The echo each has since M69 (audit AUD-10) is left out of the JSON: the yard's is AUDIO.reverb as it always was.
    const dataOf = (id: AmbienceId): string => hashOf(JSON.stringify(AMBIENCES[id], (key, value: unknown) => (key === 'reverb' ? undefined : value)));
    expect(dataOf('yard')).toBe('151064b2');
    expect(dataOf('woods')).toBe('76a25b03');
    expect(AMBIENCES.yard.day.reverb).toBe(AUDIO.reverb);
    expect(AMBIENCES.yard.night.reverb).toBe(AUDIO.reverb);
    expect(AUDIO.reverb).toEqual({ seconds: 0.8, decayPower: 3.5, wet: 0.22, seed: 1302 });
    expect(AUDIO.levels.bird).toEqual({ gain: 0.35, pitchSpread: 0.08 });
    expect(AUDIO.levels.owl).toEqual({ gain: 0.3, pitchSpread: 0.04 });
    expect(AUDIO.ambience.gain).toBe(0.035);
  });
});

describe('M34g city acceptance 1: the chime and the arcade bleeps', () => {
  // Every variant's spectrum: about 3 s alone, past the 5 s default in a full run beside the bot-match guards (TE4).
  it('chimes two bell notes, "ding-dong": the first about 1319 Hz, the second a major third (about 1047 Hz) under it', { timeout: 15_000 }, () => {
    for (const v of renderMapCue('ambience.chime', RATE)) {
      const notes = notesOf(v);
      expect(notes, 'two notes').toHaveLength(2);
      const [first, second] = notes as [{ hz: number; at: number }, { hz: number; at: number }];
      // Each variant is the recipe moved by one pitch factor (up to 2 %), so the ratio is the recipe's.
      expect(first.hz).toBeGreaterThan(1319 * 0.97);
      expect(first.hz).toBeLessThan(1319 * 1.03);
      expect(second.hz).toBeGreaterThan(1047 * 0.97);
      expect(second.hz).toBeLessThan(1047 * 1.03);
      expect(first.hz / second.hz).toBeGreaterThan(2 ** (3.7 / 12));
      expect(first.hz / second.hz).toBeLessThan(2 ** (4.3 / 12));
      expect(second.at - first.at).toBeGreaterThan(0.15);
      expect(second.at - first.at).toBeLessThan(0.4);
    }
  });

  it('rings the chime out in well under a second, so a map sound does not eat the budget', () => {
    for (const v of renderMapCue('ambience.chime', RATE)) {
      expect(v.length).toBeGreaterThan(0.4 * RATE);
      expect(v.length).toBeLessThan(1 * RATE);
    }
  });

  it('bleeps four rising notes, an arpeggio from about 523 Hz up an octave to about 1047 Hz', () => {
    const want = [523, 659, 784, 1047];
    for (const v of renderMapCue('ambience.arcade', RATE)) {
      const notes = notesOf(v);
      expect(notes, 'four notes').toHaveLength(4);
      for (let i = 1; i < 4; i++) {
        expect(notes[i]!.hz, `note ${i + 1} above note ${i}`).toBeGreaterThan(notes[i - 1]!.hz);
        expect(notes[i]!.at).toBeGreaterThan(notes[i - 1]!.at);
      }
      // Whatever the variant's pitch factor (up to 3 %), the notes keep the recipe's intervals.
      for (let i = 0; i < 4; i++) expect(notes[i]!.hz / notes[0]!.hz, `note ${i + 1}`).toBeCloseTo(want[i]! / want[0]!, 1);
      expect(notes[0]!.hz).toBeGreaterThan(523 * 0.95);
      expect(notes[0]!.hz).toBeLessThan(523 * 1.05);
    }
  });

  it('makes the arcade a toy: square-wave bleeps, short, with their highs rolled off', () => {
    const layers = SOUNDS['ambience.arcade'].layers;
    expect(layers).toHaveLength(4);
    for (const l of layers) expect(l.kind === 'tone' && l.wave === 'square').toBe(true);
    for (const v of renderMapCue('ambience.arcade', RATE)) expect(v.length).toBeLessThan(0.6 * RATE);
  });
});

describe('M34g city acceptance 3: everything else sounds as before', () => {
  /**
   * Fingerprints at 9d32c94 (before the city): the woods' loops, and their map cues at AUDIO.variants variants (re-baked by
   * M69 with the fingerprint above, owner decision 19: the same samples up to -60 dB of each cue's peak, then the fade).
   */
  const LOOPS_BEFORE: Readonly<Record<string, string>> = { yard: '07126f98', pines: '161eae54', insects: '8fbdbc3c', crackle: '52eb2f6b' };
  const MAP_CUES_BEFORE: Readonly<Record<string, string>> = {
    'step.grass.run': 'c3cac149',
    'step.grass.sprint': '08761263',
    'step.grass.land': 'f15d56ed',
    'step.leaves.run': 'd19655ca',
    'step.leaves.sprint': '9b8cde10',
    'step.leaves.land': '41bd81da',
    'step.earth.run': 'f322e1ae',
    'step.earth.sprint': '7fc1f2ab',
    'step.earth.land': 'b6652b42',
    'step.gravel.run': 'c3a953e0',
    'step.gravel.sprint': '2d90b841',
    'step.gravel.land': '12917838',
    'step.wood.run': '9f0d3eb1',
    'step.wood.sprint': '21d6edf3',
    'step.wood.land': 'ba2f285d',
    'ambience.owl': '1f55f71e',
  };

  it("renders the yard's, the pines', the insects' and the fire's loops sample for sample as before", () => {
    for (const [id, print] of Object.entries(LOOPS_BEFORE)) expect(fingerprint([finish(renderLoop(id as LoopId, RATE))]), id).toBe(print);
  });

  it("renders every footstep and the owl sample for sample as before: the city's cues take no seed of theirs", () => {
    for (const [cue, print] of Object.entries(MAP_CUES_BEFORE)) expect(fingerprint(renderMapCue(cue as SoundCue, RATE)), cue).toBe(print);
  });

  it('keeps the chime and the arcade off the title screen and last in SOUNDS, each with a seed of its own', () => {
    const all = Object.keys(SOUNDS) as SoundCue[];
    expect(all.slice(-2)).toEqual([...CITY_CUES]);
    expect(all.slice(0, TITLE_CUES.length)).toEqual(TITLE_CUES);
    const title = renderSounds(RATE);
    for (const cue of CITY_CUES) {
      expect(isMapCue(cue), cue).toBe(true);
      expect(TITLE_CUES).not.toContain(cue);
      expect(title.has(cue), cue).toBe(false);
      expect(MAP_CUE_SEEDS[cue], cue).toBeDefined();
      expect(MAP_CUE_SEEDS[cue]).not.toBe(AUDIO.synthSeed);
    }
    expect(MAP_CUE_SEEDS['ambience.chime']).not.toBe(MAP_CUE_SEEDS['ambience.arcade']);
    // The same samples whatever was rendered first, and the loops' seeds are not the cues'.
    const chime = renderMapCue('ambience.chime', RATE);
    renderMapCue('ambience.arcade', RATE);
    renderMapCue('ambience.owl', RATE);
    expect(renderMapCue('ambience.chime', RATE)).toEqual(chime);
    const loopSeeds = (Object.values(AMBIENT_LOOPS) as { seed: number }[]).map((s) => s.seed);
    for (const cue of CITY_CUES) expect(loopSeeds).not.toContain(MAP_CUE_SEEDS[cue]);
    // Nothing else in MAP_CUE_SEEDS moved: the same keys, the footsteps and owl first, the city's two last.
    expect(Object.keys(MAP_CUE_SEEDS)).toEqual([...Object.keys(MAP_CUES_BEFORE), ...CITY_CUES]);
  });
});

describe("M34g city acceptance 3: the city's soundscape asks only for its own cues and loops", () => {
  const CITY_DAY = { cues: ['ambience.chime'], loops: ['drones', 'traffic'] };
  const CITY_NIGHT = { cues: ['ambience.arcade'], loops: ['neon', 'traffic'] };

  it("asks Neon Heights, under every lighting preset it offers, for its own day or night set and nothing of the woods' or the yard's", () => {
    for (const choice of lightingChoices(NEON_HEIGHTS)) {
      const night = playsAtNight(NEON_HEIGHTS, choice);
      const scene = soundscapeOf(mapUnderLighting(NEON_HEIGHTS, choice), night);
      const want = night ? CITY_NIGHT : CITY_DAY;
      expect([...scene.cues].sort(), choice).toEqual(want.cues);
      expect([...scene.loops].sort(), choice).toEqual(want.loops);
      expect(scene.ground, choice).toBeNull();
      expect(scene.fires, choice).toEqual([]);
    }
    expect(lightingChoices(NEON_HEIGHTS).some((c) => playsAtNight(NEON_HEIGHTS, c))).toBe(true);
    expect(lightingChoices(NEON_HEIGHTS).some((c) => !playsAtNight(NEON_HEIGHTS, c))).toBe(true);
  });

  it('asks no other map, under any preset, for a city loop or cue', () => {
    for (const entry of MAPS) {
      if (mapData(entry.id) === NEON_HEIGHTS) continue;
      for (const choice of lightingChoices(mapData(entry.id))) {
        const scene = soundscapeOf(mapUnderLighting(mapData(entry.id), choice), playsAtNight(mapData(entry.id), choice));
        for (const id of CITY_LOOPS) expect(scene.loops, `${entry.id} by ${choice}`).not.toContain(id);
        for (const cue of CITY_CUES) expect(scene.cues, `${entry.id} by ${choice}`).not.toContain(cue);
      }
    }
    expect(soundscapeOf(DEPOT, false).loops).toEqual(['yard']);
    expect([...soundscapeOf(WOODLAND, true).loops].sort()).toEqual(['crackle', 'insects', 'pines']);
  });

  it("takes the city from the map's data (MapData.ambience) and the preset's night flag, never the name", () => {
    expect(NEON_HEIGHTS.ambience).toBe('city');
    expect(soundscapeOf({ ...DEPOT, ambience: 'city' }, true).ambience).toBe(AMBIENCES.city.night);
    expect(soundscapeOf({ ...DEPOT, ambience: 'city' }, false).ambience).toBe(AMBIENCES.city.day);
    const { ambience: _city, ...noAmbience } = NEON_HEIGHTS;
    expect(soundscapeOf(noAmbience, false).ambience).toBe(AMBIENCES.yard.day);
    expect(soundscapeOf({ ...NEON_HEIGHTS, name: 'Depot' }, true).ambience).toBe(AMBIENCES.city.night);
  });
});

describe('M34g city acceptance 4: footsteps on the city stay concrete', () => {
  it("has no ground grid to read, and no floor of the city's but its ramps' steel changes a step's material", () => {
    expect(soundscapeOf(NEON_HEIGHTS, false).ground).toBeNull();
    expect(NEON_HEIGHTS.terrain).toBeUndefined();
    const surfaces = new Set(NEON_HEIGHTS.blocks.map((b) => b.surface ?? 'concrete'));
    expect([...surfaces].sort()).toEqual(['concrete', 'metal']);
    for (const b of NEON_HEIGHTS.blocks) if (b.kind === 'ramp') expect(b.surface).toBe('metal');
    // Off every block (the street's open ground) a step is concrete.
    expect(surfaceUnder([], vec3(0, 0, 0), null)).toBe('concrete');
  });
});
