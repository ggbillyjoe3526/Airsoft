import { ORDER_WHEEL } from '../config/squad';

/**
 * Which of `count` orders round a wheel the pointer at (x, y) (px from the middle, y down) is on: 0 at the top, then
 * clockwise, each owning an equal slice. -1 within `deadZone` of the middle.
 */
export function wheelSlice(x: number, y: number, count: number, deadZone: number): number {
  if (count <= 0 || Math.hypot(x, y) < deadZone) return -1;
  const slice = (Math.PI * 2) / count;
  const angle = Math.atan2(x, -y); // 0 up, π/2 right
  return ((Math.round(angle / slice) % count) + count) % count;
}

/**
 * The order wheel's own pointer (M23): while the wheel is open the mouse moves this instead of the view. It starts in
 * the middle each time the wheel opens and stays within `ORDER_WHEEL.pointerReach` of it, so a big flick still lands
 * on an order and coming back needs no more than that.
 */
export class WheelPointer {
  open = false;
  x = 0;
  y = 0;

  start(): void {
    this.open = true;
    this.x = 0;
    this.y = 0;
  }

  /** Moves the pointer by (dx, dy) px, kept within reach of the middle. */
  move(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    const d = Math.hypot(this.x, this.y);
    const reach = ORDER_WHEEL.pointerReach;
    if (d > reach) {
      this.x *= reach / d;
      this.y *= reach / d;
    }
  }

  /** The order the pointer is on (an index into ORDER_WHEEL.items), or -1. */
  get pick(): number {
    return this.open ? wheelSlice(this.x, this.y, ORDER_WHEEL.items.length, ORDER_WHEEL.deadZone) : -1;
  }

  close(): void {
    this.open = false;
    this.x = 0;
    this.y = 0;
  }
}
