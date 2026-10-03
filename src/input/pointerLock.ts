import { MOUSE } from '../config/controls';

/**
 * Pointer Lock plus mouse input: look deltas, the fire button (left), the aim button (right) and wheel steps. Input is ignored
 * unless the pointer is locked to the game canvas (or, for the fire button and wheel only, unlocked
 * play is on: see `setUnlockedButtons`).
 */
export class PointerLock {
  private unlockedButtons = false;
  private dx = 0;
  private dy = 0;
  private fireHeldState = false;
  private firePressedState = false;
  private aimHeldState = false;
  private wheel = 0;
  private readonly changeListeners = new Set<(locked: boolean) => void>();
  private readonly errorListeners = new Set<() => void>();
  /** request() calls under way: a first try may fail and the second succeed, so errors wait for their outcome. */
  private requesting = 0;

  constructor(private readonly element: HTMLElement) {
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('wheel', this.onWheel, { passive: true });
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
   * promise to reject, still report it.
   */
  async request(): Promise<void> {
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
   * Unlocked play (the `?nolock` test path): the fire and aim buttons and the wheel count without the lock. Mouse look
   * still needs the lock. Turning it off drops any held or pending fire.
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

  get fireHeld(): boolean {
    return this.fireHeldState;
  }

  /** The aim button (right) is held. */
  get aimHeld(): boolean {
    return this.aimHeldState;
  }

  /** Returns true once if the fire button went down since the last call (catches sub-frame clicks). */
  consumeFirePress(): boolean {
    const p = this.firePressedState;
    this.firePressedState = false;
    return p;
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
    this.fireHeldState = false;
    this.firePressedState = false;
    this.aimHeldState = false;
    this.wheel = 0;
  }

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!(this.locked || this.unlockedButtons)) return;
    if (e.button === 0) {
      this.fireHeldState = true;
      this.firePressedState = true;
    } else if (e.button === 2) this.aimHeldState = true;
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.fireHeldState = false;
    else if (e.button === 2) this.aimHeldState = false;
  };

  private readonly onContextMenu = (e: MouseEvent): void => {
    if (this.locked || this.unlockedButtons) e.preventDefault();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!(this.locked || this.unlockedButtons)) return;
    // Normalise line/page scrolling to pixels so every device needs about one notch per step.
    const scale = e.deltaMode === 1 ? MOUSE.wheelLinePixels : e.deltaMode === 2 ? MOUSE.wheelPagePixels : 1;
    this.wheel += e.deltaY * scale;
  };
}
