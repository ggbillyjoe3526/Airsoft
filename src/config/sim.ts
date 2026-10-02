/** Core simulation timing. */
export const SIM = {
  /** Fixed simulation rate. Rendering runs independently and interpolates. */
  tickRate: 60,
  /** Cap on catch-up ticks per frame so a stall doesn't spiral. */
  maxTicksPerFrame: 5,
  /** Longest frame (seconds) accepted as real elapsed time; longer gaps (tab switch, breakpoint) are dropped. */
  maxFrameDt: 0.25,
} as const;

export const SIM_DT = 1 / SIM.tickRate;
