import { AUDIO, matchOverBlastStart, VOLUME, type VolumeChannel } from '../config/audio';
import type { ReplicaConfig } from '../config/replicas';
import { cues, type ShotProfile, type SoundCue } from '../config/sounds';
import type { MapBlock } from '../map/mapTypes';
import type { Character } from '../sim/character';
import type { GameEvent } from '../sim/events';
import type { Vec3 } from '../sim/vec';
import { volumeGain, type Volumes } from './audioMix';
import { FoleyTracker, type FoleyMove } from './foley';
import { MotorSound } from './motor';
import { blockedShare, lineBlocked, type Muffle, muffleFor, type OcclusionQuery } from './occlusion';
import { type SoundLibrary, suppressedCopies } from './soundBank';
import { impactMaterialAt, surfaceUnder } from './soundMaterials';
import { VoiceLimit } from './voiceLimit';
import { Whistle } from './whistle';

/** A playback level and per-play pitch spread (AUDIO.levels). */
type Level = { readonly gain: number; readonly pitchSpread: number };

/** A sound playing (or scheduled): its source, its level, and when it starts on the audio clock. */
interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  startsAt: number;
}

/**
 * One other character's sound source: a 3D panner that follows them, then a low-pass and a gain that muffle
 * them while level geometry stands between you (one chain per character, reused for all their sounds).
 */
interface Channel {
  panner: PannerNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  /** The blocked share last applied (-1 before the first update). */
  share: number;
}

interface ReplicaSound {
  profile: ShotProfile;
  fireRate: number;
  /** Its shot variants (muffled copies for a suppressed replica). */
  shots: AudioBuffer[];
}

/** What every match's sound shares: the volume sliders and the synthesised sounds. */
export interface SfxSetup {
  volumes: Volumes;
  library: SoundLibrary;
}

/** Lets an audio context's promise (resume, suspend, close) settle quietly: a refusal changes nothing we rely on. */
function settle(p: Promise<void>): void {
  p.catch(() => {});
}

/** A random pitch factor within ± `spread` (presentation-only randomness, not the simulation's RNG). */
function jitter(spread: number): number {
  return 1 + (Math.random() * 2 - 1) * spread;
}

/**
 * The game's sound (M13). Every effect is synthesised once when audio starts (config/sounds.ts, rendered by
 * audio/dsp.ts) and played back from buffers. Your own sounds play centred; everyone else's come through their
 * own 3D channel (HRTF panning, muffled through walls), and one-off sounds in the world (BB impacts, the flag's
 * rope) get a panner of their own that is disconnected when they end. Interface cues (hit tick, hit marker,
 * whistle) stay dry. Three volume buses: master, effects (the world) and interface.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buses = new Map<VolumeChannel, GainNode>();
  /** In-world sounds go here: straight to the effects bus plus a send to the yard's reverb. */
  private world: GainNode | null = null;
  /** Your own sounds: centred, into the world (so they echo too). */
  private self: GainNode | null = null;
  private readonly buffers = new Map<SoundCue, AudioBuffer[]>();
  private readonly lastVariant = new Map<SoundCue | string, number>();
  private readonly replicas = new Map<string, ReplicaSound>();
  private readonly channels = new Map<number, Channel>();
  private readonly motors = new Map<number, { motor: MotorSound; spinDown: Voice | null }>();
  private readonly foley = new FoleyTracker();
  private readonly impactLimit = new VoiceLimit(AUDIO.maxImpactsPerWindow, AUDIO.impactWindow);
  private readonly stepLimit = new VoiceLimit(AUDIO.footsteps.maxPerWindow, AUDIO.footsteps.window);
  private readonly foleyLimit = new VoiceLimit(AUDIO.foley.maxPerWindow, AUDIO.foley.window);
  /** Where the listener is (distance culling of quiet sounds, and muffling). */
  private readonly listener = { x: 0, y: 0, z: 0 };
  private readonly muffle: Muffle = { hz: 0, gain: 0 };
  private whistle: Whistle | null = null;
  private readonly volumes: Volumes;

  constructor(
    private readonly loadout: readonly ReplicaConfig[],
    private readonly blocks: readonly MapBlock[],
    private readonly query: OcclusionQuery,
    private readonly setup: SfxSetup,
  ) {
    this.volumes = { ...setup.volumes };
  }

  /** Pauses all sound with the game (and resumes it). */
  setPaused(paused: boolean): void {
    if (!this.ctx) return;
    settle(paused ? this.ctx.suspend() : this.ctx.resume());
  }

  /**
   * Must be called from a user gesture (browsers keep audio suspended until then). Builds every sound the first time.
   * The new context is suspended at once: nothing plays until play really starts (`setPaused(false)` once the mouse
   * is captured), so a refused mouse lock leaves the menus silent (audit M-07). Where the browser has no Web Audio
   * (or refuses a context) the game carries on without sound (audit M-04).
   */
  unlock(): void {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    try {
      this.build(new AudioContext());
      settle(this.ctx!.suspend());
    } catch (e) {
      console.warn('Audio unavailable, playing without sound', e);
      this.dispose();
    }
  }

  /** The output graph (buses, limiter, the yard's reverb, the whistle) and every sound's buffers, on `ctx`. */
  private build(ctx: AudioContext): void {
    this.ctx = ctx;
    this.master = ctx.createGain();
    const lim = AUDIO.limiter;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = lim.threshold;
    limiter.knee.value = lim.knee;
    limiter.ratio.value = lim.ratio;
    limiter.attack.value = lim.attack;
    limiter.release.value = lim.release;
    this.master.connect(limiter).connect(ctx.destination);
    for (const ch of ['effects', 'interface'] as const) {
      const bus = ctx.createGain();
      bus.connect(this.master);
      this.buses.set(ch, bus);
    }
    this.buses.set('master', this.master);
    for (const [ch, v] of Object.entries(this.volumes) as [VolumeChannel, number][]) this.buses.get(ch)!.gain.value = this.busGain(ch, v);

    const effects = this.buses.get('effects')!;
    this.world = ctx.createGain();
    this.world.connect(effects);
    const reverb = ctx.createConvolver();
    reverb.buffer = this.reverbImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = AUDIO.reverb.wet;
    this.world.connect(reverb).connect(wet).connect(effects);
    this.self = ctx.createGain();
    this.self.connect(this.world);
    this.whistle = new Whistle(ctx, this.buses.get('interface')!);

    const rendered = this.setup.library.get(ctx.sampleRate);
    for (const [cue, variants] of rendered) this.buffers.set(cue, variants.map((v) => this.toBuffer(v)));
    for (const r of this.loadout) {
      const variants = rendered.get(cues.shot(r.power))!;
      const shots = r.look.suppressed ? suppressedCopies(variants, ctx.sampleRate).map((v) => this.toBuffer(v)) : this.buffers.get(cues.shot(r.power))!;
      this.replicas.set(r.id, { profile: r.power, fireRate: r.fireRate, shots });
    }
  }

  /** A volume slider moved (Settings → Audio): eases the bus to its new level. */
  setVolume(channel: VolumeChannel, position: number): void {
    this.volumes[channel] = position;
    const bus = this.buses.get(channel);
    if (this.ctx && bus) bus.gain.setTargetAtTime(this.busGain(channel, position), this.ctx.currentTime, VOLUME.smoothing);
  }

  /** Keep the 3D listener at the camera. */
  setListener(pos: Vec3, forwardX: number, forwardY: number, forwardZ: number): void {
    this.listener.x = pos.x;
    this.listener.y = pos.y;
    this.listener.z = pos.z;
    const l = this.ctx?.listener;
    if (!l) return;
    if (!l.positionX) {
      // Firefox has no AudioParam listener properties; fall back to the older setters.
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forwardX, forwardY, forwardZ, 0, 1, 0);
      return;
    }
    // Plain value writes: no automation events pile up at 60+ updates per second.
    l.positionX.value = pos.x;
    l.positionY.value = pos.y;
    l.positionZ.value = pos.z;
    l.forwardX.value = forwardX;
    l.forwardY.value = forwardY;
    l.forwardZ.value = forwardZ;
    l.upX.value = 0;
    l.upY.value = 1;
    l.upZ.value = 0;
  }

  /**
   * Once per rendered frame, after setListener: moves every other character's channel to them and muffles it by
   * how much level geometry stands between you.
   */
  updateSources(characters: readonly Character[], localId: number): void {
    if (!this.ctx) return;
    for (const c of characters) {
      if (c.id === localId) continue;
      const ch = this.channel(c);
      this.placePanner(ch.panner, c.position, AUDIO.spatial.sourceHeight);
      const share = blockedShare(this.query, this.listener, c.position);
      if (share === ch.share) continue;
      muffleFor(share, this.muffle);
      const t = this.ctx.currentTime;
      if (ch.share < 0) {
        ch.filter.frequency.value = this.muffle.hz;
        ch.gain.gain.value = this.muffle.gain;
      } else {
        ch.filter.frequency.setTargetAtTime(this.muffle.hz, t, AUDIO.occlusion.smoothing);
        ch.gain.gain.setTargetAtTime(this.muffle.gain, t, AUDIO.occlusion.smoothing);
      }
      ch.share = share;
    }
  }

  /** After every simulation tick: the rustle of anyone starting to crouch, stand or lean. */
  afterTick(characters: readonly Character[], localId: number): void {
    if (!this.ctx) return;
    this.foley.update(characters, (c, move) => this.foleyMove(c, move, localId));
  }

  /** Plays the sound for a simulation event. `localId` is the player's character id. */
  onEvent(e: GameEvent, localId: number, characterOf: (id: number) => Character | undefined): void {
    if (!this.ctx) return;
    const L = AUDIO.levels;
    switch (e.type) {
      case 'shot':
        this.shot(e.characterId, e.replicaId, localId, characterOf);
        return;
      case 'dryFire':
      case 'reloadStart':
      case 'reloadEnd': {
        const profile = this.replicas.get(e.replicaId)?.profile ?? 'electric';
        const cue = e.type === 'dryFire' ? cues.dryFire(profile) : e.type === 'reloadStart' ? cues.magOut(profile) : cues.magIn(profile);
        this.playFrom(e.characterId, localId, characterOf, cue, L.mechanism);
        return;
      }
      case 'reloadRefused':
        if (e.characterId === localId) this.play('reloadRefused', this.self!, L.mechanism);
        return;
      case 'fireMode':
        this.playFrom(e.characterId, localId, characterOf, 'selector', L.mechanism);
        return;
      case 'draw':
        this.playFrom(e.characterId, localId, characterOf, 'draw', L.mechanism);
        return;
      case 'bbImpact':
        // Rate-limited so full auto doesn't become a hiss.
        if (this.impactLimit.take(this.ctx.currentTime)) this.oneShot(cues.impact(impactMaterialAt(this.blocks, e.position)), e.position, L.impact);
        return;
      case 'footstep': {
        const c = characterOf(e.characterId);
        if (!c) return;
        // A hi-cap rattles on a quiet walk where no step is heard (M17b); it plays at a step's level, yours turned down.
        const cue: SoundCue = e.kind === 'rattle' ? 'magRattle' : cues.step(surfaceUnder(this.blocks, c.position), e.kind);
        // Your own steps always play: they're how you judge your own pace and noise.
        if (c.id === localId) {
          this.play(cue, this.self!, L.ownStep);
          return;
        }
        if (this.distanceTo(c.position) > AUDIO.footsteps.maxDistance || !this.stepLimit.take(this.ctx.currentTime)) return;
        this.play(cue, this.channel(c).panner, L.step);
        return;
      }
      case 'characterHit': {
        if (e.victimId === localId) {
          this.play('hitTick', this.buses.get('interface')!, L.hitTick);
          return;
        }
        // On the victim's own channel: muffled with them if they're behind cover.
        const victim = characterOf(e.victimId);
        if (victim) this.play('bodyHit', this.channel(victim).panner, L.bodyHit);
        else this.oneShot('bodyHit', e.position, L.bodyHit);
        if (e.shooterId === localId) this.play('hitMarker', this.buses.get('interface')!, L.hitMarker);
        return;
      }
      case 'ricochetTick': {
        // A ricochet that doesn't count (M20): the knock of a spent BB on the body, never the "you're hit" tick.
        if (e.victimId === localId) {
          this.play('bodyHit', this.self!, L.bodyHit);
          return;
        }
        const victim = characterOf(e.victimId);
        if (victim) this.play('bodyHit', this.channel(victim).panner, L.bodyHit);
        else this.oneShot('bodyHit', e.position, L.bodyHit);
        return;
      }
      case 'targetHit':
        // The practice range (M21): steel rings, a plywood figure knocks; your own hit gets the hit marker's "tock".
        if (e.kind === 'steel') this.oneShot('steelRing', e.position, L.steelRing);
        else this.oneShot(cues.impact('wood'), e.position, L.impact);
        if (e.shooterId === localId) this.play('hitMarker', this.buses.get('interface')!, L.hitMarker);
        return;
      case 'roundOver':
        this.whistle?.blast(AUDIO.roundOverWhistle, 0);
        return;
      case 'matchOver':
        // Extra long blasts after the round's: game over.
        for (let i = 0; i < AUDIO.matchOverBlasts; i++) this.whistle?.blast(AUDIO.roundOverWhistle, matchOverBlastStart(i));
        return;
      case 'flagRope':
        this.oneShot(e.raising ? 'rope.up' : 'rope.down', e.position, L.rope);
        return;
      case 'roundStart':
        this.roundStartWhistle();
        return;
    }
  }

  /** A teammate's radio keyed twice: the squad order you gave was heard (M22). */
  orderHeard(): void {
    if (this.ctx) this.play('radio.ack', this.buses.get('interface')!, AUDIO.levels.radioAck);
  }

  /** The two short blasts that start a round. False if audio isn't unlocked yet (nothing played). */
  roundStartWhistle(): boolean {
    if (!this.ctx) return false;
    const w = this.whistle!;
    w.stopAll();
    w.blast(AUDIO.roundStartWhistle, 0);
    w.blast(AUDIO.roundStartWhistle, AUDIO.roundStartWhistle * AUDIO.roundStartWhistleGap);
    return true;
  }

  dispose(): void {
    if (this.ctx) settle(this.ctx.close());
    this.ctx = null;
    this.master = null;
    this.world = null;
    this.self = null;
    this.whistle = null;
    this.buses.clear();
    this.buffers.clear();
    this.replicas.clear();
    this.channels.clear();
    this.motors.clear();
  }

  // ---- What plays ---------------------------------------------------------------------------

  /**
   * A shot. An AEG winds its motor up on the first shot of a trigger pull and coasts down after the last: each
   * shot reschedules the wind-down, so it only sounds once the trigger is let go.
   */
  private shot(characterId: number, replicaId: string, localId: number, characterOf: (id: number) => Character | undefined): void {
    const r = this.replicas.get(replicaId);
    const out = this.outputFor(characterId, localId, characterOf);
    if (!r || !out) return;
    const L = AUDIO.levels;
    this.playBuffer(r.shots, replicaId, out, L.shot);
    if (r.profile !== 'electric') return;
    let m = this.motors.get(characterId);
    if (!m) {
      m = { motor: new MotorSound(), spinDown: null };
      this.motors.set(characterId, m);
    }
    if (m.motor.shot(this.ctx!.currentTime, r.fireRate)) this.play('motor.spinUp', out, L.motor);
    if (m.spinDown) this.cancel(m.spinDown);
    m.spinDown = this.play('motor.spinDown', out, L.motor, m.motor.spinDownAt(r.fireRate));
  }

  /** Stops a voice: one not started yet never sounds; one already playing fades out quickly rather than clicking. */
  private cancel(v: Voice): void {
    const now = this.ctx!.currentTime;
    if (now < v.startsAt) {
      v.src.stop();
      return;
    }
    v.gain.gain.setTargetAtTime(0, now, AUDIO.cutFade / 4);
    v.src.stop(now + AUDIO.cutFade);
  }

  private foleyMove(c: Character, move: FoleyMove, localId: number): void {
    const cue: SoundCue = move === 'crouch' ? 'foley.crouch' : move === 'stand' ? 'foley.stand' : 'foley.lean';
    if (c.id === localId) {
      this.play(cue, this.self!, AUDIO.levels.ownFoley);
      return;
    }
    if (this.distanceTo(c.position) > AUDIO.foley.maxDistance || !this.foleyLimit.take(this.ctx!.currentTime)) return;
    this.play(cue, this.channel(c).panner, AUDIO.levels.foley);
  }

  /** A character's sound: centred if it's yours, otherwise from their channel. */
  private playFrom(characterId: number, localId: number, characterOf: (id: number) => Character | undefined, cue: SoundCue, level: Level): void {
    const out = this.outputFor(characterId, localId, characterOf);
    if (out) this.play(cue, out, level);
  }

  private outputFor(characterId: number, localId: number, characterOf: (id: number) => Character | undefined): AudioNode | null {
    if (characterId === localId) return this.self;
    const c = characterOf(characterId);
    return c ? this.channel(c).panner : null;
  }

  /** A one-off sound at a point in the world, muffled if level geometry is in the way; its nodes go when it ends. */
  private oneShot(cue: SoundCue, at: Vec3, level: Level): void {
    const ctx = this.ctx!;
    // Equal-power for these (up to 80 BB impacts a second): HRTF is kept for the characters you locate by ear.
    const panner = this.createPanner(AUDIO.spatial.oneShotPanningModel);
    this.placePanner(panner, at, 0);
    muffleFor(lineBlocked(this.query, this.listener, at, AUDIO.occlusion.surfaceGap) ? 1 : 0, this.muffle);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.muffle.hz;
    const g = ctx.createGain();
    g.gain.value = this.muffle.gain;
    panner.connect(filter).connect(g).connect(this.world!);
    const voice = this.play(cue, panner, level);
    if (!voice) {
      panner.disconnect();
      return;
    }
    voice.src.addEventListener('ended', () => {
      panner.disconnect();
      filter.disconnect();
      g.disconnect();
    });
  }

  /** Plays a variant of `cue` into `out` at `when` (audio clock; now if not given). */
  private play(cue: SoundCue, out: AudioNode, level: Level, when?: number): Voice | null {
    const variants = this.buffers.get(cue);
    return variants ? this.playBuffer(variants, cue, out, level, when) : null;
  }

  /** Plays one of `variants` (never the same one twice running) and disconnects its nodes when it ends. */
  private playBuffer(variants: readonly AudioBuffer[], key: string, out: AudioNode, level: Level, when?: number): Voice | null {
    const ctx = this.ctx!;
    if (variants.length === 0) return null;
    const last = this.lastVariant.get(key) ?? -1;
    let i = Math.floor(Math.random() * variants.length);
    if (i === last && variants.length > 1) i = (i + 1) % variants.length;
    this.lastVariant.set(key, i);
    const src = ctx.createBufferSource();
    src.buffer = variants[i]!;
    src.playbackRate.value = jitter(level.pitchSpread);
    const g = ctx.createGain();
    g.gain.value = level.gain;
    src.connect(g).connect(out);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    const startsAt = when ?? ctx.currentTime;
    src.start(startsAt);
    return { src, gain: g, startsAt };
  }

  // ---- Channels and buses -------------------------------------------------------------------

  private channel(c: Character): Channel {
    let ch = this.channels.get(c.id);
    if (ch) return ch;
    const ctx = this.ctx!;
    const panner = this.createPanner(AUDIO.spatial.panningModel);
    this.placePanner(panner, c.position, AUDIO.spatial.sourceHeight);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = AUDIO.occlusion.openHz;
    const gain = ctx.createGain();
    panner.connect(filter).connect(gain).connect(this.world!);
    ch = { panner, filter, gain, share: -1 };
    this.channels.set(c.id, ch);
    return ch;
  }

  private createPanner(model: PanningModelType): PannerNode {
    const s = AUDIO.spatial;
    const p = this.ctx!.createPanner();
    p.panningModel = model;
    p.distanceModel = 'inverse';
    p.refDistance = s.refDistance;
    p.rolloffFactor = s.rolloff;
    p.maxDistance = s.maxDistance;
    return p;
  }

  /** Puts a panner at `at`, `lift` metres up. Plain value writes (no automation piling up at 60 a second). */
  private placePanner(p: PannerNode, at: Vec3, lift: number): void {
    p.positionX.value = at.x;
    p.positionY.value = at.y + lift;
    p.positionZ.value = at.z;
  }

  private busGain(channel: VolumeChannel, position: number): number {
    return (channel === 'master' ? AUDIO.masterVolume : 1) * volumeGain(position);
  }

  private distanceTo(p: Vec3): number {
    return Math.hypot(p.x - this.listener.x, p.z - this.listener.z);
  }

  private toBuffer(samples: Float32Array): AudioBuffer {
    const buf = this.ctx!.createBuffer(1, samples.length, this.ctx!.sampleRate);
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    return buf;
  }

  /** Stereo impulse response: noise dying away over `seconds` (a small walled yard, no roof). */
  private reverbImpulse(ctx: AudioContext): AudioBuffer {
    const r = AUDIO.reverb;
    const len = Math.round(ctx.sampleRate * r.seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** r.decayPower;
    }
    return buf;
  }
}
