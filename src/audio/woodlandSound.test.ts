import { describe, expect, it } from 'vitest';
import { AMBIENCES, type AmbienceId, AMBIENT_LOOPS, AUDIO, FIRE_SOUND, type LoopId } from '../config/audio';
import { cues, FOOTSTEP_PACES, isMapCue, MAP_CUE_SEEDS, SOUNDS, type SoundCue, TITLE_CUES } from '../config/sounds';
import { buildGroundGrid, GROUND_SURFACES, groundAt } from '../map/groundSurfaces';
import { lightingChoices, mapUnderLighting, playsAtNight } from '../map/lightingChoice';
import { MAPS } from '../map/maps';
import { DEPOT } from '../map/depot';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND, WOODLAND_LAYOUT } from '../map/woodland';
import { terrainHeightAt } from '../map/terrain';
import { vec3 } from '../sim/vec';
import { renderAmbienceBed, renderLoop } from './ambience';
import { renderMapCue, renderSounds } from './soundBank';
import { surfaceUnder } from './soundMaterials';
import { soundscapeOf, YARD_BY_DAY } from './soundscape';

/** M33j: the woodland sounds. Pure synthesis and data; the match's nodes are tested in sfx.test.ts. */

const RATE = AUDIO.renderRate;

/** FNV-1a over the sample bits of `variants`: an exact fingerprint of a cue's buffers. */
function fingerprint(variants: readonly Float32Array[]): string {
  let h = 0x811c9dc5;
  for (const v of variants) {
    const bits = new Uint32Array(v.buffer, v.byteOffset, v.length);
    for (let i = 0; i < bits.length; i++) h = Math.imul(h ^ bits[i]!, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function finish<T>(job: Generator<void, T>): T {
  for (;;) {
    const r = job.next();
    if (r.done) return r.value;
  }
}

/** Mean power of `v` over its first `seconds`. */
function power(v: Float32Array, seconds = Number.POSITIVE_INFINITY): number {
  const n = Math.min(v.length, Math.floor(seconds * RATE));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += v[i]! ** 2;
  return sum / n;
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

/**
 * `v`'s power spectrum (Hz, power) summed over frames of 4096 samples: Hann-windowed for a loop, unwindowed for a short
 * sound padded with silence to one frame (a window would hide its attack).
 */
function spectrum(v: Float32Array, hann: boolean): { hz: Float64Array; power: Float64Array } {
  const N = 4096;
  const hz = Float64Array.from({ length: N / 2 }, (_, k) => (k * RATE) / N);
  const out = new Float64Array(N / 2);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let at = 0; at + N <= v.length; at += N) {
    for (let i = 0; i < N; i++) {
      re[i] = v[at + i]! * (hann ? 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N) : 1);
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) out[k] = out[k]! + re[k]! ** 2 + im[k]! ** 2;
  }
  return { hz, power: out };
}

/** The share of `v`'s power between `lo` and `hi` Hz. */
function bandShare(v: Float32Array, lo: number, hi: number, hann = true): number {
  const { hz, power: p } = spectrum(v, hann);
  let inBand = 0;
  let all = 0;
  for (let k = 1; k < p.length; k++) {
    all += p[k]!;
    if (hz[k]! >= lo && hz[k]! <= hi) inBand += p[k]!;
  }
  return inBand / all;
}

/** A short sound padded with silence to one FFT frame. */
function padded(v: Float32Array): Float32Array {
  const out = new Float32Array(4096);
  out.set(v.subarray(0, 4096));
  return out;
}

/** A short sound's spectral centroid (Hz): how bright it is. */
function centroid(v: Float32Array): number {
  const { hz, power: p } = spectrum(padded(v), false);
  let sum = 0;
  let weighted = 0;
  for (let k = 1; k < p.length; k++) {
    sum += p[k]!;
    weighted += p[k]! * hz[k]!;
  }
  return weighted / sum;
}

/** Zero crossings per second over [from, to) s: a rough measure of brightness (or, for a pure tone, twice its pitch). */
function crossings(v: Float32Array, from = 0, to = v.length / RATE): number {
  const a = Math.floor(from * RATE);
  const b = Math.min(v.length, Math.floor(to * RATE));
  let n = 0;
  for (let i = a + 1; i < b; i++) if (v[i - 1]! < 0 !== v[i]! < 0) n++;
  return n / ((b - a) / RATE);
}

/** The footstep band (Hz): where a boot's scuff lives, and so where the ambience must not crowd it. */
const STEP_BAND = [700, 4000] as const;

describe('M33j acceptance 4: every existing cue buffer is unchanged (Depot sounds exactly as before)', () => {
  /** Fingerprints of every cue as the game rendered it before M33j (AUDIO.variants variants, AUDIO.synthSeed). */
  const BEFORE: Readonly<Record<string, string>> = {
    'shot.electric': '2dc09a3f',
    'shot.gas': '62e7dc47',
    'shot.spring': '74e23d13',
    'shot.cyber': 'd62e350f',
    'motor.spinUp': 'feba5841',
    'motor.spinDown': '1de13155',
    'dryFire.electric': '157957ef',
    'dryFire.gas': '56801531',
    'dryFire.cyber': '3d9c4646',
    'dryFire.spring': '80f5198a',
    'magOut.electric': 'cd89155a',
    'magIn.electric': '74cf7b5e',
    'magOut.gas': '32a346c6',
    'magIn.gas': '473d7ebf',
    'magOut.cyber': '3ffa5597',
    'magIn.cyber': '5e5437a8',
    'magOut.spring': 'b7c56bab',
    'magIn.spring': '465eff28',
    selector: '802e8b58',
    draw: '246af3ad',
    reloadRefused: 'ee8cd582',
    'step.concrete.run': 'd1b91d71',
    'step.concrete.sprint': '2837b7dc',
    'step.concrete.land': 'dfb84e0c',
    'step.metal.run': '68e6e977',
    'step.metal.sprint': 'efdc9aa6',
    'step.metal.land': 'c740b110',
    'foley.crouch': '50617e0d',
    'foley.stand': 'a0fedf69',
    'foley.lean': 'dc95042f',
    magRattle: '8fdf9e7c',
    'impact.concrete': 'c69c97da',
    'impact.metal': '4587f0de',
    'impact.wood': '00285c1f',
    'impact.earth': 'a24035a1',
    bodyHit: '01e0775d',
    steelRing: 'cd458344',
    hitTick: 'e8e8bb03',
    hitMarker: 'baa3b515',
    'radio.ack': '92c159c3',
    'count.beep': '7911efd3',
    'rope.up': '9d032f3b',
    'rope.down': 'e2f9d0e0',
    'ambience.bird': 'b6630b2b',
    torchClick: '629e665e',
  };

  it("renders every title-screen cue sample for sample as before, in the same order, and no map cue with them", () => {
    const rendered = renderSounds(RATE);
    expect([...rendered.keys()]).toEqual(Object.keys(BEFORE));
    for (const [cue, variants] of rendered) expect(fingerprint(variants), cue).toBe(BEFORE[cue]);
  });

  it("renders the yard's bed sample for sample as before", () => {
    expect(fingerprint([finish(renderAmbienceBed(RATE))])).toBe('07126f98');
    expect(fingerprint([finish(renderLoop('yard', RATE))])).toBe('07126f98');
  });

  it('puts the new cues last in SOUNDS, each with a seed of its own, and keeps them off the title screen', () => {
    const all = Object.keys(SOUNDS) as SoundCue[];
    const firstMapCue = all.findIndex(isMapCue);
    expect(all.slice(0, firstMapCue)).toEqual(TITLE_CUES);
    expect(all.slice(firstMapCue).every(isMapCue)).toBe(true);
    const seeds = Object.values(MAP_CUE_SEEDS);
    expect(new Set(seeds).size).toBe(seeds.length);
    expect(seeds).not.toContain(AUDIO.synthSeed);
    // Its own seed: the same samples whatever was rendered before it.
    const owl = renderMapCue('ambience.owl', RATE, 2);
    renderMapCue('step.gravel.run', RATE);
    expect(renderMapCue('ambience.owl', RATE, 2)).toEqual(owl);
    expect(() => renderMapCue('step.concrete.run', RATE)).toThrow();
  });
});

describe('M33j acceptance 3: footsteps on terrain sound like the ground underfoot', () => {
  const grid = buildGroundGrid(WOODLAND)!;
  const patches = WOODLAND.ground!.patches;
  const at = (x: number, z: number) => vec3(x, terrainHeightAt(WOODLAND.terrain!, x, z)!, z);

  it('reads the very grid the terrain is painted from (buildGroundGrid), surface for surface', () => {
    const scene = soundscapeOf(WOODLAND, true);
    expect(scene.ground).toEqual(grid);
    for (let z = grid.minZ + 0.5; z < grid.minZ + grid.rows * grid.cell; z += 3.7) {
      for (let x = grid.minX + 0.5; x < grid.minX + grid.cols * grid.cell; x += 3.1) {
        expect(surfaceUnder(WOODLAND.blocks, at(x, z), scene.ground)).toBe(groundAt(grid, x, z));
      }
    }
  });

  it('is gravel in the creek bed, boards in the cabin, earth at the spawns, grass on the meadow and leaves under the pines', () => {
    const ground = soundscapeOf(WOODLAND, true).ground;
    const creek = patches.find((p) => p.surface === 'gravel')!.path!;
    const mid = creek[Math.floor(creek.length / 2)]!;
    expect(surfaceUnder(WOODLAND.blocks, at(mid.x, mid.z), ground)).toBe('gravel');
    const cabin = patches.find((p) => p.surface === 'wood')!.box!;
    expect(surfaceUnder(WOODLAND.blocks, at((cabin[0] + cabin[1]) / 2, (cabin[2] + cabin[3]) / 2), ground)).toBe('wood');
    for (const s of WOODLAND.spawns.flat()) expect(surfaceUnder(WOODLAND.blocks, s.position, ground)).toBe('earth');
    expect(surfaceUnder(WOODLAND.blocks, at(45 - WOODLAND_LAYOUT.halfX, WOODLAND_LAYOUT.halfZ - 47.5), ground)).toBe('grass');
    const pine = WOODLAND.blocks.find((b) => b.kind === 'tree' && groundAt(grid, b.center.x, b.center.z) === 'leaves')!;
    expect(surfaceUnder(WOODLAND.blocks, at(pine.center.x + 0.6, pine.center.z), ground)).toBe('leaves');
  });

  it('leaves Depot on its blocks: concrete and the dock ramps steel, with no ground grid', () => {
    const scene = soundscapeOf(DEPOT, false);
    expect(scene.ground).toBeNull();
    const ramp = DEPOT.blocks.find((b) => b.kind === 'ramp')!;
    expect(surfaceUnder(DEPOT.blocks, vec3(ramp.center.x, ramp.size.y / 2, ramp.center.z), scene.ground)).toBe('metal');
    expect(surfaceUnder(DEPOT.blocks, vec3(0, 0, 0), scene.ground)).toBe('concrete');
  });

  /** Each pace's step on `surface`: the mean power of its variants over the first 0.1 s, all and in the footstep band. */
  const title = renderSounds(RATE);
  const variantsOf = (cue: SoundCue): Float32Array[] => (isMapCue(cue) ? renderMapCue(cue, RATE) : title.get(cue)!);
  const loudness = (cue: SoundCue, band: boolean): number => {
    const vs = variantsOf(cue);
    return vs.reduce((sum, v) => sum + power(v, 0.1) * (band ? bandShare(padded(v), STEP_BAND[0], STEP_BAND[1], false) : 1), 0) / vs.length;
  };

  it('plays every ground as loud as concrete within 1.5 dB, at every pace (footsteps are information)', () => {
    for (const pace of FOOTSTEP_PACES) {
      const concrete = loudness(cues.step('concrete', pace), false);
      for (const s of GROUND_SURFACES) {
        const dB = 10 * Math.log10(loudness(cues.step(s, pace), false) / concrete);
        expect(Math.abs(dB), `${s} ${pace}: ${dB.toFixed(2)} dB`).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it('keeps every ground within 3 dB of concrete in the footstep band too, so a softer ground hides nobody', () => {
    for (const pace of FOOTSTEP_PACES) {
      const concrete = loudness(cues.step('concrete', pace), true);
      for (const s of GROUND_SURFACES) {
        const dB = 10 * Math.log10(loudness(cues.step(s, pace), true) / concrete);
        expect(Math.abs(dB), `${s} ${pace}: ${dB.toFixed(2)} dB`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('gives each ground its own sound: leaves crackle brighter than earth, gravel clicks where grass swishes, boards ring on', () => {
    const run = (s: (typeof GROUND_SURFACES)[number]): Float32Array => renderMapCue(cues.step(s, 'run'), RATE, 1)[0]!;
    expect(centroid(run('leaves'))).toBeGreaterThan(3 * centroid(run('earth')));
    expect(centroid(run('leaves'))).toBeGreaterThan(2 * centroid(run('grass')));
    // Gravel's grains: more of each step between 2 and 5 kHz than grass's swish, over all its variants.
    const clicks = (s: (typeof GROUND_SURFACES)[number]): number => renderMapCue(cues.step(s, 'run'), RATE).reduce((sum, v) => sum + bandShare(padded(v), 2000, 5000, false), 0);
    expect(clicks('gravel')).toBeGreaterThan(1.15 * clicks('grass'));
    expect(centroid(run('earth'))).toBeLessThan(centroid(run('grass')));
    const tail = (v: Float32Array): number => power(v.subarray(Math.floor(0.05 * RATE)), 0.05);
    expect(tail(run('wood'))).toBeGreaterThan(2 * tail(run('earth')));
    for (const a of GROUND_SURFACES) for (const b of GROUND_SURFACES) if (a < b) expect(run(a), `${a} vs ${b}`).not.toEqual(run(b));
  });
});

describe('M33j acceptance 2: the woods at night', () => {
  const loops = new Map<LoopId, Float32Array>((Object.keys(AMBIENT_LOOPS) as LoopId[]).map((id) => [id, finish(renderLoop(id, RATE))]));

  it('renders each loop at its length and a loudness of 1, seamless where it wraps', () => {
    for (const [id, v] of loops) {
      expect(v.length, id).toBe(Math.round(AMBIENT_LOOPS[id].seconds * RATE));
      expect(v.every(Number.isFinite), id).toBe(true);
      expect(Math.sqrt(power(v)), id).toBeCloseTo(1, 3);
      let biggest = 0;
      for (let i = 1; i < v.length; i++) biggest = Math.max(biggest, Math.abs(v[i]! - v[i - 1]!));
      expect(Math.abs(v[0]! - v[v.length - 1]!), `${id} clicks where it loops`).toBeLessThan(biggest);
    }
  });

  it('loops the wind and the insects at coprime lengths (they line up only every 35 s)', () => {
    expect(AMBIENT_LOOPS.pines.seconds).toBe(7);
    expect(AMBIENT_LOOPS.insects.seconds).toBe(5);
  });

  it('keeps the insects above the footstep band: almost none of their energy between 0.5 and 4 kHz', () => {
    expect(bandShare(loops.get('insects')!, 500, 4000)).toBeLessThan(0.01);
    expect(bandShare(loops.get('insects')!, 5000, 7500)).toBeGreaterThan(0.95);
  });

  it('puts the wind in the pines round 500–1500 Hz, brighter than the yard', () => {
    const pines = loops.get('pines')!;
    expect(bandShare(pines, 300, 1500)).toBeGreaterThan(0.5);
    expect(crossings(pines)).toBeGreaterThan(crossings(loops.get('yard')!));
  });

  it('crackles: a fire is all sudden pops and snaps over a low roar', () => {
    const fire = loops.get('crackle')!;
    let peak = 0;
    for (const x of fire) peak = Math.max(peak, Math.abs(x));
    expect(peak).toBeGreaterThan(5);
  });

  it('hoots an owl round 350–420 Hz', () => {
    for (const v of renderMapCue('ambience.owl', RATE)) {
      const hz = crossings(v, 0.08, 0.28) / 2;
      expect(hz).toBeGreaterThan(330);
      expect(hz).toBeLessThan(440);
    }
  });

  it('plays Woodland at night with the wind, the insects and the owl, a crackle at each camp fire and none at a lantern', () => {
    const scene = soundscapeOf(WOODLAND, true);
    expect(scene.ambience.beds.map((b) => b.loop)).toEqual(['pines', 'insects']);
    expect(scene.ambience.call?.cue).toBe('ambience.owl');
    const fires = WOODLAND.lights!.filter((l) => l.kind === 'fire');
    expect(fires.length).toBeGreaterThan(0);
    expect(WOODLAND.lights!.some((l) => l.kind === 'lantern')).toBe(true);
    expect(scene.fires).toEqual(fires.map((l) => l.position));
    // By day no fire is lit (the pools and their fixtures are drawn by night only).
    expect(soundscapeOf(WOODLAND, false).fires).toEqual([]);
  });
});

describe('M33j acceptance 1: no daytime birds under a night preset, on any map', () => {
  it('has no birds in any ambience by night', () => {
    for (const id of Object.keys(AMBIENCES) as AmbienceId[]) expect(AMBIENCES[id].night.call?.cue, id).not.toBe('ambience.bird');
  });

  it('takes night from the lighting preset picked (never a map name): every map under every preset it offers', () => {
    for (const entry of MAPS) {
      for (const choice of lightingChoices(entry.data)) {
        const map = mapUnderLighting(entry.data, choice);
        const night = playsAtNight(entry.data, choice);
        const call = soundscapeOf(map, night).ambience.call?.cue;
        if (night) expect(call, `${entry.id} by ${choice}`).not.toBe('ambience.bird');
        else expect(call, `${entry.id} by ${choice}`).toBe('ambience.bird');
      }
    }
  });

  it('silences the birds on Neon Heights by Night and keeps them by Day; Depot is the yard by day, as before', () => {
    expect(soundscapeOf(NEON_HEIGHTS, true).ambience).toBe(AMBIENCES.yard.night);
    expect(soundscapeOf(NEON_HEIGHTS, true).ambience.call).toBeNull();
    expect(soundscapeOf(NEON_HEIGHTS, false).ambience).toBe(AMBIENCES.yard.day);
    expect(soundscapeOf(DEPOT, false)).toEqual(YARD_BY_DAY);
  });
});

describe('M33j acceptance 4: gameplay first, the ambience under BBs, footsteps and bot cues', () => {
  /** The power a set of beds puts into the footstep band (each bed plays as two unrelated copies). */
  const loopShare = new Map<LoopId, number>();
  const shareOf = (id: LoopId): number => {
    if (!loopShare.has(id)) loopShare.set(id, bandShare(finish(renderLoop(id, RATE)), STEP_BAND[0], STEP_BAND[1]));
    return loopShare.get(id)!;
  };
  const bandPower = (id: AmbienceId, time: 'day' | 'night'): number => AMBIENCES[id][time].beds.reduce((sum, b) => sum + 2 * b.gain ** 2 * shareOf(b.loop), 0);

  it("puts no more into the footstep band than Depot's bed, by day or night, so steps are heard as on Depot", () => {
    const depot = bandPower('yard', 'day');
    for (const id of Object.keys(AMBIENCES) as AmbienceId[]) for (const time of ['day', 'night'] as const) expect(bandPower(id, time), `${id} ${time}`).toBeLessThanOrEqual(depot * 1.0001);
  });

  it('keeps the woods no louder than the yard, the insects 6 dB under the wind, the owl no louder than a bird', () => {
    const yard = AMBIENCES.yard.day.beds[0]!.gain;
    const [pines, insects] = AMBIENCES.woods.night.beds;
    expect(pines!.gain).toBeLessThanOrEqual(yard);
    expect(20 * Math.log10(insects!.gain / pines!.gain)).toBeLessThanOrEqual(-6 + 1e-9);
    expect(AMBIENCES.woods.night.call!.level.gain).toBeLessThanOrEqual(AUDIO.levels.bird.gain);
  });

  it("peaks a camp fire's crackle under 0.25 at its full-volume distance, and heard only within 12 m", () => {
    const fire = finish(renderLoop(FIRE_SOUND.loop, RATE));
    let peak = 0;
    for (const x of fire) peak = Math.max(peak, Math.abs(x));
    expect(peak * FIRE_SOUND.gain).toBeLessThanOrEqual(0.25);
    expect(FIRE_SOUND.maxDistance).toBeLessThanOrEqual(12);
    // Beside a fire, still no more in the footstep band than Depot's bed.
    expect(FIRE_SOUND.gain ** 2 * shareOf(FIRE_SOUND.loop)).toBeLessThanOrEqual(bandPower('yard', 'day'));
  });

  it('leaves the levels of shots, impacts, steps and the hit cues as they were', () => {
    const L = AUDIO.levels;
    expect([L.shot.gain, L.impact.gain, L.step.gain, L.ownStep.gain, L.bodyHit.gain, L.hitTick.gain, L.hitMarker.gain, L.radioAck.gain]).toEqual([1, 0.9, 0.48, 0.25, 1, 1, 0.55, 0.5]);
    expect(AUDIO.footsteps).toEqual({ maxDistance: 22, maxPerWindow: 4, window: 0.1 });
  });
});

describe('M33j acceptance 5: sounds render lazily, for the maps that use them', () => {
  it('asks nothing more of Depot (or Neon Heights) than the title screen renders', () => {
    for (const scene of [soundscapeOf(DEPOT, false), soundscapeOf(NEON_HEIGHTS, true), soundscapeOf(NEON_HEIGHTS, false)]) {
      expect(scene.cues).toEqual([]);
      expect(scene.loops).toEqual(['yard']);
    }
  });

  it("asks for Woodland's own: a step for each ground it has, at each pace, the owl, the wind, the insects and the fire", () => {
    const scene = soundscapeOf(WOODLAND, true);
    const want = GROUND_SURFACES.flatMap((s) => FOOTSTEP_PACES.map((p) => cues.step(s, p)));
    expect([...scene.cues].sort()).toEqual([...want, 'ambience.owl'].sort());
    expect([...scene.loops].sort()).toEqual(['crackle', 'insects', 'pines']);
  });

  it('keeps the map sounds within a budget: each renders in a spare moment, all of them in about 7 MB', () => {
    let samples = 0;
    for (const cue of Object.keys(MAP_CUE_SEEDS) as SoundCue[]) {
      const n = renderMapCue(cue, RATE).reduce((sum, v) => sum + v.length, 0);
      expect(n, cue).toBeLessThan(0.35e6);
      samples += n;
    }
    for (const id of ['pines', 'insects', 'crackle'] as const) samples += Math.round(AMBIENT_LOOPS[id].seconds * RATE);
    expect(samples * 4, 'bytes').toBeLessThan(7.5e6);
  });
});
