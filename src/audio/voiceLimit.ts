/** Lets at most `max` sounds of one kind start per `window` seconds (keeps busy moments readable). */
export class VoiceLimit {
  private start = Number.NEGATIVE_INFINITY;
  private count = 0;

  constructor(
    private readonly max: number,
    private readonly window: number,
  ) {}

  /** True if a sound may start at time `now` (seconds), counting it. */
  take(now: number): boolean {
    if (now - this.start > this.window) {
      this.start = now;
      this.count = 0;
    }
    return this.count++ < this.max;
  }
}
