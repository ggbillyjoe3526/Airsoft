import type { Action } from '../config/controls';
import { ORDER_WHEEL, type SquadCommand, type SquadOrderKind, type WheelSelect } from '../config/squad';

/** The key that gives each wheel order directly (audit UI-22); the team plan has none (an order's own key cancels it). */
export const ORDER_KEYS: Readonly<Record<SquadCommand, Action | null>> = {
  follow: 'orderFollow',
  hold: 'orderHold',
  regroup: 'orderRegroup',
  cancel: null,
};

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
  /** Under each order, its direct key (audit UI-22): the wheel teaches the keys it stands in for. */
  private readonly keys: (HTMLElement | null)[];
  private readonly dot: HTMLElement;
  private readonly hint: HTMLDivElement;
  private shown = { open: false, pick: -2, current: '', hint: '', x: Number.NaN, y: Number.NaN };

  /**
   * `team`: your team's CSS colour, which lights the order pointed at; `keyName`: the key bound to an action ('' if
   * none), read as the wheel opens since keys can be rebound on the pause menu.
   */
  constructor(
    parent: HTMLElement,
    team: string,
    private readonly keyName: (action: Action) => string,
  ) {
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
    this.keys = ORDER_WHEEL.items.map((item, i) => {
      if (!ORDER_KEYS[item.command]) return null;
      const kbd = document.createElement('kbd');
      kbd.className = 'order-wheel-key';
      this.items[i]!.append(kbd);
      return kbd;
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
    if (open !== s.open) {
      this.root.hidden = !(s.open = open);
      if (open) this.showKeys();
    }
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

  /** Each order's direct key as bound now; hidden for one with no key. */
  private showKeys(): void {
    ORDER_WHEEL.items.forEach((item, i) => {
      const kbd = this.keys[i];
      const action = ORDER_KEYS[item.command];
      if (!kbd || !action) return;
      const name = this.keyName(action);
      kbd.textContent = name;
      kbd.hidden = name === '';
    });
  }

  hide(): void {
    if (this.shown.open) this.root.hidden = !(this.shown.open = false);
  }

  dispose(): void {
    this.root.remove();
  }
}
