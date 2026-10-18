import { FULLSCREEN_RELOCK_MS } from '../config/controls';
import type { PointerLock } from '../input/pointerLock';
import { type FullscreenRelock, fullscreenRelock, hasUserActivation, isFullscreen, toggleFullscreen } from './fullscreen';

/**
 * The Fullscreen key in play and the mouse lock across the change (audit UI-19, IN1; out of game.ts, DX5): just after
 * the key the lock is taken again once the change is done, so the key doesn't stop the match on the pause menu. Where
 * the lock drops as the page changes (Firefox), play holds without the pause menu while it is taken again.
 */
export class FullscreenPlay {
  /** When the Fullscreen key was last pressed in play (performance.now()), to take the mouse again (audit UI-19). */
  private keyAt = Number.NEGATIVE_INFINITY;
  /** Whether the page was fullscreen as the Fullscreen key was pressed: the change is done once that no longer holds. */
  private atKey = false;
  /**
   * When the lock dropped as fullscreen changed (Firefox): play holds, without the pause menu, until the lock is taken
   * again (at once, or on `fullscreenchange` if the change isn't done yet), or stops on the menu if it is refused or
   * hasn't come within FULLSCREEN_RELOCK_MS. -Infinity: not holding.
   */
  private holdAt = Number.NEGATIVE_INFINITY;
  /** The Fullscreen key gave the mouse back so the pause menu can ask for the click fullscreen needs (Firefox, IN1). */
  private byClick = false;

  /**
   * `inMatch`: a match is loaded and started, and no crash gave the mouse back for good (FA1); `unlockedPlay`: play runs
   * without the mouse (`?unlocked`).
   */
  constructor(
    private readonly pointer: PointerLock,
    private readonly inMatch: () => boolean,
    private readonly unlockedPlay: () => boolean,
  ) {}

  /** Milliseconds since the Fullscreen key in play: Esc's round skip leaves a drop that soon alone (core/escSkip.ts). */
  sinceKey(now: number): number {
    return now - this.keyAt;
  }

  /** What the page's change or the lock dropping calls for now (ui/fullscreen.ts fullscreenRelock). */
  relock(): FullscreenRelock {
    const changed = isFullscreen() !== this.atKey;
    return fullscreenRelock(performance.now() - this.keyAt, FULLSCREEN_RELOCK_MS, this.inMatch(), this.pointer.locked, this.unlockedPlay(), changed);
  }

  /** The page entered or left fullscreen, or the lock dropped: the lock is taken again if the key's change called for it. */
  takeAgain(): void {
    if (this.relock() !== 'take') return;
    this.keyAt = Number.NEGATIVE_INFINITY;
    void this.pointer.request();
  }

  /**
   * The Fullscreen key in play. Where the key brings no user activation (Firefox), entering fullscreen would be refused:
   * the mouse is given back and the pause menu asks for a click instead (click). Leaving needs none.
   */
  key(now: number): void {
    this.keyAt = now;
    this.atKey = isFullscreen();
    if (!this.atKey && !hasUserActivation() && this.pointer.locked) {
      this.byClick = true;
      this.pointer.release();
      return;
    }
    toggleFullscreen();
  }

  /**
   * The click the pause menu asked for after the Fullscreen key (Firefox, IN1): the page goes fullscreen within it, and
   * the lock is taken once it is (takeAgain; Firefox grants it to a fullscreen page without a click). Already
   * fullscreen: `play` at once.
   */
  click(play: () => void): void {
    if (isFullscreen()) return play();
    this.keyAt = performance.now();
    this.atKey = false;
    toggleFullscreen();
  }

  /** The lock dropped as fullscreen changes (Firefox): play holds while it is taken again. */
  hold(): void {
    this.holdAt = performance.now();
    this.takeAgain();
  }

  get holding(): boolean {
    return this.holdAt !== Number.NEGATIVE_INFINITY;
  }

  /** Held for fullscreen and the lock never came back in time: the pause menu, as for any other drop. */
  holdRanOut(now: number): boolean {
    return this.holding && now - this.holdAt > FULLSCREEN_RELOCK_MS;
  }

  /** Play resumed or paused: no longer holding. */
  stopHolding(): void {
    this.holdAt = Number.NEGATIVE_INFINITY;
  }

  /** Whether the key gave the mouse back for the pause menu's click; read once, as the menu opens. */
  takeByClick(): boolean {
    const was = this.byClick;
    this.byClick = false;
    return was;
  }
}
