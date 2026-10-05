import { describe, expect, it } from 'vitest';
import { AMBIENCES, AUDIO, VOLUME } from '../config/audio';
import { CYBER_PISTOL, LOADOUT } from '../config/replicas';
import { cues, isMapCue, SHOT_PROFILES, SOUNDS, type SoundCue } from '../config/sounds';
import { DEPOT } from '../map/depot';
import type { MapBlock } from '../map/mapTypes';
import { terrainHeightAt } from '../map/terrain';
import { SLOPE_YARD, SLOPE_YARD_TERRAIN } from '../map/testSupport';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { saveSetting } from '../settings/storage';
import { AmbientCalls, renderAmbienceBed } from './ambience';
import { loadVolumes, volumeField, volumeGain } from './audioMix';
import { recipeLength, renderRecipe, seededRandom, type SoundRecipe } from './dsp';
import { type FoleyMove, FoleyTracker } from './foley';
import { MotorSound } from './motor';
import { blockedShare, lineBlocked, muffleFor, type OcclusionQuery } from './occlusion';
import { renderMapCue, renderSounds, suppressedCopies } from './soundBank';
import { impactMaterialAt, surfaceUnder } from './soundMaterials';

const RATE = 48000;

/** A Storage backed by a Map (only the calls the settings use). */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

function peak(buf: Float32Array): number {
  let p = 0;
  for (const v of buf) p = Math.max(p, Math.abs(v));
  return p;
}

/** Root-mean-square level of buf[from..to) (seconds). */
function rms(buf: Float32Array, from: number, to: number): number {
  const a = Math.floor(from * RATE);
  const b = Math.min(buf.length, Math.floor(to * RATE));
  let sum = 0;
  for (let i = a; i < b; i++) sum += buf[i]! ** 2;
  return Math.sqrt(sum / Math.max(1, b - a));
}

/** Zero crossings per second: a rough measure of how bright (high-pitched) a sound is. */
function brightness(buf: Float32Array): number {
  let n = 0;
  for (let i = 1; i < buf.length; i++) if (buf[i - 1]! < 0 !== buf[i]! < 0) n++;
  return n / (buf.length / RATE);
}

/** Every cue's `variants` variants: the title screen's (one stream) and the map cues (each its own seed, M33j). */
function renderEveryCue(variants: number): Map<SoundCue, Float32Array[]> {
  const all = renderSounds(RATE, variants);
  for (const cue of Object.keys(SOUNDS) as SoundCue[]) if (isMapCue(cue)) all.set(cue, renderMapCue(cue, RATE, variants));
  return all;
}

describe('sound synthesis (M13)', () => {
  const rendered = renderEveryCue(3);

  it('renders every cue: audible, finite, never clipping, fading to silence at the end', () => {
    for (const cue of Object.keys(SOUNDS) as SoundCue[]) {
      const variants = rendered.get(cue)!;
      expect(variants, cue).toHaveLength(3);
      for (const v of variants) {
        expect(v.every(Number.isFinite), `${cue} has NaN or Infinity`).toBe(true);
        const p = peak(v);
        expect(p, `${cue} is silent`).toBeGreaterThan(0.02);
        expect(p, `${cue} clips`).toBeLessThanOrEqual(0.98 + 1e-6);
        expect(Math.abs(v[v.length - 1]!), `${cue} ends on a click`).toBeLessThan(1e-3);
        expect(v.length / RATE, `${cue} is longer than its recipe allows`).toBeLessThanOrEqual(recipeLength(SOUNDS[cue]) + 0.01);
      }
    }
  });

  it('is deterministic for a seed, and its variants differ', () => {
    const recipe = SOUNDS['shot.electric'];
    const a = renderRecipe(recipe, RATE, seededRandom(7));
    const b = renderRecipe(recipe, RATE, seededRandom(7));
    expect(a).toEqual(b);
    const [v0, v1] = rendered.get('shot.electric')!;
    expect(v0).not.toEqual(v1);
  });

  it("keeps the sounds small enough to render in the title screen's spare time (a budget in samples, not wall time)", () => {
    // Measured at M-09 (audit): 1,167,190 samples (4.7 MB) in all, the longest cue (steel's ring) 116,965. Counting
    // samples keeps the guard from flaking on a slow CI runner (audit L-11); rendering time follows the count.
    const all = renderSounds(RATE);
    let total = 0;
    for (const [cue, variants] of all) {
      const samples = variants.reduce((n, v) => n + v.length, 0);
      // Each cue is rendered in one spare moment (AudioEngine.warmUp), which the browser keeps under 50 ms.
      expect(samples, `${cue} is too long to render in one spare moment`).toBeLessThan(0.15 * 1e6);
      total += samples;
    }
    expect(total, 'samples kept per sample rate').toBeLessThan(1.4e6);
  });

  it('has a shot sound for every power source the replicas use', () => {
    for (const r of LOADOUT) expect(SHOT_PROFILES).toContain(r.power);
    for (const p of SHOT_PROFILES) for (const cue of [cues.shot(p), cues.dryFire(p), cues.magOut(p), cues.magIn(p)]) expect(SOUNDS[cue]).toBeDefined();
  });

  it('gives each power source its own character: a sharp gas pop, a spring that rings on', () => {
    const gas = rendered.get('shot.gas')![0]!;
    const electric = rendered.get('shot.electric')![0]!;
    const spring = rendered.get('shot.spring')![0]!;
    // The gas pop is brighter than the AEG's gearbox cycle.
    expect(brightness(gas)).toBeGreaterThan(brightness(electric));
    // The spring's twang carries on well after both have died away.
    expect(rms(spring, 0.15, 0.3)).toBeGreaterThan(rms(gas, 0.15, 0.3) * 4);
    expect(rms(spring, 0.15, 0.3)).toBeGreaterThan(rms(electric, 0.15, 0.3) * 4);
  });

  it('makes a steel ramp ring under a boot where concrete only scuffs', () => {
    const concrete = rendered.get('step.concrete.run')![0]!;
    const metal = rendered.get('step.metal.run')![0]!;
    expect(rms(metal, 0.08, 0.2)).toBeGreaterThan(rms(concrete, 0.08, 0.2) * 3);
  });

  it("plays a shot clearly louder than footsteps, a bot's and your own (after the mix levels)", () => {
    const played = (cue: SoundCue, gain: number, measure: (v: Float32Array) => number, pick: 'min' | 'max'): number => {
      const levels = rendered.get(cue)!.map((v) => measure(v) * gain);
      return pick === 'min' ? Math.min(...levels) : Math.max(...levels);
    };
    const L = AUDIO.levels;
    const loudness = (v: Float32Array): number => rms(v, 0, 0.1);
    const steps = (Object.keys(SOUNDS) as SoundCue[]).filter((c) => c.startsWith('step.') || c === 'magRattle');
    for (const p of SHOT_PROFILES) {
      for (const step of steps) {
        expect(played(cues.shot(p), L.shot.gain, peak, 'min'), `${p} shot vs ${step} (peak)`).toBeGreaterThan(1.5 * played(step, L.step.gain, peak, 'max'));
        expect(played(cues.shot(p), L.shot.gain, loudness, 'min'), `${p} shot vs ${step} (loudness)`).toBeGreaterThan(1.3 * played(step, L.step.gain, loudness, 'max'));
        expect(played(cues.shot(p), L.shot.gain, peak, 'min'), `${p} shot vs your ${step}`).toBeGreaterThan(2.5 * played(step, L.ownStep.gain, peak, 'max'));
      }
    }
  });

  it("keeps a bot's sprint heard near the edge of earshot: within 28 dB of your own shot at 20 m (audit CORE-26)", () => {
    // The panner's inverse model (Web Audio spec), as Sfx sets it up for every positional sound.
    const s = AUDIO.spatial;
    const distanceGain = (d: number): number => s.refDistance / (s.refDistance + s.rolloff * (Math.max(d, s.refDistance) - s.refDistance));
    const loudness = (v: Float32Array): number => rms(v, 0, 0.1);
    const L = AUDIO.levels;
    const quietestSprint = Math.min(...(['concrete', 'metal'] as const).flatMap((f) => rendered.get(cues.step(f, 'sprint'))!.map(loudness))) * L.step.gain;
    const loudestShot = Math.max(...SHOT_PROFILES.flatMap((p) => rendered.get(cues.shot(p))!.map(loudness))) * L.shot.gain;
    const at20 = 20 * Math.log10((quietestSprint * distanceGain(20)) / loudestShot);
    expect(at20, 'dB under your own shot').toBeGreaterThan(-28);
    // The same curve for shots and steps: at any distance a shot stays the louder of the two.
    for (const d of [5, 10, 20]) expect(loudestShot * distanceGain(d)).toBeGreaterThan(quietestSprint * distanceGain(d));
  });

  it("rattles a hi-cap quieter than a step and brighter than a draw, so it doesn't pass for either (M17b)", () => {
    const loudness = (cue: SoundCue): number => rms(rendered.get(cue)![0]!, 0, 0.1);
    // Brightness as zero crossings per sample: tiny ticks cross far more often than a sling's swish.
    const brightness = (cue: SoundCue): number => {
      const v = rendered.get(cue)![0]!;
      let crossings = 0;
      for (let i = 1; i < v.length; i++) if (v[i - 1]! < 0 !== v[i]! < 0) crossings++;
      return crossings / v.length;
    };
    expect(loudness('magRattle')).toBeLessThan(loudness('step.concrete.run'));
    expect(brightness('magRattle')).toBeGreaterThan(1.5 * brightness('draw'));
  });

  it('lands a jump harder than a run, and a sprint louder than a run', () => {
    const level = (cue: SoundCue): number => rms(rendered.get(cue)![0]!, 0, 0.1);
    expect(level('step.concrete.land')).toBeGreaterThan(level('step.concrete.run'));
    expect(level('step.concrete.sprint')).toBeGreaterThan(level('step.concrete.run'));
  });

  it("makes a suppressed replica's shot quieter and duller, leaving the original alone", () => {
    const shots = rendered.get('shot.gas')!;
    const before = shots[0]!.slice();
    const [muffled] = suppressedCopies(shots, RATE);
    expect(shots[0]).toEqual(before);
    expect(rms(muffled!, 0, 0.2)).toBeLessThan(rms(before, 0, 0.2) * 0.7);
    expect(brightness(muffled!)).toBeLessThan(brightness(before));
  });

  it('limits a recipe that would clip', () => {
    const loud: SoundRecipe = {
      layers: [{ kind: 'tone', wave: 'square', attack: 0.001, decay: 0.05, gain: 5, hz: 200 }],
      pitchSpread: 0,
      timeSpread: 0,
      gainSpread: 0,
    };
    expect(peak(renderRecipe(loud, RATE, seededRandom(1)))).toBeCloseTo(0.98, 3);
  });
});

describe('an AEG motor (M13)', () => {
  const rate = 13;

  it('winds up on the first shot of a trigger pull, not between shots of a burst', () => {
    const m = new MotorSound();
    expect(m.shot(10, rate)).toBe(true);
    expect(m.shot(10 + 1 / rate, rate)).toBe(false);
    expect(m.shot(10 + 2 / rate, rate)).toBe(false);
    // Let go, and pull again a moment later.
    expect(m.shot(11, rate)).toBe(true);
  });

  it('plans the wind-down just after the last shot, later than the next shot of a burst would come', () => {
    const m = new MotorSound();
    m.shot(5, rate);
    expect(m.spinDownAt(rate)).toBeGreaterThan(5 + 1 / rate);
    expect(m.spinDownAt(rate)).toBeCloseTo(5 + AUDIO.motor.spinDownAfterCycles / rate);
  });
});

describe('muffling through walls (M13)', () => {
  /** A wall across x = 5, everywhere below `top`. */
  function wallAt5(top: number): OcclusionQuery {
    return {
      raycastStatic(o, d, max) {
        if (d.x <= 0) return -1;
        const t = (5 - o.x) / d.x;
        if (t < 0 || t > max) return -1;
        return o.y + d.y * t < top ? t : -1;
      },
    };
  }
  const ears = vec3(0, 1.6, 0);

  it('hears someone in the open clearly, half-muffled behind low cover, fully behind a wall', () => {
    const feet = vec3(10, 0, 0);
    expect(blockedShare(wallAt5(0), ears, feet)).toBe(0);
    expect(blockedShare(wallAt5(1.2), ears, feet)).toBe(0.5);
    expect(blockedShare(wallAt5(3), ears, feet)).toBe(1);
    // On this side of the wall nothing is in the way.
    expect(blockedShare(wallAt5(3), ears, vec3(4, 0, 0))).toBe(0);
  });

  it('ignores the surface a sound came from (a BB impact on the wall itself)', () => {
    expect(lineBlocked(wallAt5(3), ears, vec3(5, 1, 0))).toBe(true);
    expect(lineBlocked(wallAt5(3), ears, vec3(5, 1, 0), AUDIO.occlusion.surfaceGap)).toBe(false);
  });

  it('closes the filter and turns the level down as more is blocked', () => {
    const open = muffleFor(0);
    const half = muffleFor(0.5);
    const shut = muffleFor(1);
    expect(open).toEqual({ hz: AUDIO.occlusion.openHz, gain: 1 });
    expect(shut.hz).toBeCloseTo(AUDIO.occlusion.muffledHz);
    expect(shut.gain).toBeCloseTo(AUDIO.occlusion.muffledGain);
    expect(half.hz).toBeLessThan(open.hz);
    expect(half.hz).toBeGreaterThan(shut.hz);
    expect(half.gain).toBeLessThan(1);
    expect(half.gain).toBeGreaterThan(shut.gain);
  });
});

describe('crouch and lean rustle (M13)', () => {
  it('rustles once when a crouch, a stand or a lean starts, not every tick it continues', () => {
    const c = createCharacter(1, vec3(), 0, LOADOUT, 0);
    const tracker = new FoleyTracker();
    const heard: FoleyMove[] = [];
    const tick = (crouch: number, lean: number): void => {
      c.prevCrouchAmount = c.crouchAmount;
      c.prevLean = c.lean;
      c.crouchAmount = crouch;
      c.lean = lean;
      tracker.update([c], (_, move) => heard.push(move));
    };
    tick(0, 0);
    tick(0.3, 0);
    tick(0.6, 0);
    tick(1, 0);
    tick(1, 0);
    expect(heard).toEqual(['crouch']);
    tick(0.5, 0);
    tick(0, 0);
    expect(heard).toEqual(['crouch', 'stand']);
    tick(0, 0.4);
    tick(0, 0.8);
    tick(0, 0.4); // back to upright: quiet
    tick(0, 0);
    tick(0, -0.5); // out the other side
    expect(heard).toEqual(['crouch', 'stand', 'lean', 'lean']);
  });

  it('stays quiet for someone who is out', () => {
    const c = createCharacter(1, vec3(), 0, LOADOUT, 0);
    c.status = 'walkingOff';
    const tracker = new FoleyTracker();
    let n = 0;
    c.crouchAmount = 1;
    tracker.update([c], () => n++);
    expect(n).toBe(0);
  });
});

describe('what things sound like underfoot and under a BB (M13)', () => {
  it('rings on the dock ramps and scuffs on the concrete yard and dock', () => {
    const ramp = DEPOT.blocks.find((b) => b.kind === 'ramp')!;
    const c = ramp.center;
    // Halfway up a ramp the top is at half its height.
    expect(surfaceUnder(DEPOT.blocks, vec3(c.x, ramp.size.y / 2, c.z))).toBe('metal');
    expect(surfaceUnder(DEPOT.blocks, vec3(0, 0, 0))).toBe('concrete');
    const dock = DEPOT.blocks.find((b) => b.kind === 'floor' && b.center.y > 0)!;
    expect(surfaceUnder(DEPOT.blocks, vec3(dock.center.x, dock.center.y + dock.size.y / 2, dock.center.z))).toBe('concrete');
  });

  it('pings off containers, knocks on crates and ticks off walls and floors', () => {
    const blocks: MapBlock[] = [
      { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(40, 0.5, 40) },
      { kind: 'container', center: vec3(5, 1.3, 0), size: vec3(2.4, 2.6, 6) },
      { kind: 'crate', center: vec3(-5, 0.6, 0), size: vec3(1.2, 1.2, 1.2) },
      { kind: 'wall', center: vec3(0, 1.5, 10), size: vec3(20, 3, 0.3) },
    ];
    expect(impactMaterialAt(blocks, vec3(3.8, 1, 0))).toBe('metal');
    expect(impactMaterialAt(blocks, vec3(-5, 1.2, 0))).toBe('wood');
    expect(impactMaterialAt(blocks, vec3(0, 1, 9.85))).toBe('concrete');
    expect(impactMaterialAt(blocks, vec3(10, 0, 3))).toBe('concrete');
    // A BB at the foot of a container, touching the floor too: the container.
    expect(impactMaterialAt(blocks, vec3(3.8, 0.01, 0))).toBe('metal');
  });
});

describe('what a BB ticks off on sloping ground (M33c)', () => {
  const { blocks, terrain } = SLOPE_YARD;
  const ground = (x: number, z: number): number => terrainHeightAt(SLOPE_YARD_TERRAIN, x, z)!;

  it('is earth on the ground, wherever the ground is, and the old answers without terrain', () => {
    for (const [x, z] of [[0, 8], [-10, -10], [10, 10], [6, -6]] as const) {
      expect(impactMaterialAt(blocks, vec3(x, ground(x, z), z), terrain), `${x}, ${z}`).toBe('earth');
      expect(impactMaterialAt(blocks, vec3(x, ground(x, z) + 0.02, z), terrain)).toBe('earth');
      expect(impactMaterialAt(blocks, vec3(x, ground(x, z) - 0.02, z), terrain)).toBe('earth');
      // The same point on a map without terrain: nothing is that close, so concrete, as before.
      expect(impactMaterialAt(blocks, vec3(x, ground(x, z), z))).toBe('concrete');
      expect(impactMaterialAt(blocks, vec3(x, ground(x, z), z), null)).toBe('concrete');
    }
  });

  it('is not earth in mid-air or off the terrain, and a prop on the ground still sounds like itself', () => {
    expect(impactMaterialAt(blocks, vec3(0, ground(0, 8) + 2, 8), terrain)).toBe('concrete');
    expect(impactMaterialAt(blocks, vec3(20, 0, 8), terrain)).toBe('concrete');
    // The crate's side, a little above the ground at its foot: wood, not earth.
    const crate = blocks[0]!;
    expect(impactMaterialAt(blocks, vec3(crate.center.x - 0.6, ground(crate.center.x, crate.center.z) + 0.2, crate.center.z), terrain)).toBe('wood');
    // The old answers keep their values with terrain passed (blocks away from the ground).
    expect(impactMaterialAt(blocks, vec3(crate.center.x, crate.center.y + 0.6, crate.center.z), terrain)).toBe('wood');
  });
});

describe("the yard's outdoor bed (audit CORE-34)", () => {
  const render = (rand?: () => number): { bed: Float32Array; steps: number } => {
    const job = renderAmbienceBed(RATE, rand);
    let steps = 0;
    for (;;) {
      const r = job.next();
      if (r.done) return { bed: r.value, steps };
      steps++;
    }
  };
  const { bed, steps } = render();

  it('is a loop of the configured length at a loudness of 1, rendered a second at a time', () => {
    expect(bed.length).toBe(Math.round(AUDIO.ambience.seconds * RATE));
    expect(bed.every(Number.isFinite)).toBe(true);
    expect(rms(bed, 0, AUDIO.ambience.seconds)).toBeCloseTo(1, 3);
    expect(steps).toBeGreaterThanOrEqual(AUDIO.ambience.seconds);
  });

  it('loops without a click: the step from its end back to its start is an ordinary one', () => {
    let biggest = 0;
    for (let i = 1; i < bed.length; i++) biggest = Math.max(biggest, Math.abs(bed[i]! - bed[i - 1]!));
    const wrap = Math.abs(bed[0]! - bed[bed.length - 1]!);
    expect(wrap).toBeLessThan(biggest * 0.5);
  });

  it('is low and dull (no hiss): mostly below 1 kHz', () => {
    expect(brightness(bed)).toBeLessThan(1200);
  });

  it('is the same for a seed', () => {
    expect(render(seededRandom(AUDIO.ambience.seed)).bed).toEqual(bed);
  });

  it('lets a bird sing between the configured gaps, round the listener at the configured distance', () => {
    const birds = new AmbientCalls(AMBIENCES.yard.day.call!, 5);
    const at = vec3();
    const listener = vec3(3, 1.6, -4);
    const [least, most] = AUDIO.ambience.birdEvery;
    let last = 0;
    let sung = 0;
    for (let t = 0; t < 300; t += 0.1) {
      if (!birds.due(t, listener, at)) continue;
      if (sung > 0) {
        expect(t - last).toBeGreaterThanOrEqual(least - 0.11);
        expect(t - last).toBeLessThanOrEqual(most + 0.11);
      }
      const d = Math.hypot(at.x - listener.x, at.z - listener.z);
      expect(d).toBeGreaterThanOrEqual(AUDIO.ambience.birdDistance[0] - 1e-9);
      expect(d).toBeLessThanOrEqual(AUDIO.ambience.birdDistance[1] + 1e-9);
      last = t;
      sung++;
    }
    expect(sung).toBeGreaterThan(300 / most - 1);
  });
});

describe('volume settings (M13)', () => {
  it('starts at the defaults and keeps what the player sets', () => {
    const storage = memoryStorage();
    expect(loadVolumes(storage)).toEqual(VOLUME.defaults);
    saveSetting(volumeField('effects'), 0.35, storage);
    expect(loadVolumes(storage)).toEqual({ ...VOLUME.defaults, effects: 0.35 });
  });

  it('maps a slider to a gain on a curve: silent at 0, full at 1, gentler steps at the low end', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(1)).toBe(1);
    expect(volumeGain(0.5)).toBeLessThan(0.5);
    expect(volumeGain(2)).toBe(1);
  });
});

describe('M32 acceptance 7: the Cyber Pistol sounds its own', () => {
  const rendered = renderSounds(RATE, 3);

  it("has a profile of its own with a shot, dry fire and both magazine sounds, and the replica says which it makes", () => {
    expect(CYBER_PISTOL.look.sound).toBe('cyber');
    expect(CYBER_PISTOL.power).toBe('electric');
    expect(SHOT_PROFILES).toContain('cyber');
    for (const cue of [cues.shot('cyber'), cues.dryFire('cyber'), cues.magOut('cyber'), cues.magIn('cyber')]) {
      expect(SOUNDS[cue], cue).toBeDefined();
      expect(rendered.get(cue), cue).toHaveLength(3);
    }
    // The other replicas keep their power's sounds.
    for (const r of LOADOUT) expect(r.look.sound).toBeUndefined();
  });

  it("has sounds that are none of another profile's", () => {
    for (const make of [cues.shot, cues.dryFire, cues.magOut, cues.magIn]) {
      const mine = rendered.get(make('cyber'))![0]!;
      for (const other of SHOT_PROFILES.filter((p) => p !== 'cyber')) {
        const theirs = rendered.get(make(other))![0]!;
        expect(mine.length === theirs.length && mine.every((x, i) => x === theirs[i]), `${make('cyber')} vs ${make(other)}`).toBe(false);
      }
    }
  });
});
