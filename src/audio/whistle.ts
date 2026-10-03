import { AUDIO } from '../config/audio';

/**
 * The referee's pea whistle, played live (it's long, and a new round cuts the last one short): a warbling tone into
 * `out`. Each blast's nodes are disconnected when it ends.
 */
export class Whistle {
  /** Oscillators still playing or scheduled. */
  private readonly playing: OscillatorNode[] = [];

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
  ) {}

  /** Silences every blast playing or scheduled. */
  stopAll(): void {
    // Their onended handlers still run and disconnect each blast's nodes.
    for (const o of this.playing.splice(0)) {
      try {
        o.stop();
      } catch {
        // Already stopped.
      }
    }
  }

  /** One blast of `duration` seconds, starting `delay` seconds from now. */
  blast(duration: number, delay: number): void {
    const ctx = this.ctx;
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
    osc.connect(g).connect(this.out);
    osc.start(t);
    lfo.start(t);
    this.playing.push(osc, lfo);
    osc.onended = () => {
      for (const node of [osc, lfo]) {
        const k = this.playing.indexOf(node);
        if (k >= 0) this.playing.splice(k, 1);
      }
      osc.disconnect();
      lfo.disconnect();
      depth.disconnect();
      g.disconnect();
    };
    osc.stop(t + duration + AUDIO.stopPadding);
    lfo.stop(t + duration + AUDIO.stopPadding);
  }
}
