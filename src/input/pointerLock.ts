import { MOUSE } from '../config/controls';
import { mouseButtonCode } from './keyBindings';

/** Where mouse buttons go while playing: the keyboard, which maps them through the bindings like keys (M18). */
export interface ButtonSink {
  press(code: string): void;
  release(code: string): void;
}

/**
 * The browser's back and forward side buttons (MouseEvent.button 3 and 4): their default navigates away from the game,
 * so it is blocked while they are game buttons.
 */
const NAVIGATION_BUTTONS: ReadonlySet<number> = new Set([3, 4]);

/**
 * Pointer Lock plus mouse input: look deltas, the mouse buttons (passed on to `buttons` by code, so fire, aim and any
 * other action can be bound to any of them) and wheel steps. Input is ignored unless the pointer is locked to the game
 * canvas (or, for the buttons and wheel only, unlocked play is on: see `setUnlockedButtons`).
 */
export class PointerLock {
  private unlockedButtons = false;
  private dx = 0;
  private dy = 0;
  /** Buttons down while playing, by MouseEvent.button, so they can all be let go when play stops. */
  private readonly heldButtons = new Set<number>();
  private wheel = 0;
  private readonly changeListeners = new Set<(locked: boolean) => void>();
  private readonly errorListeners = new Set<() => void>();
  /** request() calls under way: a first try may fail and the second succeed, so errors wait for their outcome. */
  private requesting = 0;

  constructor(
    private readonly element: HTMLElement,
    private readonly buttons: ButtonSink,
  ) {
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('wheel', this.onWheel, { passive: true });
    // Chrome navigates on the side buttons' release, Firefox on their auxclick.
    document.addEventListener('auxclick', this.onAuxClick);
    // The right button aims; never let it open the browser's menu over the game (or its HUD) while playing.
    document.addEventListener('contextmenu', this.onContextMenu);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  /**
   * Must be called from a user gesture (click). Prefers raw, unaccelerated input where supported, else tries
   * again without it. Refusals (Chrome blocks re-locking for ~1 s after Esc) are reported through `onError` when
   * both tries have failed: `pointerlockerror` events during the request are held back (the first try's would
   * otherwise report a refusal the second try then overturns), and browsers that only fire the event, without a
   * promise to reject, still report it. A request while one is still under way (a double-click on Play) is dropped:
   * the browser would refuse it as already pending and show the refusal hint for nothing.
   */
  async request(): Promise<void> {
    if (this.requesting > 0) return;
    this.requesting++;
    try {
      await this.element.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try {
        await this.element.requestPointerLock();
      } catch {
        this.reportError();
      }
    } finally {
      this.requesting--;
    }
  }

  /**
   * Unlocked play (the `?nolock` test path): the mouse buttons and the wheel count without the lock. Mouse look
   * still needs the lock. Turning it off lets go of any held button.
   */
  setUnlockedButtons(on: boolean): void {
    this.unlockedButtons = on;
    if (!on && !this.locked) this.releaseButtons();
  }

  /** Gives the mouse back (e.g. to click a button on the match result screen). */
  release(): void {
    if (this.locked) document.exitPointerLock();
  }

  onChange(fn: (locked: boolean) => void): void {
    this.changeListeners.add(fn);
  }

  onError(fn: () => void): void {
    this.errorListeners.add(fn);
  }

  /** Returns and resets the accumulated mouse movement. */
  consumeDelta(out: { x: number; y: number }): void {
    out.x = this.dx;
    out.y = this.dy;
    this.dx = 0;
    this.dy = 0;
  }

  /** Returns one replica step (+1 down, -1 up) once enough wheel travel has built up, else 0. */
  consumeWheelSteps(): number {
    if (Math.abs(this.wheel) < MOUSE.wheelStepPixels) return 0;
    const w = Math.sign(this.wheel);
    this.wheel = 0;
    return w;
  }

  dispose(): void {
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('auxclick', this.onAuxClick);
    document.removeEventListener('contextmenu', this.onContextMenu);
    this.changeListeners.clear();
    this.errorListeners.clear();
  }

  private readonly onLockChange = (): void => {
    const locked = this.locked;
    if (!locked) {
      this.dx = 0;
      this.dy = 0;
      this.releaseButtons();
    }
    for (const fn of this.changeListeners) fn(locked);
  };

  private readonly onLockError = (): void => {
    if (this.requesting === 0) this.reportError();
  };

  private reportError(): void {
    for (const fn of this.errorListeners) fn();
  }

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    this.dx += e.movementX;
    this.dy += e.movementY;
  };

  private releaseButtons(): void {
    for (const button of this.heldButtons) this.buttons.release(mouseButtonCode(button));
    this.heldButtons.clear();
    this.wheel = 0;
  }

  private get playing(): boolean {
    return this.locked || this.unlockedButtons;
  }

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.playing) return;
    // Middle-click autoscroll and the side buttons' navigation are browser defaults, not wanted in play.
    if (e.button !== 0) e.preventDefault();
    this.heldButtons.add(e.button);
    this.buttons.press(mouseButtonCode(e.button));
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    if (this.playing && NAVIGATION_BUTTONS.has(e.button)) e.preventDefault();
    if (!this.heldButtons.delete(e.button)) return;
    this.buttons.release(mouseButtonCode(e.button));
  };

  private readonly onAuxClick = (e: MouseEvent): void => {
    if (this.playing && NAVIGATION_BUTTONS.has(e.button)) e.preventDefault();
  };

  private readonly onContextMenu = (e: MouseEvent): void => {
    if (this.playing) e.preventDefault();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.playing) return;
    // Normalise line/page scrolling to pixels so every device needs about one notch per step.
    const scale = e.deltaMode === 1 ? MOUSE.wheelLinePixels : e.deltaMode === 2 ? MOUSE.wheelPagePixels : 1;
    this.wheel += e.deltaY * scale;
  };
}
