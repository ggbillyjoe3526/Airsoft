import type { Action } from '../config/controls';
import { MAG_WHEEL_LABELS } from '../config/magShare';
import { ORDER_WHEEL, type SquadCommand, type SquadOrderKind, type WheelSelect } from '../config/squad';

/** The key that gives each wheel order directly (audit UI-22); the team plan has none (an order's own key cancels it). */
export const ORDER_KEYS: Readonly<Record<SquadCommand, Action | null>> = {
  follow: 'orderFollow',
  hold: 'orderHold',
  regroup: 'orderRegroup',
  cancel: null,
  mag: 'askMag',
};

/** The line in the wheel's middle: how to give the order pointed at, or how to leave. */
export function wheelHint(select: WheelSelect, pick: number, keyName: string): string {
  if (pick < 0) return select === 'hover' ? 'Point at an order' : `Point and click · let go of ${keyName} to close`;
  return select === 'hover' ? `Let go of ${keyName} to give` : 'Click to give';
}

/**
 * One order's slice of the ring (Dev 6 playtest item 22) as an SVG path round (0, 0): the `i`-th of `count`, centred
 * clockwise from the top as the input reads the pointer (input/orderWheel.ts wheelSlice), between `inner` and `outer`
 * px with half of `gapDeg` taken off each side, so every slice is the same shape.
 */
export function slicePath(i: number, count: number, inner: number, outer: number, gapDeg: number): string {
  const half = Math.PI / count - (gapDeg * Math.PI) / 360;
  const mid = (i / count) * Math.PI * 2;
  const at = (r: number, a: number) => `${(Math.sin(a) * r).toFixed(1)} ${(-Math.cos(a) * r).toFixed(1)}`;
  const large = half * 2 > Math.PI ? 1 : 0;
  return `M ${at(outer, mid - half)} A ${outer} ${outer} 0 ${large} 1 ${at(outer, mid + half)} L ${at(inner, mid + half)} A ${inner} ${inner} 0 ${large} 0 ${at(inner, mid - half)} Z`;
}

/**
 * The order wheel on screen (M23; redrawn as a ring for Dev 6 playtest item 22): a ring of equal slices round the middle
 * of the screen, one per order, each with the order's name and its direct key in a box the same size; the slice pointed
 * at filled in your team's colour, the order your teammates are carrying out underlined, the wheel's own pointer, and
 * how to give the order under the ring. Input (input/orderWheel.ts) decides what it shows; the DOM is only touched when
 * that changes.
 */
export class OrderWheel {
  private readonly root: HTMLDivElement;
  private readonly items: HTMLDivElement[];
  /** Each order's slice of the ring (an SVG path in a box of its own), lit with its item. */
  private readonly slices: HTMLDivElement[] = [];
  /** Each order's label (its own span, so the key under it stays): the Mag item's reads Need a Mag or Toss a Mag (MG1). */
  private readonly labels: HTMLSpanElement[] = [];
  /** Under each order, its direct key (audit UI-22): the wheel teaches the keys it stands in for. */
  private readonly keys: (HTMLElement | null)[];
  private readonly dot: HTMLElement;
  private readonly hint: HTMLDivElement;
  private shown = { open: false, pick: -2, current: '', hint: '', x: Number.NaN, y: Number.NaN, mag: '' };

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
    const { inner, outer, gap, radius } = ORDER_WHEEL;
    this.root.style.setProperty('--wheel-outer', `${outer}px`);
    const n = ORDER_WHEEL.items.length;
    const size = outer * 2;
    // The ring, drawn once: a slice per order, each its own box so it lights with its order.
    for (let i = 0; i < n; i++) {
      const slice = document.createElement('div');
      slice.className = 'order-wheel-slice';
      slice.innerHTML = `<svg viewBox="${-outer} ${-outer} ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><path d="${slicePath(i, n, inner, outer, gap)}"/></svg>`;
      this.slices.push(slice);
      this.root.append(slice);
    }
    const hub = document.createElement('i');
    hub.className = 'order-wheel-hub';
    this.root.append(hub);
    this.items = ORDER_WHEEL.items.map((item, i) => {
      const el = document.createElement('div');
      el.className = 'order-wheel-item';
      // Clockwise from the top, as the input reads the pointer.
      const angle = (i / n) * Math.PI * 2;
      el.style.setProperty('--x', `${Math.round(Math.sin(angle) * radius)}px`);
      el.style.setProperty('--y', `${Math.round(-Math.cos(angle) * radius)}px`);
      const label = document.createElement('span');
      label.className = 'order-wheel-label';
      label.textContent = item.label;
      this.labels.push(label);
      el.append(label);
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
   * order in force (marked on the wheel), the hint in the middle and what the Mag item reads (MG1).
   */
  update(open: boolean, pick: number, x: number, y: number, current: SquadOrderKind | 'none', hint: string, mag: string = MAG_WHEEL_LABELS.ask): void {
    const s = this.shown;
    if (open !== s.open) {
      this.root.hidden = !(s.open = open);
      if (open) this.showKeys();
    }
    if (!open) return;
    if (pick !== s.pick) {
      this.items.forEach((el, i) => el.classList.toggle('picked', i === pick));
      this.slices.forEach((el, i) => el.classList.toggle('picked', i === pick));
      s.pick = pick;
    }
    if (current !== s.current) {
      // With no order in force, the team plan is what they follow.
      const now = current === 'none' ? 'cancel' : current;
      this.items.forEach((el, i) => el.classList.toggle('current', ORDER_WHEEL.items[i]!.command === now));
      this.slices.forEach((el, i) => el.classList.toggle('current', ORDER_WHEEL.items[i]!.command === now));
      s.current = current;
    }
    if (hint !== s.hint) this.hint.textContent = s.hint = hint;
    if (mag !== s.mag) {
      s.mag = mag;
      ORDER_WHEEL.items.forEach((item, i) => {
        if (item.command === 'mag') this.labels[i]!.textContent = mag;
      });
    }
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
