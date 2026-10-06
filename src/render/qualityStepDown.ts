import { QUALITY_PRESETS, QUALITY_STEP_DOWN, type QualityChoice, type QualityPreset } from '../config/render';

/**
 * The automatic quality step-down (audit REN-03): frame times while playing, judged in windows of
 * QUALITY_STEP_DOWN.windowSeconds. A window is slow when more than QUALITY_STEP_DOWN.slowShare (5 %) of its frames took
 * longer than the threshold (its 95th percentile is over it); `windows` slow windows in a row say the preset is too much
 * for this machine. Counting frames over the threshold needs no buffer and no sort: nothing is allocated.
 */
export class FrameTimeWatch {
  private frames = 0;
  private over = 0;
  private elapsedMs = 0;
  private slowWindows = 0;

  /** A drawn frame took `frameMs`; true when the last `windows` windows were all slow (the watch then starts over). */
  add(frameMs: number, thresholdMs: number): boolean {
    this.frames++;
    if (frameMs > thresholdMs) this.over++;
    this.elapsedMs += frameMs;
    if (this.elapsedMs < QUALITY_STEP_DOWN.windowSeconds * 1000) return false;
    const slow = this.over > this.frames * QUALITY_STEP_DOWN.slowShare;
    this.frames = this.over = this.elapsedMs = 0;
    this.slowWindows = slow ? this.slowWindows + 1 : 0;
    if (this.slowWindows < QUALITY_STEP_DOWN.windows) return false;
    this.slowWindows = 0;
    return true;
  }

  /** Starts over (play resumed: the time on the menus isn't a frame time). */
  reset(): void {
    this.frames = this.over = this.elapsedMs = this.slowWindows = 0;
  }
}

/** A slow frame's threshold (ms): the target, or a little over a frame-rate cap's period when that is longer. */
export function slowFrameMs(frameRateCap: number): number {
  return Math.max(QUALITY_STEP_DOWN.p95Ms, frameRateCap > 0 ? (1000 / frameRateCap) * QUALITY_STEP_DOWN.capSlack : 0);
}

/**
 * The preset one step down from `choice`, or null: Low is the floor, and a Custom mix is the player's own. Ultra steps to
 * High, though only an automatic pick steps down and the game never picks Ultra itself (G5).
 */
export function presetBelow(choice: QualityChoice): QualityPreset | null {
  if (choice === 'custom') return null;
  const i = QUALITY_PRESETS.indexOf(choice);
  return i > 0 ? QUALITY_PRESETS[i - 1]! : null;
}
