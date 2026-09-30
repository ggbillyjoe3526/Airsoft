import { AUDIO, matchOverBlastStart } from '../config/audio';
import type { ReplicaConfig, ReplicaModelKind } from '../config/replicas';
import type { GameEvent } from '../sim/events';
import type { FootstepKind } from '../sim/footsteps';
import type { Vec3 } from '../sim/vec';
import { VoiceLimit } from './voiceLimit';

/** A random pitch factor within ± `spread` (presentation-only randomness, not the simulation's RNG). */
function jitter(spread: number): number {
  return 1 + (Math.random() * 2 - 1) * spread;
}

/**
 * Procedurally synthesised sound effects (no audio files). Replicas are meant to sound like what they
 * are: an electric gearbox cycling a plastic piston, a gas blowback slide clacking. Sounds made by the
 * local player are played centred; everything else, including BB impacts, is positioned in 3D.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** In-world sounds go here: straight to the mix plus a send to the yard's reverb. */
  private world: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly impactLimit = new VoiceLimit(AUDIO.maxImpactsPerWindow, AUDIO.impactWindow);
  private readonly stepLimit = new VoiceLimit(AUDIO.footsteps.maxPerWindow, AUDIO.footsteps.window);
  /** Where the listener is (for distance culling of quiet sounds). */
  private readonly listener = { x: 0, y: 0, z: 0 };
  private readonly shotSounds = new Map<string, ReplicaModelKind>();
  /** Whistle oscillators still playing or scheduled (a new round silences them). */
  private readonly whistles: OscillatorNode[] = [];

  constructor(loadout: readonly ReplicaConfig[]) {
    for (const r of loadout) this.shotSounds.set(r.id, r.look.shotSound);
  }

  /** Pauses all sound with the game (and resumes it). */
  setPaused(paused: boolean): void {
    if (!this.ctx) return;
    void (paused ? this.ctx.suspend() : this.ctx.resume());
  }

  /** Must be called from a user gesture (browsers keep audio suspended until then). */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = AUDIO.masterVolume;
    this.master.connect(ctx.destination);
    this.world = ctx.createGain();
    this.world.connect(this.master);
    const reverb = ctx.createConvolver();
    reverb.buffer = this.reverbImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = AUDIO.reverb.wet;
    this.world.connect(reverb).connect(wet).connect(this.master);
    const len = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1; // presentation-only randomness
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

  /** Plays the sound for a simulation event. `localId` is the player's character id. */
  onEvent(e: GameEvent, localId: number, positionOf: (characterId: number) => Vec3 | undefined): void {
    if (!this.ctx || !this.master) return;
    switch (e.type) {
      case 'shot': {
        const out = this.output(e.characterId === localId ? null : e.position);
        if (this.shotSounds.get(e.replicaId) === 'pistol') this.pistolShot(out);
        else this.aegShot(out);
        return;
      }
      case 'dryFire':
        this.click(this.output(e.characterId === localId ? null : positionOf(e.characterId) ?? null), 2600, 0.006);
        return;
      case 'reloadStart':
        this.magOut(this.output(e.characterId === localId ? null : positionOf(e.characterId) ?? null));
        return;
      case 'reloadEnd':
        this.magIn(this.output(e.characterId === localId ? null : positionOf(e.characterId) ?? null));
        return;
      case 'draw':
        this.rattle(this.output(e.characterId === localId ? null : positionOf(e.characterId) ?? null));
        return;
      case 'bbImpact':
        this.impact(e.position);
        return;
      case 'footstep': {
        const self = e.characterId === localId;
        const at = self ? null : positionOf(e.characterId);
        if (!self && (!at || Math.hypot(at.x - this.listener.x, at.z - this.listener.z) > AUDIO.footsteps.maxDistance)) return;
        // Your own steps always play: they're how you judge your own pace and noise.
        if (!self && !this.stepLimit.take(this.ctx.currentTime)) return;
        const ownStepScale = AUDIO.footsteps.selfVolume / AUDIO.footsteps.volume;
        this.footstep(this.output(at ?? null), e.kind, self ? ownStepScale : 1);
        return;
      }
      case 'characterHit':
        if (e.victimId === localId) {
          this.hitTick();
          return;
        }
        this.bodyHit(e.position);
        if (e.shooterId === localId) this.hitMarker();
        return;
      case 'roundOver':
        this.whistle(AUDIO.roundOverWhistle, 0);
        return;
      case 'matchOver':
        // Extra long blasts after the round's: game over.
        for (let i = 0; i < AUDIO.matchOverBlasts; i++) this.whistle(AUDIO.roundOverWhistle, matchOverBlastStart(i));
        return;
      case 'roundStart':
        this.stopWhistles();
        this.whistle(AUDIO.roundStartWhistle, 0);
        this.whistle(AUDIO.roundStartWhistle, AUDIO.roundStartWhistle * AUDIO.roundStartWhistleGap);
        return;
    }
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.world = null;
  }

  // ---- Recipes ------------------------------------------------------------------------------

  /** AEG: a short airy puff from the nozzle, the gearbox's piston slap and the motor's whirr. */
  private aegShot(out: AudioNode): void {
    const p = jitter(AUDIO.shotPitchSpread);
    const m = AUDIO.aegMotor;
    this.noise(out, 'bandpass', 2600 * p, 0.9, AUDIO.shotVolume * 0.6, 0.002, 0.03);
    this.tone(out, 'triangle', 190 * p, 90 * p, AUDIO.shotVolume * 0.5, 0.045);
    this.tone(out, 'sawtooth', m.fromHz * p, m.toHz * p, AUDIO.shotVolume * m.gain, m.time);
    this.click(out, 1500 * p, 0.008, AUDIO.mechanismVolume * 0.6);
  }

  /** Gas pistol: a sharper gas hiss and the slide's plastic clack. */
  private pistolShot(out: AudioNode): void {
    const p = jitter(AUDIO.shotPitchSpread);
    this.noise(out, 'highpass', 1800 * p, 0.7, AUDIO.shotVolume * 0.75, 0.001, 0.06);
    this.noise(out, 'lowpass', 5000, 0.5, AUDIO.shotVolume * 0.25, 0.005, 0.14);
    this.click(out, 800 * p, 0.016, AUDIO.mechanismVolume);
  }

  /** A footstep (`run` or `sprint`) or landing thud; `scale` turns your own steps down. */
  private footstep(out: AudioNode, kind: FootstepKind, scale: number): void {
    const f = AUDIO.footsteps;
    if (kind === 'land') {
      const v = f.landVolume * scale;
      this.tone(out, 'sine', f.landThumpFromHz, f.landThumpToHz, v, f.landThumpTime);
      this.noise(out, 'bandpass', f.scuffHz * 0.8, f.scuffQ, v * 0.6, 0.002, f.scuffTime * 1.5);
      return;
    }
    const v = (kind === 'sprint' ? f.sprintVolume : f.volume) * scale;
    const pitch = jitter(f.scuffSpread);
    this.noise(out, 'bandpass', f.scuffHz * pitch, f.scuffQ, v, 0.002, f.scuffTime);
    this.tone(out, 'sine', f.thumpFromHz * pitch, f.thumpToHz, v * f.thumpGain, f.thumpTime);
    if (kind === 'sprint') this.noise(out, 'bandpass', f.gearHz * pitch, f.gearQ, v * f.gearGain, 0.004, f.gearTime);
  }

  private magOut(out: AudioNode): void {
    this.noise(out, 'bandpass', 1300, 2, AUDIO.mechanismVolume, 0.001, 0.03);
  }

  private magIn(out: AudioNode): void {
    this.click(out, 900, 0.02, AUDIO.mechanismVolume);
    this.click(out, 1400, 0.012, AUDIO.mechanismVolume * 0.8, 0.06);
  }

  private rattle(out: AudioNode): void {
    this.noise(out, 'bandpass', 1800, 1.5, AUDIO.mechanismVolume * 0.6, 0.002, 0.05);
  }

  /** The dry "tik" of a BB hitting something hard. Rate-limited so full auto doesn't become a hiss. */
  private impact(at: Vec3): void {
    if (!this.impactLimit.take(this.ctx!.currentTime)) return;
    this.noise(this.output(at), 'bandpass', 4200 * jitter(AUDIO.impactPitchSpread), 3, AUDIO.impactVolume, 0.0005, 0.018);
  }

  /** You're hit: a sharp, close plastic "tick" with a little thump. Unmistakable. */
  private hitTick(): void {
    const out = this.master!;
    const k = AUDIO.hitTick;
    const v = AUDIO.hitTickVolume;
    this.click(out, k.clickHz, k.clickTime, v);
    this.noise(out, 'bandpass', k.noiseHz, k.noiseQ, v * k.noiseGain, k.noiseAttack, k.noiseTime);
    this.tone(out, 'sine', k.thumpFromHz, k.thumpToHz, v * k.thumpGain, k.thumpTime);
  }

  /** A BB smacking into someone's jacket: duller than a hard surface. */
  private bodyHit(at: Vec3): void {
    const b = AUDIO.bodyHit;
    this.noise(this.output(at), 'bandpass', b.hz, b.q, AUDIO.bodyHitVolume, b.attack, b.time);
  }

  /** Your BB hit someone: a soft wooden "tock". */
  private hitMarker(): void {
    const m = AUDIO.hitMarker;
    this.tone(this.master!, 'triangle', m.fromHz, m.toHz, AUDIO.hitMarkerVolume, m.time);
  }

  private stopWhistles(): void {
    for (const o of this.whistles.splice(0)) {
      o.onended = null;
      try {
        o.stop();
      } catch {
        // Already stopped.
      }
    }
  }

  /** Referee whistle: a pea whistle's warbling tone. */
  private whistle(duration: number, delay: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = AUDIO.whistlePitch;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = AUDIO.whistleWarble;
    const depth = ctx.createGain();
    depth.gain.value = AUDIO.whistlePitch * AUDIO.whistleWarbleDepth;
    lfo.connect(depth).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(AUDIO.whistleVolume, t + AUDIO.whistleAttack);
    g.gain.setValueAtTime(AUDIO.whistleVolume, t + duration - AUDIO.whistleRelease);
    g.gain.linearRampToValueAtTime(0, t + duration);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    lfo.start(t);
    this.whistles.push(osc, lfo);
    osc.onended = () => {
      for (const node of [osc, lfo]) {
        const k = this.whistles.indexOf(node);
        if (k >= 0) this.whistles.splice(k, 1);
      }
    };
    osc.stop(t + duration + AUDIO.stopPadding);
    lfo.stop(t + duration + AUDIO.stopPadding);
  }

  // ---- Building blocks ----------------------------------------------------------------------

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

  /** Where an in-world sound goes: centred (null = your own), or through a 3D panner at `at`. */
  private output(at: Vec3 | null): AudioNode {
    const ctx = this.ctx!;
    if (!at) return this.world!;
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = AUDIO.refDistance;
    p.rolloffFactor = AUDIO.rolloff;
    p.maxDistance = AUDIO.maxDistance;
    p.positionX.value = at.x;
    p.positionY.value = at.y;
    p.positionZ.value = at.z;
    p.connect(this.world!);
    return p;
  }

  private noise(out: AudioNode, type: BiquadFilterType, freq: number, q: number, gain: number, attack: number, decay: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(filter).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + decay + 0.02);
  }

  private tone(out: AudioNode, type: OscillatorType, from: number, to: number, gain: number, duration: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private click(out: AudioNode, freq: number, duration: number, gain: number = AUDIO.mechanismVolume, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }
}
