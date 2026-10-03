import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO } from '../config/audio';
import { LOADOUT } from '../config/replicas';
import type { MapBlock } from '../map/mapTypes';
import { type Character, createCharacter } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { vec3 } from '../sim/vec';
import { volumeGain } from './audioMix';
import type { OcclusionQuery } from './occlusion';
import { Sfx } from './sfx';

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

class FakeContext {
  static last: FakeContext;
  currentTime = 0;
  sampleRate = 48000;
  readonly destination = new FakeNode();
  readonly listener = Object.fromEntries(['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'].map((k) => [k, new FakeParam()]));
  readonly gains: FakeGain[] = [];
  readonly panners: FakePanner[] = [];
  readonly filters: FakeFilter[] = [];
  readonly sources: FakeSource[] = [];
  constructor() {
    FakeContext.last = this;
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
    return new FakeSource();
  }
  createDynamicsCompressor(): FakeNode & Record<'threshold' | 'knee' | 'ratio' | 'attack' | 'release', FakeParam> {
    return Object.assign(new FakeNode(), { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam() });
  }
  createConvolver(): FakeNode & { buffer: unknown } {
    return Object.assign(new FakeNode(), { buffer: null });
  }
  createBuffer(channels: number, length: number, rate: number): FakeBuffer {
    return new FakeBuffer(channels, length, rate);
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

// ---- Helpers -------------------------------------------------------------------------------------

const OPEN: OcclusionQuery = { raycastStatic: () => -1 };
const WALLED: OcclusionQuery = { raycastStatic: () => 1 };
const FLOOR: MapBlock[] = [{ kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(100, 0.5, 100) }];
const VOLUMES = { master: 1, effects: 1, interface: 1 };
const PLAYER = 0;

function setup(query: OcclusionQuery = OPEN): { sfx: Sfx; ctx: FakeContext; player: Character; bot: Character; characterOf: (id: number) => Character | undefined } {
  const player = createCharacter(PLAYER, vec3(0, 0, 0), 0, LOADOUT, 0);
  const bot = createCharacter(1, vec3(6, 0, 0), 0, LOADOUT, 1);
  const sfx = new Sfx(LOADOUT, FLOOR, query, VOLUMES);
  sfx.unlock();
  sfx.setListener(vec3(0, 1.6, 0), 0, 0, -1);
  const all = [player, bot];
  return { sfx, ctx: FakeContext.last, player, bot, characterOf: (id) => all.find((c) => c.id === id) };
}

/** The node a source plays into (through its level gain). */
function destinationOf(src: FakeSource): unknown {
  const [gain] = [...src.outputs] as FakeGain[];
  return [...gain!.outputs][0];
}

const shot = (characterId: number): GameEvent => ({ type: 'shot', characterId, replicaId: 'aeg', position: vec3(0, 1.6, 0) });
const step = (characterId: number): GameEvent => ({ type: 'footstep', characterId, kind: 'run' });

describe('the sound engine (M13)', () => {
  beforeEach(() => {
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
    const { sfx, ctx } = setup();
    sfx.setVolume('interface', 0.5);
    const eased = ctx.gains.flatMap((g) => g.gain.targets);
    expect(eased).toContainEqual({ value: volumeGain(0.5), at: 0 });
  });
});
