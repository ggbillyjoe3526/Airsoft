import { REPORT_LOG } from '../config/crash';

/** The frame times of the last seconds of play, summed up (IM7). */
export interface FrameSummary {
  /** Seconds of play the summary covers: the window, or less early on. */
  seconds: number;
  frames: number;
  avgMs: number;
  worstMs: number;
  /** Frames slower than the hitch threshold. */
  hitches: number;
}

/**
 * The drawn frames of the last `seconds` of play (IM7), for a report: turns "it stutters" into numbers to set against
 * the perf budgets. Its clock is play time, the frames' own, so a report made from the pause menu still sums up the
 * play before it. One bucket per second in fixed arrays: adding a frame allocates nothing.
 */
export class FrameWindow {
  private readonly stamp: Int32Array;
  private readonly frames: Uint32Array;
  private readonly hitches: Uint32Array;
  private readonly sum: Float64Array;
  private readonly worst: Float64Array;
  /** Milliseconds of play added so far. */
  private clockMs = 0;
  /** The second of play the newest frame began in (-1: none yet). */
  private latest = -1;

  constructor(
    private readonly seconds: number = REPORT_LOG.frameSeconds,
    private readonly hitchMs: number = REPORT_LOG.hitchMs,
  ) {
    this.stamp = new Int32Array(seconds).fill(-1);
    this.frames = new Uint32Array(seconds);
    this.hitches = new Uint32Array(seconds);
    this.sum = new Float64Array(seconds);
    this.worst = new Float64Array(seconds);
  }

  /** A frame drawn in play, `ms` after the one before. */
  add(ms: number): void {
    const second = Math.floor(this.clockMs / 1000);
    const i = second % this.seconds;
    if (this.stamp[i] !== second) {
      this.stamp[i] = second;
      this.frames[i] = this.hitches[i] = this.sum[i] = this.worst[i] = 0;
    }
    this.frames[i]!++;
    this.sum[i]! += ms;
    if (ms > this.worst[i]!) this.worst[i] = ms;
    if (ms > this.hitchMs) this.hitches[i]!++;
    this.clockMs += ms;
    this.latest = second;
  }

  /** The last `seconds` of play, up to the newest frame's. */
  summary(): FrameSummary {
    const now = this.latest;
    let frames = 0;
    let sum = 0;
    let worst = 0;
    let hitches = 0;
    for (let i = 0; i < this.seconds; i++) {
      if (this.stamp[i]! < 0 || this.stamp[i]! <= now - this.seconds) continue;
      frames += this.frames[i]!;
      sum += this.sum[i]!;
      hitches += this.hitches[i]!;
      worst = Math.max(worst, this.worst[i]!);
    }
    return { seconds: Math.min(this.seconds, sum / 1000), frames, avgMs: frames ? sum / frames : 0, worstMs: worst, hitches };
  }
}
