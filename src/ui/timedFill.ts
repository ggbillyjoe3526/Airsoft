import { HUD } from '../config/render';

/** What the fill is doing: standing at a width, running on a CSS transition, or (Reduced motion) stepping per percent. */
const enum Run {
  Still,
  Smooth,
  Steps,
}

const scaleOf = (fraction: number): string => `scaleX(${fraction})`;
const percentOf = (fraction: number): number => Math.max(0, Math.min(100, Math.floor(fraction * 100)));

/**
 * The fill of a progress bar (the reload bar, the case-opening bar, the extraction count; M64, audit UI-11), drawn by one
 * CSS transition: `follow` tells the page once that the bar runs to full in so many seconds, and the browser fills it
 * between frames (smooth at low frame rates too), instead of a style write per percent. The bar's CSS gives the fill
 * `transform-origin: left`, a `transform` transition (duration set here) and, under Reduced motion, `transition-property:
 * none`: then `follow` steps per whole percent as the bar always did, and nothing slides. The game's own progress still
 * rules: if it drifts off the transition's (a pause, a long frame, a count that was reset) the run starts again from it.
 * `hold` stands the bar at a fraction (a stopped, paused or finished one); a bar whose progress stands still for longer
 * than `HUD.barDriftSeconds` (the match paused, its menu over it) is stood too, so a hidden bar is not begun again every
 * few frames. Allocates only when it writes.
 */
export class TimedFill {
  private run = Run.Still;
  /** The whole percent last written while still or stepping. */
  private shown = -1;
  /** The running transition: where it began (fraction), when (ms), and how fast it fills (fraction per ms). */
  private from = 0;
  private startedAt = 0;
  private rate = 0;
  /** The fraction `follow` was last given, and when it last changed (ms): a progress standing still is a pause. */
  private last = Number.NaN;
  private changedAt = 0;

  constructor(
    private readonly fill: HTMLElement,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** The bar stands at `fraction` (0..1) and nothing runs; written only when its whole percent changes. */
  hold(fraction: number): void {
    this.last = Number.NaN;
    this.stand(fraction);
  }

  private stand(fraction: number): void {
    const percent = percentOf(fraction);
    if (this.run !== Run.Smooth && percent === this.shown) {
      this.run = Run.Still;
      return;
    }
    this.run = Run.Still;
    this.shown = percent;
    this.fill.style.transitionDuration = '0s';
    this.fill.style.transform = scaleOf(percent / 100);
  }

  /**
   * The bar is at `fraction` and the game says it is full in `secondsLeft`: the transition runs it there, and is begun
   * again only when the game's progress is `HUD.barDriftSeconds` off it. Call it every frame the bar fills.
   */
  follow(fraction: number, secondsLeft: number): void {
    if (this.run === Run.Steps) {
      this.step(fraction);
      return;
    }
    const now = this.now();
    if (fraction !== this.last) {
      this.last = fraction;
      this.changedAt = now;
    } else if (now - this.changedAt > HUD.barDriftSeconds * 1000) {
      // The game's progress stands still (a pause): the bar stands where it is until it moves again.
      if (this.run !== Run.Still) this.stand(fraction);
      return;
    }
    if (this.run === Run.Smooth) {
      const expected = this.from + this.rate * (now - this.startedAt);
      if (Math.abs(fraction - expected) <= this.rate * 1000 * HUD.barDriftSeconds) return;
    }
    this.begin(fraction, secondsLeft, now);
  }

  private begin(fraction: number, secondsLeft: number, now: number): void {
    const from = Math.max(0, Math.min(1, fraction));
    const style = this.fill.style;
    style.transitionDuration = '0s';
    style.transform = scaleOf(from);
    if (secondsLeft <= 0 || from >= 1) {
      this.run = Run.Still;
      this.shown = percentOf(from);
      return;
    }
    // Reading the computed style makes the page settle the bar at `from` first, so the transition starts there.
    const calm = globalThis.getComputedStyle?.(this.fill).transitionProperty === 'none';
    if (calm) {
      this.run = Run.Steps;
      this.shown = percentOf(from);
      return;
    }
    this.run = Run.Smooth;
    this.from = from;
    this.startedAt = now;
    this.rate = (1 - from) / (secondsLeft * 1000);
    style.transitionDuration = `${secondsLeft}s`;
    style.transform = 'scaleX(1)';
  }

  private step(fraction: number): void {
    const percent = percentOf(fraction);
    if (percent === this.shown) return;
    this.shown = percent;
    this.fill.style.transform = scaleOf(percent / 100);
  }
}
