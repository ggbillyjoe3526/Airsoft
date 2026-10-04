/** Core simulation timing. */
export const SIM = {
  /** Fixed simulation rate. Rendering runs independently and interpolates. */
  tickRate: 60,
  /**
   * Cap on catch-up ticks per frame so a stall doesn't spiral. 10 keeps the game in real time down to 6 frames a second
   * (audit SIM-14: a Depot tick with ~100 BBs is under half a millisecond, bots ~0.02 ms; the frame is GPU-bound);
   * below that the game runs slow rather than skipping ahead.
   */
  maxTicksPerFrame: 10,
  /** The lowest frame rate (frames a second) the cap above still keeps in real time (checked in core/fixedStepper.test.ts). */
  realTimeDownToFps: 6,
  /** Longest frame (seconds) accepted as real elapsed time; longer gaps (tab switch, breakpoint) are dropped. */
  maxFrameDt: 0.25,
} as const;

export const SIM_DT = 1 / SIM.tickRate;
