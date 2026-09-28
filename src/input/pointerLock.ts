/**
 * Pointer Lock + mouse-look deltas. Movement is ignored unless the pointer is locked to the
 * game canvas.
 */
export class PointerLock {
  private dx = 0;
  private dy = 0;
  private readonly changeListeners = new Set<(locked: boolean) => void>();
  private readonly errorListeners = new Set<() => void>();

  constructor(private readonly element: HTMLElement) {
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    document.addEventListener('mousemove', this.onMouseMove);
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

  dispose(): void {
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.changeListeners.clear();
    this.errorListeners.clear();
  }

  private readonly onLockChange = (): void => {
    const locked = this.locked;
    if (!locked) {
      this.dx = 0;
      this.dy = 0;
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
}
