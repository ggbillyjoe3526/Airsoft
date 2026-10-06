import { describe, expect, it } from 'vitest';
import { AMBIENT_LOOPS, AUDIO } from '../config/audio';
import { isMapCue, SOUNDS, type SoundCue, TITLE_CUES } from '../config/sounds';
import { recipeLength, renderRecipe, seededRandom, type SoundRecipe } from './dsp';
import { renderLoop } from './ambience';
import { finish, renderMapCue, renderSounds, variantsOf } from './soundBank';

/**
 * M69 QA (audit AUD-08, AUD-09, AUD-11): what the worker's tests leave open. Pure synthesis, no Web Audio. The echo's and the
 * match's nodes are in sfx.test.ts (the M69 QA block).
 */

const RATE = AUDIO.renderRate;
const FADE = 64;

function peakOf(v: Float32Array): number {
  let p = 0;
  for (const x of v) p = Math.max(p, Math.abs(x));
  return p;
}

/** A recipe of fixed layers, no spreads: the same sound whatever the stream. */
function plain(layers: SoundRecipe['layers'], drive?: number): SoundRecipe {
  return { layers, pitchSpread: 0, timeSpread: 0, gainSpread: 0, ...(drive === undefined ? {} : { drive }) };
}

describe('M69 QA acceptance 1 (AUD-09): the trim keeps what is audible, and the samples before the fade are the old samples', () => {
  /** FNV-1a over the sample bits of each variant's first `length - 64` samples (everything before the fade). */
  function beforeFade(variants: readonly Float32Array[]): string {
    let h = 0x811c9dc5;
    for (const v of variants) {
      const bits = new Uint32Array(v.buffer, v.byteOffset, v.length);
      for (let i = 0; i < bits.length - FADE; i++) h = Math.imul(h ^ bits[i]!, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  /**
   * The same hash of every cue as the game rendered it at 0b2e79b (before M69), over the samples the trim keeps: each variant's
   * first (length - 64) samples, which were checked sample for sample equal to the old buffers' (a throwaway comparison against
   * that commit's renderer; the old fade lay further on). count.beep is its one variant of five. Where the worker's fingerprints
   * pin the new buffers whole, these tie them to the old ones.
   */
  const KEPT_AS_BEFORE: Readonly<Record<string, string>> = {
    'shot.electric': 'dbbf2458',
    'shot.gas': '57f99d36',
    'shot.spring': '9bcc539a',
    'shot.cyber': 'a228a93d',
    'motor.spinUp': 'bee7ef1e',
    'motor.spinDown': 'f62b9b07',
    'dryFire.electric': '0344f8bc',
    'dryFire.gas': 'af446336',
    'dryFire.cyber': 'e225f509',
    'dryFire.spring': 'b3dfb85d',
    'magOut.electric': '4bc8c8a6',
    'magIn.electric': 'bc14690d',
    'magOut.gas': '56c3d762',
    'magIn.gas': '00f3aab2',
    'magOut.cyber': '8034d3eb',
    'magIn.cyber': 'df8a5c7b',
    'magOut.spring': 'a6ff3742',
    'magIn.spring': 'e00151cd',
    selector: 'be4603e3',
    draw: '09dd1a26',
    'reloadRefused': '9d18a1cb',
    'step.concrete.run': 'c85e0677',
    'step.concrete.sprint': 'b17bc896',
    'step.concrete.land': '04a97375',
    'step.metal.run': '65c8b871',
    'step.metal.sprint': 'cdff5d61',
    'step.metal.land': '37b156e7',
    'foley.crouch': 'b1e7e492',
    'foley.stand': 'acc599d9',
    'foley.lean': 'adac7424',
    magRattle: 'f8fe7b4e',
    'impact.concrete': '1f94b264',
    'impact.metal': 'd77026e2',
    'impact.wood': '786dc911',
    'impact.earth': 'dea1f0c7',
    bodyHit: '83e46874',
    steelRing: '20c0773a',
    hitTick: '812fe1d9',
    hitMarker: 'c1153f2f',
    'radio.ack': 'd120d46a',
    'count.beep': 'ab71e96d',
    'rope.up': '575adc87',
    'rope.down': '69f2d4a0',
    'ambience.bird': '5096034f',
    torchClick: 'd244cd5a',
    'step.grass.run': '9e12b2e9',
    'step.grass.sprint': 'b422f69b',
    'step.grass.land': 'ebbc114c',
    'step.leaves.run': '92aabeac',
    'step.leaves.sprint': 'a4c09d43',
    'step.leaves.land': 'b17db7ab',
    'step.earth.run': '1b2ba371',
    'step.earth.sprint': 'a44a8f59',
    'step.earth.land': 'c344fc09',
    'step.gravel.run': 'c7ff1e53',
    'step.gravel.sprint': '231e6884',
    'step.gravel.land': '79d89be3',
    'step.wood.run': '33910472',
    'step.wood.sprint': 'e55b7f5f',
    'step.wood.land': 'f9100b7f',
    'ambience.owl': '3349ebcb',
    'ambience.chime': '70ca41fb',
    'ambience.arcade': 'ba7a17ff',
  };

  it("keeps every cue's samples up to the fade exactly as before M69, on the title stream and on the map cues' own seeds", { timeout: 20_000 }, () => {
    const bank = renderSounds(RATE);
    const got: Record<string, string> = {};
    for (const cue of Object.keys(SOUNDS) as SoundCue[]) got[cue] = beforeFade(isMapCue(cue) ? renderMapCue(cue, RATE) : bank.get(cue)!);
    expect(got).toEqual(KEPT_AS_BEFORE);
    expect(Object.keys(got)).toHaveLength(TITLE_CUES.length + Object.keys(SOUNDS).filter((c) => isMapCue(c as SoundCue)).length);
  });

  it('does not cut a long quiet tail that is still above -60 dB of the cue: a slow decay runs its time out', () => {
    // One sine falling to -60 dB over 1.5 s: nothing in it is a thousandth of its peak before then.
    const decay = 1.5;
    const v = renderRecipe(plain([{ kind: 'tone', wave: 'sine', hz: 330, attack: 0.001, decay, gain: 0.3 }]), RATE, seededRandom(1));
    const kept = v.length - FADE;
    expect(kept).toBeGreaterThan(0.99 * decay * RATE);
    expect(v.length).toBeLessThanOrEqual(Math.ceil((0.001 + decay) * RATE) + FADE);
  });

  it("ends a click with a quiet ring where the ring falls under a thousandth of the cue's peak, not where its layer does", () => {
    // A loud click, and a ring 28 dB under it whose own -60 dB is at 0.6 s: it drops under the cue's -60 dB at about 0.32 s.
    const ring = { kind: 'tone', wave: 'sine', hz: 440, attack: 0.001, decay: 0.6, gain: 0.02 } as const;
    const v = renderRecipe(plain([{ kind: 'tone', wave: 'sine', hz: 3000, attack: 0.0005, decay: 0.01, gain: 0.5 }, ring]), RATE, seededRandom(1));
    const floor = peakOf(v) * 1e-3;
    const tStar = 0.001 + (ring.decay * Math.log(ring.gain / floor)) / Math.log(1000);
    // Within a cycle of the ring (2.3 ms) of where its envelope crosses the floor, plus the fade.
    expect(Math.abs(v.length - FADE - tStar * RATE)).toBeLessThan(0.003 * RATE);
    expect(recipeLength(plain([ring])) * RATE).toBeGreaterThan(1.5 * v.length);
    // The ring is in the buffer where it is still above the floor (a cut at the click would leave it out).
    let ringPeak = 0;
    for (let i = Math.round(0.2 * RATE); i < Math.round(0.25 * RATE); i++) ringPeak = Math.max(ringPeak, Math.abs(v[i]!));
    expect(ringPeak).toBeGreaterThan(0.0015);
  });

  it('keeps a quiet struck mode that is above the floor, and drops one that is not', () => {
    const modes = (quiet: number): SoundRecipe => plain([{ kind: 'modes', gain: 0.5, modes: [{ hz: 600, decay: 0.08, gain: 1 }, { hz: 2300, decay: 1.4, gain: quiet }] }]);
    const audible = renderRecipe(modes(0.05), RATE, seededRandom(3));
    const dead = renderRecipe(modes(0.0004), RATE, seededRandom(3));
    // 0.05 of 0.5 is 28 dB under the peak: the mode runs to about 0.99 * 1.4 * (1 - 28/60) = 0.75 s; the other is under -60 dB from the start.
    expect(audible.length).toBeGreaterThan(0.6 * RATE);
    expect(audible.length).toBeLessThan(0.85 * RATE);
    expect(dead.length).toBeLessThan(0.09 * RATE + FADE);
    expect(recipeLength(modes(0.0004)) * RATE).toBeGreaterThan(10 * dead.length);
  });

  it('gives the same buffer whatever dead padding the recipe was sized for: a silent long layer changes nothing (drive, and a peak over the limit, too)', () => {
    for (const [gain, drive] of [[0.4, undefined], [2.5, undefined], [0.8, 0.6]] as const) {
      const body = { kind: 'tone', wave: 'saw', hz: 220, hzTo: 140, attack: 0.002, decay: 0.05, gain } as const;
      const a = renderRecipe(plain([body], drive), RATE, seededRandom(5));
      const b = renderRecipe(plain([body, { kind: 'tone', wave: 'sine', hz: 90, attack: 0.01, decay: 1.2, gain: 0 }], drive), RATE, seededRandom(5));
      expect(recipeLength(plain([body, { kind: 'noise', attack: 0.01, decay: 1.2, gain: 0, filter: { type: 'lowpass', hz: 900, q: 1 } }])) * RATE, 'sized for the long layer').toBeGreaterThan(10 * a.length);
      expect(b.length, `gain ${gain}`).toBe(a.length);
      expect(Array.from(b)).toEqual(Array.from(a));
      expect(peakOf(a)).toBeLessThanOrEqual(0.98 + 1e-6);
    }
  });

  it('fades the last 64 samples to nothing and leaves the one before them whole', () => {
    const v = renderRecipe(plain([{ kind: 'tone', wave: 'square', hz: 1650, attack: 0.002, decay: 0.06, gain: 0.12 }]), RATE, seededRandom(9));
    expect(Math.abs(v[v.length - 1]!)).toBeLessThan(0.12 / FADE + 1e-6);
    // The ramp: sample i of the fade is (64 - i) / 64 of the unfaded one, so the fade has fallen to under 2 % of the kept level.
    let tailPeak = 0;
    for (let i = v.length - 4; i < v.length; i++) tailPeak = Math.max(tailPeak, Math.abs(v[i]!));
    expect(tailPeak).toBeLessThan(0.12 * 5 / FADE);
  });

  it('keeps a cue that is all silent short and finite (nothing to trim to), and never empty or NaN', () => {
    const silent = renderRecipe(plain([{ kind: 'tone', wave: 'sine', hz: 440, attack: 0.001, decay: 0.5, gain: 0 }, { kind: 'modes', gain: 0, modes: [{ hz: 800, decay: 0.7, gain: 1 }] }]), RATE, seededRandom(2));
    expect(silent.length).toBeGreaterThan(0);
    expect(silent.length).toBeLessThanOrEqual(1 + FADE);
    expect(silent.every((x) => x === 0)).toBe(true);
  });

  it('renders cues of a few samples whole: a 1-sample click and a 10-sample one end finite, audible and inside their own length', () => {
    for (const decay of [1 / RATE / 2, 10 / RATE]) {
      const v = renderRecipe(plain([{ kind: 'noise', attack: 0, decay, gain: 0.5, filter: { type: 'lowpass', hz: 8000, q: 0.7 } }]), RATE, seededRandom(4));
      expect(v.length, `decay ${decay}`).toBeGreaterThan(0);
      expect(v.length).toBeLessThanOrEqual(Math.ceil(decay * RATE) + FADE);
      expect(v.every(Number.isFinite)).toBe(true);
      expect(peakOf(v)).toBeGreaterThan(0.01);
    }
  });

  it('trims every variant of a spread recipe on its own: variants differ in length and each ends within the fade of its last audible sample', () => {
    const lengths = new Set<number>();
    const rand = seededRandom(AUDIO.synthSeed);
    for (let i = 0; i < 8; i++) {
      const v = renderRecipe(SOUNDS['step.metal.land'], RATE, rand);
      lengths.add(v.length);
      let last = v.length - 1;
      while (last > 0 && Math.abs(v[last]!) <= peakOf(v) * 1e-3) last--;
      expect(v.length - 1 - last).toBeLessThanOrEqual(FADE);
      expect(v.length).toBeLessThan(recipeLength(SOUNDS['step.metal.land']) * RATE);
    }
    expect(lengths.size).toBeGreaterThan(1);
  });
});

describe('M69 QA acceptance 1 (AUD-08): the variant count is per recipe, and nothing else about the bank moved', () => {
  it('sets one variant for count.beep alone, and keeps SoundRecipe.variants out of every other recipe', () => {
    const own = (Object.keys(SOUNDS) as SoundCue[]).filter((c) => SOUNDS[c].variants !== undefined);
    expect(own).toEqual(['count.beep']);
    expect(SOUNDS['count.beep'].variants).toBe(1);
  });

  it('gives count.beep one variant on the title stream and on every lighter bank, and the cues after it the full count', () => {
    for (const n of [1, 2, 3]) {
      const bank = renderSounds(RATE, n);
      expect(bank.get('count.beep'), `bank of ${n}`).toHaveLength(1);
      expect(bank.get('rope.up'), `bank of ${n}`).toHaveLength(n);
    }
    expect(variantsOf('count.beep', 0)).toBe(0);
    expect(variantsOf('rope.up', 2)).toBe(2);
    expect(variantsOf('rope.up')).toBe(AUDIO.variants);
    expect(renderMapCue('step.grass.run', RATE, 2)).toHaveLength(2);
    expect(renderMapCue('step.grass.run', RATE)).toHaveLength(AUDIO.variants);
  });

  it("draws count.beep's dropped variants, then the later cues from the stream where it stands: the cue after it is what the unchanged stream gave", () => {
    // A bank of the cues up to count.beep's successor, from the stream: count.beep keeps the first of its five draws only.
    const bank = renderSounds(RATE);
    const rand = seededRandom(AUDIO.synthSeed);
    const order = TITLE_CUES;
    for (const cue of order.slice(0, order.indexOf('count.beep'))) for (let v = 0; v < AUDIO.variants; v++) renderRecipe(SOUNDS[cue], RATE, rand);
    const beeps = Array.from({ length: AUDIO.variants }, () => renderRecipe(SOUNDS['count.beep'], RATE, rand));
    expect(bank.get('count.beep')).toEqual([beeps[0]]);
    const after = order[order.indexOf('count.beep') + 1]!;
    expect(bank.get(after)![0]).toEqual(renderRecipe(SOUNDS[after], RATE, rand));
  });
});

describe('M69 QA acceptance 3 (AUD-11): the neon hum keeps its level and its harmonic stack', () => {
  const neon = finish(renderLoop('neon', RATE));

  it('is still normalised to a mean power of 1, so the tilt moves power between bands without a louder or quieter bed', () => {
    let sum = 0;
    for (const x of neon) sum += x * x;
    expect(sum / neon.length).toBeCloseTo(1, 3);
  });

  it("is the spec's harmonics at their weights: 200 Hz the strongest, each tone in the ratio the data says", () => {
    const spec = AMBIENT_LOOPS.neon;
    if (spec.kind !== 'hum') throw new Error('the neon is a hum');
    const tone = (hz: number): number => {
      let re = 0;
      let im = 0;
      for (let i = 0; i < neon.length; i++) {
        const a = (2 * Math.PI * hz * i) / RATE;
        re += neon[i]! * Math.cos(a);
        im -= neon[i]! * Math.sin(a);
      }
      return (Math.hypot(re, im) * 2) / neon.length;
    };
    const amps = spec.harmonics.map((_, h) => tone(spec.hz * (h + 1)));
    // The ratios of the tones are the ratios of the weights (the flicker moves each a little the same way).
    spec.harmonics.forEach((w, h) => expect(amps[h]! / amps[1]!, `harmonic ${h + 1}`).toBeCloseTo(w / spec.harmonics[1]!, 1));
    expect(spec.harmonics.indexOf(Math.max(...spec.harmonics))).toBe(1);
    // Under 150 Hz is the fundamental alone: its share of the stack's power, flicker and sizzle aside.
    const stack = amps.reduce((s, a) => s + a * a, 0);
    expect(amps[0]! ** 2 / stack).toBeLessThan(0.2);
  });
});
