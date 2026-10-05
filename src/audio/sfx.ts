import { AUDIO, matchOverBlastStart } from '../config/audio';
import type { ReplicaConfig } from '../config/replicas';
import { SIM_DT } from '../config/sim';
import { cues, type ImpactMaterial, type ShotProfile, type SoundCue } from '../config/sounds';
import type { MapBlock } from '../map/mapTypes';
import type { Character } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { vec3, type Vec3 } from '../sim/vec';
import { Birdsong } from './ambience';
import type { AudioEngine } from './audioEngine';
import { FoleyTracker, type FoleyMove } from './foley';
import { MotorSound } from './motor';
import { blockedShare, lineBlocked, type Muffle, muffleFor, type OcclusionQuery } from './occlusion';
import { surfaceUnder } from './soundMaterials';
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
  /** Where the panner was last put (the character's feet), so a character standing still costs no writes (CORE-35). */
  x: number;
  y: number;
  z: number;
}

interface ReplicaSound {
  profile: ShotProfile;
  fireRate: number;
  /** Its shot variants (muffled copies for a suppressed replica). */
  shots: readonly AudioBuffer[];
  /** Muffled copies, for a shooter with a silencer fitted (M29b): the engine's, made once for every match. */
  muffled: readonly AudioBuffer[];
}

/** What every match's sound shares: the Game's audio engine (context, volume buses, every sound's buffers). */
export type SfxSetup = AudioEngine;

/** A random pitch factor within ± `spread` (presentation-only randomness, not the simulation's RNG). */
function jitter(spread: number): number {
  return 1 + (Math.random() * 2 - 1) * spread;
}

/**
 * A match's sound (M13). Every effect is synthesised once per page (config/sounds.ts, rendered by audio/dsp.ts, kept
 * as buffers by the shared AudioEngine) and played back from buffers. Your own sounds play centred; everyone else's
 * come through their own 3D channel (HRTF panning, muffled through walls), and one-off sounds in the world (BB
 * impacts, the flag's rope) get a panner of their own that is disconnected when they end. Interface cues (hit tick,
 * hit marker, whistle) stay dry. The engine's three volume buses carry it all: master, effects (the world) and
 * interface. A match's own nodes are disconnected when it's disposed; the engine's context lives on.
 */
export class Sfx {
  /** The engine's context, once this match's graph is built on it (null before unlock, without audio, and after dispose). */
  private ctx: AudioContext | null = null;
  /** In-world sounds go here, then through the "you're out" muffling to the effects bus and the yard's reverb. */
  private world: GainNode | null = null;
  /** The world heard from the side line while you're out (AUDIO.out; audit CORE-30/34): a low-pass and a level. */
  private outFilter: BiquadFilterNode | null = null;
  private outLevel: GainNode | null = null;
  /** You were out when the last tick looked. */
  private playerOut = false;
  /** The outdoor bed's two looping copies, once play has started (audit CORE-34). */
  private readonly bed: AudioBufferSourceNode[] = [];
  private readonly birds = new Birdsong();
  private readonly birdAt = vec3();
  /** Your own sounds: centred, into the world (so they echo too). */
  private self: GainNode | null = null;
  /** Interface cues and the whistle: dry, into the interface bus. */
  private ui: GainNode | null = null;
  /** This match's nodes between the engine's buses and the sounds, disconnected on dispose. */
  private readonly graph: AudioNode[] = [];
  /** Where this match's sound leaves for the engine's buses (effects, interface): muted while paused. */
  private readonly outlets: GainNode[] = [];
  private buffers: ReadonlyMap<SoundCue, readonly AudioBuffer[]> = new Map();
  private readonly lastVariant = new Map<SoundCue | string, number>();
  private readonly replicas = new Map<string, ReplicaSound>();
  private readonly channels = new Map<number, Channel>();
  /**
   * Each AEG's motor. Timed on the simulation's clock, not the audio clock: shots reach the audio a frame at a time, so
   * at 30–50 fps the audio clock saw gaps between shots long enough to start a wind-down mid-burst (bug pass).
   */
  private readonly motors = new Map<number, { motor: MotorSound; fireRate: number; out: AudioNode; spinDown: Voice | null; spinDownDue: boolean }>();
  /** Simulation time this match has run (s), counted in afterTick. */
  private simTime = 0;
  /** Motors whose wind-down is still to come (afterTick looks at them only then). */
  private spinDownsDue = 0;
  private readonly foley = new FoleyTracker();
  private readonly impactLimit = new VoiceLimit(AUDIO.maxImpactsPerWindow, AUDIO.impactWindow);
  private readonly stepLimit = new VoiceLimit(AUDIO.footsteps.maxPerWindow, AUDIO.footsteps.window);
  private readonly foleyLimit = new VoiceLimit(AUDIO.foley.maxPerWindow, AUDIO.foley.window);
  /** Where the listener is (distance culling of quiet sounds, and muffling). */
  private readonly listener = { x: 0, y: 0, z: 0 };
  private listenerPlaced = false;
  private readonly muffle: Muffle = { hz: 0, gain: 0 };
  private whistle: Whistle | null = null;

  constructor(
    private readonly loadout: readonly ReplicaConfig[],
    private readonly blocks: readonly MapBlock[],
    private readonly query: OcclusionQuery,
    private readonly engine: AudioEngine,
  ) {}

  /**
   * Pauses all sound with the game (and resumes it). Paused, this match's outlets are muted too, so a volume slider's
   * preview, which runs the shared context for its cue, doesn't let the match's queued sounds through with it.
   */
  setPaused(paused: boolean): void {
    if (!this.ctx) return;
    // Eased, not jumped, so Esc and Resume don't click mid-sound (audit CORE-02); paused, the context is suspended
    // once the fade is done.
    const t = this.ctx.currentTime;
    for (const outlet of this.outlets) outlet.gain.setTargetAtTime(paused ? 0 : 1, t, AUDIO.pauseFade / 4);
    if (!paused) this.startAmbience();
    this.engine.setRunning(!paused, paused ? AUDIO.pauseFade : 0);
  }

  /**
   * Call from the Play click. Builds this match's graph on the engine's context (and every sound's buffers, if the
   * title screen didn't have the time). Nothing plays until play really starts (`setPaused(false)` once the mouse is
   * captured), so a refused mouse lock leaves the menus silent (audit M-07). Where the browser has no Web Audio (or
   * refuses a context) the game carries on without sound (audit M-04).
   */
  unlock(): void {
    if (this.ctx) return;
    const ctx = this.engine.context();
    if (!ctx) return;
    try {
      this.build(ctx);
      this.engine.setRunning(false);
    } catch (e) {
      console.warn('Audio unavailable, playing without sound', e);
      this.dispose();
    }
  }

  /** This match's graph (the world's reverb send, your own sounds, the interface's cues and whistle) on `ctx`. */
  private build(ctx: AudioContext): void {
    this.ctx = ctx;
    // The match's own way into the effects bus (dry and echo alike), so pausing can mute it in one place.
    const effects = ctx.createGain();
    effects.connect(this.engine.bus('effects')!);
    this.world = ctx.createGain();
    this.outFilter = ctx.createBiquadFilter();
    this.outFilter.type = 'lowpass';
    this.outFilter.frequency.value = AUDIO.occlusion.openHz;
    this.outLevel = ctx.createGain();
    this.graph.push(effects, this.world, this.outFilter, this.outLevel);
    this.world.connect(this.outFilter).connect(this.outLevel).connect(effects);
    const reverb = ctx.createConvolver();
    reverb.buffer = this.engine.reverbImpulse();
    const wet = ctx.createGain();
    wet.gain.value = AUDIO.reverb.wet;
    this.graph.push(reverb, wet);
    this.outLevel.connect(reverb).connect(wet).connect(effects);
    this.self = ctx.createGain();
    this.self.connect(this.world);
    this.ui = ctx.createGain();
    this.ui.connect(this.engine.bus('interface')!);
    this.graph.push(this.self, this.ui);
    this.outlets.push(effects, this.ui);
    // Silent until play starts (setPaused(false)).
    for (const outlet of this.outlets) outlet.gain.value = 0;
    this.whistle = new Whistle(ctx, this.ui);

    this.buffers = this.engine.cueBuffers();
    for (const r of this.loadout) {
      const profile = r.look.sound ?? r.power;
      const cue = cues.shot(profile);
      // A replica built suppressed always sounds muffled; one with a silencer fitted (M29b) chooses per shooter.
      const muffled = this.engine.muffledBuffers(cue);
      const shots = r.look.suppressed ? muffled : this.buffers.get(cue)!;
      this.replicas.set(r.id, { profile, fireRate: r.fireRate, shots, muffled });
    }
  }

  /** Keep the 3D listener at the camera. */
  setListener(pos: Vec3, forwardX: number, forwardY: number, forwardZ: number): void {
    this.listener.x = pos.x;
    this.listener.y = pos.y;
    this.listener.z = pos.z;
    this.listenerPlaced = true;
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
   * Once per rendered frame, after setListener: moves every other character's channel to them. Their channels are
   * made on the first frame; after that one is moved only when its character has moved, and not at all while they're
   * out of earshot or out in the dead zone (audit CORE-35): their next sound puts the channel where they are.
   */
  placeSources(characters: readonly Character[], localId: number): void {
    if (!this.ctx) return;
    for (const c of characters) {
      if (c.id === localId) continue;
      const ch = this.channelOf(c);
      if (c.status !== 'out' && this.distanceTo(c.position) <= AUDIO.spatial.maxDistance) this.follow(ch, c.position);
    }
  }

  /**
   * After every simulation tick: muffling, the world muffled while you're out, the ambience's birds, and the rustle of
   * anyone starting to crouch, stand or lean.
   */
  afterTick(characters: readonly Character[], localId: number): void {
    this.simTime += SIM_DT;
    if (!this.ctx) return;
    // A motor whose trigger was let go long enough ago coasts down now.
    if (this.spinDownsDue > 0) for (const m of this.motors.values()) {
      if (!m.spinDownDue || this.simTime < m.motor.spinDownAt(m.fireRate)) continue;
      m.spinDownDue = false;
      this.spinDownsDue--;
      m.spinDown = this.play('motor.spinDown', m.out, AUDIO.levels.motor);
    }
    this.updateMuffling(characters, localId);
    this.updateOut(characters, localId);
    if (this.listenerPlaced && this.birds.due(this.simTime, this.listener, this.birdAt)) this.oneShot('ambience.bird', this.birdAt, AUDIO.levels.bird);
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
      case 'torch':
        this.playFrom(e.characterId, localId, characterOf, 'torchClick', L.mechanism);
        return;
      case 'draw':
        this.playFrom(e.characterId, localId, characterOf, 'draw', L.mechanism);
        return;
      case 'bbImpact':
        // Played by impact(), with the material the caller already worked out for the dust (audit L-15).
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
          this.play('hitTick', this.ui!, L.hitTick);
          // The one cue that must be read: the world dips under it (audit CORE-30).
          this.engine.duck(AUDIO.duck.hit);
          return;
        }
        // On the victim's own channel: muffled with them if they're behind cover.
        const victim = characterOf(e.victimId);
        if (victim) this.play('bodyHit', this.channel(victim).panner, L.bodyHit);
        else this.oneShot('bodyHit', e.position, L.bodyHit);
        if (e.shooterId === localId) this.play('hitMarker', this.ui!, L.hitMarker);
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
        if (e.kind === 'steel') this.oneShot('steelRing', e.position, L.steelRing, AUDIO.spatial.targetMaxDistance);
        else this.oneShot(cues.impact('wood'), e.position, L.impact, AUDIO.spatial.targetMaxDistance);
        if (e.shooterId === localId) this.play('hitMarker', this.ui!, L.hitMarker);
        return;
      case 'roundOver':
        this.whistle?.blast(AUDIO.roundOverWhistle, 0);
        this.engine.duck(AUDIO.duck.whistle);
        return;
      case 'matchOver':
        // Extra long blasts after the round's: game over.
        for (let i = 0; i < AUDIO.matchOverBlasts; i++) this.whistle?.blast(AUDIO.roundOverWhistle, matchOverBlastStart(i));
        this.engine.duck(AUDIO.duck.whistle);
        return;
      case 'flagRope':
        this.oneShot(e.raising ? 'rope.up' : 'rope.down', e.position, L.rope);
        return;
      case 'roundStart':
        this.roundStartWhistle();
        return;
      case 'runWarning':
        // Extraction (M43): one long blast, a minute to go.
        this.whistle?.blast(AUDIO.roundOverWhistle, 0);
        this.engine.duck(AUDIO.duck.whistle);
        return;
      case 'exitCount':
        // The last second is the run's end: the whistle says that.
        if (e.secondsLeft > 0) this.play('count.beep', this.ui!, L.countBeep);
        return;
    }
  }

  /**
   * A BB hit the level at `at`: the tick of the `material` it hit (the caller works it out once, for the dust as well;
   * audit L-15). Rate-limited so full auto doesn't become a hiss.
   */
  impact(at: Vec3, material: ImpactMaterial): void {
    // Beyond earshot it isn't played, and doesn't use up the window either (audit CORE-01).
    if (!this.ctx || this.distanceTo(at) > AUDIO.spatial.maxDistance) return;
    if (this.impactLimit.take(this.ctx.currentTime)) this.oneShot(cues.impact(material), at, AUDIO.levels.impact);
  }

  /** A teammate's radio keyed twice: the squad order you gave was heard (M22). */
  orderHeard(): void {
    if (this.ctx) this.play('radio.ack', this.ui!, AUDIO.levels.radioAck);
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

  /** Disconnects this match's nodes from the engine's buses (the context lives on for the next match). */
  dispose(): void {
    this.whistle?.stopAll();
    for (const src of this.bed.splice(0)) src.stop();
    for (const node of this.graph.splice(0)) node.disconnect();
    this.outlets.length = 0;
    for (const ch of this.channels.values()) {
      ch.panner.disconnect();
      ch.filter.disconnect();
      ch.gain.disconnect();
    }
    this.ctx = null;
    this.world = null;
    this.outFilter = null;
    this.outLevel = null;
    this.playerOut = false;
    this.self = null;
    this.ui = null;
    this.whistle = null;
    this.buffers = new Map();
    this.replicas.clear();
    this.channels.clear();
    this.motors.clear();
    this.spinDownsDue = 0;
  }

  // ---- What plays ---------------------------------------------------------------------------

  /**
   * A shot. An AEG winds its motor up on the first shot of a trigger pull and coasts down after the last: each
   * shot puts the wind-down off (afterTick plays it), so it only sounds once the trigger is let go.
   */
  private shot(characterId: number, replicaId: string, localId: number, characterOf: (id: number) => Character | undefined): void {
    const r = this.replicas.get(replicaId);
    const out = this.outputFor(characterId, localId, characterOf);
    if (!r || !out) return;
    const L = AUDIO.levels;
    // The shooter's own replica as carried (its silencer and battery, M29b), not the local player's copy of it.
    const shooter = characterOf(characterId)?.armament;
    const muffled = shooter?.handling[shooter.active]?.muffled ?? false;
    this.playBuffer(muffled ? r.muffled : r.shots, replicaId, out, L.shot);
    if (r.profile !== 'electric') return;
    const fireRate = shooter?.replicas[shooter.active]?.fireRate ?? r.fireRate;
    let m = this.motors.get(characterId);
    if (!m) {
      m = { motor: new MotorSound(), fireRate, out, spinDown: null, spinDownDue: false };
      this.motors.set(characterId, m);
    }
    m.fireRate = fireRate;
    m.out = out;
    if (m.motor.shot(this.simTime, fireRate)) this.play('motor.spinUp', out, L.motor);
    // A wind-down still sounding from the last pull fades out under the new one.
    if (m.spinDown) this.cancel(m.spinDown);
    m.spinDown = null;
    if (!m.spinDownDue) this.spinDownsDue++;
    m.spinDownDue = true;
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

  /**
   * A one-off sound at a point in the world, muffled if level geometry is in the way; its nodes go when it ends. Not
   * played at all beyond `range` (the inverse roll-off never reaches silence; audit CORE-01).
   */
  private oneShot(cue: SoundCue, at: Vec3, level: Level, range: number = AUDIO.spatial.maxDistance): void {
    if (this.distanceTo(at) > range) return;
    const ctx = this.ctx!;
    // Equal-power for these (up to 80 BB impacts a second): HRTF is kept for the characters you locate by ear.
    const panner = this.createPanner(AUDIO.spatial.oneShotPanningModel);
    this.placePanner(panner, at, 0);
    // The chain is built only once a voice has started, so a cue with nothing to play leaves no nodes behind (audit L-16).
    const voice = this.play(cue, panner, level);
    if (!voice) return;
    muffleFor(lineBlocked(this.query, this.listener, at, AUDIO.occlusion.surfaceGap) ? 1 : 0, this.muffle);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.muffle.hz;
    const g = ctx.createGain();
    g.gain.value = this.muffle.gain;
    panner.connect(filter).connect(g).connect(this.world!);
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

  /**
   * Muffles every other character's channel by how much level geometry stands between you. Once per tick, not per
   * frame (audit L-14): only the simulation moves anyone, and the change eases over AUDIO.occlusion.smoothing anyway.
   */
  private updateMuffling(characters: readonly Character[], localId: number): void {
    // Not before the first frame has put the listener at the camera.
    if (!this.listenerPlaced) return;
    const t = this.ctx!.currentTime;
    for (const c of characters) {
      // Out in the dead zone: nothing to hear, so no rays (audit CORE-35).
      if (c.id === localId || c.status === 'out') continue;
      const ch = this.channelOf(c);
      // Beyond earshot: taken as fully muffled without casting a ray.
      const share = this.distanceTo(c.position) > AUDIO.spatial.maxDistance ? 1 : blockedShare(this.query, this.listener, c.position);
      if (share === ch.share) continue;
      muffleFor(share, this.muffle);
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

  /**
   * The world muffled while you're out (hit, walking off, in the dead zone) and clear again when the next round starts;
   * eased (audit CORE-30/34).
   */
  private updateOut(characters: readonly Character[], localId: number): void {
    let out = false;
    for (const c of characters) {
      if (c.id !== localId) continue;
      out = c.status !== 'alive';
      break;
    }
    if (out === this.playerOut) return;
    this.playerOut = out;
    const t = this.ctx!.currentTime;
    const o = AUDIO.out;
    this.outFilter!.frequency.setTargetAtTime(out ? o.hz : AUDIO.occlusion.openHz, t, o.ease);
    this.outLevel!.gain.setTargetAtTime(out ? o.gain : 1, t, o.ease);
  }

  /**
   * The yard's outdoor bed, from the first moment of play (audit CORE-34): two copies of the loop half a loop apart,
   * panned apart for width, into the world (so the effects slider sets it and it's muffled with the rest while you're
   * out). Stopped when the match is disposed.
   */
  private startAmbience(): void {
    const ctx = this.ctx!;
    const buffer = this.bed.length === 0 ? this.engine.ambienceBed() : null;
    if (!buffer) return;
    const a = AUDIO.ambience;
    const level = ctx.createGain();
    level.gain.value = a.gain;
    level.connect(this.world!);
    this.graph.push(level);
    for (const side of [-1, 1]) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const pan = ctx.createStereoPanner();
      pan.pan.value = side * a.width;
      src.connect(pan).connect(level);
      this.graph.push(src, pan);
      src.start(ctx.currentTime, side > 0 ? buffer.duration / 2 : 0);
      this.bed.push(src);
    }
  }

  // ---- Channels and buses -------------------------------------------------------------------

  /** A character's channel, put where they are now (for a sound of theirs). */
  private channel(c: Character): Channel {
    const ch = this.channelOf(c);
    this.follow(ch, c.position);
    return ch;
  }

  /** A character's channel, made (where they stand) the first time it's asked for. */
  private channelOf(c: Character): Channel {
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
    ch = { panner, filter, gain, share: -1, x: c.position.x, y: c.position.y, z: c.position.z };
    this.channels.set(c.id, ch);
    return ch;
  }

  /** Moves a channel to `at` if it has moved more than AUDIO.spatial.moveEpsilon on any axis since it was last put. */
  private follow(ch: Channel, at: Vec3): void {
    const e = AUDIO.spatial.moveEpsilon;
    if (Math.abs(at.x - ch.x) <= e && Math.abs(at.y - ch.y) <= e && Math.abs(at.z - ch.z) <= e) return;
    ch.x = at.x;
    ch.y = at.y;
    ch.z = at.z;
    this.placePanner(ch.panner, at, AUDIO.spatial.sourceHeight);
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

  private distanceTo(p: Vec3): number {
    return Math.hypot(p.x - this.listener.x, p.z - this.listener.z);
  }
}
