import { describe, expect, it } from 'vitest';
import { AUDIO, VOLUME } from '../config/audio';
import { LOADOUT } from '../config/replicas';
import { cues, SHOT_PROFILES, SOUNDS, type SoundCue } from '../config/sounds';
import { DEPOT } from '../map/depot';
import type { MapBlock } from '../map/mapTypes';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { saveSetting } from '../settings/storage';
import { loadVolumes, volumeField, volumeGain } from './audioMix';
import { recipeLength, renderRecipe, seededRandom, type SoundRecipe } from './dsp';
import { type FoleyMove, FoleyTracker } from './foley';
import { MotorSound } from './motor';
import { blockedShare, lineBlocked, muffleFor, type OcclusionQuery } from './occlusion';
import { renderSounds, suppressedCopies } from './soundBank';
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

describe('sound synthesis (M13)', () => {
  const rendered = renderSounds(RATE, 3);

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

  it('builds every sound quickly enough to do when Play is pressed', () => {
    const t0 = performance.now();
    renderSounds(RATE);
    // Node is slower than a browser's JIT at this; the game renders once per page load.
    expect(performance.now() - t0).toBeLessThan(1500);
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
    const steps = (Object.keys(SOUNDS) as SoundCue[]).filter((c) => c.startsWith('step.'));
    for (const p of SHOT_PROFILES) {
      for (const step of steps) {
        expect(played(cues.shot(p), L.shot.gain, peak, 'min'), `${p} shot vs ${step} (peak)`).toBeGreaterThan(1.5 * played(step, L.step.gain, peak, 'max'));
        expect(played(cues.shot(p), L.shot.gain, loudness, 'min'), `${p} shot vs ${step} (loudness)`).toBeGreaterThan(1.3 * played(step, L.step.gain, loudness, 'max'));
        expect(played(cues.shot(p), L.shot.gain, peak, 'min'), `${p} shot vs your ${step}`).toBeGreaterThan(2.5 * played(step, L.ownStep.gain, peak, 'max'));
      }
    }
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
