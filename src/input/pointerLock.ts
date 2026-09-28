/**
 * Pointer Lock plus mouse input: look deltas, the fire button and wheel steps. Input is ignored
 * unless the pointer is locked to the game canvas.
 */
export class PointerLock {
  private dx = 0;
  private dy = 0;
  private fireHeldState = false;
  private firePressedState = false;
  private wheel = 0;
  private readonly changeListeners = new Set<(locked: boolean) => void>();
  private readonly errorListeners = new Set<() => void>();

  constructor(private readonly element: HTMLElement) {
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('wheel', this.onWheel, { passive: true });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  /**
   * Must be called from a user gesture (click). Prefers raw, unaccelerated input where supported.
   * Refusals (Chrome blocks re-locking for ~1 s after Esc) are reported through `onError`, either
   * via the rejected promise or the `pointerlockerror` event, whichever the browser uses.
   */
  async request(): Promise<void> {
    try {
      await this.element.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try {
        await this.element.requestPointerLock();
      } catch {
        this.onLockError();
      }
    }
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

  /** Returns true once if the fire button went down since the last call (catches sub-frame clicks). */
  consumeFirePress(): boolean {
    const p = this.firePressedState;
    this.firePressedState = false;
    return p;
  }

  /** Returns and resets wheel steps since the last call (+1 per notch down, -1 per notch up). */
  consumeWheelSteps(): number {
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
    this.changeListeners.clear();
    this.errorListeners.clear();
  }

  private readonly onLockChange = (): void => {
    const locked = this.locked;
    if (!locked) {
      this.dx = 0;
      this.dy = 0;
      this.fireHeldState = false;
      this.firePressedState = false;
      this.wheel = 0;
    }
    for (const fn of this.changeListeners) fn(locked);
  };

  private readonly onLockError = (): void => {
    for (const fn of this.errorListeners) fn();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    this.dx += e.movementX;
    this.dy += e.movementY;
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.locked || e.button !== 0) return;
    this.fireHeldState = true;
    this.firePressedState = true;
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.fireHeldState = false;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (this.locked) this.wheel += e.deltaY;
  };
}
