import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AMBIENCES, AUDIO, matchOverBlastStart } from '../config/audio';
import { SIM_DT } from '../config/sim';
import { CYBER_PISTOL, LOADOUT } from '../config/replicas';
import type { SoundCue } from '../config/sounds';
import type { MapBlock } from '../map/mapTypes';
import { type Character, createCharacter } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { vec3 } from '../sim/vec';
import { DEPOT } from '../map/depot';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { terrainHeightAt } from '../map/terrain';
import { WOODLAND } from '../map/woodland';
import { FIRE_SOUND } from '../config/audio';
import { AmbientCalls } from './ambience';
import { soundscapeOf } from './soundscape';
import { AudioEngine, type IdleScheduler } from './audioEngine';
import { volumeGain } from './audioMix';
import type { OcclusionQuery } from './occlusion';
import { Sfx } from './sfx';
import { renderSoundsGradually, SoundLibrary, suppressedCopies } from './soundBank';
import { fitParts } from '../sim/armament';

// ---- A minimal stand-in for the Web Audio API (records what Sfx builds and connects) --------------

class FakeParam {
  private v = 0;
  /** Plain `value` writes (audit CORE-35 counts them). */
  writes = 0;
  targets: { value: number; at: number }[] = [];
  /** Every automation event in order (the whistle's envelope, CORE-31). */
  events: { kind: 'set' | 'ramp' | 'target' | 'cancel'; value: number; at: number }[] = [];
  get value(): number {
    return this.v;
  }
  set value(v: number) {
    this.v = v;
    this.writes++;
  }
  setTargetAtTime(value: number, at: number): void {
    this.targets.push({ value, at });
    this.events.push({ kind: 'target', value, at });
  }
  setValueAtTime(value: number, at: number): void {
    this.events.push({ kind: 'set', value, at });
  }
  linearRampToValueAtTime(value: number, at: number): void {
    this.events.push({ kind: 'ramp', value, at });
  }
  cancelScheduledValues(at: number): void {
    this.events.push({ kind: 'cancel', value: Number.NaN, at });
  }
}

class FakeNode {
  readonly outputs = new Set<unknown>();
  disconnected = false;
  connect<T>(dest: T): T {
    this.outputs.add(dest);
    return dest;
  }
  disconnect(): void {
    this.outputs.clear();
    this.disconnected = true;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type = '';
  frequency = new FakeParam();
  Q = new FakeParam();
}

class FakePanner extends FakeNode {
  panningModel = '';
  distanceModel = '';
  refDistance = 0;
  rolloffFactor = 0;
  maxDistance = 0;
  positionX = new FakeParam();
  positionY = new FakeParam();
  positionZ = new FakeParam();
}

class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  offset = 0;
  playbackRate = new FakeParam();
  frequency = new FakeParam();
  type = '';
  onended: (() => void) | null = null;
  private readonly endedListeners: (() => void)[] = [];
  startAt = Number.NaN;
  stopAt: number | null = null;
  start(at = 0, offset = 0): void {
    this.startAt = at;
    this.offset = offset;
  }
  stop(at = 0): void {
    this.stopAt = at;
  }
  addEventListener(_type: string, f: () => void): void {
    this.endedListeners.push(f);
  }
  /** The browser finishing the sound. */
  end(): void {
    this.onended?.();
    for (const f of this.endedListeners) f();
  }
}

class FakeBuffer {
  readonly data: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(ch: number): Float32Array {
    return this.data[ch]!;
  }
  copyToChannel(src: Float32Array, ch: number): void {
    this.data[ch]!.set(src);
  }
}

class FakeConvolver extends FakeNode {
  buffer: unknown = null;
}

class FakeStereoPanner extends FakeNode {
  pan = new FakeParam();
}

class FakeContext {
  static last: FakeContext;
  /** Contexts constructed since the test began. */
  static made = 0;
  state: 'running' | 'suspended' | 'closed' = 'running';
  resumed = 0;
  suspended = 0;
  closed = 0;
  buffersMade = 0;
  currentTime = 0;
  /** The next contexts' rate (a test can make a 44.1 kHz device). */
  static rate = 48000;
  sampleRate = FakeContext.rate;
  baseLatency = 0.01;
  outputLatency = 0.02;
  readonly destination = new FakeNode();
  readonly listener = Object.fromEntries(['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'].map((k) => [k, new FakeParam()]));
  readonly gains: FakeGain[] = [];
  readonly panners: FakePanner[] = [];
  readonly filters: FakeFilter[] = [];
  readonly sources: FakeSource[] = [];
  readonly oscillators: FakeSource[] = [];
  readonly compressors: FakeNode[] = [];
  readonly stereoPanners: FakeStereoPanner[] = [];
  readonly convolvers: FakeConvolver[] = [];
  constructor() {
    FakeContext.last = this;
    FakeContext.made++;
  }
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBiquadFilter(): FakeFilter {
    const f = new FakeFilter();
    this.filters.push(f);
    return f;
  }
  createPanner(): FakePanner {
    const p = new FakePanner();
    this.panners.push(p);
    return p;
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createOscillator(): FakeSource {
    const o = new FakeSource();
    this.oscillators.push(o);
    return o;
  }
  createDynamicsCompressor(): FakeNode & Record<'threshold' | 'knee' | 'ratio' | 'attack' | 'release', FakeParam> {
    const c = Object.assign(new FakeNode(), { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam() });
    this.compressors.push(c);
    return c;
  }
  createConvolver(): FakeConvolver {
    const c = new FakeConvolver();
    this.convolvers.push(c);
    return c;
  }
  createStereoPanner(): FakeStereoPanner {
    const p = new FakeStereoPanner();
    this.stereoPanners.push(p);
    return p;
  }
  createBuffer(channels: number, length: number, rate: number): FakeBuffer {
    this.buffersMade++;
    return new FakeBuffer(channels, length, rate);
  }
  resume(): Promise<void> {
    this.resumed++;
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.suspended++;
    this.state = 'suspended';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed++;
    this.state = 'closed';
    return Promise.resolve();
  }
}

// ---- Helpers -------------------------------------------------------------------------------------

const OPEN: OcclusionQuery = { raycastStatic: () => -1 };
const WALLED: OcclusionQuery = { raycastStatic: () => 1 };
const FLOOR: MapBlock[] = [{ kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(100, 0.5, 100) }];
const VOLUMES = { master: 1, effects: 1, interface: 1 };
/** Shared across tests: the sounds render once. */
const LIBRARY = new SoundLibrary();
const PLAYER = 0;

/** Spare moments on demand: `run()` gives each waiting job one moment of `ms` milliseconds. */
function manualIdle(ms = 0): { idle: IdleScheduler; waiting: () => number; run: () => void } {
  let jobs: ((timeLeft: () => number) => void)[] = [];
  return {
    idle: (work) => void jobs.push(work),
    waiting: () => jobs.length,
    run: () => {
      const now = jobs;
      jobs = [];
      for (const job of now) job(() => ms);
    },
  };
}

/** An engine as the Game keeps one; its spare-time rendering only runs when a test asks. */
function engineFor(library = LIBRARY): AudioEngine {
  return new AudioEngine({ ...VOLUMES }, library, manualIdle().idle);
}

function setup(
  query: OcclusionQuery = OPEN,
  engine = engineFor(),
): { sfx: Sfx; ctx: FakeContext; engine: AudioEngine; player: Character; bot: Character; characterOf: (id: number) => Character | undefined } {
  const player = createCharacter(PLAYER, vec3(0, 0, 0), 0, LOADOUT, 0);
  const bot = createCharacter(1, vec3(6, 0, 0), 0, LOADOUT, 1);
  const sfx = new Sfx(LOADOUT, FLOOR, query, engine);
  sfx.unlock();
  sfx.setListener(vec3(0, 1.6, 0), 0, 0, -1);
  const all = [player, bot];
  return { sfx, ctx: FakeContext.last, engine, player, bot, characterOf: (id) => all.find((c) => c.id === id) };
}

/** The muffling low-pass of the first character channel (after its HRTF panner), if one is made. */
function channelFilter(ctx: FakeContext): FakeFilter | undefined {
  const hrtf = ctx.panners.find((p) => p.panningModel === 'HRTF');
  return hrtf ? ([...hrtf.outputs][0] as FakeFilter) : undefined;
}

/** The node a source plays into (through its level gain). */
function destinationOf(src: FakeSource): unknown {
  const [gain] = [...src.outputs] as FakeGain[];
  return [...gain!.outputs][0];
}

/** Every node downstream of `node`. */
function downstream(node: FakeNode): Set<unknown> {
  const seen = new Set<unknown>();
  const todo: unknown[] = [...node.outputs];
  while (todo.length > 0) {
    const n = todo.pop();
    if (seen.has(n)) continue;
    seen.add(n);
    if (n instanceof FakeNode) todo.push(...n.outputs);
  }
  return seen;
}

/** Plays dry (an interface cue): reaches the speakers through no panner and no reverb. */
function playsDry(src: FakeSource, ctx: FakeContext): boolean {
  const after = [...downstream(src)];
  return after.includes(ctx.destination) && !after.some((n) => n instanceof FakePanner || n instanceof FakeConvolver);
}

/** Whether `src` plays one of `cue`'s rendered variants. */
function plays(src: FakeSource, cue: SoundCue): boolean {
  const data = (src.buffer as FakeBuffer).data[0]!;
  return LIBRARY.get(48000).get(cue)!.some((v) => v.length === data.length && v.every((x, i) => x === data[i]));
}

/** Whether `src` plays one of the engine's variants of `cue` (map cues included). */
function playsOf(engine: AudioEngine, src: FakeSource, cue: SoundCue): boolean {
  const data = (src.buffer as FakeBuffer).data[0]!;
  return engine.samples(cue).some((v) => v.length === data.length && v.every((x, i) => x === data[i]));
}

const shot = (characterId: number): GameEvent => ({ type: 'shot', characterId, replicaId: 'aeg', position: vec3(0, 1.6, 0) });
const step = (characterId: number): GameEvent => ({ type: 'footstep', characterId, kind: 'run' });

describe('the sound engine (M13)', () => {
  beforeEach(() => {
    FakeContext.made = 0;
    vi.stubGlobal('AudioContext', FakeContext);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reuses one HRTF channel per character for all their sounds (audit W-03)", () => {
    const { sfx, ctx, bot, characterOf } = setup();
    sfx.onEvent(step(bot.id), PLAYER, characterOf);
    sfx.onEvent(step(bot.id), PLAYER, characterOf);
    sfx.onEvent(shot(bot.id), PLAYER, characterOf);
    const hrtf = ctx.panners.filter((p) => p.panningModel === 'HRTF');
    expect(hrtf).toHaveLength(1);
    for (const src of ctx.sources) expect(destinationOf(src)).toBe(hrtf[0]);
  });

  it('plays your own sounds centred, with no panner', () => {
    const { sfx, ctx, characterOf } = setup();
    sfx.onEvent(step(PLAYER), PLAYER, characterOf);
    sfx.onEvent(shot(PLAYER), PLAYER, characterOf);
    expect(ctx.panners).toHaveLength(0);
    expect(ctx.sources.length).toBeGreaterThan(0);
  });

  it("plays a hi-cap's rattle as a step: yours centred at your own step's level, a bot's only within earshot (M17b)", () => {
    const { sfx, ctx, bot, characterOf } = setup();
    const rattle = (characterId: number): GameEvent => ({ type: 'footstep', characterId, kind: 'rattle' });
    sfx.onEvent(rattle(PLAYER), PLAYER, characterOf);
    expect(ctx.panners).toHaveLength(0);
    expect(ctx.sources).toHaveLength(1);
    const ownLevel = [...ctx.sources[0]!.outputs][0] as FakeGain;
    expect(ownLevel.gain.value).toBeGreaterThan(0);
    sfx.onEvent(step(PLAYER), PLAYER, characterOf);
    expect(ownLevel.gain.value).toBe(([...ctx.sources[1]!.outputs][0] as FakeGain).gain.value);
    bot.position.x = AUDIO.footsteps.maxDistance + 1;
    sfx.onEvent(rattle(bot.id), PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(2);
  });

  it("clicks a weapon torch's switch (M33h): yours centred, a bot's from where it stands", () => {
    const { sfx, ctx, bot, characterOf } = setup();
    sfx.onEvent({ type: 'torch', characterId: PLAYER, on: true }, PLAYER, characterOf);
    expect(ctx.panners).toHaveLength(0);
    expect(ctx.sources).toHaveLength(1);
    expect(plays(ctx.sources[0]!, 'torchClick')).toBe(true);
    sfx.onEvent({ type: 'torch', characterId: bot.id, on: false }, PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(2);
    expect(plays(ctx.sources[1]!, 'torchClick')).toBe(true);
    expect(ctx.panners.length).toBeGreaterThan(0);
  });

  it("doesn't play other players' steps beyond earshot", () => {
    const { sfx, ctx, bot, characterOf } = setup();
    bot.position.x = AUDIO.footsteps.maxDistance + 1;
    sfx.onEvent(step(bot.id), PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(0);
  });

  it('gives a BB impact its own equal-power panner and disconnects the whole chain when it ends', () => {
    const { sfx, ctx, characterOf } = setup();
    // The event itself plays nothing: CombatPresentation passes the material it worked out for the dust (audit L-15).
    sfx.onEvent({ type: 'bbImpact', position: vec3(3, 0, 0), ownerId: 1 }, PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(0);
    sfx.impact(vec3(3, 0, 0), 'concrete');
    expect(plays(ctx.sources[0]!, 'impact.concrete')).toBe(true);
    const [panner] = ctx.panners;
    expect(panner!.panningModel).toBe('equalpower');
    const src = ctx.sources[0]!;
    const levelGain = [...src.outputs][0] as FakeGain;
    const filter = [...panner!.outputs][0] as FakeFilter;
    const muffleGain = [...filter.outputs][0] as FakeGain;
    src.end();
    for (const node of [src, levelGain, panner!, filter, muffleGain]) expect(node.disconnected).toBe(true);
  });

  it('leaves no one-shot nodes connected for a cue with nothing to play (audit L-16)', () => {
    const library = new SoundLibrary(function* (rate) {
      const all = yield* renderSoundsGradually(rate, 1);
      all.delete('rope.up');
      return all;
    });
    const { sfx, ctx, characterOf } = setup(OPEN, engineFor(library));
    const gains = ctx.gains.length;
    const filters = ctx.filters.length;
    sfx.onEvent({ type: 'flagRope', position: vec3(0, 2, 10), raising: true }, PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(0);
    expect(ctx.filters).toHaveLength(filters);
    expect(ctx.gains).toHaveLength(gains);
    for (const p of ctx.panners) expect(p.outputs.size).toBe(0);
  });

  it('winds an AEG up on a fresh trigger pull and coasts it down only once the trigger is let go', () => {
    const { sfx, ctx, player, bot, characterOf } = setup();
    const rate = LOADOUT[0]!.fireRate;
    const tick = (n: number) => {
      for (let i = 0; i < n; i++) sfx.afterTick([player, bot], PLAYER);
    };
    tick(1);
    sfx.onEvent(shot(bot.id), PLAYER, characterOf);
    // Shot and spin-up; the wind-down waits for the trigger.
    expect(ctx.sources).toHaveLength(2);
    // A full-auto burst: shots 4 or 5 ticks apart (the cooldown at 60 Hz), with no wind-down in between, whatever
    // the frame rate the audio sees them at (bug pass: the audio clock let wind-downs through at 30–50 fps).
    for (const gap of [5, 4, 5, 5, 4, 5]) {
      tick(gap);
      sfx.onEvent(shot(bot.id), PLAYER, characterOf);
    }
    expect(ctx.sources).toHaveLength(2 + 6); // the six shots only
    // Let go: the wind-down plays once spinDownAfterCycles have passed on the simulation's clock.
    const ticksToDown = Math.ceil((AUDIO.motor.spinDownAfterCycles / rate) * 60 - 1e-9);
    tick(ticksToDown - 1);
    expect(ctx.sources).toHaveLength(8);
    tick(1);
    expect(ctx.sources).toHaveLength(9);
    expect(plays(ctx.sources[8]!, 'motor.spinDown')).toBe(true);
    tick(30);
    expect(ctx.sources).toHaveLength(9); // once
  });

  it('fades a wind-down already playing instead of cutting it with a click', () => {
    const { sfx, ctx, player, bot, characterOf } = setup();
    const rate = LOADOUT[0]!.fireRate;
    sfx.onEvent(shot(bot.id), PLAYER, characterOf);
    // Ticks until the wind-down has started, but the motor hasn't rested long enough for a spin-up.
    const down = Math.ceil((AUDIO.motor.spinDownAfterCycles / rate) * 60);
    for (let i = 0; i < down; i++) sfx.afterTick([player, bot], PLAYER);
    expect(down).toBeLessThan((AUDIO.motor.spinUpAfterCycles / rate) * 60);
    const wind = ctx.sources.at(-1)!;
    expect(plays(wind, 'motor.spinDown')).toBe(true);
    const windGain = [...wind.outputs][0] as FakeGain;
    ctx.currentTime = 0.5;
    sfx.onEvent(shot(bot.id), PLAYER, characterOf);
    expect(windGain.gain.targets.at(-1)).toEqual({ value: 0, at: ctx.currentTime });
    expect(wind.stopAt).toBeCloseTo(ctx.currentTime + AUDIO.cutFade);
  });

  it('muffles a character behind a wall and leaves one in the open clear', () => {
    const open = setup(OPEN);
    open.sfx.afterTick([open.player, open.bot], PLAYER);
    const clear = channelFilter(open.ctx)!;
    expect(clear.frequency.value).toBe(AUDIO.occlusion.openHz);

    const walled = setup(WALLED);
    walled.sfx.afterTick([walled.player, walled.bot], PLAYER);
    const muffled = channelFilter(walled.ctx)!;
    expect(muffled.frequency.value).toBeCloseTo(AUDIO.occlusion.muffledHz);
  });

  it('casts the muffling rays once per tick, not per frame; frames only move the channels (audit L-14)', () => {
    let casts = 0;
    const counting: OcclusionQuery = { raycastStatic: () => (casts++, -1) };
    const { sfx, player, bot, ctx } = setup(counting);
    const third = createCharacter(2, vec3(-4, 0, 3), 0, LOADOUT, 1);
    const all = [player, bot, third];
    sfx.placeSources(all, PLAYER);
    bot.position.x = 7;
    sfx.placeSources(all, PLAYER);
    expect(casts).toBe(0);
    expect(ctx.panners.find((p) => p.positionX.value === 7)).toBeDefined();
    sfx.afterTick(all, PLAYER);
    expect(casts).toBe(AUDIO.occlusion.rayHeights.length * 2);
  });

  it("doesn't muffle anyone before the first frame has placed the listener", () => {
    const sfx = new Sfx(LOADOUT, FLOOR, WALLED, engineFor());
    sfx.unlock();
    const player = createCharacter(PLAYER, vec3(0, 0, 0), 0, LOADOUT, 0);
    const bot = createCharacter(1, vec3(6, 0, 0), 0, LOADOUT, 1);
    sfx.afterTick([player, bot], PLAYER);
    expect(channelFilter(FakeContext.last)?.frequency.value ?? AUDIO.occlusion.openHz).toBe(AUDIO.occlusion.openHz);
  });

  it('eases a volume bus to its slider', () => {
    const { engine, ctx } = setup();
    engine.setVolume('interface', 0.5);
    const eased = ctx.gains.flatMap((g) => g.gain.targets);
    expect(eased).toContainEqual({ value: volumeGain(0.5), at: 0 });
  });
});

describe('the sound engine: lifecycle, whistle and routing (audit L-18)', () => {
  beforeEach(() => {
    FakeContext.made = 0;
    vi.stubGlobal('AudioContext', FakeContext);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const roundOver: GameEvent = { type: 'roundOver', winner: 0, reason: 'eliminated' };
  const matchOver: GameEvent = { type: 'matchOver', winner: 0 };
  const roundStart: GameEvent = { type: 'roundStart', round: 2 };

  it('plays silent, without throwing, where the browser has no Web Audio or refuses a context (audit M-04)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    class Refused {
      constructor() {
        throw new DOMException('no audio device', 'NotSupportedError');
      }
    }
    for (const AudioContextStub of [undefined, Refused]) {
      vi.stubGlobal('AudioContext', AudioContextStub);
      const player = createCharacter(PLAYER, vec3(0, 0, 0), 0, LOADOUT, 0);
      const engine = engineFor();
      const sfx = new Sfx(LOADOUT, FLOOR, OPEN, engine);
      expect(() => {
        engine.warmUp();
        sfx.unlock();
        sfx.onEvent(shot(PLAYER), PLAYER, () => player);
        sfx.setPaused(false);
        sfx.setListener(vec3(0, 1.6, 0), 0, 0, -1);
        sfx.placeSources([player], PLAYER);
        sfx.afterTick([player], PLAYER);
        engine.setVolume('master', 0.5);
        sfx.unlock();
        sfx.dispose();
        engine.dispose();
      }).not.toThrow();
      expect(sfx.roundStartWhistle()).toBe(false);
    }
    // Once for the refused context: the engine doesn't try again on every Play.
    expect(warn).toHaveBeenCalledTimes(1);
    // Files share a worker's globals (vite.config.ts isolate: false): nothing stubbed here outlives the test.
    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  it("lets a context's refused resume, suspend or close settle quietly (audit M-04)", async () => {
    const { sfx, ctx, engine } = setup();
    const refuse = (): Promise<void> => Promise.reject(new DOMException('refused', 'InvalidStateError'));
    Object.assign(ctx, { resume: refuse, suspend: refuse, close: refuse });
    sfx.setPaused(false);
    sfx.setPaused(true);
    sfx.unlock();
    sfx.dispose();
    engine.dispose();
    // An unhandled rejection would fail the run once the microtasks have run.
    await new Promise((r) => setTimeout(r, 0));
  });

  it('builds one audio context however often it is unlocked', () => {
    const { sfx } = setup();
    sfx.unlock();
    expect(FakeContext.made).toBe(1);
  });

  it('keeps a new match silent until play starts: unlocking never resumes the audio (audit M-07)', () => {
    vi.useFakeTimers();
    const { sfx, ctx } = setup();
    sfx.unlock();
    expect(ctx.resumed).toBe(0);
    expect(ctx.state).toBe('suspended');
    sfx.setPaused(false);
    expect(ctx.resumed).toBe(1);
    expect(ctx.state).toBe('running');
    // Play again after Esc (the click comes before the mouse is captured again): still silent until the capture.
    sfx.setPaused(true);
    vi.advanceTimersByTime(AUDIO.pauseFade * 1000);
    sfx.unlock();
    expect(ctx.resumed).toBe(1);
    expect(ctx.state).toBe('suspended');
  });

  it('suspends the audio with the game and resumes it', () => {
    vi.useFakeTimers();
    const { sfx, ctx } = setup();
    const resumed = ctx.resumed;
    const suspended = ctx.suspended;
    sfx.setPaused(true);
    vi.advanceTimersByTime(AUDIO.pauseFade * 1000);
    expect(ctx.suspended).toBe(suspended + 1);
    expect(ctx.state).toBe('suspended');
    sfx.setPaused(false);
    expect(ctx.resumed).toBe(resumed + 1);
    expect(ctx.state).toBe('running');
  });

  it('plays nothing once disposed, and pausing it then is harmless', () => {
    const { sfx, ctx, bot, characterOf } = setup();
    sfx.dispose();
    sfx.onEvent(shot(bot.id), PLAYER, characterOf);
    sfx.onEvent(roundOver, PLAYER, characterOf);
    sfx.setPaused(false);
    expect(ctx.sources).toHaveLength(0);
    expect(ctx.oscillators).toHaveLength(0);
    expect(sfx.roundStartWhistle()).toBe(false);
  });

  it('blows one long blast at the end of a round, and the extra ones at the end of the match, all dry', () => {
    const { sfx, ctx, characterOf } = setup();
    sfx.onEvent(roundOver, PLAYER, characterOf);
    // Each blast is a tone and its warble (which only moves the tone's pitch).
    expect(ctx.oscillators).toHaveLength(2);
    expect(ctx.oscillators[0]!.startAt).toBe(0);
    sfx.onEvent(matchOver, PLAYER, characterOf);
    expect(ctx.oscillators).toHaveLength(2 * (1 + AUDIO.matchOverBlasts));
    for (let i = 0; i < AUDIO.matchOverBlasts; i++) expect(ctx.oscillators[2 + 2 * i]!.startAt).toBeCloseTo(matchOverBlastStart(i));
    for (let i = 0; i < ctx.oscillators.length; i += 2) expect(playsDry(ctx.oscillators[i]!, ctx)).toBe(true);
  });

  it('cuts a blast still sounding when the next round starts, then blows the two short ones', () => {
    const { sfx, ctx, characterOf } = setup();
    sfx.onEvent(roundOver, PLAYER, characterOf);
    const [tone, warble] = ctx.oscillators;
    sfx.onEvent(roundStart, PLAYER, characterOf);
    expect(tone!.stopAt).toBe(0);
    expect(warble!.stopAt).toBe(0);
    expect(ctx.oscillators).toHaveLength(2 + 4);
    expect(ctx.oscillators[4]!.startAt).toBeCloseTo(AUDIO.roundStartWhistle * AUDIO.roundStartWhistleGap);
  });

  it('blows one long blast a minute before the run ends, like the round-over whistle (M43)', () => {
    const { sfx, ctx, characterOf } = setup();
    sfx.onEvent({ type: 'runWarning', secondsLeft: 60 }, PLAYER, characterOf);
    // One blast: a tone and its warble, started at once, dry like the other whistles.
    expect(ctx.oscillators).toHaveLength(2);
    expect(ctx.oscillators[0]!.startAt).toBe(0);
    expect(playsDry(ctx.oscillators[0]!, ctx)).toBe(true);
    expect(ctx.sources).toHaveLength(0);
  });

  it("beeps the exit's count each second on the interface channel, and the last second is left to the whistle (M43)", () => {
    const { sfx, ctx, characterOf } = setup();
    sfx.onEvent({ type: 'exitCount', exit: 0, secondsLeft: 9 }, PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(1);
    expect(plays(ctx.sources[0]!, 'count.beep')).toBe(true);
    expect(playsDry(ctx.sources[0]!, ctx)).toBe(true);
    sfx.onEvent({ type: 'exitCount', exit: 0, secondsLeft: 1 }, PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(2);
    sfx.onEvent({ type: 'exitCount', exit: 0, secondsLeft: 0 }, PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(2);
    expect(ctx.oscillators).toHaveLength(0);
  });

  it("disconnects a blast's nodes when it ends", () => {
    const { sfx, ctx, characterOf } = setup();
    sfx.onEvent(roundOver, PLAYER, characterOf);
    const [tone, warble] = ctx.oscillators;
    const level = [...tone!.outputs][0] as FakeGain;
    const depth = [...warble!.outputs][0] as FakeGain;
    tone!.end();
    for (const node of [tone!, warble!, level, depth]) expect(node.disconnected).toBe(true);
    // An ended blast is forgotten: a new round's start doesn't stop it again.
    tone!.stopAt = null;
    sfx.onEvent(roundStart, PLAYER, characterOf);
    expect(tone!.stopAt).toBeNull();
  });

  it('routes a hit: yours is the dry tick; one you scored is the body hit on the victim plus the dry hit marker', () => {
    const { sfx, ctx, bot, characterOf } = setup();
    const hit = (victimId: number, shooterId: number): GameEvent => ({ type: 'characterHit', victimId, shooterId, position: vec3(6, 1.2, 0), direction: vec3(1, 0, 0), ricochet: false });
    sfx.onEvent(hit(PLAYER, bot.id), PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(1);
    expect(plays(ctx.sources[0]!, 'hitTick')).toBe(true);
    expect(playsDry(ctx.sources[0]!, ctx)).toBe(true);

    sfx.onEvent(hit(bot.id, PLAYER), PLAYER, characterOf);
    const [body, marker] = ctx.sources.slice(1);
    expect(plays(body!, 'bodyHit')).toBe(true);
    expect(destinationOf(body!)).toBe(ctx.panners.find((p) => p.panningModel === 'HRTF'));
    expect(plays(marker!, 'hitMarker')).toBe(true);
    expect(playsDry(marker!, ctx)).toBe(true);

    // Someone else's hit on someone no longer in play: the body hit where it landed, no marker.
    sfx.onEvent(hit(7, bot.id), PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(4);
    expect(plays(ctx.sources[3]!, 'bodyHit')).toBe(true);
    expect(destinationOf(ctx.sources[3]!)).toBe(ctx.panners.at(-1));
    expect(ctx.panners.at(-1)!.panningModel).toBe('equalpower');
  });

  it("plays a range target's ring and the flag's rope where they are, with the hit marker for your own hit", () => {
    const { sfx, ctx, bot, characterOf } = setup();
    sfx.onEvent({ type: 'targetHit', targetId: 0, kind: 'steel', shooterId: PLAYER, position: vec3(0, 1, -30), ricochet: false }, PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(2);
    expect(plays(ctx.sources[0]!, 'steelRing')).toBe(true);
    expect(destinationOf(ctx.sources[0]!)).toBe(ctx.panners[0]);
    expect(plays(ctx.sources[1]!, 'hitMarker')).toBe(true);
    sfx.onEvent({ type: 'targetHit', targetId: 1, kind: 'figure', shooterId: bot.id, position: vec3(0, 1, -30), ricochet: false }, PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(3);
    expect(plays(ctx.sources[2]!, 'impact.wood')).toBe(true);
    sfx.onEvent({ type: 'flagRope', position: vec3(0, 2, 10), raising: true }, PLAYER, characterOf);
    expect(plays(ctx.sources[3]!, 'rope.up')).toBe(true);
    expect(ctx.panners).toHaveLength(3);
    for (const p of ctx.panners) expect(p.panningModel).toBe('equalpower');
  });

  it('ticks a BB into the ground with the earth cue (M33c)', () => {
    const { sfx, ctx } = setup();
    sfx.impact(vec3(3, 0, 0), 'earth');
    expect(ctx.sources).toHaveLength(1);
    expect(plays(ctx.sources[0]!, 'impact.earth')).toBe(true);
    expect(plays(ctx.sources[0]!, 'impact.concrete')).toBe(false);
  });

  it("caps other players' footsteps and BB impacts per window, and lets them through again after it", () => {
    const { sfx, ctx, bot, characterOf } = setup();
    for (let i = 0; i < AUDIO.footsteps.maxPerWindow + 3; i++) sfx.onEvent(step(bot.id), PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(AUDIO.footsteps.maxPerWindow);
    // Your own steps are never capped.
    sfx.onEvent(step(PLAYER), PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(AUDIO.footsteps.maxPerWindow + 1);
    ctx.currentTime = AUDIO.footsteps.window + 0.01;
    sfx.onEvent(step(bot.id), PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(AUDIO.footsteps.maxPerWindow + 2);

    const before = ctx.sources.length;
    for (let i = 0; i < AUDIO.maxImpactsPerWindow + 3; i++) sfx.impact(vec3(3, 0, 0), 'metal');
    expect(plays(ctx.sources.at(-1)!, 'impact.metal')).toBe(true);
    expect(ctx.sources.length - before).toBe(AUDIO.maxImpactsPerWindow);
  });
});

describe("the shared audio engine: one context and one render for the page's matches (audit M-09)", () => {
  beforeEach(() => {
    FakeContext.made = 0;
    vi.stubGlobal('AudioContext', FakeContext);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** A library whose renders are counted (one variant per cue, to keep the test quick). */
  function countingLibrary(): { library: SoundLibrary; renders: number[] } {
    const renders: number[] = [];
    const library = new SoundLibrary((rate) => {
      renders.push(rate);
      return renderSoundsGradually(rate, 1);
    });
    return { library, renders };
  }

  it('renders the sounds once per sample rate, and makes their buffers once, however many matches play', () => {
    const { library, renders } = countingLibrary();
    const engine = engineFor(library);
    const first = setup(OPEN, engine);
    const made = first.ctx.buffersMade;
    first.sfx.dispose();
    const second = setup(OPEN, engine);
    expect(second.ctx).toBe(first.ctx);
    expect(FakeContext.made).toBe(1);
    expect(first.ctx.buffersMade).toBe(made);
    expect(renders).toEqual([48000]);
  });

  it('holds the sounds once: the library lets go of its samples once the engine has made its buffers (bug pass)', () => {
    const { library } = countingLibrary();
    const { engine, ctx } = setup(OPEN, engineFor(library));
    expect(library.holds(ctx.sampleRate)).toBe(false);
    // A match's own variants (a suppressed replica's) still get the samples, from the buffers.
    const [cue, buffers] = [...engine.cueBuffers()][0]!;
    expect(engine.samples(cue)[0]).toBe(buffers[0]!.getChannelData(0));
  });

  it("renders in the title screen's spare time, a cue at a time, so Play has nothing left to do", () => {
    const { library, renders } = countingLibrary();
    const spare = manualIdle(0);
    const engine = new AudioEngine({ ...VOLUMES }, library, spare.idle);
    engine.warmUp();
    expect(renders).toEqual([]);
    let moments = 0;
    while (spare.waiting() > 0) {
      spare.run();
      moments++;
    }
    expect(renders).toEqual([48000]);
    // A cue per moment for the samples and again for the buffers, then the echo.
    expect(moments).toBeGreaterThan(20);
    const ctx = FakeContext.last;
    const made = ctx.buffersMade;
    setup(OPEN, engine);
    expect(ctx.buffersMade).toBe(made);
  });

  it('finishes the rendering at once when Play comes first, and the spare-time slices then stop', () => {
    const { library, renders } = countingLibrary();
    const spare = manualIdle(0);
    const engine = new AudioEngine({ ...VOLUMES }, library, spare.idle);
    engine.warmUp();
    spare.run();
    spare.run();
    const { sfx, ctx, characterOf } = setup(OPEN, engine);
    sfx.onEvent(shot(PLAYER), PLAYER, characterOf);
    expect(ctx.sources.length).toBeGreaterThan(0);
    spare.run();
    expect(spare.waiting()).toBe(0);
    expect(renders).toEqual([48000]);
  });

  it('makes the context suspended, and runs it only while a match is played', () => {
    vi.useFakeTimers();
    const engine = engineFor();
    const ctx = engine.context() as unknown as FakeContext;
    expect(ctx.state).toBe('suspended');
    expect(ctx.resumed).toBe(0);
    const { sfx } = setup(OPEN, engine);
    expect(ctx.state).toBe('suspended');
    sfx.setPaused(false);
    expect(ctx.state).toBe('running');
    sfx.setPaused(true);
    vi.advanceTimersByTime(AUDIO.pauseFade * 1000);
    expect(ctx.state).toBe('suspended');
  });

  it("disconnects a finished match's nodes and its whistle but keeps the context for the next; the Game's dispose closes it", () => {
    const engine = engineFor();
    const { sfx, ctx, characterOf } = setup(OPEN, engine);
    sfx.onEvent({ type: 'roundOver', winner: 0, reason: 'time' }, PLAYER, characterOf);
    sfx.onEvent(step(1), PLAYER, characterOf);
    // The engine's buses and its ducking are the first four gains; the match's outlet, world, out-level, echo,
    // own-sound and interface gains follow.
    const ownNodes = [...ctx.gains.slice(4, 10), ...ctx.panners, ...ctx.filters];
    sfx.dispose();
    expect(ctx.oscillators[0]!.stopAt).toBe(0);
    for (const node of ownNodes) expect(node.outputs.size, 'a node still connected').toBe(0);
    for (const voice of [...ctx.sources, ...ctx.oscillators]) expect(downstream(voice).has(ctx.destination), 'a voice still reaches the speakers').toBe(false);
    // The engine's buses stay wired to the speakers.
    expect(downstream(ctx.gains[0]!).has(ctx.destination)).toBe(true);
    expect(ctx.closed).toBe(0);
    engine.dispose();
    expect(ctx.closed).toBe(1);
  });
});

describe('a volume slider let go plays a cue at its new level (audit L-17)', () => {
  beforeEach(() => {
    FakeContext.made = 0;
    vi.stubGlobal('AudioContext', FakeContext);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('on the title screen: runs the context just for a dry cue through that bus, then suspends it again', () => {
    const engine = engineFor();
    engine.warmUp(); // as the Game does at start: the context exists, suspended
    const ctx = FakeContext.last;
    engine.setVolume('effects', 0.4);
    engine.preview('effects');
    expect(ctx.resumed).toBe(1);
    expect(ctx.state).toBe('running');
    const [src] = ctx.sources;
    expect(plays(src!, AUDIO.volumePreview.cue)).toBe(true);
    expect(playsDry(src!, ctx)).toBe(true);
    // Through the effects bus: the gain the slider just eased.
    const effects = ctx.gains.find((g) => g.gain.targets.some((t) => t.value === volumeGain(0.4)));
    expect(downstream(src!).has(effects)).toBe(true);
    src!.end();
    expect(ctx.state).toBe('suspended');
    expect(src!.disconnected).toBe(true);
  });

  it("from the pause menu: leaves the match's audio paused after the cue, but running if play resumed meanwhile", () => {
    const engine = engineFor();
    const { sfx, ctx } = setup(OPEN, engine);
    sfx.setPaused(true);
    engine.preview('master');
    engine.preview('interface');
    const [first, second] = ctx.sources;
    first!.end();
    // The second cue is still sounding.
    expect(ctx.state).toBe('running');
    second!.end();
    expect(ctx.state).toBe('suspended');

    engine.preview('master');
    sfx.setPaused(false); // Resume clicked before the cue ended
    ctx.sources[2]!.end();
    expect(ctx.state).toBe('running');
  });

  it("from the pause menu: the match's own sounds stay muted while the cue plays (bug pass)", () => {
    const engine = engineFor();
    const { sfx, ctx } = setup(OPEN, engine);
    sfx.setPaused(false);
    sfx.roundStartWhistle(); // a whistle the match had queued
    sfx.setPaused(true);
    engine.preview('master');
    expect(ctx.state).toBe('running');
    // The engine's buses are its first three gains; the match leaves for them through its own outlets.
    const buses = ctx.gains.slice(0, 3);
    const preview = [...ctx.sources.at(-1)!.outputs][0] as FakeGain;
    const outlets = ctx.gains.filter((g) => !buses.includes(g) && g !== preview && [...g.outputs].some((o) => buses.includes(o as FakeGain)));
    expect(outlets).toHaveLength(2); // effects (dry and echo) and interface
    const whistle = ctx.oscillators[0]!;
    expect(outlets.some((o) => downstream(whistle).has(o))).toBe(true);
    // Eased down (audit CORE-02): the last thing each outlet was told is silence.
    for (const o of outlets) expect(o.gain.targets.at(-1)!.value).toBe(0);
    expect(preview.gain.value).toBeGreaterThan(0);
    sfx.setPaused(false);
    for (const o of outlets) expect(o.gain.targets.at(-1)!.value).toBe(1);
  });

  it('is silent, and harmless, without Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined);
    const engine = engineFor();
    expect(() => engine.preview('master')).not.toThrow();
    expect(FakeContext.made).toBe(0);
  });
});

describe('the final alpha audit: range, pause, mix and ambience (FA6)', () => {
  beforeEach(() => {
    FakeContext.made = 0;
    FakeContext.rate = 48000;
    vi.stubGlobal('AudioContext', FakeContext);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    FakeContext.rate = 48000;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** The engine's ducking gain: between the effects bus (its second gain) and the limiter. */
  const ducker = (ctx: FakeContext): FakeGain => [...ctx.gains[1]!.outputs][0] as FakeGain;
  /** The match's "you're out" low-pass: the filter whose level feeds the yard's echo directly. */
  const outFilter = (ctx: FakeContext): FakeFilter =>
    ctx.filters.find((f) => [...([...f.outputs][0] as FakeGain).outputs].some((n) => n instanceof FakeConvolver))!;

  it("doesn't play (or build nodes for) a one-off sound beyond earshot, but the range's targets carry (CORE-01)", () => {
    const { sfx, ctx, characterOf } = setup();
    sfx.impact(vec3(AUDIO.spatial.maxDistance + 1, 0, 0), 'concrete');
    expect(ctx.sources).toHaveLength(0);
    expect(ctx.panners).toHaveLength(0);
    sfx.impact(vec3(AUDIO.spatial.maxDistance - 1, 0, 0), 'concrete');
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.panners).toHaveLength(1);
    // A far impact doesn't use up the window: a full window of near ones still plays after a hose of far ones.
    for (let i = 0; i < 20; i++) sfx.impact(vec3(0, 0, -(AUDIO.spatial.maxDistance + 5)), 'metal');
    for (let i = 0; i < AUDIO.maxImpactsPerWindow; i++) sfx.impact(vec3(3, 0, 0), 'metal');
    expect(ctx.sources).toHaveLength(AUDIO.maxImpactsPerWindow);
    // Someone else's hit far away: no body hit.
    const hit: GameEvent = { type: 'characterHit', victimId: 7, shooterId: 1, position: vec3(0, 1, -70), direction: vec3(0, 0, -1), ricochet: false };
    const before = ctx.sources.length;
    sfx.onEvent(hit, PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(before);
    // A steel plate at the back of the practice range still rings.
    sfx.onEvent({ type: 'targetHit', targetId: 0, kind: 'steel', shooterId: 1, position: vec3(-7, 1, -68), ricochet: false }, PLAYER, characterOf);
    expect(plays(ctx.sources.at(-1)!, 'steelRing')).toBe(true);
  });

  it('eases the match out on pause and in on resume, and suspends only once the fade is done (CORE-02)', () => {
    vi.useFakeTimers();
    const { sfx, ctx } = setup();
    sfx.setPaused(false);
    const outlets = ctx.gains.filter((g) => [...g.outputs].some((o) => o === ctx.gains[1] || o === ctx.gains[2]));
    expect(outlets).toHaveLength(2);
    for (const o of outlets) expect(o.gain.targets.at(-1)).toEqual({ value: 1, at: ctx.currentTime });
    ctx.currentTime = 2;
    sfx.setPaused(true);
    for (const o of outlets) expect(o.gain.targets.at(-1)).toEqual({ value: 0, at: 2 });
    // Still running while the fade plays...
    expect(ctx.state).toBe('running');
    vi.advanceTimersByTime(AUDIO.pauseFade * 1000 - 1);
    expect(ctx.state).toBe('running');
    vi.advanceTimersByTime(1);
    expect(ctx.state).toBe('suspended');
    // ...and a Resume within the fade keeps it running.
    sfx.setPaused(false);
    sfx.setPaused(true);
    sfx.setPaused(false);
    vi.advanceTimersByTime(AUDIO.pauseFade * 1000 * 2);
    expect(ctx.state).toBe('running');
  });

  it('renders at its own rate on a 44.1 kHz device, once, and lets the sources resample (CORE-03, CORE-31)', () => {
    FakeContext.rate = 44100;
    const renders: number[] = [];
    const library = new SoundLibrary((rate) => {
      renders.push(rate);
      return renderSoundsGradually(rate, 1);
    });
    const { ctx, engine } = setup(OPEN, engineFor(library));
    expect(ctx.sampleRate).toBe(44100);
    expect(renders).toEqual([AUDIO.renderRate]);
    for (const variants of engine.cueBuffers().values()) for (const b of variants) expect(b.sampleRate).toBe(AUDIO.renderRate);
    expect(engine.ambienceBed()!.sampleRate).toBe(AUDIO.renderRate);
    // The silencer's muffled shot copies too (FA6 follow-up): filtered at the rate they were rendered at.
    const shotCues = [...engine.cueBuffers().keys()].filter((c) => c.startsWith('shot.'));
    expect(shotCues.length).toBeGreaterThan(0);
    for (const cue of shotCues) {
      const want = suppressedCopies(engine.samples(cue), AUDIO.renderRate);
      const got = engine.muffledBuffers(cue).map((b) => (b as unknown as FakeBuffer).data[0]!);
      expect(got).toEqual(want);
      // Filtered at the device's rate instead, they would sound duller or brighter than meant.
      expect(got).not.toEqual(suppressedCopies(engine.samples(cue), 44100));
    }
    // The convolver takes only the context's own rate.
    expect((ctx.convolvers[0]!.buffer as FakeBuffer).sampleRate).toBe(44100);
  });

  it('keeps the limiter off the interface: the hit tick goes straight to master; the world is limited (CORE-16)', () => {
    const { ctx, engine } = setup();
    const [limiter] = ctx.compressors;
    const [master, effects, ui] = ctx.gains;
    expect(downstream(ui!).has(ctx.destination)).toBe(true);
    expect(downstream(ui!).has(limiter)).toBe(false);
    expect([...ui!.outputs]).toEqual([master]);
    expect(downstream(effects!).has(limiter)).toBe(true);
    expect(engine.latencyMs()).toBeCloseTo(30);
    expect(engineFor().latencyMs()).toBeNull();
  });

  it('renders the echo from a seed, the same every time, a channel per step (CORE-17)', () => {
    const a = engineFor().reverbImpulse() as unknown as FakeBuffer;
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const b = engineFor().reverbImpulse() as unknown as FakeBuffer;
    expect(a.data[0]!.some((x) => x !== 0)).toBe(true);
    expect(b.data).toEqual(a.data);
    expect(a.data[0]).not.toEqual(a.data[1]);
  });

  it("tells the game when the browser won't let the sound start (CORE-21)", async () => {
    vi.useFakeTimers();
    const { sfx, ctx, engine } = setup();
    const blocked = vi.fn();
    engine.onBlocked = blocked;
    // Refused outright (Firefox's "Block audio and video", a policy).
    ctx.resume = () => Promise.reject(new DOMException('not allowed', 'NotAllowedError'));
    sfx.setPaused(false);
    await vi.advanceTimersByTimeAsync(AUDIO.blockedCheck * 1000);
    expect(blocked).toHaveBeenCalledTimes(1);
    // Left pending (the spec's "not allowed to start"): noticed a moment later.
    sfx.setPaused(true);
    ctx.state = 'suspended';
    ctx.resume = () => new Promise<void>(() => {});
    sfx.setPaused(false);
    await vi.advanceTimersByTimeAsync(AUDIO.blockedCheck * 1000 - 10);
    expect(blocked).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(blocked).toHaveBeenCalledTimes(2);
    // A volume slider's cue refused too.
    sfx.setPaused(true);
    ctx.resume = () => Promise.reject(new DOMException('not allowed', 'NotAllowedError'));
    engine.preview('master');
    await vi.advanceTimersByTimeAsync(0);
    expect(blocked).toHaveBeenCalledTimes(3);
    // Allowed: nothing to say.
    ctx.resume = FakeContext.prototype.resume.bind(ctx);
    sfx.setPaused(false);
    await vi.advanceTimersByTimeAsync(AUDIO.blockedCheck * 1000 * 2);
    expect(blocked).toHaveBeenCalledTimes(3);
  });

  it('dips the world, never the interface, under your own hit and the whistle; the deeper dip wins (CORE-30)', () => {
    const { sfx, ctx, bot, characterOf } = setup();
    const duck = ducker(ctx);
    expect(downstream(ctx.gains[2]!).has(duck)).toBe(false);
    const hit = (victimId: number, shooterId: number): GameEvent => ({ type: 'characterHit', victimId, shooterId, position: vec3(6, 1.2, 0), direction: vec3(1, 0, 0), ricochet: false });
    // Someone else hit: no dip.
    sfx.onEvent(hit(bot.id, PLAYER), PLAYER, characterOf);
    expect(duck.gain.targets).toHaveLength(0);
    ctx.currentTime = 1;
    sfx.onEvent(hit(PLAYER, bot.id), PLAYER, characterOf);
    const h = AUDIO.duck.hit;
    expect(duck.gain.targets).toEqual([
      { value: h.depth, at: 1 },
      { value: 1, at: 1 + h.hold },
    ]);
    // The round's whistle while the hit's dip is on: it stays as deep, and lasts as long as the longer hold.
    ctx.currentTime = 1.1;
    sfx.onEvent({ type: 'roundOver', winner: 1, reason: 'eliminated' }, PLAYER, characterOf);
    expect(duck.gain.events.filter((e) => e.kind === 'cancel').at(-1)!.at).toBe(1.1);
    expect(duck.gain.targets.slice(-2)).toEqual([
      { value: h.depth, at: 1.1 },
      { value: 1, at: 1.1 + AUDIO.duck.whistle.hold },
    ]);
    // Later, on its own, the whistle's gentler dip.
    ctx.currentTime = 5;
    sfx.onEvent({ type: 'matchOver', winner: 1 }, PLAYER, characterOf);
    expect(duck.gain.targets.at(-2)).toEqual({ value: AUDIO.duck.whistle.depth, at: 5 });
  });

  it("muffles the world while you're out and clears it when you're back in play (CORE-30, CORE-34)", () => {
    const { sfx, ctx, player, bot } = setup();
    const filter = outFilter(ctx);
    const level = [...filter.outputs][0] as FakeGain;
    sfx.afterTick([player, bot], PLAYER);
    expect(filter.frequency.targets).toHaveLength(0);
    player.status = 'calling';
    ctx.currentTime = 3;
    sfx.afterTick([player, bot], PLAYER);
    expect(filter.frequency.targets).toEqual([{ value: AUDIO.out.hz, at: 3 }]);
    expect(level.gain.targets).toEqual([{ value: AUDIO.out.gain, at: 3 }]);
    player.status = 'out';
    sfx.afterTick([player, bot], PLAYER);
    expect(filter.frequency.targets).toHaveLength(1);
    player.status = 'alive';
    sfx.afterTick([player, bot], PLAYER);
    expect(filter.frequency.targets.at(-1)!.value).toBe(AUDIO.occlusion.openHz);
    expect(level.gain.targets.at(-1)!.value).toBe(1);
    // The interface (the whistle, the hit tick) is never behind it.
    expect(downstream(ctx.gains[2]!).has(filter)).toBe(false);
  });

  it('plays the outdoor bed from the first moment of play, two copies apart, into the world, until disposed (CORE-34)', () => {
    const { sfx, ctx, engine } = setup();
    expect(ctx.sources).toHaveLength(0);
    sfx.setPaused(false);
    const bed = ctx.sources.filter((s) => s.loop);
    expect(bed).toHaveLength(2);
    const buffer = engine.ambienceBed() as unknown as FakeBuffer;
    for (const s of bed) expect(s.buffer).toBe(buffer);
    expect(bed.map((s) => s.offset)).toEqual([0, buffer.duration / 2]);
    expect(ctx.stereoPanners.map((p) => p.pan.value)).toEqual([-AUDIO.ambience.width, AUDIO.ambience.width]);
    // Through the world: the echo, the "out" muffling and the effects slider (with its dip and limiter).
    for (const s of bed) {
      const after = downstream(s);
      expect(after.has(outFilter(ctx))).toBe(true);
      expect(after.has(ctx.gains[1])).toBe(true);
      expect(after.has(ctx.destination)).toBe(true);
    }
    sfx.setPaused(true);
    sfx.setPaused(false);
    expect(ctx.sources.filter((s) => s.loop)).toHaveLength(2);
    sfx.dispose();
    for (const s of bed) {
      expect(s.stopAt).toBe(0);
      expect(downstream(s).has(ctx.destination)).toBe(false);
    }
  });

  it('lets a bird sing now and then, somewhere round you, timed on the simulation clock (CORE-34)', () => {
    const { sfx, ctx, player, bot } = setup();
    const [least, most] = AUDIO.ambience.birdEvery;
    const ticks = (s: number): number => Math.round(s / SIM_DT);
    for (let i = 0; i < ticks(least) - 1; i++) sfx.afterTick([player, bot], PLAYER);
    expect(ctx.sources).toHaveLength(0);
    for (let i = 0; i < ticks(most - least) + 1; i++) sfx.afterTick([player, bot], PLAYER);
    const birds = ctx.sources.filter((s) => plays(s, 'ambience.bird'));
    expect(birds.length).toBeGreaterThanOrEqual(1);
    const panner = destinationOf(birds[0]!) as FakePanner;
    expect(panner.panningModel).toBe('equalpower');
    const d = Math.hypot(panner.positionX.value, panner.positionZ.value);
    expect(d).toBeGreaterThanOrEqual(AUDIO.ambience.birdDistance[0] - 1e-9);
    expect(d).toBeLessThanOrEqual(AUDIO.ambience.birdDistance[1] + 1e-9);
  });

  it('does no channel work for a still, far-off or out character, and places it again for its next sound (CORE-35)', () => {
    let casts = 0;
    const counting: OcclusionQuery = { raycastStatic: () => (casts++, -1) };
    const { sfx, ctx, player, bot, characterOf } = setup(counting);
    const all = [player, bot];
    sfx.placeSources(all, PLAYER);
    const panner = ctx.panners.find((p) => p.panningModel === 'HRTF')!;
    const writes = (): number => panner.positionX.writes + panner.positionY.writes + panner.positionZ.writes;
    const made = writes();
    expect(made).toBe(3);
    // Standing still (or shuffling under 5 cm): no writes.
    sfx.placeSources(all, PLAYER);
    bot.position.x += AUDIO.spatial.moveEpsilon / 2;
    sfx.placeSources(all, PLAYER);
    expect(writes()).toBe(made);
    bot.position.x += AUDIO.spatial.moveEpsilon;
    sfx.placeSources(all, PLAYER);
    expect(writes()).toBe(made + 3);
    // Beyond earshot: the channel isn't moved, no ray is cast and, far enough out, it counts as muffled (M53: AUD-03)...
    const far = AUDIO.spatial.maxDistance + AUDIO.occlusion.farRamp;
    bot.position.x = far;
    sfx.placeSources(all, PLAYER);
    sfx.afterTick(all, PLAYER);
    expect(writes()).toBe(made + 3);
    expect(casts).toBe(0);
    expect(channelFilter(ctx)!.frequency.value).toBeCloseTo(AUDIO.occlusion.muffledHz);
    // ...until it has a sound to play: then it's put where its character is.
    sfx.onEvent(shot(bot.id), PLAYER, characterOf);
    expect(panner.positionX.value).toBe(bot.position.x);
    // Out in the dead zone, near or far: no rays and no moves.
    bot.status = 'out';
    bot.position.x = 5;
    sfx.placeSources(all, PLAYER);
    sfx.afterTick(all, PLAYER);
    expect(casts).toBe(0);
    expect(panner.positionX.value).toBe(far);
    bot.status = 'alive';
    sfx.afterTick(all, PLAYER);
    expect(casts).toBe(AUDIO.occlusion.rayHeights.length);
  });

  it('renders several cues in a long spare moment and stops once the moment runs short (CORE-31)', () => {
    let steps = 0;
    const library = new SoundLibrary(function* (rate) {
      const job = renderSoundsGradually(rate, 1);
      for (;;) {
        const r = job.next();
        if (r.done) return r.value;
        steps++;
        yield;
      }
    });
    // Each cue "takes" 4 ms of a 50 ms moment.
    let jobs: ((timeLeft: () => number) => void)[] = [];
    const engine = new AudioEngine({ ...VOLUMES }, library, (work) => void jobs.push(work));
    engine.warmUp();
    const [first] = jobs;
    jobs = [];
    let left = 50;
    first!(() => (left -= 4));
    // Rendering stopped once no more than warmUpSliceMs were left: (50 - 5) / 4 cues, give or take the first.
    expect(steps).toBeGreaterThanOrEqual(5);
    expect(steps).toBe(Math.ceil((50 - AUDIO.warmUpSliceMs) / 4));
    expect(left).toBeLessThanOrEqual(AUDIO.warmUpSliceMs);
    expect(jobs).toHaveLength(1); // the rest waits for the next moment
  });

  it("shapes each whistle blast: a fade in, a hold, a fade out, then stops just after (CORE-31)", () => {
    const { sfx, ctx, characterOf } = setup();
    ctx.currentTime = 10;
    sfx.onEvent({ type: 'roundOver', winner: 0, reason: 'time' }, PLAYER, characterOf);
    const [tone] = ctx.oscillators;
    const level = [...tone!.outputs][0] as FakeGain;
    const d = AUDIO.roundOverWhistle;
    expect(level.gain.events).toEqual([
      { kind: 'set', value: 0, at: 10 },
      { kind: 'ramp', value: AUDIO.whistleVolume, at: 10 + AUDIO.whistleAttack },
      { kind: 'set', value: AUDIO.whistleVolume, at: 10 + d - AUDIO.whistleRelease },
      { kind: 'ramp', value: 0, at: 10 + d },
    ]);
    const times = level.gain.events.map((e) => e.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(tone!.stopAt).toBeCloseTo(10 + d + AUDIO.stopPadding);
  });
});

describe('a silenced shot sounds muffled (M29b)', () => {
  beforeEach(() => {
    FakeContext.made = 0;
    FakeContext.rate = 48000;
    vi.stubGlobal('AudioContext', FakeContext);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const bufferOf = (src: FakeSource): Float32Array => (src.buffer as FakeBuffer).data[0]!;
  const same = (a: Float32Array, b: Float32Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

  it("plays the shooter's own muffled copies when its silencer is fitted, and the usual shot when it is not", () => {
    const { sfx, ctx, bot, characterOf } = setup();
    sfx.onEvent(shot(bot.id), PLAYER, characterOf);
    const usual = bufferOf(ctx.sources[0]!);
    // The usual variants of the cue that shot used, and their muffled copies.
    const cue = [...LIBRARY.get(48000).keys()].find((c) => LIBRARY.get(48000).get(c)!.some((v) => same(v, usual)))!;
    const muffled = suppressedCopies(LIBRARY.get(48000).get(cue)!, 48000);
    expect(muffled.some((v) => same(v, usual))).toBe(false);
    fitParts(bot.armament, [{ grip: 'none', magazine: 'standard', muzzle: 'silencer' }]);
    sfx.onEvent(shot(bot.id), PLAYER, characterOf);
    const heard = bufferOf(ctx.sources[ctx.sources.length - 1]!);
    expect(muffled.some((v) => same(v, heard)), 'muffled copy').toBe(true);
    expect(same(heard, usual)).toBe(false);
    // A shooter without one is not muffled by another's silencer, and your own silenced shot is muffled too.
    const { sfx: sfx2, ctx: ctx2, player, characterOf: of2 } = setup();
    fitParts(player.armament, [{ grip: 'none', magazine: 'standard', muzzle: 'silencer' }]);
    sfx2.onEvent(shot(PLAYER), PLAYER, of2);
    expect(muffled.some((v) => same(v, bufferOf(ctx2.sources[0]!)))).toBe(true);
  });

  it('has its muffled copies ready before the match: the first silenced shot makes no buffer', () => {
    const { sfx, ctx, bot, characterOf } = setup();
    fitParts(bot.armament, [{ grip: 'none', magazine: 'standard', muzzle: 'silencer' }]);
    const made = ctx.buffersMade;
    sfx.onEvent(shot(bot.id), PLAYER, characterOf);
    expect(ctx.sources.length).toBeGreaterThan(0);
    expect(ctx.buffersMade).toBe(made);
  });
});

describe('M32 acceptance 7: the Cyber Pistol sounds its own in a match', () => {
  beforeEach(() => {
    FakeContext.made = 0;
    FakeContext.rate = 48000;
    vi.stubGlobal('AudioContext', FakeContext);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** A match whose sounds cover `heard`, with the player carrying LOADOUT and a bot carrying `bot`. */
  function match(heard: typeof LOADOUT, botLoadout: typeof LOADOUT) {
    const player = createCharacter(PLAYER, vec3(0, 0, 0), 0, LOADOUT, 0);
    const bot = createCharacter(1, vec3(6, 0, 0), 0, botLoadout, 1);
    const sfx = new Sfx(heard, FLOOR, OPEN, engineFor());
    sfx.unlock();
    sfx.setListener(vec3(0, 1.6, 0), 0, 0, -1);
    const all = [player, bot];
    return { sfx, ctx: FakeContext.last, player, bot, characterOf: (id: number) => all.find((c) => c.id === id) };
  }
  const cyberShot = (id: number): GameEvent => ({ type: 'shot', characterId: id, replicaId: 'cyber', position: vec3(0, 1.6, 0) });

  it("plays the Cyber Pistol's own shot, with no AEG motor winding up around it", () => {
    const { sfx, ctx, player, bot, characterOf } = match([...LOADOUT, CYBER_PISTOL], [CYBER_PISTOL, ...LOADOUT.slice(1)]);
    sfx.afterTick([player, bot], PLAYER);
    sfx.onEvent(cyberShot(bot.id), PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(1); // the shot only: an AEG would add its motor's spin-up
    expect(plays(ctx.sources[0]!, 'shot.cyber')).toBe(true);
    expect(plays(ctx.sources[0]!, 'shot.electric')).toBe(false);
    for (let i = 0; i < 5; i++) {
      for (let t = 0; t < 4; t++) sfx.afterTick([player, bot], PLAYER);
      sfx.onEvent(cyberShot(bot.id), PLAYER, characterOf);
    }
    for (let t = 0; t < 120; t++) sfx.afterTick([player, bot], PLAYER);
    expect(ctx.sources).toHaveLength(6); // never a spin-up or a wind-down
  });

  it('plays its own dry fire and magazine sounds', () => {
    const { sfx, ctx, bot, characterOf } = match([...LOADOUT, CYBER_PISTOL], [CYBER_PISTOL]);
    sfx.onEvent({ type: 'dryFire', characterId: bot.id, replicaId: 'cyber' }, PLAYER, characterOf);
    sfx.onEvent({ type: 'reloadStart', characterId: bot.id, replicaId: 'cyber' }, PLAYER, characterOf);
    sfx.onEvent({ type: 'reloadEnd', characterId: bot.id, replicaId: 'cyber' }, PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(3);
    expect(plays(ctx.sources[0]!, 'dryFire.cyber')).toBe(true);
    expect(plays(ctx.sources[1]!, 'magOut.cyber')).toBe(true);
    expect(plays(ctx.sources[2]!, 'magIn.cyber')).toBe(true);
  });

  it("still gives an AEG its motor, and the Gas Pistol its pop, beside it", () => {
    const { sfx, ctx, bot, characterOf } = match([...LOADOUT, CYBER_PISTOL], LOADOUT);
    sfx.onEvent(shot(bot.id), PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(2);
    expect(plays(ctx.sources[1]!, 'motor.spinUp')).toBe(true);
  });
});

// ---- M33j: the woodland sounds ---------------------------------------------------------------------

/** FNV-1a over a string or a buffer's sample bits: a short, exact fingerprint. */
function fingerprint(data: string | Float32Array): string {
  let h = 0x811c9dc5;
  if (typeof data === 'string') {
    for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data.charCodeAt(i), 0x01000193) >>> 0;
  } else {
    const bits = new Uint32Array(data.buffer, data.byteOffset, data.length);
    for (let i = 0; i < bits.length; i++) h = Math.imul(h ^ bits[i]!, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Everything a match built on `ctx`, in order: each node's kind, settings, buffer (by its samples' fingerprint), start
 * and stop, and where it is connected (by label). Two matches that build the same graph give the same text.
 */
function graphOf(ctx: FakeContext): string {
  const labels = new Map<unknown, string>([[ctx.destination, 'out']]);
  const lists: [string, FakeNode[]][] = [
    ['gain', ctx.gains],
    ['filter', ctx.filters],
    ['panner', ctx.panners],
    ['source', ctx.sources],
    ['osc', ctx.oscillators],
    ['comp', ctx.compressors],
    ['stereo', ctx.stereoPanners],
    ['conv', ctx.convolvers],
  ];
  for (const [kind, nodes] of lists) nodes.forEach((n, i) => labels.set(n, `${kind}${i}`));
  const lines: string[] = [];
  const buffer = (b: unknown): string => (b instanceof FakeBuffer ? `${b.length}@${b.sampleRate}:${b.data.map((d) => fingerprint(d)).join('/')}` : 'none');
  for (const [, nodes] of lists) {
    for (const n of nodes) {
      const parts = [labels.get(n)!];
      if (n instanceof FakeGain) parts.push(`g=${n.gain.value}`, `t=${JSON.stringify(n.gain.targets)}`);
      if (n instanceof FakeFilter) parts.push(n.type, `f=${n.frequency.value}`, `t=${JSON.stringify(n.frequency.targets)}`);
      if (n instanceof FakePanner) parts.push(n.panningModel, n.distanceModel, `${n.refDistance}/${n.rolloffFactor}/${n.maxDistance}`, `@${n.positionX.value},${n.positionY.value},${n.positionZ.value}`);
      if (n instanceof FakeSource) parts.push(buffer(n.buffer), `loop=${n.loop}`, `rate=${n.playbackRate.value}`, `start=${n.startAt}+${n.offset}`, `stop=${n.stopAt}`);
      if (n instanceof FakeStereoPanner) parts.push(`pan=${n.pan.value}`);
      if (n instanceof FakeConvolver) parts.push(buffer(n.buffer));
      parts.push(`-> ${[...n.outputs].map((o) => labels.get(o) ?? '?').join(',')}`);
      lines.push(parts.join(' '));
    }
  }
  return lines.join('\n');
}

describe('M33j: Depot sounds exactly as before (its Sfx node graph pinned)', () => {
  beforeEach(() => {
    FakeContext.made = 0;
    FakeContext.rate = 48000;
    vi.stubGlobal('AudioContext', FakeContext);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds the same nodes, buffers and connections for a Depot match: bed, birds, steps, an impact', () => {
    const player = createCharacter(PLAYER, vec3(0, 0, 0), 0, LOADOUT, 0);
    const bot = createCharacter(1, vec3(6, 0, 0), 0, LOADOUT, 1);
    const all = [player, bot];
    const characterOf = (id: number): Character | undefined => all.find((c) => c.id === id);
    const engine = engineFor();
    const sfx = new Sfx(LOADOUT, DEPOT.blocks, OPEN, engine);
    // As a Depot match sets it (CombatPresentation.setLighting): the yard by day, and nothing to render for it.
    sfx.setScene(soundscapeOf(DEPOT, false));
    sfx.unlock();
    sfx.setListener(vec3(0, 1.6, 0), 0, 0, -1);
    sfx.setPaused(false);
    for (let t = 0; t < Math.round(40 / SIM_DT); t++) sfx.afterTick(all, PLAYER);
    sfx.onEvent(step(bot.id), PLAYER, characterOf);
    sfx.onEvent(step(PLAYER), PLAYER, characterOf);
    sfx.impact(vec3(3, 0.5, 0), 'concrete');
    const ctx = FakeContext.last;
    expect(ctx.sources.filter((s) => s.loop)).toHaveLength(2);
    expect(fingerprint(graphOf(ctx))).toBe('a6925abd');
    expect([...engine.cueBuffers().keys()].some((c) => c.startsWith('step.grass') || c === 'ambience.owl')).toBe(false);
  });
});

describe('M33j: the woods at night in a match', () => {
  beforeEach(() => {
    FakeContext.made = 0;
    FakeContext.rate = 48000;
    vi.stubGlobal('AudioContext', FakeContext);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const onGround = (x: number, z: number) => vec3(x, terrainHeightAt(WOODLAND.terrain!, x, z)!, z);

  /** A match on `map` by day or night, as CombatPresentation sets it up, playing from the first spawn. */
  function match(map: typeof WOODLAND, night: boolean, engine = engineFor()) {
    const spawn = map.spawns[0][0]!.position;
    const player = createCharacter(PLAYER, vec3(spawn.x, spawn.y, spawn.z), 0, LOADOUT, 0);
    const bot = createCharacter(1, vec3(spawn.x + 3, spawn.y, spawn.z), 0, LOADOUT, 1);
    const all = [player, bot];
    const sfx = new Sfx(LOADOUT, map.blocks, OPEN, engine);
    sfx.setScene(soundscapeOf(map, night));
    sfx.unlock();
    sfx.setListener(vec3(spawn.x, spawn.y + 1.6, spawn.z), 0, 0, -1);
    sfx.setPaused(false);
    return { sfx, ctx: FakeContext.last, engine, player, bot, all, characterOf: (id: number) => all.find((c) => c.id === id) };
  }

  it('plays the wind and the insects as beds, and a crackle at each camp fire with none at a lantern', () => {
    const { ctx, engine } = match(WOODLAND, true);
    const fires = WOODLAND.lights!.filter((l) => l.kind === 'fire');
    const loops = ctx.sources.filter((s) => s.loop);
    expect(loops).toHaveLength(4 + fires.length);
    expect(loops.slice(0, 2).every((s) => s.buffer === engine.loop('pines'))).toBe(true);
    expect(loops.slice(2, 4).every((s) => s.buffer === engine.loop('insects'))).toBe(true);
    const crackle = loops.slice(4);
    expect(crackle.every((s) => s.buffer === engine.loop('crackle'))).toBe(true);
    // Each fire where its light is, fading out by 12 m; no two crackling in step.
    const panners = ctx.panners.filter((p) => p.distanceModel === 'linear');
    expect(panners).toHaveLength(fires.length);
    panners.forEach((p, i) => {
      expect(p.panningModel).toBe('equalpower');
      expect(p.maxDistance).toBe(FIRE_SOUND.maxDistance);
      expect([p.positionX.value, p.positionY.value, p.positionZ.value]).toEqual([fires[i]!.position.x, fires[i]!.position.y, fires[i]!.position.z]);
    });
    expect(new Set(crackle.map((s) => s.offset)).size).toBe(fires.length);
    // Everything stops with the match.
    const { sfx } = match(WOODLAND, true);
    sfx.dispose();
    expect(FakeContext.last.sources.filter((s) => s.loop).every((s) => s.stopAt === 0)).toBe(true);
  });

  it('lets an owl hoot now and then, and never a bird, the whole night through', () => {
    const { sfx, ctx, engine, all } = match(WOODLAND, true);
    for (let t = 0; t < Math.round(130 / SIM_DT); t++) sfx.afterTick(all, PLAYER);
    const calls = ctx.sources.filter((s) => !s.loop);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const s of calls) expect(playsOf(engine, s, 'ambience.owl')).toBe(true);
    expect(calls.some((s) => plays(s, 'ambience.bird'))).toBe(false);
  });

  it('plays the city on Neon Heights (M34g): a shop door chiming by Day, arcade bleeps by Night, never a bird', () => {
    for (const night of [true, false]) {
      const { sfx, ctx, engine, all } = match(NEON_HEIGHTS, night);
      for (let t = 0; t < Math.round(60 / SIM_DT); t++) sfx.afterTick(all, PLAYER);
      const calls = ctx.sources.filter((s) => !s.loop);
      expect(calls.length, `night ${night}`).toBeGreaterThanOrEqual(2);
      for (const s of calls) expect(playsOf(engine, s, night ? 'ambience.arcade' : 'ambience.chime')).toBe(true);
      expect(calls.some((s) => plays(s, 'ambience.bird'))).toBe(false);
    }
  });

  it("plays a bot's step on the creek's gravel as gravel, and yours on the spawn's grass as grass", () => {
    const { sfx, ctx, engine, bot, characterOf } = match(WOODLAND, true);
    const creek = WOODLAND.ground!.patches.find((p) => p.surface === 'gravel')!.path!;
    const mid = creek[Math.floor(creek.length / 2)]!;
    bot.position = onGround(mid.x, mid.z);
    sfx.setListener(vec3(mid.x + 4, bot.position.y + 1.6, mid.z), 0, 0, -1);
    const before = ctx.sources.length;
    sfx.onEvent(step(bot.id), PLAYER, characterOf);
    sfx.onEvent(step(PLAYER), PLAYER, characterOf);
    const [theirs, yours] = ctx.sources.slice(before);
    expect(playsOf(engine, theirs!, 'step.gravel.run')).toBe(true);
    expect(playsOf(engine, yours!, 'step.grass.run')).toBe(true);
  });

  it("renders Woodland's own sounds once, as the first match on it loads, and reuses them after", () => {
    const engine = engineFor();
    match(WOODLAND, true, engine);
    const made = FakeContext.last.buffersMade;
    expect(made).toBeGreaterThan(0);
    for (const cue of ['step.leaves.sprint', 'step.wood.land', 'ambience.owl'] as const) expect(engine.cueBuffers().get(cue)?.length).toBe(AUDIO.variants);
    match(WOODLAND, true, engine);
    expect(FakeContext.last.buffersMade).toBe(made);
  });
});

// ---- M33j QA: lazy rendering, a match ending and switching fields -----------------------------------

describe('M33j QA: the map sounds render only for the fields that play them, and stop with the match', () => {
  beforeEach(() => {
    FakeContext.made = 0;
    FakeContext.rate = 48000;
    vi.stubGlobal('AudioContext', FakeContext);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** A match on `map` as CombatPresentation and the session set it up: scene, unlock, listener at the first spawn, play. */
  function matchOn(map: typeof DEPOT, night: boolean, engine: AudioEngine) {
    const spawn = map.spawns[0][0]!.position;
    const player = createCharacter(PLAYER, vec3(spawn.x, spawn.y, spawn.z), 0, LOADOUT, 0);
    const bot = createCharacter(1, vec3(spawn.x + 3, spawn.y, spawn.z), 0, LOADOUT, 1);
    const all = [player, bot];
    const sfx = new Sfx(LOADOUT, map.blocks, OPEN, engine);
    sfx.setScene(soundscapeOf(map, night));
    sfx.unlock();
    sfx.setListener(vec3(spawn.x, spawn.y + 1.6, spawn.z), 0, 0, -1);
    sfx.setPaused(false);
    return { sfx, ctx: FakeContext.last, player, bot, all, characterOf: (id: number) => all.find((c) => c.id === id) };
  }
  const isMapCueName = (c: string): boolean => /^step\.(grass|leaves|earth|gravel|wood)\./.test(c) || /^ambience\.(owl|chime|arcade)$/.test(c);

  it('renders nothing beyond the title screen for Depot: not a buffer more', () => {
    const engine = engineFor();
    // The title screen: every title cue, the yard's bed and the echo.
    engine.cueBuffers();
    engine.ambienceBed();
    engine.reverbImpulse();
    const ctx = FakeContext.last;
    expect([...engine.cueBuffers().keys()].some(isMapCueName)).toBe(false);
    const titleBuffers = ctx.buffersMade;
    const m = matchOn(DEPOT, false, engine);
    for (let t = 0; t < Math.round(10 / SIM_DT); t++) m.sfx.afterTick(m.all, PLAYER);
    m.sfx.onEvent(step(m.bot.id), PLAYER, m.characterOf);
    m.sfx.dispose();
    expect(ctx.buffersMade).toBe(titleBuffers);
    expect([...engine.cueBuffers().keys()].some(isMapCueName)).toBe(false);
  });

  it("renders Neon Heights' own sounds (M34g) as a match on it loads, only its own, once each", () => {
    const engine = engineFor();
    engine.cueBuffers();
    const ctx = FakeContext.last;
    const title = ctx.buffersMade;
    const day = matchOn(NEON_HEIGHTS, false, engine);
    day.sfx.dispose();
    const afterDay = ctx.buffersMade;
    expect(afterDay).toBeGreaterThan(title);
    expect(engine.cueBuffers().get('ambience.chime')?.length).toBe(AUDIO.variants);
    expect(engine.cueBuffers().has('ambience.arcade')).toBe(false);
    expect([...engine.cueBuffers().keys()].some((c) => c.startsWith('step.') && isMapCueName(c))).toBe(false);
    matchOn(NEON_HEIGHTS, false, engine).sfx.dispose();
    expect(ctx.buffersMade).toBe(afterDay);
    matchOn(NEON_HEIGHTS, true, engine).sfx.dispose();
    expect(engine.cueBuffers().get('ambience.arcade')?.length).toBe(AUDIO.variants);
  });

  it("stops every Woodland loop when its match ends, and the next match on Depot plays only the yard's bed, its birds and concrete", () => {
    const engine = engineFor();
    const woods = matchOn(WOODLAND, true, engine);
    const woodsLoops = woods.ctx.sources.filter((s) => s.loop);
    expect(woodsLoops.length).toBeGreaterThan(4);
    woods.sfx.dispose();
    expect(woodsLoops.every((s) => s.stopAt === 0)).toBe(true);
    expect(woodsLoops.every((s) => s.disconnected)).toBe(true);
    expect(woods.ctx.panners.filter((p) => p.distanceModel === 'linear').every((p) => p.disconnected)).toBe(true);

    // Switching field on the same engine (Play again on another map): nothing of the woods carries over.
    const sourcesBefore = woods.ctx.sources.length;
    const pannersBefore = woods.ctx.panners.length;
    const depot = matchOn(DEPOT, false, engine);
    expect(depot.ctx).toBe(woods.ctx);
    const depotLoops = depot.ctx.sources.slice(sourcesBefore).filter((s) => s.loop);
    expect(depotLoops).toHaveLength(2);
    expect(depotLoops.every((s) => s.buffer === engine.ambienceBed())).toBe(true);
    expect(depot.ctx.panners.slice(pannersBefore).some((p) => p.distanceModel === 'linear')).toBe(false);
    for (let t = 0; t < Math.round(60 / SIM_DT); t++) depot.sfx.afterTick(depot.all, PLAYER);
    const calls = depot.ctx.sources.slice(sourcesBefore).filter((s) => !s.loop);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((s) => plays(s, 'ambience.bird'))).toBe(true);
    // A bot's step on Depot's yard floor is concrete again (no ground grid left behind), at a step's level.
    const before = depot.ctx.sources.length;
    depot.sfx.onEvent(step(depot.bot.id), PLAYER, depot.characterOf);
    const [theirs] = depot.ctx.sources.slice(before);
    expect(plays(theirs!, 'step.concrete.run')).toBe(true);
    expect(([...theirs!.outputs][0] as FakeGain).gain.value).toBe(AUDIO.levels.step.gain);
    depot.sfx.dispose();
    expect(depotLoops.every((s) => s.stopAt === 0)).toBe(true);
  });

  it("switches Day | Night on Neon Heights between the city's two soundscapes, two beds each, never a bird", () => {
    const engine = engineFor();
    for (const night of [true, false, true]) {
      const from = FakeContext.made > 0 ? FakeContext.last.sources.length : 0;
      const m = matchOn(NEON_HEIGHTS, night, engine);
      for (let t = 0; t < Math.round(60 / SIM_DT); t++) m.sfx.afterTick(m.all, PLAYER);
      const mine = m.ctx.sources.slice(from);
      expect(mine.filter((s) => s.loop && s.stopAt === null), `night ${night}`).toHaveLength(4);
      const calls = mine.filter((s) => !s.loop);
      expect(calls.length, `night ${night}`).toBeGreaterThan(0);
      expect(calls.every((s) => playsOf(engine, s, night ? 'ambience.arcade' : 'ambience.chime'))).toBe(true);
      m.sfx.dispose();
      expect(m.ctx.sources.filter((s) => s.loop && s.stopAt === null)).toHaveLength(0);
    }
  });

  it("plays a step on Woodland's ground at the same level as a step on Depot's concrete", () => {
    const engine = engineFor();
    const woods = matchOn(WOODLAND, true, engine);
    const before = woods.ctx.sources.length;
    woods.sfx.onEvent(step(woods.bot.id), PLAYER, woods.characterOf);
    woods.sfx.onEvent(step(PLAYER), PLAYER, woods.characterOf);
    const [theirs, yours] = woods.ctx.sources.slice(before);
    expect(theirs!.buffer).not.toBeNull();
    expect(engine.samples('step.grass.run').some((v) => v === (theirs!.buffer as FakeBuffer).data[0])).toBe(true);
    expect(([...theirs!.outputs][0] as FakeGain).gain.value).toBe(AUDIO.levels.step.gain);
    expect(([...yours!.outputs][0] as FakeGain).gain.value).toBe(AUDIO.levels.ownStep.gain);
    woods.sfx.dispose();
  });
});

describe('M53: mix and placement (audit AUD-02, AUD-03, AUD-05, AUD-07, AUD-12)', () => {
  beforeEach(() => {
    FakeContext.made = 0;
    FakeContext.rate = 48000;
    vi.stubGlobal('AudioContext', FakeContext);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Where a filter is headed: its last target, or its value if it was never eased. */
  const aimedHz = (f: FakeFilter): number => f.frequency.targets.at(-1)?.value ?? f.frequency.value;
  const octaves = (a: number, b: number): number => Math.abs(Math.log2(a / b));

  it('lets a bot crossing the 60 m line keep its muffling, and closes it to fully muffled further out, without a ray (AUD-03)', () => {
    for (const [query, label] of [[OPEN, 'in the open'], [WALLED, 'behind a wall']] as const) {
      let casts = 0;
      const counting: OcclusionQuery = { raycastStatic: (...a) => (casts++, query.raycastStatic(...a)) };
      const { sfx, ctx, player, bot } = setup(counting);
      const all = [player, bot];
      const max = AUDIO.spatial.maxDistance;
      bot.position.x = max - 1;
      sfx.afterTick(all, PLAYER);
      const inside = aimedHz(channelFilter(ctx)!);
      const rays = casts;
      bot.position.x = max + 1;
      sfx.afterTick(all, PLAYER);
      expect(octaves(aimedHz(channelFilter(ctx)!), inside), label).toBeLessThan(1);
      expect(casts, `${label}: no ray beyond the line`).toBe(rays);
      // Further out it closes a step at a time, a fifth of an octave or less each, to fully muffled at the ramp's end.
      let last = aimedHz(channelFilter(ctx)!);
      for (let d = max + 1; d <= max + AUDIO.occlusion.farRamp; d += 1) {
        bot.position.x = d;
        sfx.afterTick(all, PLAYER);
        const now = aimedHz(channelFilter(ctx)!);
        expect(octaves(now, last), `${label} at ${d} m`).toBeLessThanOrEqual(Math.log2(AUDIO.occlusion.openHz / AUDIO.occlusion.muffledHz) * (AUDIO.occlusion.farStep / AUDIO.occlusion.farRamp) + 1e-9);
        last = now;
      }
      expect(last, label).toBeCloseTo(AUDIO.occlusion.muffledHz);
      expect(casts, label).toBe(rays);
    }
  });

  it("writes the listener's own up, the world's when none is given (AUD-05)", () => {
    const { sfx, ctx } = setup();
    const l = ctx.listener;
    expect([l.upX!.value, l.upY!.value, l.upZ!.value]).toEqual([0, 1, 0]);
    // Looking down at your feet: forward nearly straight down, up nearly level and at right angles to it.
    const pitch = -1.55;
    sfx.setListener(vec3(0, 1.6, 0), 0, Math.sin(pitch), -Math.cos(pitch), 0, Math.cos(pitch), Math.sin(pitch));
    expect([l.upX!.value, l.upY!.value, l.upZ!.value]).toEqual([0, Math.cos(pitch), Math.sin(pitch)]);
    expect(l.forwardY!.value * l.upY!.value + l.forwardZ!.value * l.upZ!.value).toBeCloseTo(0, 12);
  });

  it("times the ambience's calls from the match's seed: another seed, another first bird; seed 0 as before (AUD-07)", () => {
    const firstBird = (seed: number): { tick: number; x: number; z: number } => {
      const player = createCharacter(PLAYER, vec3(0, 0, 0), 0, LOADOUT, 0);
      const sfx = new Sfx(LOADOUT, FLOOR, OPEN, engineFor(), seed);
      sfx.unlock();
      sfx.setListener(vec3(0, 1.6, 0), 0, 0, -1);
      const ctx = FakeContext.last;
      for (let tick = 0; tick < Math.round(AUDIO.ambience.birdEvery[1] / SIM_DT) + 1; tick++) {
        sfx.afterTick([player], PLAYER);
        const bird = ctx.sources.find((s) => plays(s, 'ambience.bird'));
        if (bird) {
          const p = destinationOf(bird) as FakePanner;
          return { tick, x: p.positionX.value, z: p.positionZ.value };
        }
      }
      throw new Error('no bird');
    };
    // Seed 0 sings as the call's own seed always did (woodlandSoundQA.test.ts pins those times).
    const before = new AmbientCalls(AMBIENCES.yard.day.call!);
    const at = vec3();
    let tick = 0;
    while (!before.due((tick + 1) * SIM_DT, vec3(0, 1.6, 0), at)) tick++;
    expect(firstBird(0)).toMatchObject({ tick, x: at.x, z: at.z });
    const a = firstBird(12345);
    const b = firstBird(987654321);
    expect(a).not.toEqual(firstBird(0));
    expect(b).not.toEqual(a);
    expect(firstBird(12345)).toEqual(a);
  });

  it('beeps twice, quickly and dry, when a late exit opens, once however many open in the tick, with no dip (AUD-12)', () => {
    const { sfx, ctx, engine, player, characterOf } = setup();
    const duck = vi.spyOn(engine, 'duck');
    ctx.currentTime = 2;
    sfx.onEvent({ type: 'exitOpened', exit: 1 }, PLAYER, characterOf);
    sfx.onEvent({ type: 'exitOpened', exit: 3 }, PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(AUDIO.exitOpened.beeps);
    expect(ctx.sources.every((s) => plays(s, 'count.beep') && playsDry(s, ctx))).toBe(true);
    expect(ctx.sources.map((s) => s.startAt)).toEqual([2, 2 + AUDIO.exitOpened.gap]);
    expect(duck).not.toHaveBeenCalled();
    // The next tick's opening beeps again.
    sfx.afterTick([player], PLAYER);
    sfx.onEvent({ type: 'exitOpened', exit: 2 }, PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(2 * AUDIO.exitOpened.beeps);
  });

  it("starts the neon bed's second copy a fifth of a hum cycle past half a loop; the other beds half a loop on (AUD-02)", () => {
    const engine = engineFor();
    const sfx = new Sfx(LOADOUT, NEON_HEIGHTS.blocks, OPEN, engine);
    sfx.setScene(soundscapeOf(NEON_HEIGHTS, true));
    sfx.unlock();
    sfx.setPaused(false);
    const beds = AMBIENCES.city.night.beds;
    const loops = FakeContext.last.sources.filter((s) => s.loop);
    expect(loops).toHaveLength(2 * beds.length);
    beds.forEach((bed, i) => {
      const half = (engine.loop(bed.loop) as unknown as FakeBuffer).duration / 2;
      expect(loops.slice(2 * i, 2 * i + 2).map((s) => s.offset), bed.loop).toEqual([0, half + (bed.copyOffset ?? 0)]);
    });
    expect(beds.find((b) => b.loop === 'neon')!.copyOffset).toBeCloseTo(0.002, 9);
    expect(beds.find((b) => b.loop === 'traffic')!.copyOffset).toBeUndefined();
  });
});
