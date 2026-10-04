import { AUDIO, VOLUME, type VolumeChannel } from '../config/audio';
import { cues, SHOT_PROFILES, type SoundCue } from '../config/sounds';
import { volumeGain, type Volumes } from './audioMix';
import { SoundLibrary, suppressedCopies } from './soundBank';

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

/** Stereo impulse response: noise dying away over `seconds` (a small walled yard, no roof). */
function reverbImpulse(ctx: AudioContext): AudioBuffer {
  const r = AUDIO.reverb;
  const len = Math.round(ctx.sampleRate * r.seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** r.decayPower;
  }
  return buf;
}

/**
 * What every match's sound shares, kept by the Game for the page's lifetime (audit M-09): one audio context, the
 * volume buses (master with its limiter, effects, interface) and every sound as audio buffers. The context is made
 * suspended when the game starts and the sounds are rendered in the title screen's spare time, so Play only builds
 * a match's own graph (audio/sfx.ts). The context runs only while a match is played, or for a volume slider's
 * preview. Where the browser has no Web Audio, or refuses a context, everything here is silent (audit M-04).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  /** Making a context failed (or the engine is disposed): no retry on every Play. */
  private unavailable = false;
  private readonly buses = new Map<VolumeChannel, GainNode>();
  private readonly buffers = new Map<SoundCue, AudioBuffer[]>();
  private readonly muffled = new Map<SoundCue, AudioBuffer[]>();
  private reverb: AudioBuffer | null = null;
  /** The rendering still to do (null when it's done or not begun). */
  private warming: Generator<void> | null = null;
  /** A match is being played (setRunning): the context should run. */
  private running = false;
  /** Volume previews still sounding: the context runs for them, then suspends again unless a match is played. */
  private previews = 0;

  constructor(
    /** The volume sliders' positions (Settings → Audio), kept up to date by setVolume. */
    readonly volumes: Volumes,
    private readonly library: SoundLibrary = new SoundLibrary(),
    private readonly idle: IdleScheduler = browserIdle,
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
    if (!ctx || this.warming || this.reverb) return;
    this.warming = this.warm(ctx);
    const slice = (timeLeft: () => number): void => {
      do {
        if (!this.warming) return; // finished by a Play that couldn't wait, or disposed
        if (this.warming.next().done) {
          this.warming = null;
          return;
        }
      } while (timeLeft() > AUDIO.warmUpSliceMs);
      this.idle(slice);
    };
    this.idle(slice);
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
   * A cue's rendered samples at the context's rate (for a match's own variants of a sound), read from its buffers: the
   * library lets go of its copy once the buffers are made. Empty without a context.
   */
  samples(cue: SoundCue): readonly Float32Array[] {
    return this.cueBuffers().get(cue)?.map((b) => b.getChannelData(0)) ?? [];
  }

  /** The yard's echo (a stereo impulse response for a convolver). Null without a context. */
  reverbImpulse(): AudioBuffer | null {
    this.finishWarmUp();
    return this.reverb;
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
    // A context that won't run never ends the cue: count it as over.
    if (!this.running) ctx.resume().catch(done);
  }

  /** A match is played (true) or paused (false): the context runs only while it is played. */
  setRunning(running: boolean): void {
    this.running = running;
    if (!this.ctx) return;
    if (running) settle(this.ctx.resume());
    else if (this.previews === 0) settle(this.ctx.suspend());
  }

  dispose(): void {
    this.warming = null;
    this.unavailable = true;
    if (this.ctx) settle(this.ctx.close());
    this.ctx = null;
    this.buses.clear();
    this.buffers.clear();
    this.reverb = null;
  }

  private buildBuses(ctx: AudioContext): void {
    const master = ctx.createGain();
    const lim = AUDIO.limiter;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = lim.threshold;
    limiter.knee.value = lim.knee;
    limiter.ratio.value = lim.ratio;
    limiter.attack.value = lim.attack;
    limiter.release.value = lim.release;
    master.connect(limiter).connect(ctx.destination);
    this.buses.set('master', master);
    for (const ch of ['effects', 'interface'] as const) {
      const bus = ctx.createGain();
      bus.connect(master);
      this.buses.set(ch, bus);
    }
    for (const [ch, v] of Object.entries(this.volumes) as [VolumeChannel, number][]) this.buses.get(ch)!.gain.value = busGain(ch, v);
  }

  /** The rendering, a cue at a time: the library's samples, then each cue's buffers, then the echo. */
  private *warm(ctx: AudioContext): Generator<void> {
    const rate = ctx.sampleRate;
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
    this.reverb = reverbImpulse(ctx);
  }

  private finishWarmUp(): void {
    if (this.reverb) return;
    const ctx = this.context();
    if (!ctx) return;
    const job = this.warming ?? this.warm(ctx);
    this.warming = null;
    while (!job.next().done);
  }
}

/** An audio buffer holding `samples` (mono) on `ctx`. */
export function toBuffer(ctx: AudioContext, samples: Float32Array): AudioBuffer {
  const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  return buf;
}

function busGain(channel: VolumeChannel, position: number): number {
  return (channel === 'master' ? AUDIO.masterVolume : 1) * volumeGain(position);
}
