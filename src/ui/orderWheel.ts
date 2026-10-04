import { ORDER_WHEEL, type SquadOrderKind, type WheelSelect } from '../config/squad';

/** The line in the wheel's middle: how to give the order pointed at, or how to leave. */
export function wheelHint(select: WheelSelect, pick: number, keyName: string): string {
  if (pick < 0) return select === 'hover' ? 'Point at an order' : `Point and click · let go of ${keyName} to close`;
  return select === 'hover' ? `Let go of ${keyName} to give` : 'Click to give';
}

/**
 * The order wheel on screen (M23): the orders round the middle of the screen, the one pointed at lit, the one your
 * teammates are carrying out marked, and the wheel's own pointer. Input (input/orderWheel.ts) decides what it shows;
 * the DOM is only touched when that changes.
 */
export class OrderWheel {
  private readonly root: HTMLDivElement;
  private readonly items: HTMLDivElement[];
  private readonly dot: HTMLElement;
  private readonly hint: HTMLDivElement;
  private shown = { open: false, pick: -2, current: '', hint: '', x: Number.NaN, y: Number.NaN };

  /** `team`: your team's CSS colour, which lights the order pointed at. */
  constructor(parent: HTMLElement, team: string) {
    this.root = document.createElement('div');
    this.root.className = 'order-wheel';
    this.root.hidden = true;
    this.root.style.setProperty('--team', team);
    this.root.style.setProperty('--wheel-radius', `${ORDER_WHEEL.radius}px`);
    const n = ORDER_WHEEL.items.length;
    this.items = ORDER_WHEEL.items.map((item, i) => {
      const el = document.createElement('div');
      el.className = 'order-wheel-item';
      // Clockwise from the top, as the input reads the pointer.
      const angle = (i / n) * Math.PI * 2;
      el.style.setProperty('--x', `${Math.round(Math.sin(angle) * ORDER_WHEEL.radius)}px`);
      el.style.setProperty('--y', `${Math.round(-Math.cos(angle) * ORDER_WHEEL.radius)}px`);
      el.textContent = item.label;
      this.root.append(el);
      return el;
    });
    this.dot = document.createElement('i');
    this.dot.className = 'order-wheel-pointer';
    this.hint = document.createElement('div');
    this.hint.className = 'order-wheel-hint';
    this.root.append(this.hint, this.dot);
    parent.appendChild(this.root);
  }

  /**
   * Once per frame: the wheel open or not, the order pointed at (-1: none), the pointer (px from the middle), the
   * order in force (marked on the wheel) and the hint in the middle.
   */
  update(open: boolean, pick: number, x: number, y: number, current: SquadOrderKind | 'none', hint: string): void {
    const s = this.shown;
    if (open !== s.open) this.root.hidden = !(s.open = open);
    if (!open) return;
    if (pick !== s.pick) {
      this.items.forEach((el, i) => el.classList.toggle('picked', i === pick));
      s.pick = pick;
    }
    if (current !== s.current) {
      // With no order in force, the team plan is what they follow.
      const now = current === 'none' ? 'cancel' : current;
      this.items.forEach((el, i) => el.classList.toggle('current', ORDER_WHEEL.items[i]!.command === now));
      s.current = current;
    }
    if (hint !== s.hint) this.hint.textContent = s.hint = hint;
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx !== s.x || ry !== s.y) {
      s.x = rx;
      s.y = ry;
      this.dot.style.transform = `translate(${rx}px, ${ry}px)`;
    }
  }

  hide(): void {
    if (this.shown.open) this.root.hidden = !(this.shown.open = false);
  }

  dispose(): void {
    this.root.remove();
  }
}
