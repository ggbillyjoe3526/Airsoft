import { AUDIO, type LoopId, type ReverbSpec, VOLUME, type VolumeChannel } from '../config/audio';
import { cues, SHOT_PROFILES, type SoundCue } from '../config/sounds';
import { renderAmbienceBed } from './ambience';
import { volumeGain, type Volumes } from './audioMix';
import { Biquad, seededRandom } from './dsp';
import { finish, MAP_SOUND_RENDERERS, type MapSoundRenderers, SoundLibrary, suppressedCopies } from './soundBank';
import type { Soundscape } from './soundscape';

/** What a field plays beyond the title screen's sounds (M33j): its map cues and loops, and its echo (M69). */
export type FieldSounds = Pick<Soundscape, 'cues' | 'loops' | 'reverb'>;

/** Lets an audio context's promise (resume, suspend, close) settle quietly: a refusal changes nothing we rely on. */
export function settle(p: Promise<void>): void {
  p.catch(() => {});
}

/** Runs `work` in a spare moment; `timeLeft` says how many milliseconds of it remain. */
export type IdleScheduler = (work: (timeLeft: () => number) => void) => void;

/** The browser's idle callback (a zero-length moment after a timeout where it has none). */
const browserIdle: IdleScheduler = (work) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback((deadline) => work(() => deadline.timeRemaining()));
  else setTimeout(() => work(() => 0), 0);
};

/** One way to dip the world under a cue (AUDIO.duck). */
export interface DuckShape {
  readonly depth: number;
  readonly attack: number;
  readonly hold: number;
  readonly release: number;
}

/** A dark echo's low-pass is maximally flat (Butterworth): 12 dB an octave above ReverbSpec.darkHz, no bump below. */
const DARK_Q = Math.SQRT1_2;

/**
 * Stereo impulse response of echo `r` (config/audio.ts ReverbSpec): noise dying away over `r.seconds` (the yard's: a
 * small walled yard, no roof), its highs rolled off above `r.darkHz` if it sets one. Seeded, like every other sound
 * (audit CORE-17), and made a channel per step. At the context's own rate: a convolver refuses a buffer at any other.
 */
function* reverbImpulse(ctx: AudioContext, r: ReverbSpec): Generator<void, AudioBuffer> {
  const len = Math.round(ctx.sampleRate * r.seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const rand = seededRandom(r.seed);
  for (let ch = 0; ch < 2; ch++) {
    yield;
    const d = buf.getChannelData(ch);
    // A low-pass for a dark echo (M69, audit AUD-10); without darkHz the noise is used as it comes, as the yard's always was.
    let dark: Biquad | null = null;
    if (r.darkHz !== undefined) {
      dark = new Biquad('lowpass', ctx.sampleRate);
      dark.set(r.darkHz, DARK_Q);
    }
    for (let i = 0; i < len; i++) {
      const n = rand() * 2 - 1;
      d[i] = (dark ? dark.process(n) : n) * (1 - i / len) ** r.decayPower;
    }
  }
  return buf;
}

/**
 * What every match's sound shares, kept by the Game for the page's lifetime (audit M-09): one audio context, the
 * volume buses (master; effects, the world, through its ducking and limiter; interface, straight to master) and every
 * sound as audio buffers (rendered at AUDIO.renderRate whatever the device's rate, audit CORE-03). The context is made
 * suspended when the game starts and the sounds are rendered in the title screen's spare time, the picked field's own
 * with them (M65, audit AUD-01), so Play only builds a match's own graph (audio/sfx.ts). The context runs only while a
 * match is played, or for a volume slider's preview. Where the browser has no Web Audio, or refuses a context, everything here is silent (audit M-04).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  /** Making a context failed (or the engine is disposed): no retry on every Play. */
  private unavailable = false;
  private readonly buses = new Map<VolumeChannel, GainNode>();
  private readonly buffers = new Map<SoundCue, AudioBuffer[]>();
  private readonly muffled = new Map<SoundCue, AudioBuffer[]>();
  /** The echoes made so far: the yard's (AUDIO.reverb, the title screen's last step) and each played field's own (M69). */
  private readonly reverbs = new Map<ReverbSpec, AudioBuffer>();
  /** The yard's outdoor bed, a loop (audit CORE-34). */
  private ambience: AudioBuffer | null = null;
  /** The other loops a map played (M33j: the woods' wind and insects, a fire's crackle), rendered when first needed. */
  private readonly loops = new Map<LoopId, AudioBuffer>();
  /** Between the effects bus and its limiter: dips the world under a cue that must be read (audit CORE-30). */
  private ducker: GainNode | null = null;
  /** The audio-clock time the current dip lets go, and how deep it is (a gentler cue never lifts a deeper dip). */
  private duckUntil = 0;
  private duckDepth = 1;
  /** The context's suspend after a pause's fade-out (CORE-02), and the check that a play really made it run (CORE-21). */
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private runCheckTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Called when the browser won't let the audio run (sound blocked for the site, audit CORE-21): a match is played, or
   * a volume slider's cue asked for, and the context stays suspended.
   */
  onBlocked: (() => void) | null = null;
  /** The rendering still to do (null when it's done or not begun). */
  private warming: Generator<void> | null = null;
  /**
   * The picked field's own sounds, rendered ahead of Play in the title screen's spare time (M65, audit AUD-01): the
   * field to work out at the next spare moment (prefetch), then what it plays; each map cue's, loop's and echo's (M69)
   * rendering while it is under way; and those finished ahead that no match has played yet. Only the picked field's: a
   * new pick lets go of the rest, so beyond what is kept today only that one field's sounds are held.
   */
  private aheadOf: (() => FieldSounds) | null = null;
  private ahead: FieldSounds | null = null;
  private readonly cueJobs = new Map<SoundCue, Generator<void, Float32Array[]>>();
  private readonly loopJobs = new Map<LoopId, Generator<void, Float32Array>>();
  private readonly reverbJobs = new Map<ReverbSpec, Generator<void, AudioBuffer>>();
  private readonly unplayedCues = new Set<SoundCue>();
  private readonly unplayedLoops = new Set<LoopId>();
  private readonly unplayedReverbs = new Set<ReverbSpec>();
  /** A spare moment is asked for (pump). */
  private pumping = false;
  /** A match is being played (setRunning): the context should run. */
  private running = false;
  /** Volume previews still sounding: the context runs for them, then suspends again unless a match is played. */
  private previews = 0;

  constructor(
    /** The volume sliders' positions (Settings → Audio), kept up to date by setVolume. */
    readonly volumes: Volumes,
    private readonly library: SoundLibrary = new SoundLibrary(),
    private readonly idle: IdleScheduler = browserIdle,
    private readonly render: MapSoundRenderers = MAP_SOUND_RENDERERS,
  ) {}

  /**
   * The shared context, made (suspended, with its buses) the first time it's asked for; null where the browser has no
   * Web Audio or refuses a context.
   */
  context(): AudioContext | null {
    if (this.ctx || this.unavailable) return this.ctx;
    if (typeof AudioContext === 'undefined') {
      this.unavailable = true;
      return null;
    }
    try {
      const ctx = new AudioContext();
      this.ctx = ctx;
      // Made outside a gesture it starts suspended anyway; made inside one it would run. Either way: silent until play.
      if (!this.running) settle(ctx.suspend());
      this.buildBuses(ctx);
    } catch (e) {
      console.warn('Audio unavailable, playing without sound', e);
      if (this.ctx) settle(this.ctx.close());
      this.ctx = null;
      this.buses.clear();
      this.unavailable = true;
    }
    return this.ctx;
  }

  /** The bus for `channel` (sounds go into effects or interface; both feed master). Null without a context. */
  bus(channel: VolumeChannel): GainNode | null {
    return this.context() ? this.buses.get(channel)! : null;
  }

  /**
   * Starts rendering every sound and filling its buffers in the browser's spare time, a cue at a time (from the
   * title screen, so the first Play doesn't have to).
   */
  warmUp(): void {
    const ctx = this.context();
    if (!ctx || this.warming || this.reverbs.has(AUDIO.reverb)) return;
    this.warming = this.warm(ctx);
    this.pump();
  }

  /**
   * Starts rendering the picked field's own sounds (its map cues and loops) in the browser's spare time, after the
   * title screen's (M65, audit AUD-01), so Play doesn't have to: call when New game's map or its Day/Night pick
   * changes. `field` is worked out in a spare moment too (a field's ground grid takes a while). A new pick redirects
   * the work: what both fields play carries on from where it was, the rest is let go of. Paused while a match is played.
   * Whatever isn't done by Play, prepare finishes, with the same samples.
   */
  prefetch(field: () => FieldSounds): void {
    if (!this.context()) return;
    this.aheadOf = field;
    this.pump();
  }

  /** Every sound's buffers, finishing the rendering now if the title screen didn't have the time. Empty without a context. */
  cueBuffers(): ReadonlyMap<SoundCue, readonly AudioBuffer[]> {
    this.finishWarmUp();
    return this.buffers;
  }

  /**
   * A shot cue's muffled copies (a silencer, M29b; a replica built suppressed), made with the rendering and kept for
   * every match, so the first silenced shot never waits on them. Empty without a context or for any other cue.
   */
  muffledBuffers(cue: SoundCue): readonly AudioBuffer[] {
    this.finishWarmUp();
    return this.muffled.get(cue) ?? [];
  }

  /**
   * A cue's rendered samples at `AUDIO.renderRate` (for a match's own variants of a sound), read from its buffers: the
   * library lets go of its copy once the buffers are made. Empty without a context.
   */
  samples(cue: SoundCue): readonly Float32Array[] {
    return this.cueBuffers().get(cue)?.map((b) => b.getChannelData(0)) ?? [];
  }

  /**
   * Echo `spec`'s impulse (a stereo impulse response for a convolver): the yard's from the title screen's rendering, a
   * field's own (M69, audit AUD-10) made the first time it is asked for and kept for the page (prepare does it as the
   * match loads, from where New game's spare time left it). Null without a context.
   */
  reverbImpulse(spec: ReverbSpec = AUDIO.reverb): AudioBuffer | null {
    if (spec === AUDIO.reverb) {
      this.finishWarmUp();
      return this.reverbs.get(spec) ?? null;
    }
    const ctx = this.context();
    if (!ctx) return null;
    let buf = this.reverbs.get(spec);
    if (!buf) {
      buf = finish(this.reverbJobs.get(spec) ?? reverbImpulse(ctx, spec));
      this.reverbJobs.delete(spec);
      this.reverbs.set(spec, buf);
    }
    return buf;
  }

  /** The yard's outdoor bed: a mono loop (audio/ambience.ts). Null without a context. */
  ambienceBed(): AudioBuffer | null {
    this.finishWarmUp();
    return this.ambience;
  }

  /**
   * Loop `id` (config/audio.ts AMBIENT_LOOPS): the yard's bed from the title screen's rendering, any other rendered the
   * first time a map asks for it and kept for the page (prepare does it as the match loads). Null without a context.
   */
  loop(id: LoopId): AudioBuffer | null {
    if (id === 'yard') return this.ambienceBed();
    const ctx = this.context();
    if (!ctx) return null;
    let buf = this.loops.get(id);
    if (!buf) {
      // From where New game's spare time left it, if it began there (M65).
      buf = toBuffer(ctx, finish(this.loopJobs.get(id) ?? this.render.loop(id, AUDIO.renderRate)));
      this.loopJobs.delete(id);
      this.loops.set(id, buf);
    }
    return buf;
  }

  /**
   * Renders what `scene` plays beyond the title screen's sounds (M33j: its map cues and loops; M69: its echo), once per
   * page, so a map that never uses them costs nothing and the match never waits on them mid-play. Call as the match
   * loads. What New game's spare time rendered ahead (prefetch, M65) is taken as it is; what it began is finished from
   * where it was.
   */
  prepare(scene: FieldSounds): void {
    const ctx = this.context();
    if (!ctx) return;
    for (const cue of scene.cues) {
      // Played now: kept for the page, as every played field's sounds are.
      this.unplayedCues.delete(cue);
      if (this.buffers.has(cue)) continue;
      this.buffers.set(cue, finish(this.cueJobs.get(cue) ?? this.render.cue(cue, AUDIO.renderRate)).map((v) => toBuffer(ctx, v)));
      this.cueJobs.delete(cue);
    }
    for (const id of scene.loops) {
      if (id === 'yard') continue;
      this.unplayedLoops.delete(id);
      this.loop(id);
    }
    if (scene.reverb !== AUDIO.reverb) {
      this.unplayedReverbs.delete(scene.reverb);
      this.reverbImpulse(scene.reverb);
    }
  }

  /**
   * Dips the world (the effects bus, not the interface) under a cue that must be read (audit CORE-30): down to the
   * shape's depth, held, then let back. Two automation events on one gain, no per-frame work. While a dip is on, the
   * deeper of the two depths and the later of the two ends win.
   */
  duck(shape: DuckShape): void {
    const g = this.ducker?.gain;
    if (!this.ctx || !g) return;
    const t = this.ctx.currentTime;
    const on = t < this.duckUntil;
    this.duckDepth = on ? Math.min(this.duckDepth, shape.depth) : shape.depth;
    this.duckUntil = Math.max(on ? this.duckUntil : 0, t + shape.hold);
    g.cancelScheduledValues(t);
    g.setTargetAtTime(this.duckDepth, t, shape.attack);
    g.setTargetAtTime(1, this.duckUntil, shape.release);
  }

  /**
   * The output's latency in milliseconds (the context's processing plus the device's; Firefox doesn't always report
   * the device's) for the debug overlay, or null without a context (audit CORE-16).
   */
  latencyMs(): number | null {
    const ctx = this.ctx;
    return ctx ? ((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000 : null;
  }

  /** A volume slider moved (Settings → Audio): eases the bus to its new level. */
  setVolume(channel: VolumeChannel, position: number): void {
    this.volumes[channel] = position;
    const bus = this.buses.get(channel);
    if (this.ctx && bus) bus.gain.setTargetAtTime(busGain(channel, position), this.ctx.currentTime, VOLUME.smoothing);
  }

  /**
   * A volume slider was let go (Settings → Audio, audit L-17): a short dry cue through that slider's bus, so its level
   * can be heard from the pause menu or the title screen. The context runs just for the cue, then suspends again
   * unless a match is being played by then.
   */
  preview(channel: VolumeChannel): void {
    const ctx = this.context();
    const bus = this.buses.get(channel);
    const variants = this.cueBuffers().get(AUDIO.volumePreview.cue);
    if (!ctx || !bus || !variants?.length) return;
    const src = ctx.createBufferSource();
    src.buffer = variants[0]!;
    const g = ctx.createGain();
    g.gain.value = AUDIO.volumePreview.gain;
    src.connect(g).connect(bus);
    this.previews++;
    let over = false;
    const done = (): void => {
      if (over) return;
      over = true;
      src.disconnect();
      g.disconnect();
      this.previews--;
      if (this.previews === 0 && !this.running && this.ctx === ctx) settle(ctx.suspend());
    };
    src.onended = done;
    src.start(ctx.currentTime);
    // A context that won't run never ends the cue: count it as over, and say why nothing was heard.
    if (!this.running)
      ctx.resume().catch(() => {
        done();
        this.onBlocked?.();
      });
  }

  /**
   * A match is played (true) or paused (false): the context runs only while it is played. A pause may let the match's
   * own fade-out (`fade` seconds) finish before the context is suspended, so Esc doesn't cut a sound mid-wave
   * (audit CORE-02). Played, a context the browser won't run is reported to onBlocked (audit CORE-21).
   */
  setRunning(running: boolean, fade = 0): void {
    this.running = running;
    // Out of play, a field picked meanwhile renders on in the spare time (M65).
    if (!running) this.pump();
    this.clearTimers();
    const ctx = this.ctx;
    if (!ctx) return;
    if (running) {
      let reported = false;
      const check = (): void => {
        if (reported || !this.running || this.ctx !== ctx || ctx.state === 'running') return;
        reported = true;
        this.onBlocked?.();
      };
      ctx.resume().then(check, () => {
        // Refused outright (Firefox's autoplay blocking, a policy): report it even if the state reads otherwise.
        if (this.running && this.ctx === ctx && !reported) {
          reported = true;
          this.onBlocked?.();
        }
      });
      // A browser may also leave the promise pending (the spec's "not allowed to start"): look again a little later.
      this.runCheckTimer = setTimeout(check, AUDIO.blockedCheck * 1000);
    } else if (this.previews === 0) {
      if (fade <= 0) settle(ctx.suspend());
      else
        this.suspendTimer = setTimeout(() => {
          this.suspendTimer = null;
          if (!this.running && this.previews === 0 && this.ctx === ctx) settle(ctx.suspend());
        }, fade * 1000);
    }
  }

  dispose(): void {
    this.clearTimers();
    this.warming = null;
    this.aheadOf = this.ahead = null;
    this.cueJobs.clear();
    this.loopJobs.clear();
    this.reverbJobs.clear();
    this.unplayedCues.clear();
    this.unplayedLoops.clear();
    this.unplayedReverbs.clear();
    this.unavailable = true;
    if (this.ctx) settle(this.ctx.close());
    this.ctx = null;
    this.buses.clear();
    this.buffers.clear();
    this.loops.clear();
    this.reverbs.clear();
    this.ambience = null;
    this.ducker = null;
  }

  private clearTimers(): void {
    if (this.suspendTimer !== null) clearTimeout(this.suspendTimer);
    if (this.runCheckTimer !== null) clearTimeout(this.runCheckTimer);
    this.suspendTimer = this.runCheckTimer = null;
  }

  /**
   * effects → ducking → limiter → master → speakers; interface → master. Only the world goes through the limiter
   * (audit CORE-16): it is what clips (six replicas at once), and the limiter's look-ahead would delay the hit tick.
   */
  private buildBuses(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.connect(ctx.destination);
    this.buses.set('master', master);
    for (const ch of ['effects', 'interface'] as const) this.buses.set(ch, ctx.createGain());
    const lim = AUDIO.limiter;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = lim.threshold;
    limiter.knee.value = lim.knee;
    limiter.ratio.value = lim.ratio;
    limiter.attack.value = lim.attack;
    limiter.release.value = lim.release;
    this.ducker = ctx.createGain();
    this.buses.get('effects')!.connect(this.ducker).connect(limiter).connect(master);
    this.buses.get('interface')!.connect(master);
    for (const [ch, v] of Object.entries(this.volumes) as [VolumeChannel, number][]) this.buses.get(ch)!.gain.value = busGain(ch, v);
  }

  /**
   * The rendering, a cue at a time: the library's samples, then each cue's buffers, then the outdoor bed (a second
   * of it at a time), then the echo (a channel at a time; audit CORE-17).
   */
  private *warm(ctx: AudioContext): Generator<void> {
    const rate = AUDIO.renderRate;
    while (!this.library.step(rate)) yield;
    for (const [cue, variants] of this.library.get(rate)) {
      if (this.buffers.has(cue)) continue;
      this.buffers.set(cue, variants.map((v) => toBuffer(ctx, v)));
      yield;
    }
    for (const profile of SHOT_PROFILES) {
      const cue = cues.shot(profile);
      const shots = this.buffers.get(cue);
      if (!shots || this.muffled.has(cue)) continue;
      this.muffled.set(cue, suppressedCopies(shots.map((b) => b.getChannelData(0)), rate).map((v) => toBuffer(ctx, v)));
      yield;
    }
    // The buffers hold every sound now; the library's copy would double the memory (about 9 MB).
    this.library.release(rate);
    yield;
    this.ambience = toBuffer(ctx, yield* renderAmbienceBed(rate));
    this.reverbs.set(AUDIO.reverb, yield* reverbImpulse(ctx, AUDIO.reverb));
  }

  /**
   * Asks for spare moments until the rendering is done: in each, a step after another (a title cue, a map cue's variant,
   * a second of a loop) for as long as more than AUDIO.warmUpSliceMs of it are left.
   */
  private pump(): void {
    if (this.pumping || !(this.warming || this.aheadOf || this.ahead)) return;
    this.pumping = true;
    const slice = (timeLeft: () => number): void => {
      do {
        if (!this.step()) {
          this.pumping = false;
          return;
        }
      } while (timeLeft() > AUDIO.warmUpSliceMs);
      this.idle(slice);
    };
    this.idle(slice);
  }

  /**
   * One step of the spare-time rendering: the title screen's sounds first, then the picked field's (not while a match
   * is played). False once there is nothing to do (finished by a Play that couldn't wait, or disposed).
   */
  private step(): boolean {
    if (this.warming) {
      if (this.warming.next().done) this.warming = null;
      return true;
    }
    return !this.running && this.ctx !== null && this.stepAhead(this.ctx);
  }

  /** One step of the picked field's rendering (prefetch); false when it is all rendered. */
  private stepAhead(ctx: AudioContext): boolean {
    if (this.aheadOf) {
      const field = this.aheadOf();
      this.aheadOf = null;
      this.ahead = field;
      // Only the picked field's sounds are held ahead of Play: a new pick lets go of the rest, half-rendered or not.
      for (const cue of [...this.cueJobs.keys()]) if (!field.cues.includes(cue)) this.cueJobs.delete(cue);
      for (const id of [...this.loopJobs.keys()]) if (!field.loops.includes(id)) this.loopJobs.delete(id);
      for (const cue of this.unplayedCues) if (!field.cues.includes(cue) && this.unplayedCues.delete(cue)) this.buffers.delete(cue);
      for (const id of this.unplayedLoops) if (!field.loops.includes(id) && this.unplayedLoops.delete(id)) this.loops.delete(id);
      for (const spec of [...this.reverbJobs.keys()]) if (spec !== field.reverb) this.reverbJobs.delete(spec);
      for (const spec of this.unplayedReverbs) if (spec !== field.reverb && this.unplayedReverbs.delete(spec)) this.reverbs.delete(spec);
      return true;
    }
    const field = this.ahead;
    if (!field) return false;
    const rate = AUDIO.renderRate;
    for (const cue of field.cues) {
      if (this.buffers.has(cue)) continue;
      const job = this.cueJobs.get(cue) ?? this.render.cue(cue, rate);
      const r = job.next();
      if (!r.done) this.cueJobs.set(cue, job);
      else {
        this.cueJobs.delete(cue);
        this.buffers.set(cue, r.value.map((v) => toBuffer(ctx, v)));
        this.unplayedCues.add(cue);
      }
      return true;
    }
    for (const id of field.loops) {
      if (id === 'yard' || this.loops.has(id)) continue;
      const job = this.loopJobs.get(id) ?? this.render.loop(id, rate);
      const r = job.next();
      if (!r.done) this.loopJobs.set(id, job);
      else {
        this.loopJobs.delete(id);
        this.loops.set(id, toBuffer(ctx, r.value));
        this.unplayedLoops.add(id);
      }
      return true;
    }
    // The field's own echo last (M69, audit AUD-10), a channel a step (5-8 ms at 48 kHz); the yard's comes with the title screen.
    const echo = field.reverb;
    if (echo !== AUDIO.reverb && !this.reverbs.has(echo)) {
      const job = this.reverbJobs.get(echo) ?? reverbImpulse(ctx, echo);
      const r = job.next();
      if (!r.done) this.reverbJobs.set(echo, job);
      else {
        this.reverbJobs.delete(echo);
        this.reverbs.set(echo, r.value);
        this.unplayedReverbs.add(echo);
      }
      return true;
    }
    this.ahead = null;
    return false;
  }

  private finishWarmUp(): void {
    if (this.reverbs.has(AUDIO.reverb)) return;
    const ctx = this.context();
    if (!ctx) return;
    const job = this.warming ?? this.warm(ctx);
    this.warming = null;
    while (!job.next().done);
  }
}

/**
 * An audio buffer holding `samples` (mono, rendered at AUDIO.renderRate) on `ctx`. A source playing it resamples it to
 * the context's rate, so the sounds are rendered once whatever the output device runs at (audit CORE-03).
 */
function toBuffer(ctx: AudioContext, samples: Float32Array): AudioBuffer {
  const buf = ctx.createBuffer(1, samples.length, AUDIO.renderRate);
  buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  return buf;
}

function busGain(channel: VolumeChannel, position: number): number {
  return (channel === 'master' ? AUDIO.masterVolume : 1) * volumeGain(position);
}
