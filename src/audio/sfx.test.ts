import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO, matchOverBlastStart } from '../config/audio';
import { LOADOUT } from '../config/replicas';
import type { SoundCue } from '../config/sounds';
import type { MapBlock } from '../map/mapTypes';
import { type Character, createCharacter } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { vec3 } from '../sim/vec';
import { AudioEngine, type IdleScheduler } from './audioEngine';
import { volumeGain } from './audioMix';
import type { OcclusionQuery } from './occlusion';
import { Sfx } from './sfx';
import { renderSoundsGradually, SoundLibrary } from './soundBank';

// ---- A minimal stand-in for the Web Audio API (records what Sfx builds and connects) --------------

class FakeParam {
  value = 0;
  targets: { value: number; at: number }[] = [];
  setTargetAtTime(value: number, at: number): void {
    this.targets.push({ value, at });
  }
  setValueAtTime(): void {}
  linearRampToValueAtTime(): void {}
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
  playbackRate = new FakeParam();
  frequency = new FakeParam();
  type = '';
  onended: (() => void) | null = null;
  private readonly endedListeners: (() => void)[] = [];
  startAt = Number.NaN;
  stopAt: number | null = null;
  start(at = 0): void {
    this.startAt = at;
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
  sampleRate = 48000;
  readonly destination = new FakeNode();
  readonly listener = Object.fromEntries(['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'].map((k) => [k, new FakeParam()]));
  readonly gains: FakeGain[] = [];
  readonly panners: FakePanner[] = [];
  readonly filters: FakeFilter[] = [];
  readonly sources: FakeSource[] = [];
  readonly oscillators: FakeSource[] = [];
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
    return Object.assign(new FakeNode(), { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam() });
  }
  createConvolver(): FakeConvolver {
    return new FakeConvolver();
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

const shot = (characterId: number): GameEvent => ({ type: 'shot', characterId, replicaId: 'aeg', position: vec3(0, 1.6, 0) });
const step = (characterId: number): GameEvent => ({ type: 'footstep', characterId, kind: 'run' });

describe('the sound engine (M13)', () => {
  beforeEach(() => {
    FakeContext.made = 0;
    vi.stubGlobal('AudioContext', FakeContext);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
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

  it("doesn't play other players' steps beyond earshot", () => {
    const { sfx, ctx, bot, characterOf } = setup();
    bot.position.x = AUDIO.footsteps.maxDistance + 1;
    sfx.onEvent(step(bot.id), PLAYER, characterOf);
    expect(ctx.sources).toHaveLength(0);
  });

  it('gives a BB impact its own equal-power panner and disconnects the whole chain when it ends', () => {
    const { sfx, ctx, characterOf } = setup();
    sfx.onEvent({ type: 'bbImpact', position: vec3(3, 0, 0), ownerId: 1 }, PLAYER, characterOf);
    const [panner] = ctx.panners;
    expect(panner!.panningModel).toBe('equalpower');
    const src = ctx.sources[0]!;
    const levelGain = [...src.outputs][0] as FakeGain;
    const filter = [...panner!.outputs][0] as FakeFilter;
    const muffleGain = [...filter.outputs][0] as FakeGain;
    src.end();
    for (const node of [src, levelGain, panner!, filter, muffleGain]) expect(node.disconnected).toBe(true);
  });

  it('winds an AEG up on a fresh trigger pull and reschedules the wind-down on every shot', () => {
    const { sfx, ctx, bot, characterOf } = setup();
    const rate = LOADOUT[0]!.fireRate;
    sfx.onEvent(shot(bot.id), PLAYER, characterOf);
    // Shot, spin-up, and the wind-down scheduled after the last shot.
    expect(ctx.sources).toHaveLength(3);
    const firstDown = ctx.sources[2]!;
    expect(firstDown.startAt).toBeCloseTo(AUDIO.motor.spinDownAfterCycles / rate);
    ctx.currentTime = 1 / rate;
    sfx.onEvent(shot(bot.id), PLAYER, characterOf);
    // Mid-burst: no spin-up, the pending wind-down is cancelled before it starts and a new one scheduled.
    expect(ctx.sources).toHaveLength(5);
    expect(firstDown.stopAt).toBe(0);
    expect(ctx.sources[4]!.startAt).toBeCloseTo((1 + AUDIO.motor.spinDownAfterCycles) / rate);
  });

  it('fades a wind-down already playing instead of cutting it with a click', () => {
    const { sfx, ctx, bot, characterOf } = setup();
    const rate = LOADOUT[0]!.fireRate;
    sfx.onEvent(shot(bot.id), PLAYER, characterOf);
    const down = ctx.sources[2]!;
    const downGain = [...down.outputs][0] as FakeGain;
    ctx.currentTime = 1.4 / rate; // the wind-down has started, the motor hasn't rested long enough for a spin-up
    sfx.onEvent(shot(bot.id), PLAYER, characterOf);
    expect(downGain.gain.targets.at(-1)).toEqual({ value: 0, at: ctx.currentTime });
    expect(down.stopAt).toBeCloseTo(ctx.currentTime + AUDIO.cutFade);
  });

  it('muffles a character behind a wall and leaves one in the open clear', () => {
    const open = setup(OPEN);
    open.sfx.updateSources([open.player, open.bot], PLAYER);
    const clear = open.ctx.filters.find((f) => f.type === 'lowpass')!;
    expect(clear.frequency.value).toBe(AUDIO.occlusion.openHz);

    const walled = setup(WALLED);
    walled.sfx.updateSources([walled.player, walled.bot], PLAYER);
    const muffled = walled.ctx.filters.find((f) => f.type === 'lowpass')!;
    expect(muffled.frequency.value).toBeCloseTo(AUDIO.occlusion.muffledHz);
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
        sfx.updateSources([player], PLAYER);
        engine.setVolume('master', 0.5);
        sfx.unlock();
        sfx.dispose();
        engine.dispose();
      }).not.toThrow();
      expect(sfx.roundStartWhistle()).toBe(false);
    }
    // Once for the refused context: the engine doesn't try again on every Play.
    expect(warn).toHaveBeenCalledTimes(1);
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
    const { sfx, ctx } = setup();
    sfx.unlock();
    expect(ctx.resumed).toBe(0);
    expect(ctx.state).toBe('suspended');
    sfx.setPaused(false);
    expect(ctx.resumed).toBe(1);
    expect(ctx.state).toBe('running');
    // Play again after Esc (the click comes before the mouse is captured again): still silent until the capture.
    sfx.setPaused(true);
    sfx.unlock();
    expect(ctx.resumed).toBe(1);
    expect(ctx.state).toBe('suspended');
  });

  it('suspends the audio with the game and resumes it', () => {
    const { sfx, ctx } = setup();
    const resumed = ctx.resumed;
    sfx.setPaused(true);
    expect(ctx.suspended).toBeGreaterThan(0);
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
    for (let i = 0; i < AUDIO.maxImpactsPerWindow + 3; i++) sfx.onEvent({ type: 'bbImpact', position: vec3(3, 0, 0), ownerId: 1 }, PLAYER, characterOf);
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
    // Another engine (another context at the same rate) shares the rendered samples too.
    setup(OPEN, engineFor(library));
    expect(FakeContext.made).toBe(2);
    expect(renders).toEqual([48000]);
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
    const engine = engineFor();
    const ctx = engine.context() as unknown as FakeContext;
    expect(ctx.state).toBe('suspended');
    expect(ctx.resumed).toBe(0);
    const { sfx } = setup(OPEN, engine);
    expect(ctx.state).toBe('suspended');
    sfx.setPaused(false);
    expect(ctx.state).toBe('running');
    sfx.setPaused(true);
    expect(ctx.state).toBe('suspended');
  });

  it("disconnects a finished match's nodes and its whistle but keeps the context for the next; the Game's dispose closes it", () => {
    const engine = engineFor();
    const { sfx, ctx, characterOf } = setup(OPEN, engine);
    sfx.onEvent({ type: 'roundOver', winner: 0, reason: 'time' }, PLAYER, characterOf);
    sfx.onEvent(step(1), PLAYER, characterOf);
    // The engine's buses are the first three gains; the match's world, echo, own-sound and interface gains follow.
    const ownNodes = [...ctx.gains.slice(3, 7), ...ctx.panners, ...ctx.filters];
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

  it('is silent, and harmless, without Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined);
    const engine = engineFor();
    expect(() => engine.preview('master')).not.toThrow();
    expect(FakeContext.made).toBe(0);
  });
});
