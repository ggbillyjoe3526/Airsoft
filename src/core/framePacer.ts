import { FRAME_PACING } from '../config/render';

/**
 * The frame-rate cap (Settings → Graphics; audit REN-16, CORE-25): which animation frames are drawn. Frames are due a
 * cap's period apart, counted from when the last one was due (not from when it came), so the average rate is the cap
 * even when the screen's rate isn't a multiple of it; a frame up to FRAME_PACING.slackMs early still counts, so a cap equal
 * to the screen's rate draws every frame. Frames not drawn still run the simulation (Game.frame). Pure: no clock of its own.
 */
export class FramePacer {
  /** When the next frame is due (ms, the animation frame's clock). */
  private due = Number.NEGATIVE_INFINITY;

  /** Whether to draw the animation frame at `now` (ms) under a cap of `cap` frames a second (0 = every frame). */
  shouldDraw(now: number, cap: number): boolean {
    if (cap <= 0) {
      this.due = Number.NEGATIVE_INFINITY;
      return true;
    }
    const period = 1000 / cap;
    if (now < this.due - FRAME_PACING.slackMs) return false;
    // Far behind (a hitch, a pause, the cap just set): the schedule restarts from now rather than bursting to catch up.
    this.due = now - this.due > period * FRAME_PACING.resetFrames ? now + period : this.due + period;
    return true;
  }
}
